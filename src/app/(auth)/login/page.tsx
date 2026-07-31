'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { logAuthEvent } from '@/app/actions/auth-log'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      logAuthEvent('login').catch(console.error)
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Subtle background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Brand Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex items-center justify-center w-52">
            <img
              src="/logo.png"
              alt="Green Power Fitness Center"
              className="w-full h-auto object-contain"
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-lg shadow-black/40">
          <h2 className="text-lg font-bold text-foreground mb-0.5">Welcome back</h2>
          <p className="text-muted-foreground text-sm mb-6">Sign in to your admin account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@fitness.gym"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary hover:bg-primary/95 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded-xl font-bold transition-all shadow-md shadow-primary/10 hover:shadow-primary/20 text-sm mt-1"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        </div>

        <div className="mt-4 text-center">
          <p className="text-muted-foreground/30 text-xs">Fitness ERP &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  )
}
