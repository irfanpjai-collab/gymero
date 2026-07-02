import { createAdminClient } from '@/lib/supabase/admin'
import { ensureSheetTabs, overwriteSheetTab, appendSheetRow } from '@/lib/google-sheets'

// ── Tab names ────────────────────────────────────────────────────────────────
// Live-sync tabs are overwritten on every relevant mutation.
// Backup tabs are overwritten once a week by the cron job.
const TAB = {
  MEMBERS:     'Members',
  PAYMENTS:    'Payments',
  EXPENSES:    'Expenses',
  MEMBERSHIPS: 'Memberships',
  SALARY:      'Salary',
  PLANS:       'Plans',
  COACHES:     'Coaches',
  LOG:         'Backup Log',
} as const

// Weekly backup: tables that aren't live-synced get a full overwrite each run.
// Key = DB table name, value = sheet tab name.
const BACKUP_TABLES: Record<string, string> = {
  memberships:      TAB.MEMBERSHIPS,
  staff_salaries:   TAB.SALARY,
  membership_plans: TAB.PLANS,
  coaches:          TAB.COACHES,
}

const PAGE_SIZE = 1000

function toSheetValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function rowsToGrid(rows: Record<string, unknown>[]): unknown[][] {
  if (rows.length === 0) return []
  const headers = Object.keys(rows[0])
  return [headers, ...rows.map((r) => headers.map((h) => toSheetValue(r[h])))]
}

async function fetchAllRows(
  supabase: ReturnType<typeof createAdminClient>,
  table: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...((data ?? []) as Record<string, unknown>[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID ?? null
}

// ── Live-sync: Members ───────────────────────────────────────────────────────

const MEMBER_COLS = [
  'member_id', 'full_name', 'mobile', 'email', 'gender',
  'join_date', 'address', 'admission_fee', 'notes', 'created_at',
]

export async function syncMembersSheet(): Promise<void> {
  const id = spreadsheetId()
  if (!id) return

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('members')
    .select('member_id, full_name, mobile, email, gender, join_date, address, admission_fee, notes, created_at')
    .is('deleted_at', null)
    .order('member_id', { ascending: true })

  if (!data) return
  const grid: unknown[][] = [
    MEMBER_COLS,
    ...(data as Record<string, unknown>[]).map((r) => MEMBER_COLS.map((c) => toSheetValue(r[c]))),
  ]
  await ensureSheetTabs(id, [TAB.MEMBERS])
  await overwriteSheetTab(id, TAB.MEMBERS, grid)
}

// ── Live-sync: Payments ──────────────────────────────────────────────────────

const PAYMENT_COLS = [
  'Date', 'Member ID', 'Member Name', 'Amount (₹)', 'Method', 'Type', 'Receipt No', 'Notes',
]

export async function syncPaymentsSheet(): Promise<void> {
  const id = spreadsheetId()
  if (!id) return

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('payments')
    .select('payment_date, amount, payment_method, payment_type, receipt_number, notes, member:members!payments_member_id_fkey(member_id, full_name)')
    .order('payment_date', { ascending: false })

  if (!data) return

  type Row = {
    payment_date: string; amount: number; payment_method: string
    payment_type: string; receipt_number: string | null; notes: string | null
    member: { member_id: number; full_name: string } | null
  }

  const grid: unknown[][] = [
    PAYMENT_COLS,
    ...(data as unknown as Row[]).map((r) => [
      r.payment_date,
      r.member?.member_id ?? '',
      r.member?.full_name ?? '',
      r.amount,
      r.payment_method,
      r.payment_type,
      r.receipt_number ?? '',
      r.notes ?? '',
    ]),
  ]
  await ensureSheetTabs(id, [TAB.PAYMENTS])
  await overwriteSheetTab(id, TAB.PAYMENTS, grid)
}

// ── Live-sync: Expenses ──────────────────────────────────────────────────────

const EXPENSE_COLS = [
  'Date', 'Category', 'Description', 'Amount (₹)', 'Method', 'Status', 'Paid At', 'Notes',
]

export async function syncExpensesSheet(): Promise<void> {
  const id = spreadsheetId()
  if (!id) return

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('expenses')
    .select('expense_date, category, description, amount, payment_method, status, paid_at, notes')
    .order('expense_date', { ascending: false })

  if (!data) return

  type Row = {
    expense_date: string; category: string; description: string; amount: number
    payment_method: string; status: string; paid_at: string | null; notes: string | null
  }

  const grid: unknown[][] = [
    EXPENSE_COLS,
    ...(data as unknown as Row[]).map((r) => [
      r.expense_date,
      r.category.replace(/_/g, ' '),
      r.description,
      r.amount,
      r.payment_method,
      r.status,
      r.paid_at ?? '',
      r.notes ?? '',
    ]),
  ]
  await ensureSheetTabs(id, [TAB.EXPENSES])
  await overwriteSheetTab(id, TAB.EXPENSES, grid)
}

// ── Weekly backup ────────────────────────────────────────────────────────────

export interface SheetsBackupResult {
  ok: boolean
  summary: string[]
  errors: string[]
}

export async function runSheetsBackup(): Promise<SheetsBackupResult> {
  const id = spreadsheetId()
  if (!id) {
    return { ok: false, summary: [], errors: ['GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID not configured'] }
  }

  const supabase = createAdminClient()
  const allTabs = [...Object.values(BACKUP_TABLES), TAB.LOG]

  try {
    await ensureSheetTabs(id, allTabs)
  } catch (err) {
    return { ok: false, summary: [], errors: [err instanceof Error ? err.message : String(err)] }
  }

  const summary: string[] = []
  const errors: string[] = []

  for (const [table, tabName] of Object.entries(BACKUP_TABLES)) {
    try {
      const rows = await fetchAllRows(supabase, table)
      await overwriteSheetTab(id, tabName, rowsToGrid(rows))
      summary.push(`${tabName}=${rows.length}`)
    } catch (err) {
      errors.push(`${tabName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Also refresh the three live-sync tabs as part of the weekly run
  // so the backup is always a consistent point-in-time snapshot.
  try { await syncMembersSheet() } catch (err) { errors.push(`Members: ${err instanceof Error ? err.message : String(err)}`) }
  try { await syncPaymentsSheet() } catch (err) { errors.push(`Payments: ${err instanceof Error ? err.message : String(err)}`) }
  try { await syncExpensesSheet() } catch (err) { errors.push(`Expenses: ${err instanceof Error ? err.message : String(err)}`) }

  try {
    await appendSheetRow(id, TAB.LOG, [
      new Date().toISOString(),
      summary.join(', '),
      errors.length === 0 ? 'ok' : `errors: ${errors.join(' | ')}`,
    ])
  } catch (err) {
    errors.push(`Backup Log: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { ok: errors.length === 0, summary, errors }
}
