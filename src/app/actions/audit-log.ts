'use server'

import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'

export interface AuditLogEntry {
  id: string
  actorName: string | null
  actorRole: string | null
  action: 'create' | 'update' | 'delete'
  entityType: string
  entityId: string | null
  entityLabel: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

// PostgREST treats , . : ( ) as filter-grammar separators — same escaping
// as escapePostgrestValue in members.ts, needed here too since search is
// user-typed and flows into an .or() clause.
function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export interface AuditLogFilters {
  entityType?: string
  action?: 'create' | 'update' | 'delete'
  search?: string
  limit?: number
}

// RLS already restricts this table to a super admin (supabase/audit_log.sql),
// but requireSuperAdmin() is checked explicitly too so a non-super-admin
// gets a clear "not authorized" error instead of a silently empty table —
// same double-gating pattern used everywhere else in this app.
export async function getAuditLog(filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> {
  try {
    await requireSuperAdmin()
    const supabase = await createClient()

    let query = supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filters.limit ?? 300)

    if (filters.entityType) query = query.eq('entity_type', filters.entityType)
    if (filters.action) query = query.eq('action', filters.action)
    if (filters.search) {
      const pattern = escapePostgrestValue(`%${filters.search}%`)
      query = query.or(`entity_label.ilike.${pattern},actor_name.ilike.${pattern}`)
    }

    const { data, error } = await query
    if (error) throw error

    return (data ?? []).map((row) => ({
      id: row.id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityLabel: row.entity_label,
      details: row.details,
      createdAt: row.created_at,
    }))
  } catch (err) {
    console.error('getAuditLog error:', err)
    return []
  }
}

// Populates the entity-type filter dropdown with only what's actually
// present, rather than a hardcoded list that drifts from what's really logged.
export async function getAuditLogEntityTypes(): Promise<string[]> {
  try {
    await requireSuperAdmin()
    const supabase = await createClient()
    const { data, error } = await supabase.from('audit_log').select('entity_type')
    if (error) throw error
    return [...new Set((data ?? []).map((r) => r.entity_type as string))].sort()
  } catch (err) {
    console.error('getAuditLogEntityTypes error:', err)
    return []
  }
}
