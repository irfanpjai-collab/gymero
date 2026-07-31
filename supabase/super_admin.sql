-- Super Admin: a boolean flag on top of the existing 'admin' role, not a new
-- role value. Deliberately NOT a 4th entry in the role CHECK constraint —
-- that would require touching every one of the ~20 RLS policies across
-- schema.sql/security_hardening.sql/adms.sql/attendance_log.sql/
-- biometric_audit_log.sql/expenses.sql that check `current_user_role() =
-- 'admin'` or `IN ('admin', 'receptionist')`, since a genuinely new role
-- value wouldn't satisfy any of those string comparisons. Keeping
-- role='admin' unchanged for a super admin means every existing check keeps
-- working exactly as before, with zero risk of regressing admin access —
-- this migration adds exactly one new, exclusive capability: changing
-- another user's role. Run after security_hardening.sql. Safe to re-run.

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

-- Narrows role-changing from "any admin" to "only a super admin" — previously
-- prevent_role_self_escalation() gated this on current_user_role() = 'admin'.
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() IS NULL means this is a direct DB connection (Supabase SQL
  -- editor, service role, etc.) rather than a PostgREST/app request acting
  -- as a logged-in user — that already requires full DB access, so don't
  -- block it here, or you'd never be able to promote the first super admin.
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin)
     AND NOT current_user_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can change a user''s role';
  END IF;
  RETURN NEW;
END;
$$;

-- "Users can update own profile" (schema.sql) only allows auth.uid() =
-- user_id — a super admin changing SOMEONE ELSE's role needs its own policy.
DROP POLICY IF EXISTS "Super admin can update any profile" ON user_profiles;
CREATE POLICY "Super admin can update any profile" ON user_profiles FOR UPDATE
  USING (current_user_is_super_admin());

-- Bootstrap: promote Irfan to super admin (already role='admin' — this only
-- adds the extra flag, doesn't change his existing admin access at all).
UPDATE user_profiles SET is_super_admin = true WHERE user_id = 'c37de3cc-58c8-4229-948b-134bebeccbfe';
