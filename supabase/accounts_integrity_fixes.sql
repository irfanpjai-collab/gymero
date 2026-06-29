-- Fixes for issues found during an accounts/member-fees logic audit:
--
-- 1. member_id was assigned by the app reading MAX(member_id) and incrementing
--    in JS, then inserting — two simultaneous "Add Member" submissions could
--    compute the same "next" id. coach_id already got the sequence treatment
--    (see security_hardening.sql); member_id never did. Fixed the same way.
--
-- 2. membership_plans.fee had no positivity check, unlike payments.amount and
--    memberships.amount which both do.
--
-- 3. memberships.amount_note — lets staff record a reason when the amount
--    charged differs from the plan's listed fee (legitimate discounts,
--    partial payments, etc.), so those cases are flagged/auditable instead of
--    being indistinguishable from a full-price payment with no trace.
--
-- 4. members.deleted_at — "deleting" a member used to hard-delete the row,
--    which cascades to permanently erase their entire payment/membership
--    history (payments.member_id and memberships.member_id are both
--    ON DELETE CASCADE). Switched to a soft delete so financial records are
--    never destroyed. Restricted to admin via a trigger, mirroring the
--    prevent_role_self_escalation pattern already used for user_profiles.role.
--
-- Safe to re-run.

-- 1. member_id sequence
CREATE SEQUENCE IF NOT EXISTS member_id_seq;
SELECT setval('member_id_seq', COALESCE((SELECT MAX(member_id) FROM members), 99), true);
ALTER TABLE members ALTER COLUMN member_id SET DEFAULT nextval('member_id_seq');

-- 2. positive fee
ALTER TABLE membership_plans DROP CONSTRAINT IF EXISTS membership_plans_fee_positive;
ALTER TABLE membership_plans ADD CONSTRAINT membership_plans_fee_positive CHECK (fee > 0);

-- 3. amount_note for price-mismatch flagging
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS amount_note TEXT;

-- 4. soft delete for members
ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_members_deleted_at ON members(deleted_at);

CREATE OR REPLACE FUNCTION prevent_non_admin_member_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can delete or restore a member';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_admin_member_delete ON members;
CREATE TRIGGER trg_prevent_non_admin_member_delete
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION prevent_non_admin_member_delete();
