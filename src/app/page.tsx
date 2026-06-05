import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, CreditCard, MessageCircle, Check, ArrowRight } from 'lucide-react'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#050608] text-[#e2e8f0] overflow-hidden">
      {/* Ambient neon blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-64 -right-64 w-[700px] h-[700px] rounded-full bg-[#7df914]/[0.03] blur-3xl" />
        <div className="absolute -bottom-64 -left-64 w-[700px] h-[700px] rounded-full bg-[#7df914]/[0.02] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1a1e27]">
        <div className="flex items-center gap-2.5">
          <img 
            src="/logo.png" 
            alt="Green Power Gym" 
            className="h-12 w-auto object-contain"
          />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-5 py-2.5 text-sm bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl font-bold transition-all shadow-md shadow-primary/10 hover:shadow-primary/20"
          >
            Staff Login
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-28 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d0f14] border border-[#1a1e27] text-muted-foreground text-xs font-semibold mb-8 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-soft inline-block" />
          GRP Gym Command Center
        </div>

        <h1 className="text-5xl md:text-7xl font-black mb-5 leading-[1.1] tracking-tight uppercase">
          <span className="text-white">GREEN POWER GYM.</span>
          <br />
          <span className="bg-gradient-to-r from-primary via-emerald-400 to-lime-300 bg-clip-text text-transparent">
            COMMAND CENTER.
          </span>
        </h1>
        <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Manage members, track membership payments, and dispatch WhatsApp alerts — all in one premium ERP system built for GRP Fitness.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl font-extrabold text-base transition-all shadow-lg shadow-primary/20 hover:shadow-primary/35 hover:-translate-y-0.5"
          >
            Access Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Stats row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-10 mt-16 text-center">
          {[
            { value: 'Active', label: 'Member Tracking' },
            { value: 'Instant', label: 'UPI Payments' },
            { value: 'WhatsApp', label: 'Smart Alerts' },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <span className="text-2xl font-black text-white uppercase tracking-tight">{stat.value}</span>
              <span className="text-primary text-xs font-bold uppercase tracking-widest">{stat.label}</span>
            </div>
          ))}
        </div>
      </main>

      {/* Feature cards */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <p className="text-center text-primary text-xs font-black uppercase tracking-widest mb-10">
          Core Operations
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Users,
              iconColor: 'text-primary',
              iconBg: 'bg-primary/10 border border-primary/20',
              title: 'Member Profiles',
              desc: 'Register members, customize active plans, track renewal history, and check in members instantly.',
              highlights: ['Detailed member sheets', 'Bulk CSV importer', 'Quick session check-in'],
            },
            {
              icon: CreditCard,
              iconColor: 'text-emerald-400',
              iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
              title: 'Payments & Revenue',
              desc: 'Log cash, UPI, and bank transfers, generate unique receipts, and monitor month-on-month growth.',
              highlights: ['Flexible payment modes', 'Automated receipt number', 'Monthly breakdown reports'],
            },
            {
              icon: MessageCircle,
              iconColor: 'text-lime-400',
              iconBg: 'bg-lime-500/10 border border-lime-500/20',
              title: 'Reminders & Alerts',
              desc: 'Deliver manual and auto-templated WhatsApp notifications for expiring memberships or grace periods.',
              highlights: ['One-click reminders', 'Pre-configured templates', 'Outbound log history'],
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-card border border-border rounded-2xl p-6 card-hover"
            >
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${feature.iconBg} mb-4`}>
                <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
              </div>
              <h3 className="text-white font-bold text-base mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">{feature.desc}</p>
              <ul className="space-y-1.5">
                {feature.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
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
        <div className="bg-gradient-to-br from-primary to-emerald-500 rounded-2xl p-10 text-center shadow-lg shadow-primary/20 text-black">
          <h2 className="text-2xl font-black uppercase mb-2">Ready to run GRP Command Center?</h2>
          <p className="text-black/80 mb-6 text-sm font-medium">Log in to manage members, record collections, and view statistics.</p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-black hover:bg-black/90 text-primary rounded-xl font-extrabold transition-colors shadow-md border border-primary/20"
          >
            Staff Login
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-muted-foreground/30 text-xs border-t border-[#1a1e27]">
        <p>&copy; {new Date().getFullYear()} Green Power Fitness Center. All rights reserved.</p>
      </footer>
    </div>
  )
}
