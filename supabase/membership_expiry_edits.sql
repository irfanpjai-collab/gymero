-- Audit trail for manual expiry-date corrections on an existing membership
-- (distinct from a normal renewal, which creates a new membership row instead
-- of mutating one in place). Requires a reason and an explicit staff
-- attribution — useful when multiple staff share one login account, so the
-- authenticated caller (already enforced via requireRole) and the named
-- person who actually made the call can differ.
-- Run once in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS membership_expiry_edits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  membership_id UUID REFERENCES memberships(id) ON DELETE CASCADE NOT NULL,
  old_expiry_date DATE NOT NULL,
  new_expiry_date DATE NOT NULL,
  reason TEXT NOT NULL,
  edited_by_user_id UUID REFERENCES auth.users(id) NOT NULL,
  performed_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE membership_expiry_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view expiry edits" ON membership_expiry_edits;
CREATE POLICY "Authenticated users can view expiry edits" ON membership_expiry_edits FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Staff can log expiry edits" ON membership_expiry_edits;
CREATE POLICY "Staff can log expiry edits" ON membership_expiry_edits FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_membership_expiry_edits_membership_id ON membership_expiry_edits(membership_id);
