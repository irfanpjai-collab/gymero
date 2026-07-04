import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function textResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

interface PendingCommand {
  id: string
  operation: 'enroll' | 'remove' | 'block' | 'unblock'
  member_id: number
  full_name: string | null
  attempts: number
}

// Builds the device-bound command string. This exact syntax is the least
// standardized part of ADMS across firmware versions — commonly-used shape,
// not verified against this specific K30 Pro. Expect a tuning pass once tested.
function buildCommandString(cmd: PendingCommand): string {
  const pin = cmd.member_id
  const name = cmd.full_name ?? `Member ${pin}`

  switch (cmd.operation) {
    case 'enroll':
      return `USER ADD PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=1`
    case 'block':
      return `USER ADD PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0`
    case 'unblock':
      return `USER ADD PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=1`
    case 'remove':
      return `USER DEL PIN=${pin}`
  }
}

// Device polls this on its own heartbeat interval. This is the asymmetric-
// latency side of ADMS — a queued command only executes the next time the
// device happens to call here, not the moment it's queued.
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') ?? ''
  const supabase = createAdminClient()

  const { data: device } = await supabase
    .from('adms_devices')
    .select('serial_number')
    .eq('serial_number', sn)
    .maybeSingle()
  if (!device) return textResponse('OK')

  await supabase.from('adms_devices').update({ last_seen: new Date().toISOString() }).eq('serial_number', sn)

  // A command stuck at 'sent' with no ack (firmware didn't recognize it, the
  // ack got lost) would otherwise never be retried — the query below only
  // looks at 'pending'. Recover anything sent more than 2 minutes ago so it
  // gets picked up again on this poll.
  const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  await supabase
    .from('adms_commands')
    .update({ status: 'pending' })
    .eq('status', 'sent')
    .lt('sent_at', staleCutoff)
    .lt('attempts', 10)

  const { data: pending } = await supabase
    .from('adms_commands')
    .select('id, operation, member_id, full_name, attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5)

  if (!pending || pending.length === 0) return textResponse('OK')

  const rows = pending as PendingCommand[]
  // eSSL devices expect C:data: as the literal prefix, not a UUID.
  const lines = rows.map(cmd => `C:data:${buildCommandString(cmd)}`)

  await Promise.all(
    rows.map(cmd =>
      supabase
        .from('adms_commands')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: (cmd.attempts ?? 0) + 1 })
        .eq('id', cmd.id)
    )
  )

  return textResponse(lines.join('\n'))
}
