import { createClient } from '@/lib/supabase/server'
import { ShieldOff } from 'lucide-react'
import AccountsClient from './accounts-client'

// Server-side role gate — RLS already hides staff_salaries/expenses data from
// non-admins, but payments are visible to any authenticated user, so the page
// itself needs an explicit check to actually be "admin only" rather than
// "admin only except the revenue numbers."
export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    role = profile?.role ?? null
  }

  if (role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <ShieldOff className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <p className="text-foreground font-semibold">Admins only</p>
        <p className="text-muted-foreground text-sm mt-1">This section is restricted to admin accounts.</p>
      </div>
    )
  }

  return <AccountsClient />
}
