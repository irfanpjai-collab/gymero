import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'GreenPowerGym',
  description: 'Professional Gym ERP & CRM for managing members, memberships, payments, and more.',
}

export const viewport: Viewport = {
  themeColor: '#3b5bdb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Analytics />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
