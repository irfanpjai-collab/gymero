import type { NextConfig } from 'next'
import path from 'path'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // A stray package-lock.json in the parent user folder makes Turbopack guess
  // the wrong workspace root — pin it explicitly to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async rewrites() {
    return [
      // Some firmware (IIS/ASP.NET-era ADMS heritage) requests the .aspx-suffixed
      // paths instead of the plain ones — accept both.
      { source: '/iclock/cdata',           destination: '/api/adms/cdata' },
      { source: '/iclock/cdata.aspx',      destination: '/api/adms/cdata' },
      { source: '/iclock/getrequest',      destination: '/api/adms/getrequest' },
      { source: '/iclock/getrequest.aspx', destination: '/api/adms/getrequest' },
      { source: '/iclock/devicecmd',       destination: '/api/adms/devicecmd' },
      { source: '/iclock/devicecmd.aspx',  destination: '/api/adms/devicecmd' },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
