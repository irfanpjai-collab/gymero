'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit-log'

// Not gated by requireRole — any authenticated user logs their own session
// events, there's no "role" that should be excluded from this. Called from
// the login page right after signInWithPassword succeeds (client still has
// a session then), and from Sidebar's handleLogout BEFORE supabase.auth.signOut()
// clears it — after signOut, getUser() below would return no one to attribute this to.
export async function logAuthEvent(action: 'login' | 'logout'): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, role')
      .eq('user_id', user.id)
      .maybeSingle()

    await logAudit(
      { user_id: user.id, name: profile?.name ?? null, role: profile?.role ?? null },
      action === 'login' ? 'create' : 'delete',
      'session',
      user.id,
      profile?.name ?? user.email ?? null,
      { action, email: user.email }
    )
  } catch (err) {
    console.error('logAuthEvent error:', err)
  }
}
