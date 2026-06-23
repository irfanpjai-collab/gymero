import crypto from 'crypto'

// Minimal Google Sheets client using a service-account JWT — avoids pulling in the
// full `googleapis` SDK for what's just a handful of REST calls.

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not configured')
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claims}`
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey)
  const jwt = `${unsigned}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`Google auth failed: ${await res.text()}`)

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.token
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const token = await getAccessToken()
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Sheets API error (${path}): ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>>
}

/** Creates any tabs in `titles` that don't already exist in the spreadsheet. */
export async function ensureSheetTabs(spreadsheetId: string, titles: string[]): Promise<void> {
  const meta = await sheetsFetch(`${spreadsheetId}?fields=sheets.properties.title`)
  const sheets = (meta.sheets ?? []) as { properties: { title: string } }[]
  const existing = new Set(sheets.map((s) => s.properties.title))
  const missing = titles.filter((t) => !existing.has(t))
  if (missing.length === 0) return

  await sheetsFetch(`${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  })
}

/** Replaces a tab's entire contents — this is the actual weekly backup mechanism per table. */
export async function overwriteSheetTab(spreadsheetId: string, title: string, rows: unknown[][]): Promise<void> {
  await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(title)}:clear`, {
    method: 'POST',
    body: '{}',
  })
  if (rows.length === 0) return
  await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(title)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: rows }),
  })
}

/** Appends a single row — used for the run-history log tab, not the per-table data tabs. */
export async function appendSheetRow(spreadsheetId: string, title: string, row: unknown[]): Promise<void> {
  await sheetsFetch(
    `${spreadsheetId}/values/${encodeURIComponent(title)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) }
  )
}
