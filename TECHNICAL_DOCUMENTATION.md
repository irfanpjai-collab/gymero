# Green Power Gym — Technical Documentation

A gym CRM/ERP built on Next.js App Router + Supabase, covering members, memberships/renewals, payments, personal training, coaches, payroll/expenses, accounting, reporting, WhatsApp reminders, a Google Sheets integration, and a biometric (fingerprint) attendance/access-control integration with a physical eSSL K30 Pro device over the ADMS protocol.

Production: `https://greenpowergym.vercel.app` (Vercel project `greenpowergym`, scope `irfanpjai-9584s-projects`).

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, `class-variance-authority`, `tailwind-merge` |
| UI primitives | Radix UI (dialog, select, tabs, dropdown, popover, etc.) |
| Charts | Recharts |
| Database | Supabase (Postgres + PostgREST + Realtime + Auth) |
| Auth | Supabase Auth (email/password), cookie-based sessions via `@supabase/ssr` |
| Hosting | Vercel (standalone output), Vercel Cron for scheduled jobs |
| Spreadsheets | Google Sheets API v4, custom minimal JWT client (no `googleapis` SDK) |
| Dates | `date-fns` |
| Excel export | `xlsx` (SheetJS) |
| State | Mostly server state via Server Components/Server Actions; `zustand` present but not load-bearing for core CRM flows |

Key `package.json` scripts: `dev`, `build`, `start`, `lint`.

---

## 2. Architecture

### 2.1 Route groups

```
src/app/
├── (auth)/               login, signup — no sidebar chrome
├── (dashboard)/
│   ├── (crm)/            all CRM pages — dashboard, members, memberships,
│   │                     payments, coaches, salary, expenses, accounts,
│   │                     whatsapp, reports, documents
│   ├── (fingerprint)/    biometric (device attendance/access page)
│   └── (system)/         settings
├── api/
│   ├── adms/             device-facing endpoints (cdata, getrequest, devicecmd)
│   └── cron/             Vercel Cron targets (sync-form-intake, backup-to-sheets)
└── actions/              all Server Actions ('use server'), one file per domain
```

Route groups `(crm)`, `(fingerprint)`, `(system)` share the dashboard layout (sidebar + topbar) but don't affect the URL path.

### 2.2 Server Actions pattern

Every mutation and most reads go through a `'use server'` file in `src/app/actions/`. The consistent shape:

```ts
export async function doThing(...): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin', 'receptionist'])
    const supabase = await createClient()
    // ...mutate...
    revalidateTag('members', {})
    revalidatePath('/members')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
```

- Never throws to the client — always returns `{ error }` on failure, so UI code checks `result.error` rather than try/catching.
- `requireRole()` (`src/lib/auth.ts`) is defense-in-depth on top of RLS: fetches the caller's `user_profiles.role` and throws `AuthorizationError` if not in the allowed list. Read-only actions (`getX`) generally skip this and rely on RLS's "any authenticated user can SELECT" policies.
- Read functions catch internally and return an empty/default value (`[]`, `null`, a zeroed summary object) rather than throwing, so a page never hard-crashes on a query failure — it just renders empty.

### 2.3 Supabase client variants (`src/lib/supabase/`)

| File | Client | Use |
|---|---|---|
| `server.ts` | `createServerClient` (cookie-based) | Server Components & Server Actions — respects the logged-in user's session and RLS |
| `client.ts` | `createBrowserClient` | Client Components (login form, Realtime subscriptions) |
| `admin.ts` | `createClient` with the **service-role key** | Bypasses RLS entirely. Reserved for background jobs with no logged-in user: `cached-queries.ts`, cron routes, ADMS device routes, Sheets sync. Comment in the file explicitly warns never to import it into request-path code that handles user input. |

### 2.4 Caching strategy

`src/lib/cached-queries.ts` wraps admin-client reads in `unstable_cache` with a 5-minute `revalidate` and tags (`members`, `payments`, `settings`). This is what backs the Dashboard and cached Members list. Mutations call `revalidateTag(...)`/`revalidatePath(...)` to bust these on write.

**Caveat:** direct database writes that bypass the app (e.g. raw SQL/REST truncation, a manual Supabase dashboard edit) do **not** trigger revalidation — those cached views only catch up after the 5-minute window expires, or on the next write that goes through the app.

### 2.5 Middleware / edge proxy (`src/proxy.ts`)

- Refreshes the Supabase session cookie on every request.
- Passes through **without auth-redirecting** any `/api/*` or `/iclock/*` path — cron callers and the physical ADMS device poll these and would break if redirected to an HTML `/login` page.
- Otherwise: redirects unauthenticated users to `/login`, and redirects already-authenticated users away from `/login`/`/signup` to `/dashboard`.

