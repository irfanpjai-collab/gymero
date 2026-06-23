import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureSheetTabs, overwriteSheetTab, appendSheetRow } from '@/lib/google-sheets'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// One tab per table, fully overwritten each run — that's the actual backup.
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

// Triggered weekly by Vercel Cron (see vercel.json). Vercel automatically sends
// `Authorization: Bearer ${CRON_SECRET}` on cron-triggered invocations when that
// env var is set, so this check also blocks anyone else from hitting the route.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'GOOGLE_SHEETS_BACKUP_SPREADSHEET_ID not configured' }, { status: 500 })
  }

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
    await ensureSheetTabs(spreadsheetId, [...BACKUP_TABLES, LOG_TAB])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const summary: string[] = []
  const errors: string[] = []

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await fetchAllRows(supabase, table)
      await overwriteSheetTab(spreadsheetId, table, rowsToGrid(rows))
      summary.push(`${table}=${rows.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${table}: ${message}`)
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

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, summary, errors }, { status: 500 })
  }
  return NextResponse.json({ ok: true, summary })
}
