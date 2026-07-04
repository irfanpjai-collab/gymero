import { NextResponse } from 'next/server'
import { runFormIntakeSync } from '@/lib/form-intake-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Triggered every few minutes by Vercel Cron (see vercel.json). Same
// CRON_SECRET auth pattern as backup-to-sheets — Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` automatically on cron-triggered
// invocations, so this also blocks anyone else from hitting the route.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runFormIntakeSync()
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}
