'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  DollarSign,
  UserCheck,
  Wallet,
  MessageCircle,
  BarChart3,
  Settings,
  LogOut,
  Dumbbell,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', subtitle: 'OVERVIEW' },
  { href: '/members', icon: Users, label: 'Members', subtitle: 'MANAGE' },
  { href: '/memberships', icon: CreditCard, label: 'Memberships', subtitle: 'PLANS' },
  { href: '/payments', icon: DollarSign, label: 'Payments', subtitle: 'BILLING' },
  { href: '/coaches', icon: UserCheck, label: 'Coaches', subtitle: 'TRAINERS' },
  { href: '/salary', icon: Wallet, label: 'Salary', subtitle: 'EXPENSES' },
  { href: '/whatsapp', icon: MessageCircle, label: 'WhatsApp', subtitle: 'MESSAGING' },
  { href: '/reports', icon: BarChart3, label: 'Reports', subtitle: 'ANALYTICS' },
  { href: '/settings', icon: Settings, label: 'Settings', subtitle: 'CONFIG' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden lg:flex flex-col h-screen sticky top-0 w-[240px] bg-sidebar border-r border-border z-30">
      {/* Logo / Brand */}
      <div className="flex items-center justify-center p-3 border-b border-border/50">
        <img
          src="/logo.png"
          alt="Green Power Fitness Center"
          className="h-30 w-auto object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative',
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-[var(--sidebar-foreground)] hover:bg-white/[0.04] hover:text-white/80'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[55%] bg-primary rounded-r-full" />
              )}
              <item.icon
                className={cn(
                  'w-4.5 h-4.5 shrink-0 transition-colors duration-150',
                  isActive ? 'text-primary' : 'text-[var(--sidebar-foreground)] group-hover:text-white/60'
                )}
                size={18}
              />
              <div className="min-w-0 flex-1">
                <span className="block leading-tight text-[13px]">{item.label}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-border/50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[var(--sidebar-foreground)] hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 group"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0 group-hover:text-red-400 transition-colors" />
          <span className="text-[13px]">Logout</span>
        </button>
      </div>
    </aside>
  )
}
