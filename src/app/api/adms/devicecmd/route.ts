import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function textResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

// Commonly arrives as SN=<serial>&ID=<commandId>&Return=<code>&CMD=<type>,
// either as a query string (GET) or form-encoded body (POST) depending on
// firmware. Requires a registered SN, same as cdata/getrequest — this route
// previously skipped that check, the only one of the three ADMS routes that
// did, letting any caller flip a command's status without proving it's the
// device that command was actually sent to.
async function ack(sn: string | null, id: string | null, ret: string | null): Promise<void> {
  if (!sn) return
  const supabase = createAdminClient()

  const { data: device } = await supabase
    .from('adms_devices')
    .select('serial_number')
    .eq('serial_number', sn)
    .maybeSingle()
  if (!device) return

  const update = {
    status: ret === '0' ? 'done' : 'failed',
    result: `Return=${ret ?? 'unknown'}`,
    completed_at: new Date().toISOString(),
  }

  // Commands are sent with C:data: prefix so the device echoes back ID=data,
  // not a UUID. Mark all currently-sent commands as done/failed in that case.
  if (!id || id === 'data') {
    await supabase.from('adms_commands').update(update).eq('status', 'sent')
    return
  }

  // Fallback for any command that carried a real UUID as its ID
  await supabase.from('adms_commands').update(update).eq('id', id)
}

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(await req.text())
  const sn = req.nextUrl.searchParams.get('SN') ?? params.get('SN')
  await ack(sn, params.get('ID') ?? req.nextUrl.searchParams.get('ID'), params.get('Return') ?? req.nextUrl.searchParams.get('Return'))
  return textResponse('OK')
}

export async function GET(req: NextRequest) {
  await ack(
    req.nextUrl.searchParams.get('SN'),
    req.nextUrl.searchParams.get('ID'),
    req.nextUrl.searchParams.get('Return')
  )
  return textResponse('OK')
}
