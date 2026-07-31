import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit-log'

const DEVICE_ACTOR = { user_id: null, name: 'Biometric Device (OPERLOG)', role: 'device' }

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

  if (table === 'OPERLOG') {
    // Confirmed via live device test: a fingerprint enrollment shows up here
    // as "FP PIN=x\tFID=y\tSize=z\tValid=1\tTMP=<template>". This is the only
    // reliable signal that a template actually exists — there's no working
    // remote query command for this firmware (DATA QUERY FP → Return=-1004).
    // The template blob itself isn't stored, only existence/validity.
    const lines = body.split(/\r\n|\r|\n/).filter(Boolean)
    for (const line of lines) {
      const fields = line.split('\t')
      if (!fields[0]?.startsWith('FP PIN=')) continue

      const pin = fields[0].slice('FP PIN='.length).trim()
      const fidField = fields.find(f => f.startsWith('FID='))
      const validField = fields.find(f => f.startsWith('Valid='))
      const fid = fidField ? parseInt(fidField.slice('FID='.length), 10) : NaN
      if (!pin || Number.isNaN(fid)) continue

      const isValid = validField?.slice('Valid='.length) === '1'

      // Only log an actual change — the device can resend the same OPERLOG
      // history on reconnect, and re-logging an unchanged record every time
      // would flood the audit log with duplicates of the same physical
      // enrollment event.
      const { data: existing } = await supabase
        .from('adms_fingerprints')
        .select('valid')
        .eq('device_user_id', pin)
        .eq('fid', fid)
        .maybeSingle()

      const { error: fpErr } = await supabase.from('adms_fingerprints').upsert(
        {
          device_user_id: pin,
          fid,
          valid: isValid,
          enrolled_at: new Date().toISOString(),
        },
        { onConflict: 'device_user_id,fid' }
      )
      if (fpErr) {
        console.error('adms cdata: fingerprint upsert failed —', fpErr.message)
      } else if (!existing || existing.valid !== isValid) {
        const { data: member } = await supabase.from('members').select('full_name').eq('member_id', Number(pin)).maybeSingle()
        await logAudit(DEVICE_ACTOR, existing ? 'update' : 'create', 'fingerprint_enrollment', pin, member?.full_name ?? `PIN ${pin}`, {
          fid, valid: isValid,
        })
      }
    }
  }

  // Everything else in OPERLOG (USER records, OPLOG audit entries, face data)
  // isn't consumed — just acknowledge so the device doesn't keep retrying.
  return textResponse('OK')
}
