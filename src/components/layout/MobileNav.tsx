'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Landmark,
  Receipt,
  Settings,
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

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar/95 backdrop-blur-xl border-t border-border/50 px-2 pb-safe">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
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
