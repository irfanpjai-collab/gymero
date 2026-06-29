import { NextResponse } from 'next/server'
import { runSheetsBackup } from '@/lib/sheets-backup'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Triggered weekly by Vercel Cron (see vercel.json). Vercel automatically sends
// `Authorization: Bearer ${CRON_SECRET}` on cron-triggered invocations when that
// env var is set, so this check also blocks anyone else from hitting the route.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runSheetsBackup()
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}
