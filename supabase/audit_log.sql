-- Structured audit log — every create/update/delete across the app, in one
-- place, visible only to a super admin (see supabase/super_admin.sql, which
-- this depends on for current_user_is_super_admin() — run that one first).
--
-- Written exclusively by logAudit() (src/lib/audit-log.ts) using the
-- service-role client, same pattern as form_intake_issues — no INSERT
-- policy needed for app users, since nothing but that helper ever writes
-- here. Regular admins (not super) cannot read this table at all, per the
-- "only the super admin should see this" requirement — not even their own
-- actions.

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name      TEXT,
  actor_role      TEXT,
  action          TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  entity_label    TEXT,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log(actor_user_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin can view audit log" ON audit_log;
CREATE POLICY "Super admin can view audit log" ON audit_log FOR SELECT
  USING (current_user_is_super_admin());
