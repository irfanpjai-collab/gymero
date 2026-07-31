-- Consolidated run of everything still pending as of 2026-07-31. Checked
-- directly against the live database first: supabase/coach_device_push.sql
-- is confirmed already applied (coaches.device_number exists, Vishnu's
-- enroll already completed on the device) — NOT included here. The realtime
-- publication checks below are unverifiable from the app's REST connection
-- (no system-catalog access without a direct Postgres connection), but
-- every ALTER PUBLICATION here is IF-NOT-EXISTS-guarded, so running this on
-- top of whatever's already applied is a safe no-op for any part already
-- done. Confirmed still missing: user_profiles.is_super_admin (the
-- super_admin.sql section below).
--
-- Run this once in the Supabase SQL editor, top to bottom.


-- ============================================================
-- 1. Realtime: payments, membership_plans, pt_plans, coaches
--    (supabase/enable_realtime_payments_coaches.sql)
-- ============================================================
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


-- ============================================================
-- 2. Realtime: staff_salaries, expenses
--    (supabase/enable_realtime_reports_extra.sql)
-- ============================================================
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


-- ============================================================
-- 3. Realtime: pt_memberships, adms_fingerprints
--    (supabase/enable_realtime_member_detail.sql)
-- ============================================================
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


-- ============================================================
-- 4. One-active-membership-per-member constraint
--    (supabase/unique_active_membership.sql)
--    NOTE: security_hardening.sql (confirmed already applied) already
--    creates an index named one_active_membership_per_member with this
--    exact same effect — this one below uses a different name, so it is
--    NOT skipped by IF NOT EXISTS even though it's functionally redundant.
--    Harmless either way (Postgres just enforces the same rule twice), but
--    if you want to skip it, this section is the one to remove.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_active_per_member
  ON memberships (member_id)
  WHERE status = 'active';


-- ============================================================
-- 5. Super admin (supabase/super_admin.sql) — confirmed NOT yet applied
-- ============================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION current_user_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT is_super_admin FROM user_profiles WHERE user_id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin)
     AND NOT current_user_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can change a user''s role';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Super admin can update any profile" ON user_profiles;
CREATE POLICY "Super admin can update any profile" ON user_profiles FOR UPDATE
  USING (current_user_is_super_admin());

UPDATE user_profiles SET is_super_admin = true WHERE user_id = 'c37de3cc-58c8-4229-948b-134bebeccbfe';
