import { createClient } from '@/lib/supabase/server'
import type { UserProfile, UserRole } from '@/types'

export class AuthorizationError extends Error {}

/**
 * Server-action defense-in-depth check, on top of Supabase RLS.
 * Throws AuthorizationError if the caller isn't logged in or doesn't hold one of `allowedRoles`.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<UserProfile> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new AuthorizationError('Not signed in')

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error || !profile) throw new AuthorizationError('No staff profile found')

  const role = (profile as UserProfile).role
  if (!allowedRoles.includes(role)) {
    throw new AuthorizationError(`This action requires role: ${allowedRoles.join(' or ')}`)
  }

  return profile as UserProfile
}
