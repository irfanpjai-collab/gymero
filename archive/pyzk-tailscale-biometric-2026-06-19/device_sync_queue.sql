-- Outbound-only, retryable member→device sync queue. Closes the audit finding
-- that automatic enroll/remove pushes (on member create/delete) had no retry
-- and no status tracking — failures were completely silent.
--
-- The CRM only ever INSERTs here (a plain DB write, no HTTP call to the bridge).
-- The bridge subscribes via Supabase Realtime and processes rows — meaning this
-- direction now needs zero inbound reachability, unlike the old direct-HTTP path.
-- Requires security_hardening.sql to have been run first (uses current_user_role()).

CREATE TABLE IF NOT EXISTS device_sync_queue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation     TEXT NOT NULL CHECK (operation IN ('enroll', 'remove')),
  member_id     INTEGER NOT NULL,   -- human-readable member_id == the device's user_id
  full_name     TEXT,               -- required for 'enroll', null for 'remove'
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  result        TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  requested_by  UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

ALTER TABLE device_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View sync queue" ON device_sync_queue;
CREATE POLICY "View sync queue" ON device_sync_queue FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admin/receptionist server actions ever insert here (matches who can
-- create/delete members in the first place). The bridge updates status via the
-- service-role key, bypassing RLS — same pattern as attendance_logs.
DROP POLICY IF EXISTS "Queue sync operations" ON device_sync_queue;
CREATE POLICY "Queue sync operations" ON device_sync_queue FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));

CREATE INDEX IF NOT EXISTS idx_device_sync_queue_status ON device_sync_queue(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'device_sync_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_sync_queue;
  END IF;
END $$;
