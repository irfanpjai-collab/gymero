"""
Green Power Gym — Biometric Bridge
Lightweight FastAPI server for ZKTeco/ESSL fingerprint device management.
No face recognition, no camera, no GPU required.

Endpoints:
  GET  /api/biometric/status        device connectivity
  GET  /api/biometric/users         enrolled users on device
  GET  /api/biometric/attendance    attendance log from device
  POST /api/biometric/sync          pull attendance → return records
  GET  /api/biometric/push-status   compare CRM members vs device
  POST /api/biometric/push-members  enrol CRM members on device
  DELETE /api/biometric/users/{uid} remove user from device
  POST /api/biometric/access-sync   block expired / restore renewed memberships
  GET  /api/biometric/access-status membership access status for every device user
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

BRIDGE_API_KEY = os.getenv("BRIDGE_API_KEY", "")
BRIDGE_STREAM_KEY = os.getenv("BRIDGE_STREAM_KEY", "")
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("BRIDGE_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]

if not BRIDGE_API_KEY or not BRIDGE_STREAM_KEY:
    sys.exit(
        "BRIDGE_API_KEY and BRIDGE_STREAM_KEY must be set in biometric-bridge/.env "
        "before starting the bridge — every biometric endpoint (including door unlock) "
        "would otherwise be reachable with no authentication."
    )


def require_api_key(x_bridge_key: str = Header(default="")) -> None:
    if x_bridge_key != BRIDGE_API_KEY:
        raise HTTPException(401, "Missing or invalid X-Bridge-Key header")


def require_stream_key(key: str = Query(default="")) -> None:
    if key != BRIDGE_STREAM_KEY:
        raise HTTPException(401, "Missing or invalid stream key")


# Simple in-memory per-action rate limit — a leaked BRIDGE_API_KEY shouldn't let
# someone hammer the door unlock or spam device writes. Single-process bridge,
# so a plain module-level dict is sufficient; no need for a distributed limiter.
_last_call: dict[str, float] = {}


def rate_limit(key: str, min_interval_seconds: float):
    def _check() -> None:
        now = time.monotonic()
        last = _last_call.get(key, 0.0)
        wait = min_interval_seconds - (now - last)
        if wait > 0:
            raise HTTPException(429, f"Too many requests for '{key}' — wait {wait:.1f}s")
        _last_call[key] = now
    return _check

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

from core.biometric        import BiometricDevice
from core.access_sync      import AccessSyncManager
from core.attendance_store import persist_punch, flush_pending
from core.sync_queue       import run_sync_queue_listener
from database.client       import get_crm_client

# ── Global state ───────────────────────────────────────────────────────────────

_device:      BiometricDevice | None = None
_access_sync: AccessSyncManager | None = None
_punch_queue: asyncio.Queue[dict[str, Any]] | None = None


def _enqueue_punch(record: dict[str, Any]) -> None:
    if _punch_queue is not None:
        try:
            _punch_queue.put_nowait(record)
        except Exception:
            pass
    # Durable write — independent of the live SSE queue above. Never raises;
    # falls back to a local on-disk queue if Supabase is unreachable.
    persist_punch(record)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _device, _access_sync, _punch_queue

    host = os.getenv("DEVICE_HOST", "")
    port = int(os.getenv("DEVICE_PORT", "4370"))

    if not host:
        logger.warning("DEVICE_HOST not set — biometric endpoints will return 503")
    else:
        _device = BiometricDevice(host, port)
        _access_sync = AccessSyncManager(_device)
        _punch_queue = asyncio.Queue(maxsize=500)
        _device.start_monitor(_enqueue_punch)
        logger.info("Biometric bridge ready → %s:%d", host, port)

        # Flush any attendance queued from a previous outage immediately, rather
        # than waiting up to 60s for the first periodic flush to come around.
        try:
            await asyncio.get_event_loop().run_in_executor(None, flush_pending)
        except Exception as exc:
            logger.error("startup attendance flush failed: %s", exc)

        asyncio.create_task(_periodic_access_sync())
        asyncio.create_task(_periodic_attendance_flush())
        asyncio.create_task(run_sync_queue_listener(_device))

    yield

    if _device:
        _device.stop_monitor()
    logger.info("Biometric bridge shutdown")


async def _periodic_access_sync() -> None:
    """Run access sync 30 s after startup, then every hour."""
    await asyncio.sleep(30)
    _run_sync_safe()

    while True:
        await asyncio.sleep(3600)   # every hour
        _run_sync_safe()


def _run_sync_safe() -> None:
    try:
        result = _access_sync.run_sync()
        logger.info("Access sync — %s", result.to_dict())
    except Exception as exc:
        logger.error("Access sync failed: %s", exc)


async def _periodic_attendance_flush() -> None:
    """Retry any attendance records that couldn't be persisted (e.g. internet was
    down at punch time) — runs every minute so an outage doesn't lose history."""
    while True:
        await asyncio.sleep(60)
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, flush_pending)
        except Exception as exc:
            logger.error("attendance flush failed: %s", exc)


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Green Power Gym — Biometric Bridge",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_device():
    if _device is None:
        raise HTTPException(503, "Device not configured — set DEVICE_HOST in .env")