### 2.6 `next.config.ts` notes

- `output: 'standalone'`.
- Rewrites `/iclock/cdata(.aspx)`, `/iclock/getrequest(.aspx)`, `/iclock/devicecmd(.aspx)` → the corresponding `/api/adms/*` routes, because the device firmware is IIS/ASP.NET-heritage and may request either suffix.
- Security headers applied globally: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS.
- Turbopack root pinned explicitly (a stray `package-lock.json` in a parent folder was confusing workspace-root detection).

---

## 3. Database Schema

All DDL lives in `supabase/*.sql`, applied in this order (each file documents itself as "safe to re-run"):

1. `schema.sql` — base tables
2. `salary_and_seed.sql` — `staff_salaries` + (historical) dev seed data
3. `security_hardening.sql` — role-aware RLS, `current_user_role()`, constraints, `one_active_membership_per_member` unique index
4. `accounts_integrity_fixes.sql` — member_id sequence, soft delete, `amount_note`
5. `attendance_log.sql`, `adms.sql`, `adms_fingerprints.sql` — biometric
6. `app_settings.sql` — grace period setting
7. `pt_feature.sql` — Personal Training
8. `expenses.sql`, `membership_expiry_edits.sql` — accounting/audit additions
9. `biometric_audit_log.sql` — device-action audit trail

### 3.1 Table reference

