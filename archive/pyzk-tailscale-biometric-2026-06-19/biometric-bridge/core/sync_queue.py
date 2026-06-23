"""
Outbound-only listener for device_sync_queue — processes member enroll/remove
requests the CRM has queued (auto-push on create, auto-remove on delete), with
automatic retry. The CRM only ever INSERTs a row; this listener (running inside
the bridge, connecting OUT to Supabase) picks it up — unlike the old direct-HTTP
push, this direction needs zero inbound reachability, and failures are no longer
silent: every attempt is recorded with a status and a result message.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import acreate_client

from database.client import get_crm_client

logger = logging.getLogger(__name__)

RETRY_INTERVAL_SECONDS = 300   # sweep for failed/missed rows every 5 minutes
MAX_ATTEMPTS = 10


def _process(device, row: dict[str, Any]) -> tuple[bool, str]:
    op = row.get("operation")
    member_id = str(row.get("member_id"))

    if op == "enroll":
        name = row.get("full_name") or f"Member {member_id}"
        res = device.add_user(name, member_id)
        if res.get("success"):
            return True, "already enrolled" if res.get("already_enrolled") else "enrolled"
        return False, str(res.get("error", "unknown error"))

    if op == "remove":
        users = device.get_users()
        match = next((u for u in users if str(u["user_id"]) == member_id), None)
        if match is None:
            return True, "not on device, nothing to remove"
        ok, error = device.delete_user(match["uid"])
        return ok, error or "removed"

    return False, f"unknown operation: {op}"


def _complete(row_id: str, success: bool, message: str, attempts: int) -> None:
    crm = get_crm_client()
    crm.table("device_sync_queue").update({
        "status": "done" if success else "failed",
        "result": message,
        "attempts": attempts,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", row_id).execute()


def _handle_row(device, row: dict[str, Any]) -> None:
    attempts = int(row.get("attempts") or 0) + 1
    try:
        success, message = _process(device, row)
    except Exception as exc:
        success, message = False, str(exc)

    if success:
        logger.info("sync_queue: %s succeeded: %s", row.get("id"), message)
    else:
        logger.warning("sync_queue: %s failed (attempt %d/%d): %s", row.get("id"), attempts, MAX_ATTEMPTS, message)

    _complete(row.get("id"), success, message, attempts)


async def _retry_sweep(device) -> None:
    """Catches two cases the live Realtime subscription can't: rows that failed
    and need retrying, and rows the bridge simply missed because it was offline
    when they were inserted (Realtime has no replay — a missed INSERT is gone)."""
    while True:
        await asyncio.sleep(RETRY_INTERVAL_SECONDS)
        try:
            crm = get_crm_client()

            failed = (
                crm.table("device_sync_queue").select("*")
                .eq("status", "failed").lt("attempts", MAX_ATTEMPTS).execute()
            ).data or []

            stale_cutoff = (datetime.now(timezone.utc) - timedelta(seconds=RETRY_INTERVAL_SECONDS)).isoformat()
            missed_pending = (
                crm.table("device_sync_queue").select("*")
                .eq("status", "pending").lt("created_at", stale_cutoff).execute()
            ).data or []

            loop = asyncio.get_event_loop()
            for row in failed + missed_pending:
                await loop.run_in_executor(None, _handle_row, device, row)
        except Exception as exc:
            logger.error("sync_queue retry sweep failed: %s", exc)


async def run_sync_queue_listener(device) -> None:
    """Subscribes to new device_sync_queue rows via Supabase Realtime, plus a
    periodic sweep for anything that failed or was missed while offline."""
    url = os.getenv("CRM_SUPABASE_URL", "")
    key = os.getenv("CRM_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        logger.error("device_sync_queue listener disabled — CRM_SUPABASE_URL/CRM_SUPABASE_SERVICE_KEY not set")
        return

    asyncio.create_task(_retry_sweep(device))

    client = await acreate_client(url, key)
    await client.realtime.connect()

    channel = client.channel("device_sync_queue_listener")

    def _on_insert(payload: dict[str, Any]) -> None:
        row = (payload.get("data", {}) or {}).get("record") or {}
        if row.get("status") != "pending":
            return
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _handle_row, device, row)

    channel.on_postgres_changes(
        "INSERT",
        schema="public",
        table="device_sync_queue",
        callback=_on_insert,
    )
    await channel.subscribe()

    logger.info("device_sync_queue listener ready")
    await client.realtime.listen()
