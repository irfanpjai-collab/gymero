'use client'

import './globals.css'

// Only fires when the root layout itself throws — every other route already
// has its own error.tsx (e.g. src/app/(dashboard)/error.tsx). Without this,
// a crash here fell through to Next's default unstyled error screen, which
// gives non-technical staff no way back into the app. Must render its own
// <html>/<body> since it replaces the root layout entirely.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ fontSize: '0.875rem', color: '#a1a1aa', marginBottom: '1.5rem' }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={reset}
            style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem', background: '#3b5bdb', color: '#fff', border: 'none', borderRadius: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
