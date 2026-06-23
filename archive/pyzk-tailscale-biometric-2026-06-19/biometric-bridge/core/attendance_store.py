"""
Persists confirmed device punches into Supabase's attendance_logs table — turns
the live feed from a best-effort UI stream into an actual system of record.

If Supabase/the internet is unreachable at punch time, the record is appended
to a local on-disk queue and retried periodically (see flush_pending), so a
connectivity outage at the gym doesn't silently lose attendance history.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from database.client import get_crm_client

logger = logging.getLogger(__name__)

QUEUE_PATH = Path(__file__).resolve().parent.parent / "data" / "pending_attendance.jsonl"


def _resolve_member_uuid(device_user_id: str) -> str | None:
    try:
        device_id_int = int(device_user_id)
    except (TypeError, ValueError):
        return None
    crm = get_crm_client()
    res = crm.table("members").select("id").eq("member_id", device_id_int).limit(1).execute()
    rows = res.data or []
    return rows[0]["id"] if rows else None


def _insert(record: dict[str, Any]) -> bool:
    try:
        member_uuid = _resolve_member_uuid(record["user_id"])
        crm = get_crm_client()
        crm.table("attendance_logs").upsert(
            {
                "member_id":      member_uuid,
                "device_user_id": str(record["user_id"]),
                "punched_at":     record["timestamp"],
                "punch_type":     int(record.get("punch", 0)),
                "status":         int(record.get("status", 0)),
            },
            on_conflict="device_user_id,punched_at",
            ignore_duplicates=True,
        ).execute()
        return True
    except Exception as exc:
        logger.warning("attendance persist failed (will queue offline): %s", exc)
        return False


def _queue_offline(record: dict[str, Any]) -> None:
    QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(QUEUE_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def persist_punch(record: dict[str, Any]) -> None:
    """Called for every live punch. Never raises — the monitor thread must keep running
    regardless of whether Supabase is reachable."""
    try:
        if not _insert(record):
            _queue_offline(record)
    except Exception as exc:
        logger.error("persist_punch unexpected failure: %s", exc)


def flush_pending() -> int:
    """Retries anything queued while Supabase/internet was unreachable. Returns count flushed."""
    if not QUEUE_PATH.exists():
        return 0
    lines = [l for l in QUEUE_PATH.read_text(encoding="utf-8").splitlines() if l.strip()]
    if not lines:
        return 0

    remaining: list[str] = []
    flushed = 0
    for line in lines:
        try:
            record = json.loads(line)
            if _insert(record):
                flushed += 1
            else:
                remaining.append(line)
        except Exception:
            remaining.append(line)

    if remaining:
        QUEUE_PATH.write_text("\n".join(remaining) + "\n", encoding="utf-8")
    else:
        QUEUE_PATH.unlink(missing_ok=True)

    if flushed:
        logger.info("Flushed %d queued attendance record(s) to Supabase", flushed)
    return flushed
