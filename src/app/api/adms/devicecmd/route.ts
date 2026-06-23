import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function textResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

// Commonly arrives as ID=<commandId>&Return=<code>&CMD=<type>, either as a
// query string (GET) or form-encoded body (POST) depending on firmware.
async function ack(id: string | null, ret: string | null): Promise<void> {
  if (!id) return
  const supabase = createAdminClient()
  await supabase
    .from('adms_commands')
    .update({
      status: ret === '0' ? 'done' : 'failed',
      result: `Return=${ret ?? 'unknown'}`,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(await req.text())
  await ack(params.get('ID'), params.get('Return'))
  return textResponse('OK')
}

export async function GET(req: NextRequest) {
  await ack(req.nextUrl.searchParams.get('ID'), req.nextUrl.searchParams.get('Return'))
  return textResponse('OK')
}