# ── Status ─────────────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/health")
async def health():
    return {"status": "ok", "device_configured": _device is not None}


@app.get("/api/biometric/status", dependencies=[Depends(require_api_key)])
async def biometric_status():
    if _device is None:
        return {"connected": False, "error": "Device not configured (set DEVICE_HOST in .env)"}
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _device.get_status)


# ── Users ──────────────────────────────────────────────────────────────────────

@app.get("/api/biometric/users", dependencies=[Depends(require_api_key)])
async def biometric_users():
    _require_device()
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _device.get_users)
    except Exception as exc:
        raise HTTPException(502, f"Device error: {exc}")


@app.delete("/api/biometric/users/{uid}", dependencies=[Depends(require_api_key), Depends(rate_limit("delete_user", 1.0))])
async def biometric_delete_user(uid: int):
    _require_device()
    loop = asyncio.get_event_loop()
    ok, error = await loop.run_in_executor(None, _device.delete_user, uid)
    if not ok:
        raise HTTPException(500, f"Failed to delete user {uid}: {error}")
    return {"success": True, "uid": uid}


class AccessUpdate(BaseModel):
    group_id: str   # "0" = block  "1" = allow
    name:     str
    user_id:  str


@app.post("/api/biometric/users/{uid}/access", dependencies=[Depends(require_api_key), Depends(rate_limit("set_access", 1.0))])
async def biometric_set_access(uid: int, body: AccessUpdate):
    _require_device()
    if body.group_id not in ("0", "1"):
        raise HTTPException(400, "group_id must be '0' or '1'")
    loop = asyncio.get_event_loop()
    ok = await loop.run_in_executor(
        None, _device.set_user_group, uid, body.name, body.user_id, body.group_id,
    )
    if not ok:
        raise HTTPException(500, f"Failed to update access for uid {uid}")
    return {"success": True, "uid": uid, "group_id": body.group_id}


@app.post("/api/biometric/unlock", dependencies=[Depends(require_api_key), Depends(rate_limit("unlock", 5.0))])
async def biometric_unlock_door():
    _require_device()
    loop = asyncio.get_event_loop()
    ok, error = await loop.run_in_executor(None, _device.unlock_door, 3)
    if not ok:
        raise HTTPException(500, f"Failed to unlock door: {error}")
    return {"success": True, "seconds": 3}


# ── Attendance ─────────────────────────────────────────────────────────────────

@app.get("/api/biometric/attendance", dependencies=[Depends(require_api_key)])
async def biometric_attendance(limit: int = Query(default=500, le=5000)):
    _require_device()
    try:
        loop    = asyncio.get_event_loop()
        records = await loop.run_in_executor(None, _device.get_attendance)
        return records[:limit]
    except Exception as exc:
        raise HTTPException(502, f"Device error: {exc}")


