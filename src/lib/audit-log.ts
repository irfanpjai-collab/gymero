import { createAdminClient } from '@/lib/supabase/admin'
import type { UserProfile } from '@/types'

export type AuditAction = 'create' | 'update' | 'delete'

// A minimal actor shape rather than requiring the full UserProfile — lets
// the automated form-intake sync (no logged-in user, see form-intake-sync.ts)
// log under a synthetic "system" actor instead of needing a real one.
export interface AuditActor {
  user_id: string | null
  name: string | null
  role: string | null
}

export const SYSTEM_ACTOR: AuditActor = {
  user_id: null,
  name: 'Form Intake Sync (automated)',
  role: 'system',
}

export function actorFromProfile(profile: UserProfile): AuditActor {
  return { user_id: profile.user_id, name: profile.name, role: profile.role }
}

// Fire-and-forget — a logging failure must never block or fail the mutation
// it's attached to, so every call site should call this without awaiting
// its result blocking a user-facing error, and errors are only console.error'd.
// Uses the service-role client rather than the caller's request-scoped one:
// audit_log has no INSERT policy for regular users (see supabase/audit_log.sql),
// so this is the only path that can write here regardless of which role
// performed the underlying action.
export async function logAudit(
  actor: AuditActor,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  entityLabel: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('audit_log').insert({
      actor_user_id: actor.user_id,
      actor_name: actor.name,
      actor_role: actor.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_label: entityLabel,
      details: details ?? null,
    })
    if (error) console.error('logAudit insert failed:', error.message)
  } catch (err) {
    console.error('logAudit failed:', err)
  }
}

export interface AuditLogRow {
  actor: AuditActor
  action: AuditAction
  entityType: string
  entityId: string | null
  entityLabel: string | null
  details?: Record<string, unknown>
}

// Bulk variant — one INSERT for N rows instead of N round trips, for loops
// like importMembers/runFormIntakeSync that can process hundreds of rows.
export async function logAuditBatch(rows: AuditLogRow[]): Promise<void> {
  if (rows.length === 0) return
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('audit_log').insert(
      rows.map((r) => ({
        actor_user_id: r.actor.user_id,
        actor_name: r.actor.name,
        actor_role: r.actor.role,
        action: r.action,
        entity_type: r.entityType,
        entity_id: r.entityId,
        entity_label: r.entityLabel,
        details: r.details ?? null,
      }))
    )
    if (error) console.error('logAuditBatch insert failed:', error.message)
  } catch (err) {
    console.error('logAuditBatch failed:', err)
  }
}
