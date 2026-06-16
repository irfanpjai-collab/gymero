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
import unicodedata
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

from core.biometric   import BiometricDevice
from core.access_sync import AccessSyncManager
from database.client  import get_crm_client

# ── Global state ───────────────────────────────────────────────────────────────

_device:      BiometricDevice | None = None
_access_sync: AccessSyncManager | None = None
_punch_queue: asyncio.Queue[dict[str, Any]] | None = None


def _enqueue_punch(record: dict[str, Any]) -> None:
    if _punch_queue is None:
        return
    try:
        _punch_queue.put_nowait(record)
    except Exception:
        pass


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

        asyncio.create_task(_nightly_access_sync())

    yield

    if _device:
        _device.stop_monitor()
    logger.info("Biometric bridge shutdown")


async def _nightly_access_sync() -> None:
    """Run access sync 30 s after startup, then nightly at 00:05."""
    await asyncio.sleep(30)
    _run_sync_safe()

    while True:
        now      = datetime.now()
        next_run = (now + timedelta(days=1)).replace(hour=0, minute=5, second=0, microsecond=0)
        await asyncio.sleep((next_run - now).total_seconds())
        _run_sync_safe()


def _run_sync_safe() -> None:
    try:
        result = _access_sync.run_sync()
        logger.info("Access sync — %s", result.to_dict())
    except Exception as exc:
        logger.error("Access sync failed: %s", exc)


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Green Power Gym — Biometric Bridge",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.get("/api/biometric/status")
async def biometric_status():
    if _device is None:
        return {"connected": False, "error": "Device not configured (set DEVICE_HOST in .env)"}
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _device.get_status)


# ── Users ──────────────────────────────────────────────────────────────────────

@app.get("/api/biometric/users")
async def biometric_users():
    _require_device()
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _device.get_users)
    except Exception as exc:
        raise HTTPException(502, f"Device error: {exc}")


@app.delete("/api/biometric/users/{uid}")
async def biometric_delete_user(uid: int):
    _require_device()
    loop = asyncio.get_event_loop()
    ok   = await loop.run_in_executor(None, _device.delete_user, uid)
    if not ok:
        raise HTTPException(500, "Failed to delete user from device")
    return {"success": True, "uid": uid}


# ── Attendance ─────────────────────────────────────────────────────────────────

@app.get("/api/biometric/attendance")
async def biometric_attendance(limit: int = Query(default=500, le=5000)):
    _require_device()
    try:
        loop    = asyncio.get_event_loop()
        records = await loop.run_in_executor(None, _device.get_attendance)
        return records[:limit]
    except Exception as exc:
        raise HTTPException(502, f"Device error: {exc}")


@app.post("/api/biometric/sync")
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

@app.get("/api/biometric/live")
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

def _norm_name(name: str) -> str:
    n = unicodedata.normalize("NFD", name)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return " ".join(n.lower().split())


@app.get("/api/biometric/push-status")
async def biometric_push_status():
    """Compare CRM members against enrolled device users."""
    _require_device()
    loop         = asyncio.get_event_loop()
    device_users = await loop.run_in_executor(None, _device.get_users)

    crm = get_crm_client()
    members = (crm.table("members").select("id, full_name, mobile").order("full_name").execute()).data or []

    by_uid  = {u["user_id"]: u for u in device_users}
    by_name = {_norm_name(u["name"]): u for u in device_users}

    result = []
    for m in members:
        du = by_uid.get(m["id"]) or by_name.get(_norm_name(m["full_name"]))
        result.append({
            "crm_id":    m["id"],
            "crm_name":  m["full_name"],
            "mobile":    m.get("mobile", ""),
            "on_device": du is not None,
            "device_uid": du["uid"] if du else None,
        })

    return result


@app.post("/api/biometric/push-members")
async def biometric_push_members(body: dict):
    """Enrol CRM members on device (user record only — member scans finger at device)."""
    _require_device()
    member_ids: list[str] = body.get("member_ids", [])
    if not member_ids:
        raise HTTPException(400, "member_ids is required")

    crm     = get_crm_client()
    members = (crm.table("members").select("id, full_name").in_("id", member_ids).execute()).data or []

    loop    = asyncio.get_event_loop()
    results = []
    for m in members:
        res = await loop.run_in_executor(None, _device.add_user, m["full_name"], m["id"])
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

@app.post("/api/biometric/access-sync")
async def biometric_access_sync():
    if _access_sync is None:
        raise HTTPException(503, "Device not configured")
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _access_sync.run_sync)
    return result.to_dict()


@app.get("/api/biometric/access-status")
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
