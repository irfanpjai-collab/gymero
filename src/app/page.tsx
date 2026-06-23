import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#050608] text-[#e2e8f0] flex flex-col">
      {/* Ambient neon blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/3 -right-1/4 w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-[#7df914]/[0.03] blur-3xl" />
        <div className="absolute -bottom-1/3 -left-1/4 w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-[#7df914]/[0.02] blur-3xl" />
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <img
          src="/logo.png"
          alt="Green Power Gym"
          className="h-20 sm:h-24 md:h-28 w-auto object-contain mb-8"
        />

        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-2">
          Green Power Gym
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base mb-10">
          Gym Management Command Center
        </p>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-7 py-3 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl font-bold text-sm sm:text-base transition-all shadow-lg shadow-primary/20 hover:shadow-primary/35 hover:-translate-y-0.5"
        >
          Staff Login
          <ArrowRight className="w-4 h-4" />
        </Link>
      </main>

      <footer className="relative z-10 text-center py-6 text-muted-foreground/30 text-xs">
        &copy; {new Date().getFullYear()} Green Power Fitness Center
      </footer>
    </div>
  )
}
