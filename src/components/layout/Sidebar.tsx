'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { logAuthEvent } from '@/app/actions/auth-log'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  DollarSign,
  UserCheck,
  Wallet,
  Receipt,
  Landmark,
  MessageCircle,
  BarChart3,
  FileSpreadsheet,
  Settings,
  LogOut,
  Fingerprint,
  ClipboardList,
} from 'lucide-react'

type NavItem = {
  href:  string
  icon:  React.ElementType
  label: string
}

type NavGroup = {
  section: string
  items:   NavItem[]
}

const navGroups: NavGroup[] = [
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
      { href: '/accounts',    icon: Landmark,        label: 'Accounts'    },
      { href: '/whatsapp',    icon: MessageCircle,   label: 'WhatsApp'    },
      { href: '/reports',     icon: BarChart3,       label: 'Reports'     },
      { href: '/documents',   icon: FileSpreadsheet, label: 'Document Center' },
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

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  // Logs is inserted into the System group only for a super admin — fetched
  // client-side since Sidebar has no server-rendered profile data to draw on.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .single()
      if (profile?.is_super_admin) setIsSuperAdmin(true)
    })
  }, [])

  const groups: NavGroup[] = isSuperAdmin
    ? navGroups.map((g) =>
        g.section === 'System'
          ? { ...g, items: [...g.items, { href: '/logs', icon: ClipboardList, label: 'Logs' }] }
          : g
      )
    : navGroups

  const handleLogout = async () => {
    // Must log before signOut() — once the session is cleared, logAuthEvent
    // has no authenticated user left to attribute the entry to.
    await logAuthEvent('logout').catch(console.error)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <aside className="hidden lg:flex flex-col h-screen sticky top-0 w-[220px] bg-sidebar border-r border-border z-30">

      {/* Logo */}
      <div className="flex items-center justify-center p-3 border-b border-border/50">
        <img
          src="/logo.png"
          alt="Green Power Fitness Center"
          className="h-30 w-auto object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-4">
        {groups.map((group) => (
          <div key={group.section}>
            {/* Section label */}
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 select-none">
              {group.section}
            </p>

            {/* Items */}
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

      {/* Logout */}
      <div className="p-2.5 border-t border-border/50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-[var(--sidebar-foreground)] hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 group"
        >
          <LogOut size={16} className="shrink-0 group-hover:text-red-400 transition-colors" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}
