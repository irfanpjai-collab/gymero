# Restoring the pyzk + Tailscale biometric system

This archive is a snapshot of the working `pyzk`-based biometric integration, taken
2026-06-19, right before switching to ADMS. Everything here was tested, hardened,
and working as of this date — auth-gated bridge, attendance offline-retry queue,
idempotent device enrollment, rate-limited endpoints, audited device-control
actions, an outbound-only sync queue for member push/remove.

Use this if ADMS testing against the real device doesn't pan out and you want to
go back to the local-bridge approach.

## What this archive contains

- `biometric-bridge/` — the full Python FastAPI bridge (minus `__pycache__`)
- `biometric-bridge.spec` — PyInstaller spec for building `biometric-bridge.exe`
- `biometric-bridge/.env.example` — template only; **the real `.env` with actual
  secrets/device IP was deliberately not archived** — recreate it from this
  template plus your own values
- `device_sync_queue.sql` — the outbound-only member-sync queue table
- `src-snapshot/biometric.ts` — the original `src/app/actions/biometric.ts`
- `src-snapshot/biometric-page.tsx` — the original `/biometric` page UI
- `electron-main.js` — the Electron app's `main.js` as it was, including the
  bridge-spawning logic
- `TEST_REMOTE_ACCESS.md` — the Tailscale Funnel testing checklist

## Restore steps

1. **Bridge folder**: copy `biometric-bridge/` from this archive back to the repo
   root (it replaces nothing, since ADMS doesn't use that folder name).
2. **`biometric-bridge.spec`**: copy back to repo root.
3. **Bridge env**: copy `.env.example` to `biometric-bridge/.env`, then fill in
   `DEVICE_HOST`, `BRIDGE_API_KEY`, `BRIDGE_STREAM_KEY`, `CRM_SUPABASE_URL`,
   `CRM_SUPABASE_SERVICE_KEY`, `BRIDGE_ALLOWED_ORIGINS` for real.
4. **SQL**: re-run `device_sync_queue.sql` in the Supabase SQL editor (it's
   additive — safe even if `adms.sql` from the new system is also still present).
5. **`src/app/actions/biometric.ts`**: copy `src-snapshot/biometric.ts` back to
   that exact path.
6. **`src/app/(dashboard)/(fingerprint)/biometric/page.tsx`**: copy
   `src-snapshot/biometric-page.tsx` back to that exact path (overwrites
   whatever ADMS-based UI is there).
7. **`src/app/actions/members.ts`**: change `pushNewMembersToDevice` and
   `removeMemberFromDevice` back to inserting into `device_sync_queue` instead
   of whatever ADMS table they were changed to (compare against this archive's
   `biometric.ts` for the original HTTP-based calls, or check git history for
   the exact diff — these two functions are small and self-contained).
8. **`electron/main.js`**: re-add the bridge-spawning block from
   `electron-main.js` in this archive — specifically the `BRIDGE_DIR`/
   `BRIDGE_EXE`/`BRIDGE_PY` constants, the `startBridge()` function, the
   `bridgeProc` tray status lines, and the `startBridge()` call in
   `app.whenReady()`.
9. **`.env.local`**: re-add `AI_MONITOR_URL`, `NEXT_PUBLIC_AI_MONITOR_URL`,
   `BRIDGE_API_KEY`, `NEXT_PUBLIC_BRIDGE_STREAM_KEY` (generate fresh keys or
   reuse old ones if you still have them recorded elsewhere — they were not
   archived here for security reasons).
10. **`eslint.config.mjs`**: re-add `"biometric-bridge/**"` to the
    `globalIgnores` array.
11. **`.gitignore`**: re-add the `biometric-bridge` section (`__pycache__`,
    `*.spec`, `venv`, `data`).
12. **Tailscale Funnel**: re-follow `TEST_REMOTE_ACCESS.md` in this archive to
    re-establish the tunnel on whichever PC will run the bridge.
13. Rebuild `biometric-bridge.exe` (`pyinstaller biometric-bridge.spec`) and the
    Electron installer before shipping to the gym PC again.

## What you do NOT need to touch

`attendance_logs`, `enable_realtime_attendance.sql`, `biometric_audit_log.sql`,
`PunchNotifier.tsx`, and the Document Center's attendance export were never
removed in the first place — they're backend-agnostic and kept working
throughout the ADMS transition. No action needed on those regardless of which
system you end up running.
