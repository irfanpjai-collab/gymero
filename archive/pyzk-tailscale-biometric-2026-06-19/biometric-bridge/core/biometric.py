"""
ESSL K90 Pro / ZKTeco fingerprint device manager — TCP port 4370.
Uses pyzk for all device communication.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class BiometricDevice:
    """
    Manages a single ZKTeco/ESSL device over TCP/IP.
    Thread safety: all device I/O is serialised through self._lock.
    The live monitor runs in a daemon thread, polling every 10 s.
    """

    def __init__(self, host: str, port: int = 4370, timeout: int = 10) -> None:
        self._host    = host
        self._port    = port
        self._timeout = timeout
        self._lock    = threading.Lock()

        self._monitor_thread: Optional[threading.Thread] = None
        self._monitor_stop   = threading.Event()
        self._on_punch: Optional[Callable[[dict[str, Any]], None]] = None

    def _zk(self):
        from zk import ZK
        return ZK(
            self._host,
            port=self._port,
            timeout=self._timeout,
            password=0,
            force_udp=False,
            ommit_ping=True,
        )

    def _connect(self):
        return self._zk().connect()

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_status(self) -> dict[str, Any]:
        try:
            with self._lock:
                conn   = self._connect()
                serial = conn.get_serialnumber()
                conn.disconnect()
            return {"connected": True, "serial": serial, "host": self._host}
        except Exception as exc:
            logger.warning("Biometric status check failed: %s", exc)
            return {"connected": False, "error": str(exc), "host": self._host}

    def get_users(self) -> list[dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                conn.disable_device()
                users = conn.get_users()
                return [
                    {
                        "uid":      int(u.uid),
                        "user_id":  str(u.user_id),
                        "name":     u.name or f"User {u.user_id}",
                        "privilege": int(u.privilege),
                        "group_id": str(getattr(u, "group_id", "1") or "1"),
                    }
                    for u in users
                ]
            finally:
                try: conn.enable_device()
                except Exception: pass
                conn.disconnect()

    def add_user(self, name: str, user_id: str) -> dict[str, Any]:
        """Create a user record on the device (name + ID only, no fingerprint template).
        Idempotent: if user_id is already enrolled, returns the existing uid instead
        of creating a duplicate device slot under the same member id."""
        safe_name = name[:24]
        with self._lock:
            conn = self._connect()
            try:
                conn.disable_device()
                existing = conn.get_users()

                already = next((u for u in existing if str(u.user_id) == str(user_id)), None)
                if already is not None:
                    logger.info("add_user skipped — user_id=%s already enrolled as uid=%d", user_id, already.uid)
                    return {"success": True, "uid": int(already.uid), "already_enrolled": True}

                uid = max((u.uid for u in existing), default=0) + 1
                conn.set_user(
                    uid=uid,
                    name=safe_name,
                    privilege=0,
                    password='',
                    group_id='1',
                    user_id=user_id,
                )
                logger.info("add_user uid=%d name=%r user_id=%s", uid, safe_name, user_id)
                return {"success": True, "uid": uid, "already_enrolled": False}
            except Exception as exc:
                logger.error("add_user failed name=%r: %s", safe_name, exc)
                return {"success": False, "error": str(exc)}
            finally:
                try: conn.enable_device()
                except Exception: pass
                conn.disconnect()

    def delete_user(self, uid: int) -> tuple[bool, str]:
        with self._lock:
            conn = self._connect()
            try:
                # Do NOT call disable_device() before delete — many ZKTeco
                # firmware versions reject CMD_USER_DEL while disabled.
                conn.delete_user(uid=uid)
                conn.refresh_data()   # commit deletion to device storage
                logger.info("delete_user uid=%d OK", uid)
                return True, ""
            except Exception as exc:
                logger.error("delete_user uid=%d failed: %s", uid, exc)
                return False, str(exc)
            finally:
                conn.disconnect()

    def set_user_group(self, uid: int, name: str, user_id: str, group_id: str) -> bool:
        """Change access group without touching the fingerprint template.
        group_id '0' = blocked, '1' = allowed."""
        with self._lock:
            conn = self._connect()
            try:
                conn.disable_device()
                conn.set_user(
                    uid=uid, name=name, privilege=0,
                    password='', group_id=group_id, user_id=user_id,
                )
                conn.refresh_data()
                logger.info("set_user_group uid=%d name=%r group=%s", uid, name, group_id)
                return True
            except Exception as exc:
                logger.error("set_user_group failed uid=%d: %s", uid, exc)
                return False
            finally:
                try: conn.enable_device()
                except Exception: pass
                conn.disconnect()

    def unlock_door(self, seconds: int = 3) -> tuple[bool, str]:
        with self._lock:
            conn = self._connect()
            try:
                conn.unlock(time=seconds)
                logger.info("Door unlocked for %d s", seconds)
                return True, ""
            except Exception as exc:
                logger.error("unlock_door failed: %s", exc)
                return False, str(exc)
            finally:
                conn.disconnect()

    def get_attendance(self, since: Optional[datetime] = None) -> list[dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                conn.disable_device()
                logs = conn.get_attendance()
            finally:
                try: conn.enable_device()
                except Exception: pass
                conn.disconnect()

        result = []
        for a in logs:
            if since and a.timestamp <= since:
                continue
            result.append({
                "user_id":   str(a.user_id),
                "timestamp": a.timestamp.isoformat(),
                "status":    int(a.status),
                "punch":     int(a.punch),  # 0=check-in 1=check-out
            })

        return sorted(result, key=lambda x: x["timestamp"], reverse=True)

    # ── Live monitor ───────────────────────────────────────────────────────────

    def start_monitor(self, on_punch: Callable[[dict[str, Any]], None]) -> None:
        if self._monitor_thread and self._monitor_thread.is_alive():
            return
        self._on_punch = on_punch
        self._monitor_stop.clear()
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop, daemon=True, name="bio-monitor",
        )
        self._monitor_thread.start()
        logger.info("Biometric live monitor started → %s:%d", self._host, self._port)

    def stop_monitor(self) -> None:
        self._monitor_stop.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=8)

    def _monitor_loop(self) -> None:
        baseline: Optional[datetime] = None
        first_run = True

        while not self._monitor_stop.is_set():
            try:
                records = self.get_attendance(since=baseline)
                if records:
                    latest = datetime.fromisoformat(records[0]["timestamp"])
                    if not first_run and self._on_punch:
                        for rec in records:
                            ts = datetime.fromisoformat(rec["timestamp"])
                            if baseline is None or ts > baseline:
                                try:
                                    self._on_punch(rec)
                                except Exception: pass
                    baseline  = latest
                    first_run = False
            except Exception as exc:
                logger.warning("Biometric monitor poll failed: %s", exc)

            self._monitor_stop.wait(10)
