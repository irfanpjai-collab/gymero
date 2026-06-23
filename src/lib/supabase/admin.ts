import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client — bypasses Row Level Security entirely. Only for trusted,
 * server-only background jobs (e.g. the weekly Sheets backup) that have no logged-in
 * user/session to check a role against. Never import this into request-path code
 * that handles user input.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}
