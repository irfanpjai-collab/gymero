import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ADMS speaks plain text, not JSON — every response here must be text/plain,
// and the exact formatting matters to the device's firmware.
export const dynamic = 'force-dynamic'

function textResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain' } })
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
    // Commonly-documented ADMS handshake response shape — not verified against
    // this exact firmware yet. Expect to adjust once tested against the real
    // device (see supabase/adms.sql header comment + project notes).
    const body = [
      `GET OPTION FROM: ${sn}`,
      'Stamp=9999',
      'OpStamp=9999',
      'ErrorDelay=60',
      'Delay=30',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=111111111111',
      'Realtime=1',
      'Encrypt=0',
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

  const supabase = createAdminClient()

  // The protocol's only identity signal is SN — reject anything not already
  // registered via a prior handshake, rather than trusting it blindly.
  const { data: device, error: deviceError } = await supabase
    .from('adms_devices')
    .select('serial_number')
    .eq('serial_number', sn)
    .maybeSingle()
  if (deviceError) console.error('adms cdata: device lookup failed —', deviceError.message)
  if (!device) return textResponse('ERROR', 403)

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
          punched_at: new Date(dateTime).toISOString(),
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

  // OPERLOG (user/fingerprint/face uploads) — not consumed for now; just
  // acknowledge so the device doesn't keep retrying.
  return textResponse('OK')
}
