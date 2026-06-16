import { NextResponse } from 'next/server'

// Returns a short-lived JWT from the Python AI backend.
// Credentials are read server-side only — never sent to the browser.
export async function GET() {
  const base     = process.env.AI_MONITOR_URL ?? 'http://localhost:8000'
  const email    = process.env.AI_ADMIN_EMAIL
  const password = process.env.AI_ADMIN_PASSWORD

  if (!email || !password) {
    return NextResponse.json({ error: 'AI admin credentials not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${base}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
      cache:   'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'AI auth failed' }, { status: 502 })
    }

    const { access_token } = await res.json()
    return NextResponse.json({ token: access_token })
  } catch {
    return NextResponse.json({ error: 'AI service unreachable' }, { status: 503 })
  }
}
