-- Enables Supabase Realtime broadcasting for pt_memberships and
-- adms_fingerprints — the two tables behind the member detail page's PT and
-- biometric sections that aren't already covered by an earlier
-- enable_realtime_*.sql file. Needed so the newly-cached member detail page
-- (getCachedMemberDetail) refreshes immediately on a PT sale/renewal or a
-- device-confirmed fingerprint enrollment. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pt_memberships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pt_memberships;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'adms_fingerprints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE adms_fingerprints;
  END IF;
END $$;
