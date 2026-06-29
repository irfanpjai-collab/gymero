import { ImageResponse } from 'next/og'

// iOS Safari (tab switcher, home screen, bookmarks) only supports
// apple-touch-icon as a raster image — it doesn't use icon.svg at all, which
// is why the dumbbell favicon never showed up there. Same design as
// src/app/icon.svg, rendered as a real PNG via next/og since the project has
// no image library installed.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#050608',
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="9" width="6" height="14" rx="2" fill="#7df914" />
          <rect x="22" y="9" width="6" height="14" rx="2" fill="#7df914" />
          <rect x="2" y="13" width="3" height="6" rx="1.5" fill="#7df914" />
          <rect x="27" y="13" width="3" height="6" rx="1.5" fill="#7df914" />
          <rect x="10" y="14" width="12" height="4" rx="1.5" fill="#7df914" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
