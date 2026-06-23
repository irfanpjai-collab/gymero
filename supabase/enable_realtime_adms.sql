-- Enables Supabase Realtime broadcasting for adms_commands and adms_devices —
-- needed so the Biometric page can show live status changes (command queued →
-- sent → done, device last-seen updates) without a manual refresh. Mirrors
-- enable_realtime_attendance.sql, which only covered attendance_logs.
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'adms_commands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE adms_commands;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'adms_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE adms_devices;
  END IF;
END $$;
