# Production Setup — Green Power Gym CRM

Full checklist from "code in VS Code" to "actually live." Work through it in order — later steps depend on earlier ones. Check items off as you go.

---

## 1. Push the code

- [ ] Commit all current changes.
- [ ] `git push` to `origin/main` (GitHub repo: `irfanpjai-collab/gymero`).

## 2. Deploy the web app to Vercel

- [ ] Go to vercel.com → **Add New Project** → import `irfanpjai-collab/gymero` from GitHub.
- [ ] Before or right after the first deploy, set these Environment Variables in Vercel (values are in your local `.env.local` — copy them from there, don't retype):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → Settings → API (used by the ADMS API routes and the Sheets backup cron)
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID` — see step 4
  - `CRON_SECRET` — already generated, copy from `.env.local`
- [ ] Deploy. You'll get a `*.vercel.app` URL (or your custom domain if you add one).

No bridge-related env vars needed anymore — the biometric device talks to your Vercel app's own API routes directly (see step 5), there's no separate local service to point at.

## 3. Lock down the database

- [ ] Supabase dashboard → SQL Editor → paste and run `supabase/security_hardening.sql`. **Don't skip this — without it, RLS is still wide open.**
- [ ] Then run, in order: `supabase/attendance_log.sql`, `supabase/enable_realtime_attendance.sql`, `supabase/biometric_audit_log.sql`, `supabase/adms.sql`.
- [ ] Authentication → Users → create your real staff logins (signup is disabled in the app now, so this is the only way to create accounts).
- [ ] For each new user, add a matching row in `user_profiles` with the correct `role` (`admin` / `receptionist` / `coach`).
- [ ] Confirm you can log in to the deployed Vercel URL with one of these accounts.

## 4. Google Sheets weekly backup

- [ ] [Google Cloud Console](https://console.cloud.google.com) → create/pick a project → enable the **Google Sheets API**.
- [ ] IAM & Admin → Service Accounts → create one → Keys tab → Add key → JSON → download.
- [ ] Create a new Google Sheet → Share it with the service account's email (from the JSON) as **Editor**.
- [ ] Copy the spreadsheet ID from its URL → set as `GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID` in Vercel.
- [ ] Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (from the JSON) in Vercel.
- [ ] Redeploy so the new env vars take effect.
- [ ] Test manually (don't wait for Sunday):
  ```
  curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/cron/backup-to-sheets
  ```
  Should return `{"ok":true,...}` and tabs (`members`, `payments`, etc. + `Backup Log`) should appear in the sheet.

## 5. Biometric device setup — ADMS (no local PC, no tunnel)

**The pyzk/Tailscale local-bridge system has been retired** — archived at `archive/pyzk-tailscale-biometric-2026-06-19/` (zipped copy + `RESTORE_INSTRUCTIONS.md` at repo root, in case it's ever needed again). The device now pushes data and pulls commands directly from your Vercel app's own API routes — nothing local to install, run, or keep online.

- [ ] On the physical device: `Menu → Comm → Cloud Server Setting` (wording varies by firmware).
- [ ] Server Address: your Vercel domain (no `https://` prefix, just the hostname).
- [ ] Server Port: `443` if the firmware supports HTTPS, otherwise whatever HTTP port it offers.
- [ ] Set the heartbeat/transfer interval as low as the firmware allows — there's no real downside on a mains-powered, networked device, and it directly controls how fast `enroll`/`block`/`unblock`/`remove` commands actually reach the device.
- [ ] **This is the part most likely to need adjustment once you actually test it** — the exact handshake response and command-string format (`src/app/api/adms/cdata/route.ts`, `src/app/api/adms/getrequest/route.ts`) are the commonly-documented ADMS shape, not verified against this specific firmware. If commands aren't landing, check the bridge's — sorry, the *route's* — response against what the device actually expects and adjust.
- [ ] Confirm: a real fingerprint scan shows up in the CRM's Biometric page → Attendance tab, and a queued Enroll/Block/Unblock from the Members tab flips from "Pending" to "Done" in the Command Queue tab once the device next checks in.

## 6. Loose ends

- [ ] Rotate the old AI-monitor Supabase project's `service_role` key (separate project, `xlqojdsdsasatdhhjcuk` — unrelated to your CRM database, but the leaked-scope key is still live until you revoke it there).
- [ ] If you ever need to fall back to the local-bridge approach, see `archive/pyzk-tailscale-biometric-2026-06-19/RESTORE_INSTRUCTIONS.md`.

---

## Quick reference — what each secret is for

| Variable | Where it's used | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | CRM ↔ Supabase | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ADMS API routes (`src/app/api/adms/*`, no device session to check a role against) + Sheets backup cron | Supabase dashboard → Settings → API |
| `CRON_SECRET` | Protects the weekly backup endpoint | Already generated, in `.env.local` |
| `GOOGLE_SERVICE_ACCOUNT_*` | Sheets backup cron → Google Sheets API | Google Cloud Console service account JSON |
| `GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID` | Which sheet gets the backup | The sheet's own URL |

No bridge/Tailscale-related variables anymore — the ADMS routes live inside the same Next.js app, so there's no separate service address to configure.
