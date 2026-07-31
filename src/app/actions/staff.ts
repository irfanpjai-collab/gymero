'use server'

import { requireRole, requireSuperAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { UserRole } from '@/types'

export interface StaffOption {
  user_id: string
  name: string
  role: UserRole
}

// Populates the "who made this change" attribution dropdown (e.g. on the
// membership expiry edit) — admins and coaches only, not receptionist, per
// how that feature was scoped.
export async function getStaffForAttribution(): Promise<StaffOption[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('user_profiles')
      .select('user_id, name, role')
      .in('role', ['admin', 'coach'])
      .order('name', { ascending: true })

    return (data ?? []) as StaffOption[]
  } catch (err) {
    console.error('getStaffForAttribution error:', err)
    return []
  }
}

// Creates both the Supabase Auth login and the matching user_profiles row in one
// step — signup is disabled app-wide, so this is now the only way to add staff.
export async function createStaffUser(data: {
  name: string
  email: string
  password: string
  role: UserRole
}): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])

    if (data.password.length < 6) {
      return { error: 'Password must be at least 6 characters' }
    }

    const admin = createAdminClient()

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    })
    if (createError || !created.user) {
      throw new Error(createError?.message ?? 'Failed to create account')
    }

    const { error: profileError } = await admin.from('user_profiles').insert({
      user_id: created.user.id,
      name: data.name,
      email: data.email,
      role: data.role,
    })
    if (profileError) {
      // Don't leave an orphaned login with no profile if this step fails
      await admin.auth.admin.deleteUser(created.user.id)
      throw new Error(profileError.message)
    }

    revalidatePath('/settings')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

// A regular admin must never be able to delete, or take over via a password
// reset, a super admin's account — only another super admin can. Every write
// in this file goes through the service-role client (the Auth Admin API
// calls below bypass RLS entirely by design, and even updateUserRole's table
// update uses the admin client) — so unlike most of this app, there's no RLS
// backstop here. This check is the actual enforcement, not a defense-in-depth
// layer on top of one.
async function assertCanActOnTarget(callerIsSuperAdmin: boolean, targetUserId: string): Promise<void> {
  if (callerIsSuperAdmin) return
  const supabase = await createClient()
  const { data: target } = await supabase
    .from('user_profiles')
    .select('is_super_admin')
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (target?.is_super_admin) {
    throw new Error('Only a super admin can do this to another super admin')
  }
}

// Deletes the Auth login; user_profiles row cascades via its
// ON DELETE CASCADE foreign key (see schema.sql).
export async function deleteStaffUser(userId: string): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin'])

    if (userId === profile.user_id) {
      return { error: "You can't delete your own account" }
    }
    await assertCanActOnTarget(profile.is_super_admin, userId)

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw error

    revalidatePath('/settings')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

// Restricted to super admin, not just admin — see requireSuperAdmin. Unlike
// deleteStaffUser/resetStaffPassword, this one needs no separate target
// check: requireSuperAdmin already means only a super admin ever reaches
// this point, for any target.
export async function updateUserRole(userId: string, role: UserRole): Promise<{ error?: string }> {
  try {
    const profile = await requireSuperAdmin()

    if (userId === profile.user_id) {
      return { error: "You can't change your own role" }
    }

    const admin = createAdminClient()
    const { error } = await admin.from('user_profiles').update({ role }).eq('user_id', userId)
    if (error) throw error

    revalidatePath('/settings')
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

export async function resetStaffPassword(
  userId: string,
  newPassword: string,
): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin'])

    if (newPassword.length < 6) {
      return { error: 'Password must be at least 6 characters' }
    }
    await assertCanActOnTarget(profile.is_super_admin, userId)

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) throw error

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
