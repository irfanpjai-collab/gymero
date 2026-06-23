'use server'

import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { UserRole } from '@/types'

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

// Deletes the Auth login; user_profiles row cascades via its
// ON DELETE CASCADE foreign key (see schema.sql).
export async function deleteStaffUser(userId: string): Promise<{ error?: string }> {
  try {
    const profile = await requireRole(['admin'])

    if (userId === profile.user_id) {
      return { error: "You can't delete your own account" }
    }

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

export async function resetStaffPassword(
  userId: string,
  newPassword: string,
): Promise<{ error?: string }> {
  try {
    await requireRole(['admin'])

    if (newPassword.length < 6) {
      return { error: 'Password must be at least 6 characters' }
    }

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) throw error

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
