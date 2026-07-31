'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  Landmark,
  Receipt,
  Settings,
  ClipboardList,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home'     },
  { href: '/members',   icon: Users,           label: 'Members'  },
  { href: '/accounts',  icon: Landmark,        label: 'Accounts' },
  { href: '/expenses',  icon: Receipt,         label: 'Expenses' },
  { href: '/settings',  icon: Settings,        label: 'Settings' },
]

export default function MobileNav() {
  const pathname = usePathname()
  // Same super-admin-only gating as the desktop Sidebar — fetched client-side
  // since neither nav has server-rendered profile data to draw on.
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

  const items = isSuperAdmin
    ? [...navItems, { href: '/logs', icon: ClipboardList, label: 'Logs' }]
    : navItems

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar/95 backdrop-blur-xl border-t border-border/50 px-2 pb-safe">
      <div className="flex items-center justify-around py-2">
        {items.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all min-w-[48px] relative',
                isActive ? 'text-white' : 'text-[var(--sidebar-foreground)] hover:text-white/60'
              )}
            >
              {isActive && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" />
              )}
              <item.icon className={cn('w-5 h-5', isActive && 'text-primary')} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
