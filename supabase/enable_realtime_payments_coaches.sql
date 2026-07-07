-- Enables Supabase Realtime broadcasting for payments, membership_plans,
-- pt_plans, and coaches — the tables backing the newly-cached Payments,
-- Memberships, and Coaches pages. This is the safety net that makes those
-- caches safe regardless of source: any row change (whether from the app,
-- a future mutation that forgets to call revalidateTag, or a direct edit in
-- the Supabase table editor) gets caught here and triggers an immediate
-- refresh — not dependent on application code remembering anything.
-- Mirrors enable_realtime_members.sql. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'membership_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE membership_plans;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pt_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pt_plans;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'coaches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE coaches;
  END IF;
END $$;