@app.post("/api/biometric/sync", dependencies=[Depends(require_api_key)])
async def biometric_sync():
    """Pull attendance from device. Check-in punches only (punch=0)."""
    _require_device()
    loop = asyncio.get_event_loop()

    try:
        records, users = await asyncio.gather(
            loop.run_in_executor(None, _device.get_attendance),
            loop.run_in_executor(None, _device.get_users),
        )
    except Exception as exc:
        raise HTTPException(502, f"Device error: {exc}")

    name_map = {str(u["user_id"]): u["name"] for u in users}
    checkins = [
        {
            "user_id":   r["user_id"],
            "name":      name_map.get(r["user_id"], f"User {r['user_id']}"),
            "timestamp": r["timestamp"],
        }
        for r in records
        if int(r.get("punch", 0)) == 0
    ]

    return {
        "synced":  len(checkins),
        "skipped": len(records) - len(checkins),
        "total":   len(records),
        "message": f"Pulled {len(checkins)} check-in records from device",
        "records": checkins,
    }


# ── Live SSE stream ────────────────────────────────────────────────────────────

@app.get("/api/biometric/live", dependencies=[Depends(require_stream_key)])
async def biometric_live():
    if _punch_queue is None:
        raise HTTPException(503, "Device not configured")

    async def _stream():
        yield 'data: {"type":"connected"}\n\n'
        while True:
            try:
                record = await asyncio.wait_for(_punch_queue.get(), timeout=30.0)
                yield f"data: {json.dumps(record)}\n\n"
            except asyncio.TimeoutError:
                yield 'data: {"type":"ping"}\n\n'

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Push members → device ──────────────────────────────────────────────────────

@app.get("/api/biometric/push-status", dependencies=[Depends(require_api_key)])
async def biometric_push_status():
    """Compare CRM members against enrolled device users."""
    _require_device()
    loop         = asyncio.get_event_loop()
    device_users = await loop.run_in_executor(None, _device.get_users)

    crm = get_crm_client()
    members = (crm.table("members").select("id, full_name, mobile, member_id").order("full_name").execute()).data or []

    # Match only on exact device_user_id == CRM member_id (the human-readable id shown
    # in the member list). A name-based fallback would let a fingerprint enrolled
    # locally under a similar name silently inherit another member's access status.
    by_device_id = {u["user_id"]: u for u in device_users}

    result = []
    for m in members:
        du = by_device_id.get(str(m["member_id"]))
        result.append({
            "crm_id":     m["id"],
            "crm_name":   m["full_name"],
            "mobile":     m.get("mobile", ""),
            "member_id":  m["member_id"],
            "on_device":  du is not None,
            "device_uid": du["uid"] if du else None,
        })

    return result


@app.post("/api/biometric/push-members", dependencies=[Depends(require_api_key), Depends(rate_limit("push_members", 2.0))])
async def biometric_push_members(body: dict):
    """Enrol CRM members on device (user record only — member scans finger at device).
    The device's user_id is set to the member's human-readable member_id (e.g. "1001"),
    matching what's shown in the CRM member list — not the internal UUID, which is too
    long for the device's user_id field anyway."""
    _require_device()
    member_ids: list[str] = body.get("member_ids", [])
    if not member_ids:
        raise HTTPException(400, "member_ids is required")

    crm     = get_crm_client()
    members = (crm.table("members").select("id, full_name, member_id").in_("id", member_ids).execute()).data or []

    loop    = asyncio.get_event_loop()
    results = []
    for m in members:
        res = await loop.run_in_executor(None, _device.add_user, m["full_name"], str(m["member_id"]))
        results.append({
            "crm_id":  m["id"],
            "name":    m["full_name"],
            "success": res.get("success", False),
            "uid":     res.get("uid"),
            "error":   res.get("error"),
        })

    pushed = sum(1 for r in results if r["success"])
    return {"pushed": pushed, "failed": len(results) - pushed, "results": results}


# ── Access control sync ────────────────────────────────────────────────────────

@app.post("/api/biometric/access-sync", dependencies=[Depends(require_api_key)])
async def biometric_access_sync():
    if _access_sync is None:
        raise HTTPException(503, "Device not configured")
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _access_sync.run_sync)
    return result.to_dict()


@app.get("/api/biometric/access-status", dependencies=[Depends(require_api_key)])
async def biometric_access_status():
    if _access_sync is None:
        raise HTTPException(503, "Device not configured")
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _access_sync.get_status)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
        workers=1,
    )
