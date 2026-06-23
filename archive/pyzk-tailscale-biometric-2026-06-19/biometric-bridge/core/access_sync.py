"""
Biometric access control sync — ties CRM membership expiry to device access groups.

Logic:
  - Active membership (status=active AND expiry >= today)  → group_id "1" (allowed)
  - Expired / no membership                                → group_id "0" (blocked)
  - Device user not matched to any CRM member             → untouched (staff / owner)

Runs automatically at midnight daily and on startup.
Can also be triggered manually via POST /api/biometric/access-sync.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from database.client import get_crm_client

logger = logging.getLogger(__name__)


def _is_active(expiry_str: str, status: str) -> bool:
    if status != "active":
        return False
    try:
        return date.fromisoformat(expiry_str[:10]) >= date.today()
    except Exception:
        return False


@dataclass
class SyncResult:
    blocked:    list[str] = field(default_factory=list)
    unblocked:  list[str] = field(default_factory=list)
    already_ok: int = 0
    unmatched:  int = 0
    errors:     list[str] = field(default_factory=list)
    ran_at:     str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "blocked":    self.blocked,
            "unblocked":  self.unblocked,
            "already_ok": self.already_ok,
            "unmatched":  self.unmatched,
            "errors":     self.errors,
            "ran_at":     self.ran_at,
        }


class AccessSyncManager:

    def __init__(self, device) -> None:
        self._device = device

    def _fetch_crm_data(self):
        crm = get_crm_client()

        # member_id here is the member's human-readable id (e.g. 1001) — that's what's
        # written to the device's user_id field on enrollment, not the internal `id` UUID.
        members = (crm.table("members").select("id, full_name, member_id").execute()).data or []

        memberships = (
            crm.table("memberships")
            .select("member_id, status, expiry_date")
            .execute()
        ).data or []

        expiry_by_mid: dict[str, str] = {}
        status_by_mid: dict[str, str] = {}
        for m in memberships:
            mid = m["member_id"]
            exp = m.get("expiry_date", "")
            if not expiry_by_mid.get(mid) or exp > expiry_by_mid[mid]:
                expiry_by_mid[mid] = exp
                status_by_mid[mid] = m.get("status", "")

        return members, expiry_by_mid, status_by_mid

    def _match(self, du, by_member_id):
        # Exact match only — device_user_id must equal the CRM member_id. A name-based
        # fallback would let a fingerprint enrolled locally under a similar name silently
        # inherit another member's access status.
        return by_member_id.get(du["user_id"])

    def run_sync(self) -> SyncResult:
        result = SyncResult()
        try:
            device_users                      = self._device.get_users()
            members, expiry_by_mid, status_by_mid = self._fetch_crm_data()
            by_member_id = {str(m["member_id"]): m for m in members}
        except Exception as exc:
            logger.error("access_sync fetch failed: %s", exc)
            result.errors.append(str(exc))
            return result

        for du in device_users:
            crm_member = self._match(du, by_member_id)
            if crm_member is None:
                result.unmatched += 1
                logger.warning(
                    "UNMATCHED device user uid=%s user_id=%s name=%r — no CRM member with this id; access left untouched",
                    du.get("uid"), du.get("user_id"), du.get("name"),
                )
                continue

            mid        = crm_member["id"]
            expiry     = expiry_by_mid.get(mid, "")
            status     = status_by_mid.get(mid, "")
            want_group = "1" if _is_active(expiry, status) else "0"
            cur_group  = du.get("group_id", "1")

            if cur_group == want_group:
                result.already_ok += 1
                continue

            ok = self._device.set_user_group(
                uid=du["uid"], name=du["name"],
                user_id=du["user_id"], group_id=want_group,
            )
            if ok:
                if want_group == "0":
                    result.blocked.append(du["name"])
                    logger.info("BLOCKED %s (expired %s)", du["name"], expiry)
                else:
                    result.unblocked.append(du["name"])
                    logger.info("UNBLOCKED %s (renewed)", du["name"])
            else:
                result.errors.append(f"Failed to update {du['name']}")

        logger.info(
            "access_sync — blocked=%d unblocked=%d ok=%d unmatched=%d errors=%d",
            len(result.blocked), len(result.unblocked),
            result.already_ok, result.unmatched, len(result.errors),
        )
        return result

    def get_status(self) -> list[dict[str, Any]]:
        try:
            device_users                      = self._device.get_users()
            members, expiry_by_mid, status_by_mid = self._fetch_crm_data()
            by_member_id = {str(m["member_id"]): m for m in members}
        except Exception as exc:
            logger.error("access_sync.get_status failed: %s", exc)
            return []

        rows = []
        for du in device_users:
            crm_member = self._match(du, by_member_id)
            group_id   = du.get("group_id", "1")

            if crm_member is None:
                rows.append({
                    "device_uid": du["uid"], "device_user_id": du["user_id"],
                    "device_name": du["name"], "group_id": group_id,
                    "crm_member_id": None, "crm_name": None,
                    "membership_status": None, "expiry_date": None,
                    "access": "unmanaged",
                })
                continue

            mid    = crm_member["id"]
            expiry = expiry_by_mid.get(mid)
            status = status_by_mid.get(mid, "none")

            rows.append({
                "device_uid": du["uid"], "device_user_id": du["user_id"],
                "device_name": du["name"], "group_id": group_id,
                "crm_member_id": mid, "crm_name": crm_member["full_name"],
                "membership_status": status if expiry else "none",
                "expiry_date": expiry,
                "access": "allowed" if _is_active(expiry or "", status) else "blocked",
            })

        return sorted(rows, key=lambda r: r["device_name"])
