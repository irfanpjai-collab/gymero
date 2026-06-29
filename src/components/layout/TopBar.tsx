'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/types'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import {
  Sun, Moon, LogOut, Menu, X,
  LayoutDashboard, Users, CreditCard, DollarSign,
  UserCheck, Wallet, Receipt, MessageCircle, BarChart3,
  Settings, Fingerprint,
} from 'lucide-react'

const pageTitles: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/members':     'Members',
  '/memberships': 'Memberships',
  '/payments':    'Payments',
  '/coaches':     'Coaches',
  '/leads':       'Leads',
  '/salary':      'Salary',
  '/expenses':    'Expenses',
  '/whatsapp':    'WhatsApp',
  '/reports':     'Reports',
  '/settings':    'Settings',
  '/biometric':   'Biometric',
}

const navGroups = [
  {
    section: 'CRM',
    items: [
      { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
      { href: '/members',     icon: Users,           label: 'Members'     },
      { href: '/memberships', icon: CreditCard,      label: 'Memberships' },
      { href: '/payments',    icon: DollarSign,      label: 'Payments'    },
      { href: '/coaches',     icon: UserCheck,       label: 'Coaches'     },
      { href: '/salary',      icon: Wallet,          label: 'Salary'      },
      { href: '/expenses',    icon: Receipt,         label: 'Expenses'    },
      { href: '/whatsapp',    icon: MessageCircle,   label: 'WhatsApp'    },
      { href: '/reports',     icon: BarChart3,       label: 'Reports'     },
    ],
  },
  {
    section: 'Fingerprint',
    items: [
      { href: '/biometric', icon: Fingerprint, label: 'Biometric' },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

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
  const router   = useRouter()
  const [profile, setProfile]       = useState<UserProfile | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { theme, setTheme }         = useTheme()
  const [mounted, setMounted]       = useState(false)

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

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
  const initials  = profile?.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'FT'

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 lg:px-6 py-2 lg:py-3 bg-background/90 backdrop-blur-md border-b border-border shadow-[0_1px_0_0_var(--border)]">
        <div className="flex items-center gap-2.5">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden w-8 h-8 rounded-lg bg-secondary hover:bg-card-elevated text-muted-foreground hover:text-foreground flex items-center justify-center border border-border transition-all cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Mobile brand logo */}
          <div className="lg:hidden flex items-center shrink-0">
            <img
              src="/logo.png"
              alt="Green Power Fitness Center"
              className="h-7 w-auto object-contain dark:brightness-0 dark:invert opacity-90"
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
            <button
              onClick={handleLogout}
              className="lg:hidden ml-1 w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center transition-all cursor-pointer"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile full-nav drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <aside className="relative flex flex-col h-full w-[260px] bg-sidebar border-r border-border shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <img
                src="/logo.png"
                alt="Green Power Fitness Center"
                className="h-10 w-auto object-contain"
              />
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white flex items-center justify-center transition-all"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav groups */}
            <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-4">
              {navGroups.map((group) => (
                <div key={group.section}>
                  <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 select-none">
                    {group.section}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group relative',
                            active
                              ? 'bg-white/[0.08] text-white'
                              : 'text-[var(--sidebar-foreground)] hover:bg-white/[0.04] hover:text-white/80'
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[55%] bg-primary rounded-r-full" />
                          )}
                          <item.icon
                            size={16}
                            className={cn(
                              'shrink-0 transition-colors duration-150',
                              active
                                ? 'text-primary'
                                : 'text-[var(--sidebar-foreground)] group-hover:text-white/60'
                            )}
                          />
                          <span className="leading-tight truncate">{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* User + Logout */}
            <div className="p-2.5 border-t border-border/50">
              {profile && (
                <div className="px-2.5 pb-2.5">
                  <p className="text-[13px] font-medium text-foreground leading-tight">{profile.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{profile.email}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-[var(--sidebar-foreground)] hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 group"
              >
                <LogOut size={16} className="shrink-0 group-hover:text-red-400 transition-colors" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
