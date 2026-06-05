import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dumbbell, Users, CreditCard, MessageCircle, Check, ArrowRight } from 'lucide-react'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0b0d11] text-[#e8eaf0] overflow-hidden">
      {/* Subtle ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-64 -right-64 w-[700px] h-[700px] rounded-full bg-[#3b5bdb]/[0.04] blur-3xl" />
        <div className="absolute -bottom-64 -left-64 w-[700px] h-[700px] rounded-full bg-[#818cf8]/[0.03] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e2130]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#3b5bdb] flex items-center justify-center shadow-lg shadow-[#3b5bdb]/25">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white text-sm tracking-wide">Fitness</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-5 py-2 text-sm bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#3b5bdb]/20"
          >
            Staff Login
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-28 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e2130] border border-[#2a2f44] text-[#9ca3af] text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5b7cfa] animate-pulse-soft inline-block" />
          Gym Management Platform
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold mb-5 leading-[1.1] tracking-tight">
          <span className="text-white">Your Gym.</span>
          <br />
          <span className="bg-gradient-to-r from-[#5b7cfa] via-[#818cf8] to-[#a5b4fc] bg-clip-text text-transparent">
            Fully Managed.
          </span>
        </h1>
        <p className="text-[#6b7280] text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Manage members, track payments, and send WhatsApp reminders — all in one powerful ERP built for fitness centers.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#3b5bdb] hover:bg-[#4c6ef5] text-white rounded-xl font-semibold text-base transition-all shadow-lg shadow-[#3b5bdb]/25 hover:shadow-[#3b5bdb]/40 hover:-translate-y-0.5"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Stats row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-10 mt-16 text-center">
          {[
            { value: '500+', label: 'Active Members' },
            { value: '99%', label: 'Uptime' },
            { value: '24/7', label: 'Access' },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <span className="text-3xl font-extrabold text-white">{stat.value}</span>
              <span className="text-[#6b7280] text-sm">{stat.label}</span>
            </div>
          ))}
        </div>
      </main>

      {/* Feature cards */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <p className="text-center text-[#6b7280] text-xs font-semibold uppercase tracking-widest mb-10">
          Everything you need
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Users,
              iconColor: 'text-blue-400',
              iconBg: 'bg-blue-500/10 border border-blue-500/10',
              title: 'Member Management',
              desc: 'Register members, track their plans, renewal history, and personal details in one place.',
              highlights: ['Member profiles', 'Bulk import via CSV', 'Advanced search'],
            },
            {
              icon: CreditCard,
              iconColor: 'text-indigo-400',
              iconBg: 'bg-indigo-500/10 border border-indigo-500/10',
              title: 'Payment Tracking',
              desc: 'Record payments, generate receipts, and monitor monthly revenue with instant insights.',
              highlights: ['Cash, UPI, bank transfer', 'Monthly revenue reports', 'Payment history'],
            },
            {
              icon: MessageCircle,
              iconColor: 'text-amber-400',
              iconBg: 'bg-amber-500/10 border border-amber-500/10',
              title: 'WhatsApp Reminders',
              desc: 'Auto-remind members about expiring memberships and send custom messages via WhatsApp.',
              highlights: ['Expiry alerts', 'Bulk messaging', 'Custom templates'],
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-[#13151c] border border-[#1e2130] rounded-2xl p-6 card-hover"
            >
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${feature.iconBg} mb-4`}>
                <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
              </div>
              <h3 className="text-white font-semibold text-base mb-2">{feature.title}</h3>
              <p className="text-[#6b7280] text-sm leading-relaxed mb-4">{feature.desc}</p>
              <ul className="space-y-1.5">
                {feature.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-[#6b7280] text-sm">
                    <Check className="w-3.5 h-3.5 text-[#5b7cfa] flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <div className="bg-gradient-to-br from-[#3b5bdb]/90 to-[#4c6ef5]/90 rounded-2xl p-10 text-center shadow-lg shadow-[#3b5bdb]/20">
          <Dumbbell className="w-9 h-9 text-white/90 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Ready to manage your gym?</h2>
          <p className="text-white/70 mb-6 text-sm">Log in and start managing your members today.</p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-white hover:bg-white/90 text-[#3b5bdb] rounded-xl font-semibold transition-colors shadow-md"
          >
            Staff Login
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-[#374151] text-sm border-t border-[#1e2130]">
        <p>&copy; {new Date().getFullYear()} Fitness. All rights reserved.</p>
      </footer>
    </div>
  )
}
