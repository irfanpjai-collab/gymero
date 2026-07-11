-- Enables Supabase Realtime broadcasting for staff_salaries and expenses —
-- the two Reports-page tables not already covered by enable_realtime_members.sql
-- (members/memberships) or enable_realtime_payments_coaches.sql (payments).
-- Needed so the Reports page's TableRealtimeRefresh actually fires when either
-- table changes. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'staff_salaries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_salaries;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
  END IF;
END $$;
