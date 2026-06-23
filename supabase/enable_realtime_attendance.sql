-- Enables Supabase Realtime broadcasting for attendance_logs, so the dashboard
-- can subscribe to new punches directly from the database — no dependency on
-- the bridge/Tailscale being reachable for this specific feature.
-- Run after attendance_log.sql. Safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_logs;
  END IF;
END $$;
