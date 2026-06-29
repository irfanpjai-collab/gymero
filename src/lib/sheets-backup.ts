import { createAdminClient } from '@/lib/supabase/admin'
import { ensureSheetTabs, overwriteSheetTab, appendSheetRow } from '@/lib/google-sheets'

// One tab per table, fully overwritten each run — that's the actual backup.
// Shared by the weekly cron job and the manual "Backup now" button on the
// Document Center page, so there's exactly one place this list and logic live.
const BACKUP_TABLES = [
  'members',
  'membership_plans',
  'memberships',
  'payments',
  'coaches',
  'coach_members',
  'staff_salaries',
  'whatsapp_logs',
] as const

const LOG_TAB = 'Backup Log'
const PAGE_SIZE = 1000

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

export interface SheetsBackupResult {
  ok: boolean
  summary: string[]
  errors: string[]
}

export async function runSheetsBackup(): Promise<SheetsBackupResult> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID
  if (!spreadsheetId) {
    return { ok: false, summary: [], errors: ['GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID not configured'] }
  }

  const supabase = createAdminClient()
  try {
    await ensureSheetTabs(spreadsheetId, [...BACKUP_TABLES, LOG_TAB])
  } catch (err) {
    return { ok: false, summary: [], errors: [err instanceof Error ? err.message : String(err)] }
  }

  const summary: string[] = []
  const errors: string[] = []

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await fetchAllRows(supabase, table)
      await overwriteSheetTab(spreadsheetId, table, rowsToGrid(rows))
      summary.push(`${table}=${rows.length}`)
    } catch (err) {
      errors.push(`${table}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  try {
    await appendSheetRow(spreadsheetId, LOG_TAB, [
      new Date().toISOString(),
      summary.join(', '),
      errors.length === 0 ? 'ok' : `errors: ${errors.join(' | ')}`,
    ])
  } catch (err) {
    errors.push(`Backup Log: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { ok: errors.length === 0, summary, errors }
}
