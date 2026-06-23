-- Durable attendance log — addresses the gap where punches only ever lived
-- transiently on the device/bridge with no system of record.
-- Requires security_hardening.sql to have been run first (uses current_user_role()).

CREATE TABLE IF NOT EXISTS attendance_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id       UUID REFERENCES members(id) ON DELETE SET NULL,
  device_user_id  TEXT NOT NULL,              -- raw device user_id (== members.member_id, stringified)
  punched_at      TIMESTAMPTZ NOT NULL,       -- device-reported punch time
  punch_type      INTEGER NOT NULL DEFAULT 0, -- 0=check-in 1=check-out 4=OT-in 5=OT-out
  status          INTEGER,                    -- raw device status code
  source          TEXT NOT NULL DEFAULT 'device',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_user_id, punched_at)
);

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View attendance" ON attendance_logs;
CREATE POLICY "View attendance" ON attendance_logs FOR SELECT USING (auth.uid() IS NOT NULL);

-- Inserts come from the bridge via a service-role key (bypasses RLS), or from
-- admin/receptionist staff if a manual-entry feature is ever added.
DROP POLICY IF EXISTS "Insert attendance" ON attendance_logs;
CREATE POLICY "Insert attendance" ON attendance_logs FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));

-- No UPDATE/DELETE policy — append-only audit trail by design.

CREATE INDEX IF NOT EXISTS idx_attendance_member_id  ON attendance_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_punched_at ON attendance_logs(punched_at);
