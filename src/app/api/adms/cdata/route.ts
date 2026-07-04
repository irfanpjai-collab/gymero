import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ADMS speaks plain text, not JSON — every response here must be text/plain,
// and the exact formatting matters to the device's firmware.
export const dynamic = 'force-dynamic'

function textResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

// The device reports ATTLOG timestamps as its own local wall-clock time
// (e.g. "2026-07-04 19:28:31") with no timezone marker. Parsing that directly
// with `new Date(...)` treats it as UTC (Vercel's runtime clock is UTC),
// storing punches ~5:30 in the future. The device's clock is IST — attach
// that offset explicitly so the stored instant is the real UTC moment.
function parseDeviceTimestamp(dateTime: string): string {
  return new Date(`${dateTime.replace(' ', 'T')}+05:30`).toISOString()
}

async function upsertDevice(serialNumber: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('adms_devices').upsert({
    serial_number: serialNumber,
    last_seen: new Date().toISOString(),
  })
  if (error) console.error('adms cdata: upsertDevice failed —', error.message)
}

// Device registration/handshake — GET .../iclock/cdata?SN=...&options=all
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') ?? ''
  const isHandshake = req.nextUrl.searchParams.get('options') === 'all'
  if (!sn) return textResponse('ERROR', 400)

  await upsertDevice(sn)

  if (isHandshake) {
    const body = [
      `GET OPTION FROM:${sn}`,
      'Stamp=9999',
      'ATTLOGSTAMP=9999',
      'OPERLOGSTAMP=0',
      'ERRORDELAY=30',
      'DELAY=10',
      'TRANSIMES=1',
      'REALTIME=1',
      'ENCRYPT=None',
    ].join('\n')
    return textResponse(body)
  }

  return textResponse('OK')
}

// Attendance / user data upload — POST .../iclock/cdata?SN=...&table=ATTLOG|OPERLOG
export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') ?? ''
  const table = req.nextUrl.searchParams.get('table') ?? ''
  const body = await req.text()

  if (!sn) return textResponse('ERROR', 400)

  const supabase = createAdminClient()

  // This firmware pushes attendance data straight over POST without ever doing
  // a prior GET ...&options=all handshake, so registration has to happen here
  // too — SN is the only identity signal in this protocol either way.
  await upsertDevice(sn)

  if (table === 'ATTLOG') {
    const lines = body.split(/\r\n|\r|\n/).filter(Boolean)
    let processed = 0

    for (const line of lines) {
      const fields = line.split('\t')
      if (fields.length < 4) continue
      const [pin, dateTime, status, verifyType] = fields

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('member_id', Number(pin))
        .maybeSingle()

      const { error: attErr } = await supabase.from('attendance_logs').upsert(
        {
          member_id: member?.id ?? null,
          device_user_id: pin,
          punched_at: parseDeviceTimestamp(dateTime),
          punch_type: 0,
          status: Number(status) || 0,
          source: 'adms',
        },
        { onConflict: 'device_user_id,punched_at', ignoreDuplicates: true }
      )
      if (attErr) console.error('adms cdata: attendance upsert failed —', attErr.message)
      // verifyType isn't stored — attendance_logs has no column for it; kept
      // available here in case a future need arises.
      void verifyType
      processed++
    }

    return textResponse(`OK: ${processed}`)
  }

  // TEMPORARY MANUAL TRIAL — logging whatever non-ATTLOG table this device
  // pushes (expected OPERLOG) to see the real field format for a fingerprint
  // enrollment upload. Remove once captured.
  if (sn === 'NFZ8260503127') {
    console.error(`[TRIAL] cdata POST table="${table}" body="${body}"`)
  }

  // OPERLOG (user/fingerprint/face uploads) — not consumed for now; just
  // acknowledge so the device doesn't keep retrying.
  return textResponse('OK')
}