| Table | Purpose | Key columns / constraints |
|---|---|---|
| `user_profiles` | Staff accounts, 1:1 with `auth.users` | `role`: `admin` \| `receptionist` \| `coach`. Self-role-escalation blocked by trigger. |
| `membership_plans` | Regular gym plans | `duration_months`, `fee` (CHECK `fee > 0`) |
| `members` | Gym members | `member_id` INTEGER, unique, **DB-sequence default** (`member_id_seq`) — device PIN. `deleted_at` for soft delete (admin-only via trigger). |
| `memberships` | One row per membership period (new row per renewal, never mutated except by explicit expiry-edit) | `status`: active/expired/cancelled. **Unique index `one_active_membership_per_member` — at most one `status='active'` row per member, DB-enforced.** `amount_note` flags price ≠ plan fee. `payment_pending` for "today, not yet paid" entries. |
| `payments` | Every recorded transaction | `payment_type`: membership/admission/personal_training. `receipt_number` auto-generated (`GPG-YYYYMM-NNNN` via trigger + `receipt_seq`). `membership_id` / `pt_membership_id` are optional FKs (SET NULL) — only one is normally populated per row. |
| `coaches` | Trainers | `coach_id` auto (`C001`, `C002`, … via sequence) |
| `coach_members` | Coach ↔ member assignment (many-to-many) | Unique `(coach_id, member_id)` |
| `pt_plans` | Personal Training plans — **fully separate from `membership_plans`** | Same shape as membership plans |
| `pt_memberships` | PT package instances | Tied to a `coach_id`. No auto-expire-on-new-package logic — each "Add PT" is independent (see §4.4). |
| `whatsapp_logs` | Sent reminder log | `message_type`: due_today/due_in_3_days/expired/custom |
| `staff_salaries` | Monthly payroll | `net_salary` is a **generated column** (`base_salary + bonus - deductions`) |
| `expenses` | Operating expenses | Fixed category enum (rent, electricity, water, maintenance, equipment, supplies, marketing, staff_welfare, other) |
| `app_settings` | Singleton config row (`id=1`) | Currently just `grace_period_days` |
| `membership_expiry_edits` | Audit trail for manual expiry corrections | Requires `reason` + `edited_by_user_id` (who actually made the call) distinct from `performed_by_user_id` (who's logged in) |
| `attendance_logs` | Durable punch history from the biometric device | `device_user_id` = stringified `member_id`. `member_id` FK is `ON DELETE SET NULL` (not CASCADE). Unique `(device_user_id, punched_at)`. Append-only — no UPDATE/DELETE RLS policy. |
| `adms_devices` | Registered device(s) by serial number | `last_seen`, `ip_address` |
| `adms_commands` | Outbound command queue to the device | `operation`: enroll/remove/block/unblock. `status`: pending/sent/done/failed. `member_id` here is the plain INTEGER PIN, no FK. |
| `adms_fingerprints` | Device-confirmed fingerprint enrollment | Populated passively from the device's own OPERLOG push, not queried on demand (no such command exists in this firmware) |
| `biometric_audit_log` | Who triggered which device action | `action`: unlock/push_members/delete_user/set_access |

### 3.2 Cascade behavior (matters for any bulk-delete/import operation)

From `members`:
- `memberships`, `payments`, `coach_members`, `whatsapp_logs`, `pt_memberships` → **CASCADE** (deleted with the member)
- `attendance_logs.member_id` → **SET NULL** (row survives, just loses the member link)

From `memberships`:
- `payments.membership_id` → SET NULL
- `membership_expiry_edits` → CASCADE

**Practical implication:** truncating `members` alone does *not* clear `attendance_logs` — that table must be cleared explicitly if a full data reset is intended.

### 3.3 RLS model

- `current_user_role()` is a `SECURITY DEFINER` helper reading `user_profiles.role` for `auth.uid()` — used throughout policies to avoid RLS-recursion problems that a naive subquery would hit.
- General shape: **SELECT** = any authenticated user; **INSERT/UPDATE** = `admin` + `receptionist`; **DELETE** (and other sensitive mutations, e.g. member soft-delete, role changes) = `admin` only.
- `staff_salaries` and `expenses` are **admin-only, full stop** (no receptionist access) — sensitive payroll/financial data.
- Two triggers explicitly reinforce policy at the row-mutation level (not just at query-authorization level):
  - `prevent_role_self_escalation` — a non-admin (or an admin trying to change *someone else's* role while not being the one enforced... actually: any authenticated caller) cannot change `user_profiles.role` unless they're already `admin`.
  - `prevent_non_admin_member_delete` — only `admin` can toggle `members.deleted_at`.
- `createAdminClient()` (service-role) bypasses all of this — used only in trusted server-only contexts (cron jobs, ADMS device routes, `cached-queries.ts`).

---

## 4. Core Domain Logic & Invariants

These are the load-bearing conventions the whole app depends on. Get one of these wrong anywhere and status counts, WhatsApp reminders, or revenue figures silently corrupt.

### 4.1 "Latest membership per member" is the source of truth for status

A member accumulates one `memberships` row per renewal cycle. The *current* status of a member is **never** "any row with `status='expired'`" or similar — it's **the row with the greatest `expiry_date`** for that member (optionally excluding `status='cancelled'`). This pattern recurs across:

- `getMembers()` / `getMember()` (members.ts) — `active_membership` is the membership ordered `expiry_date DESC` and de-arrayed to `[0]`.
- `getCachedMembers()` (cached-queries.ts) — same pattern, admin client.
- `getExpiredMembers()` (whatsapp.ts) — explicitly rewritten (see §8, Known Fixes) to use this pattern after it was found to under- and over-report expired members.
- `getCachedDashboardStats()` / `getCachedGracePeriodMembers()` (cached-queries.ts) — same fix applied in the July 2026 audit.
- `getBiometricPageData()` / `getMemberAdmsInfo()` (adms.ts) — membership status per punch/member resolved the same way.
- `getReportsOverview()` (reports.ts) — same join pattern.

**Why this matters:** `renewMembership()` flips the *old* active row to `status='expired'` and inserts a *new* active row — it never deletes the old one. Any query that counts/filters raw `memberships` rows by `status` column alone (rather than picking the member's single latest row first) will double-count members who have ever renewed, because their history keeps accumulating `expired` rows forever.

Status itself (active / expiring_soon / grace_period / expired) is computed **from the expiry date**, not trusted from the stored `status` string — see `getMembershipStatus()` in `src/lib/utils.ts`:

```
expiry in the past, > gracePeriodDays ago  → expired
expiry in the past, within gracePeriodDays → grace_period
expiry within 7 days (inclusive), not past → expiring_soon
otherwise                                  → active
```

`gracePeriodDays` is read from `app_settings` (server-side, see §4.6), defaulting to `DEFAULT_GRACE_PERIOD_DAYS = 180` if the setting can't be read.

### 4.2 "One active row per member" is DB-enforced

`security_hardening.sql` creates:

```sql
CREATE UNIQUE INDEX one_active_membership_per_member ON memberships(member_id) WHERE status = 'active';
```

Any code path that inserts a new active membership **must** first flip the member's existing active row to `expired`, or the insert fails the unique index. Three places do this explicitly:

- `renewMembership()` (memberships.ts) — the canonical renewal path.
- `importMembers()` (members.ts) — bulk CSV import, when the row matches an *existing* member (fixed in the July 2026 audit; previously could attempt a conflicting insert).
- Google Form intake sync (`form-intake-sync.ts`) — sidesteps the issue entirely by only ever creating a membership on a brand-new member insert, never on an update to an existing one.

### 4.3 Renewal date math — the "day after current expiry" convention

`renewMembership()` (memberships.ts) lets staff renew **before** the current membership has actually expired (e.g. a member pays early). To avoid losing the remaining paid days:

```ts
const dayAfterCurrentExpiry = currentExpiry ? new Date(currentExpiry.getTime() + 24*60*60*1000) : null
const effectiveStart = dayAfterCurrentExpiry && dayAfterCurrentExpiry > requestedStart
  ? dayAfterCurrentExpiry
  : requestedStart
```

The new membership always starts the **day after** the currently-active membership's expiry (not the same day — that would create a 1-day overlap) unless the member has actually lapsed, in which case the staff-supplied `start_date` is used as-is. The client-side Renew dialog defaults its date picker to this same `expiry + 1 day` value, so this server-side logic is a defensive fallback for when staff manually override the date, not the primary path.

New expiry = `effectiveStart + plan.duration_months` (calendar months, via `Date.setMonth`).

### 4.4 PT (Personal Training) is deliberately separate and simpler

`pt_plans`/`pt_memberships` mirror `membership_plans`/`memberships` but are **fully independent**, because `renewMembership()` unconditionally expires the member's regular gym membership on renewal — PT can't be "just another plan row" without accidentally cancelling someone's gym access. Consequences of this design choice (per explicit product scoping during development — PT was descoped from "sell packages/assign like a membership" to a minimal add/cancel flow):

- `assignPtMembership()` ("Add PT") never expires a prior PT package — multiple simultaneous PT rows for one member are allowed by schema (no unique-active-row constraint on `pt_memberships`).
- `getMemberPt()` shows only the **most recently created** PT row (`order('created_at', desc).limit(1)`), not necessarily the one with the furthest expiry.
- `cancelPtMembership()` is the only way to end one early (`status → 'cancelled'`).
- PT payments always carry `payment_type: 'personal_training'` and `pt_membership_id` (not `membership_id`).

### 4.5 Payments ↔ Membership/PT linkage

`payments.membership_id` and `payments.pt_membership_id` are independent, optional FKs. `getPayments()` (payments.ts) joins both:

```
membership:memberships!payments_membership_id_fkey(id, plan:membership_plans(name, duration_months))
pt_membership:pt_memberships!payments_pt_membership_id_fkey(id, plan:pt_plans(name, duration_months))
```

The Payments table's "Plan" column checks the regular membership plan first, then falls back to the PT plan.

**Payments deliberately excluded from `payments` table:** Google Form-intake-created memberships and any "already paid outside the system" entries record the membership row (with `payment_pending: false`) but **no** `payments` row — so Accounts/Reports revenue figures only ever reflect money actually processed through the app's own recording flow, not an automated backfill.

### 4.6 Grace period setting

Single source of truth: `app_settings.grace_period_days` (singleton row, `id=1`), read via `getGracePeriodDays()` (settings.ts, request-scoped) or `getCachedGracePeriodDays()` (cached-queries.ts, 5-min cache tagged `settings`). Updated only by `admin` via `updateGracePeriodDays()`, which does a plain `.update().eq('id', 1)` rather than an upsert (the row is guaranteed to exist; upsert would additionally require an INSERT RLS policy just to satisfy the ON CONFLICT path).

Historically this lived only in browser `localStorage`, which server-rendered pages (Dashboard, Members, Reports) had no way to read — they silently used the hardcoded `180`-day default regardless of what was "saved" in Settings. Fixed by moving it server-side; every page that needs it now fetches it explicitly.

### 4.7 Receipt numbers

Auto-generated by a Postgres trigger on `payments` insert: `GPG-{YYYYMM}-{4-digit sequence}`, sequence is a single global `receipt_seq` (not per-month), formatted with the payment's *insert* month, not necessarily `payment_date`'s month if backdated.

---

## 5. Feature-by-Feature Reference

### 5.1 Dashboard (`/dashboard`)

Backed by `getCachedDashboardStats()` (cached-queries.ts, 5 min cache). Stats: total/active/expired/grace-period/expiring-this-week/due-today member counts (all via the latest-membership-per-member pattern, §4.1), revenue-this-month, admission-fee-this-month (both are direct date-range payment sums, no row-count cap). Also surfaces a grace-period follow-up list (`getCachedGracePeriodMembers`) and a `WelcomeBanner` component with its own status-driven copy.

### 5.2 Members (`/members`)

- List with live-filtering search (`MembersSearchInput` — debounced 300ms, updates the `?search=` query param via `router.replace`, no Enter key required).
- Add / Edit / Soft-delete (admin only for delete).
- Editing `member_id` triggers an ADMS remove+re-enroll cycle (the device PIN *is* `member_id`; the member must physically re-scan their fingerprint afterward — the old template doesn't follow the ID change).
- Bulk CSV import (`importMembers`) — upserts on `member_id` conflict (`ignoreDuplicates: true`), optionally creates a membership per row if `expiry_date`+`amount_paid` are present.
- Member detail page (`/members/[id]`) hosts the Renew, Add PT, and Edit Expiry dialogs.

### 5.3 Memberships (`/memberships`)

Plan CRUD (`getPlans`, `createPlan`, `updatePlan` — admin only for mutation) plus the renewal action described in §4.3. `getLastMembershipExpiry()` is a lookup helper used to pre-fill dialogs.

**Edit Expiry** (`updateMembershipExpiry`) is distinct from renewal — it *mutates* an existing row's `expiry_date` in place (correcting a mistake, e.g. wrong plan picked), rather than creating a new membership period. Requires a free-text `reason` and an explicit `edited_by_user_id` (a dropdown of admin/coach staff, not necessarily whoever is logged in — useful when staff share a login) — both are logged to `membership_expiry_edits` alongside the actor's own `performed_by_user_id`.

### 5.4 Payments (`/payments`)

Live transaction list (`getPayments`, capped at 100 most recent rows — this is intentionally a *display* cap, not used for totals; see §4.5/§8) plus a stats bar: Today's Revenue, This Month's Revenue (from `getMonthlyRevenue`, unlimited), and **Total Collected** (from a separate unlimited `getPaymentsSummary()` query — split out specifically so an all-time total can never be silently truncated by the display cap).

### 5.5 Coaches (`/coaches`)

Coach CRUD, member assignment (`coach_members` join table, `assignMember`/`unassignMember`). Deliberately read-only for PT/member details on this page per product scoping — no package-selling or member-assignment UI beyond a simple list; only Edit/Delete coach actions remain here as first-class actions. Assigning a PT package to a member (from the member's own page) automatically also creates the general `coach_members` link, so that member shows under the coach's regular member list too, not only the PT client list.

### 5.6 Salary (`/salary`) and Expenses (`/expenses`)

Both admin-only (RLS + `requireRole`), both follow the same pending → paid lifecycle with a `markXPaid` action stamping `paid_at`. `staff_salaries.net_salary` is DB-computed (generated column). `expenses.category` is a fixed enum acting as a lightweight chart of accounts. Both sync to a live Google Sheets tab on every mutation (`syncExpensesSheet` — salary does not currently live-sync, only via the weekly backup).

### 5.7 Accounts (`/accounts`) — admin only

The primary financial-overview page (distinct from Reports). Server-gates on `role === 'admin'` at the page level — RLS already hides `staff_salaries`/`expenses` from non-admins, but `payments` are visible to any authenticated user, so this explicit check makes the *page* actually admin-only, not just some of its numbers.

`getAccountsOverview(month?)` (accounts.ts) returns, in one round trip:
- Selected-month Revenue/Expenses/Salary/Net, plus an **All-Time Net** figure (both computed from an unlimited `payments` fetch, deliberately *not* reused from any capped list — see the file's own comment explaining this).
- Pending totals: unpaid salaries, unpaid expenses, and memberships with `payment_pending = true`.
- A 6-month trend chart (revenue/expenses/salary/net, `ComposedChart`).
- Expense-by-category and payments-by-method breakdowns (selected month only).
- A combined, filterable transaction ledger (revenue+expense+salary rows merged, sorted by date, capped at 200 for display).

### 5.8 Reports (`/reports`)

Two tabs: **Members** (total/active/expiring/expired counts + a 50-row table + Excel export of the full member list) and **Financial** (Total Revenue/Payments/Avg Payment stat cards, Salary/Expenses "All Time" figures, Net Profit, a 12-month revenue chart, and a full Payments Excel export). `getReportsOverview()` fetches payments **unlimited** (fixed in the July 2026 audit — previously capped at 100, silently wrong for revenue/export purposes once the gym passed 100 lifetime payments).

### 5.9 WhatsApp (`/whatsapp`)

`getDueMembers('today' | '3days' | 'all')` — filters `memberships` by `status='active'` (safe: DB-enforced uniqueness per member, §4.2) and an expiry date range. `getExpiredMembers()` — the latest-membership-per-member pattern (§4.1, §8). `logWhatsAppMessage()` records what was sent (the actual send happens client-side via a `wa.me` deep link — this app doesn't hold a WhatsApp Business API integration, just prepares messages and logs the intent).

### 5.10 Biometric (`/biometric`) & ADMS integration

The most protocol-heavy subsystem. See §6 for the full device-communication picture; this section covers the CRM-facing side.

- `getBiometricPageData(dateStr?)` — one round trip for devices, today's (or a chosen day's) attendance, all members, recent commands, and a computed per-member ADMS status map.
- **Two distinct booleans, deliberately not merged into one "enrolled" flag:**
  - `pushedToDevice` — purely our own action history: did the CRM successfully push an `enroll` command (and it wasn't later reversed by `remove`).
  - `fingerprintEnrolled` — device-confirmed via the OPERLOG push (a real fingerprint template exists), *or* proven retroactively by any successful punch ever recorded for that PIN. A member can be pushed to the device without ever having scanned a finger, and — less commonly — can have a fingerprint enrolled locally at the machine (e.g. a walk-in test) without ever having gone through our push.
- `blocked` — reflects the most recent completed `block`/`unblock` command; defaults to unblocked if neither ever ran.
- `bulkEnrollAllMembers()` — queues `enroll` for every member not already enrolled/queued/ever-punched, skipping duplicates.
- `queueEnroll` / `queueRemove` / `queueBlock` / `queueUnblock` — all just insert a row into `adms_commands`; nothing reaches the physical device synchronously. Delivery happens only the next time the device polls (see §6). Every queued command is also mirrored into `biometric_audit_log` with the acting user's identity (closing a gap where the device bridge's own logs only saw a shared API key, not a CRM user).

### 5.11 Settings (`/settings`)

Grace period (§4.6) and staff account management: `createStaffUser` (creates both the Supabase Auth login and the `user_profiles` row in one step — signup is disabled app-wide, so this is the *only* way to add staff), `deleteStaffUser`, `resetStaffPassword`. All admin-only.

### 5.12 Document Center (`/documents`)

`getDocumentCenterData(startDate, endDate)` — a date-range export across members, memberships, payments, coaches (full list, not date-filtered), staff salaries, WhatsApp logs, attendance logs, and membership plans (full list). Admin-only. Purely a read/export surface, no mutations.

---

## 6. ADMS Biometric Device Integration

Device: eSSL K30 Pro, speaking the ADMS push protocol (IIS/ASP.NET heritage — some firmware calls request `.aspx`-suffixed paths, handled by `next.config.ts` rewrites). All device-facing responses are **plain text**, never JSON — exact formatting matters to the firmware parser.

### 6.1 Endpoints

| Route | Direction | Purpose |
|---|---|---|
| `GET /iclock/cdata` (→ `/api/adms/cdata`) | device → server | Registration/handshake (`?SN=...&options=all`). Responds with device config lines (`Stamp`, `ATTLOGSTAMP`, `DELAY`, etc.). |
| `POST /iclock/cdata?table=ATTLOG` | device → server | Attendance punches. Tab-separated `pin, dateTime, status, verifyType` per line. |
| `POST /iclock/cdata?table=OPERLOG` | device → server | Operation log — the only channel that surfaces fingerprint enrollment (`FP PIN=x\tFID=y\tSize=z\tValid=1\tTMP=...`). |
| `GET /iclock/getrequest` (→ `/api/adms/getrequest`) | device polls | Device's heartbeat poll for pending commands. Server returns up to 5 pending `adms_commands` as `C:data:<command string>` lines. |
| `POST`/`GET /iclock/devicecmd` (→ `/api/adms/devicecmd`) | device → server | Command acknowledgment (`Return=0` success, else failure code). |

### 6.2 Protocol quirks (confirmed by live testing against the real device)

- **No remote "is this enrolled" query exists.** `DATA QUERY FP` returns `Return=-1004` on this firmware. Fingerprint state is therefore **passive-only** — inferred from the OPERLOG push at enrollment time, or retroactively proven by a successful punch.
- **User add/delete commands:** `USER ADD`/`USER DEL` are rejected (`Return=-1002`). The correct form for this firmware is `DATA UPDATE USERINFO ...` / `DATA DELETE USERINFO PIN=...` (full word `DELETE`, not `DEL`).
- **Command prefix:** commands sent via `getrequest` must be prefixed `C:data:` (literal string, not a UUID) — the device echoes back `ID=data` on acknowledgment, which `devicecmd`'s handler accounts for specifically (falls back to a real UUID lookup only if a genuine ID was echoed).
- **Device timestamps have no timezone marker** and are the device's local wall-clock (IST). Naively parsing with `new Date(...)` on a UTC server (Vercel) would store punches ~5.5 hours in the future — `parseDeviceTimestamp()` explicitly appends `+05:30` before parsing.
- **Stale "sent" recovery:** a command stuck at `status='sent'` for over 2 minutes with no ack (firmware didn't recognize it, or the ack was lost) is automatically reset to `pending` on the next device poll, up to 10 attempts.
- **`devicecmd` requires a registered device.** This was previously the one ADMS route that skipped that check, letting any caller (not necessarily the real device) flip a command's status — closed by requiring the `SN` to match a known `adms_devices` row, same as the other two routes.

### 6.3 Command lifecycle

`adms_commands` row: `pending` → (device polls `getrequest`) → `sent` → (device posts `devicecmd` ack) → `done` or `failed`. Delivery is entirely asymmetric-latency: queuing a command does nothing until the device's own polling interval happens to hit `getrequest` next — there is no way to push to the device synchronously/immediately.

### 6.4 Realtime attendance notifications

`src/lib/realtime/attendance-bus.ts` — a single shared Supabase Realtime channel (`attendance_logs_shared`) with a listener-set pattern, specifically because two independent channel subscriptions to the same table (one from `PunchNotifier`, one from the Biometric page) resulted in only one of them ever actually receiving INSERT broadcasts, even though both reported `SUBSCRIBED`. Consolidating to one shared channel with multiple listeners sidesteps the issue regardless of its root cause.

---

## 7. Google Sheets Integration

Two entirely separate spreadsheets, two directions, using a shared minimal REST client (`src/lib/google-sheets.ts`, service-account JWT auth, no `googleapis` SDK dependency).

### 7.1 Outbound: live sync + weekly backup (`src/lib/sheets-backup.ts` → `GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID`)

- **Live-sync tabs** (Members, Payments, Expenses) — fully overwritten on every relevant mutation (`syncMembersSheet`, `syncPaymentsSheet`, `syncExpensesSheet`), fire-and-forget (`.catch(console.error)`, never blocks the user-facing action).
- **Weekly backup** (`runSheetsBackup`, cron-triggered) — full-overwrite export of tables that aren't live-synced (Memberships, Salary, Plans, Coaches), plus a re-run of the three live-sync tabs for a consistent point-in-time snapshot, plus an appended row to a "Backup Log" tab recording what ran and any errors.

### 7.2 Inbound: Google Form intake sync (`src/lib/form-intake-sync.ts` → `GYM_INTAKE_FORM_SPREADSHEET_ID`)

Pulls new/edited rows from a Google Form's response sheet (`'Form responses 1'!A2:G`: Timestamp, Name, Member ID, Mobile, Place, Join Date, Membership Month) and upserts into `members`, keyed by the Member ID column staff fill in after reviewing each submission.

- Dates are day-first (`DD/MM/YYYY`), matching the rest of the app's convention.
- **Duplicate Member ID with disagreeing names** → every row for that ID is skipped with a warning (never silently "last row wins" — that would merge two different people's data under one record).
- Multiple rows for the same ID with the *same* name (a re-submission/edit) → last row wins.
- Membership creation only happens on the **first-ever creation** of a member (never on update) — so it can't clobber anything staff have since changed by hand — and only for a recognized `MEMBERSHIP MONTH` value (`1` or `3`; anything else is ignored, not stored as a bogus note).
- These memberships are marked `payment_pending: false` (treated as already paid in cash outside the system) but deliberately get **no** `payments` row — see §4.5.

### 7.3 Cron schedule (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/backup-to-sheets",   "schedule": "0 3 * * 0" },
    { "path": "/api/cron/sync-form-intake",   "schedule": "0 4 * * *" }
  ]
}
```

Both routes check `Authorization: Bearer ${CRON_SECRET}` (Vercel auto-attaches this header on cron-triggered invocations, so this doubles as the auth mechanism blocking any other caller).

**Vercel Hobby plan constraint:** cron jobs are limited to once per day. A schedule finer than that (e.g. `*/5 * * * *`) causes the **entire deployment to fail silently** with no obvious error surfaced during normal development — this bit the project once already; any future cron schedule change must stay at-or-below daily frequency, and deployment success should be explicitly verified (`vercel inspect ... `) after any `vercel.json` change.

---

## 8. Known Fixes From the July 2026 Renewal/Accounts Audit

Documented here because the bug *classes* are easy to reintroduce if new code doesn't follow the conventions in §4:

1. **Dashboard member-status counts double-counted renewed members.** `expiredMembers`/`gracePeriodMembers` (and the grace-period follow-up list) originally counted every historical `memberships` row matching a date range, not each member's current one — a member who renewed normally leaves a superseded `expired` row behind that eventually ages past the grace window and gets counted forever, even while currently active. Fixed to derive from each member's latest membership only (§4.1).
2. **Payments/Reports revenue was silently capped at 100 rows.** `getPayments()`'s 100-row cap (fine for a *display* list) was being reused to compute all-time aggregates (Total Collected, Total Revenue, Net Profit, Monthly Revenue chart, full Excel export) — correct only as long as the gym had under 100 lifetime payments. Fixed by introducing `getPaymentsSummary()` (unlimited) for aggregates, and removing the cap from `reports.ts`'s payments query entirely (it only ever feeds aggregates/exports there, never a capped display list).
3. **Bulk CSV import could create duplicate active memberships.** Re-importing a spreadsheet for an existing member (matched by Member ID) inserted a new membership row without expiring the prior active one first — violates §4.2's invariant, and would have failed loudly against the DB unique index, or worse, silently confused WhatsApp due-date messaging if the index weren't there. Fixed to expire the prior active row first, same as `renewMembership()`.
4. **Payments tab Plan column was blank for PT payments** — only joined `membership_id`, not `pt_membership_id`. Fixed per §4.5.
5. **Renewal date off-by-one:** the server's early-renewal fallback used the *same day* as the old expiry rather than *the day after*, one day out of step with the client dialog's own default — fixed to match §4.3's convention exactly.
6. **Grace period was localStorage-only** (§4.6) — server-rendered pages had no way to read it and silently used a hardcoded default regardless of what Settings displayed as saved.
7. **WhatsApp "Recently Expired" undercounted** — originally filtered `memberships.status = 'expired'`, which only catches members superseded by a later renewal, missing the much larger group who simply never renewed and still sit at `status='active'` with a long-past expiry date. Fixed to compute status from the expiry date on each member's latest membership (§4.1), not the stored status string.

---

## 9. Deployment & Environment

### 9.1 Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client, server, admin, proxy | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client, server, proxy | Anon/public key — RLS-governed access |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client only | Bypasses RLS — background jobs only |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `google-sheets.ts` | Service-account JWT for Sheets API |
| `GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID` | `sheets-backup.ts` | Destination spreadsheet for live-sync + weekly backup |
| `GYM_INTAKE_FORM_SPREADSHEET_ID` | `form-intake-sync.ts` | Source spreadsheet for the Google Form intake sync |
| `CRON_SECRET` | both cron routes | Bearer-token check against Vercel's auto-attached header |

### 9.2 Verification workflow established during development

Because Server Actions can't be `curl`'d directly (Next.js's internal action-ID protocol), changes to server-action logic are typically verified by replicating the same database operations via direct Supabase REST calls (service-role key) in a throwaway Node script, comparing before/after behavior against real data, then cleaning up any test rows created. Deployment success is confirmed via `vercel inspect greenpowergym.vercel.app --scope irfanpjai-9584s-projects` (or `vercel ls`) matching a fresh `created` timestamp against the push time — established as a mandatory habit after the Hobby-plan cron-frequency incident (§7.3) caused several pushes to silently fail deployment with no obvious signal.

---

## 10. Notable Dead Code

`src/lib/constants.ts` defines `MEAL_TYPES`, `WORKOUT_TYPES`, `FITNESS_GOALS`, `INVENTORY_CATEGORIES`, `DEFAULT_EXERCISES` — vestigial constants from what appears to have been a different (fitness/meal-tracking) template this project originated from. Confirmed unused anywhere else in `src/` as of this writing. Safe to ignore or remove; not part of the actual gym CRM feature set.

---

## 11. UI Structure Reference

Sidebar nav (`src/components/layout/Sidebar.tsx`), grouped exactly as shown to users:

**CRM:** Dashboard · Members · Memberships · Payments · Coaches · Salary · Expenses · Accounts · WhatsApp · Reports · Document Center
**Fingerprint:** Biometric
**System:** Settings

Shared UI primitives live in `src/components/ui/` (thin Radix wrappers styled with `cva` + Tailwind — badge, button, card, dialog, input, label, progress, select, skeleton, table, tabs, textarea). Shared feature components: `EmptyState`, `LoadingSkeleton`, `ProgressRing` (`src/components/shared/`), `WelcomeBanner` (dashboard), `PunchNotifier` (global biometric toast listener), `Sidebar`/`TopBar`/`MobileNav` (layout chrome).
