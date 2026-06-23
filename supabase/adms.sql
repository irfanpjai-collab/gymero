-- ADMS (device push protocol) integration tables. Replaces device_sync_queue —
-- the old pyzk/Tailscale system has been archived (see
-- archive/pyzk-tailscale-biometric-2026-06-19/ at repo root).
--
-- No Realtime subscription needed here, unlike device_sync_queue: the device's
-- own poll to /api/adms/getrequest IS the delivery mechanism, so there's no
-- separate background listener process to wire up.
-- Requires security_hardening.sql to have been run first (uses current_user_role()).

CREATE TABLE IF NOT EXISTS adms_devices (
  serial_number TEXT PRIMARY KEY,
  last_seen     TIMESTAMPTZ,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE adms_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View adms devices" ON adms_devices;
CREATE POLICY "View adms devices" ON adms_devices FOR SELECT USING (auth.uid() IS NOT NULL);
-- No INSERT/UPDATE policy for app users — only the device-facing API routes
-- (using the service-role key) ever write here.

CREATE TABLE IF NOT EXISTS adms_commands (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation     TEXT NOT NULL CHECK (operation IN ('enroll', 'remove', 'block', 'unblock')),
  member_id     INTEGER NOT NULL,   -- human-readable member_id == the device's PIN
  full_name     TEXT,               -- needed for 'enroll', null otherwise
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'done', 'failed')),
  result        TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  requested_by  UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

ALTER TABLE adms_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View adms commands" ON adms_commands;
CREATE POLICY "View adms commands" ON adms_commands FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Queue adms commands" ON adms_commands;
CREATE POLICY "Queue adms commands" ON adms_commands FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));

CREATE INDEX IF NOT EXISTS idx_adms_commands_status ON adms_commands(status);
