-- Tracks whether a membership's payment has been collected yet.
-- Set to true when a member is added with "Paid now" unchecked.
-- False by default (existing rows and normal paid entries).
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payment_pending BOOLEAN NOT NULL DEFAULT FALSE;
