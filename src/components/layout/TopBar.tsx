'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/types'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/members': 'Members',
  '/memberships': 'Memberships',
  '/payments': 'Payments',
  '/coaches': 'Coaches',
  '/leads': 'Leads',
  '/whatsapp': 'WhatsApp',
  '/reports': 'Reports',
  '/settings': 'Settings',
}

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      return title
    }
  }
  return 'Fitness'
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-primary/10 text-primary border border-primary/20'
    case 'coach':
      return 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
    case 'receptionist':
      return 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
    default:
      return 'bg-muted text-muted-foreground border border-border'
  }
}

export default function TopBar() {
  const pathname = usePathname()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) setProfile(data as UserProfile)
    }

    fetchProfile()
  }, [])

  const pageTitle = getPageTitle(pathname)
  const initials = profile?.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'FT'

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 lg:px-6 py-2 lg:py-3 bg-background/90 backdrop-blur-md border-b border-border shadow-[0_1px_0_0_var(--border)]">
      <div className="flex items-center gap-3">
        {/* Mobile/Tablet Brand Logo */}
        <div className="lg:hidden flex items-center bg-white rounded-lg p-1 px-2 shadow-neon shrink-0">
          <img
            src="/logo.png"
            alt="Green Power Fitness Center"
            className="h-7 w-auto object-contain"
          />
        </div>
        <h2 className="text-sm lg:text-base font-semibold text-foreground tracking-tight">{pageTitle}</h2>
      </div>

      <div className="flex items-center gap-2.5">
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-8 h-8 rounded-lg bg-secondary hover:bg-card-elevated text-muted-foreground hover:text-foreground flex items-center justify-center border border-border hover:border-border-bright transition-all cursor-pointer"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
          </button>
        )}

        {profile && (
          <span className={`hidden sm:inline-flex text-[11px] font-medium px-2.5 py-1 rounded-full capitalize ${getRoleBadgeClass(profile.role)}`}>
            {profile.role}
          </span>
        )}

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-[11px]">{initials}</span>
          </div>
          {profile && (
            <div className="hidden md:block">
              <p className="text-[13px] font-medium text-foreground leading-tight">{profile.name}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{profile.email}</p>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
