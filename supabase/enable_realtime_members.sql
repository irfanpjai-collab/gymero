-- Enables Supabase Realtime broadcasting for members and memberships, so the
-- Members page can pick up a form-intake sync's writes (e.g. from the Apps
-- Script on-submit trigger) the instant they land, without anyone needing to
-- manually reload. Mirrors enable_realtime_attendance.sql / enable_realtime_adms.sql.
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'memberships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE memberships;
  END IF;
END $$;
