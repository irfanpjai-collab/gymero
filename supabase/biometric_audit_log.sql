-- Audit trail for device-control actions (unlock, push, delete, access change).
-- Closes the audit finding that these had zero record of who triggered them —
-- the bridge's own logs are ephemeral, local-machine-only, and don't know which
-- CRM user made the request (it only sees a shared API key, not an identity).
-- Written from the Next.js side, where the logged-in user's identity is known.

CREATE TABLE IF NOT EXISTS biometric_audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action          TEXT NOT NULL CHECK (action IN ('unlock', 'push_members', 'delete_user', 'set_access')),
  actor_user_id   UUID REFERENCES auth.users(id),
  target_member   TEXT,        -- member_id / device uid / name, whatever's relevant to the action
  details         JSONB,
  success         BOOLEAN NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE biometric_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View biometric audit log" ON biometric_audit_log;
CREATE POLICY "View biometric audit log" ON biometric_audit_log FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Insert biometric audit log" ON biometric_audit_log;
CREATE POLICY "Insert biometric audit log" ON biometric_audit_log FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));

CREATE INDEX IF NOT EXISTS idx_biometric_audit_created_at ON biometric_audit_log(created_at);
