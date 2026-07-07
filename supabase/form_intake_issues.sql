-- Rows from the Google Form intake sheet that couldn't be synced because of
-- a data-entry problem (bad/duplicate Member ID, missing name or mobile) —
-- previously these were only ever surfaced as a transient toast on whoever
-- happened to click "Sync from Form", with nothing to look at afterward.
-- Cleared and fully repopulated on every sync run (see runFormIntakeSync),
-- so this table always reflects only the *currently* unresolved rows — fix
-- one in the sheet and re-sync, and it drops out on its own.
-- Run once in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS form_intake_issues (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempted_member_id TEXT,
  name                TEXT,
  mobile              TEXT,
  reason              TEXT NOT NULL,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE form_intake_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View form intake issues" ON form_intake_issues;
CREATE POLICY "View form intake issues" ON form_intake_issues FOR SELECT USING (auth.uid() IS NOT NULL);
-- No INSERT/UPDATE/DELETE policy for app users — only the sync job (using
-- the service-role key) ever writes here.
