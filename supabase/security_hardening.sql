-- Green Power Gym — Security Hardening Migration
-- Run this once in your Supabase SQL editor AFTER schema.sql and salary_and_seed.sql.
-- Safe to re-run (uses IF EXISTS / OR REPLACE / DROP POLICY IF EXISTS throughout).

-- ============================================================
-- ROLE HELPER (SECURITY DEFINER avoids RLS recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM user_profiles WHERE user_id = auth.uid();
$$;

-- ============================================================
-- PREVENT SELF ROLE-ESCALATION
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() IS NULL means this is a direct DB connection (Supabase SQL editor,
  -- service role, etc.) rather than a PostgREST/app request acting as a logged-in
  -- user — that already requires full DB access, so don't block it here, or you'd
  -- never be able to promote the first admin account via the SQL editor.
  IF auth.uid() IS NOT NULL
     AND NEW.role IS DISTINCT FROM OLD.role
     AND current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change a user''s role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON user_profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();

-- ============================================================
-- ROLE-AWARE RLS POLICIES
-- ============================================================

-- membership_plans: view = any authenticated; manage = admin only
DROP POLICY IF EXISTS "Authenticated users can view plans" ON membership_plans;
DROP POLICY IF EXISTS "Admins can manage plans" ON membership_plans;
CREATE POLICY "View plans" ON membership_plans FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin manage plans" ON membership_plans FOR ALL
  USING (current_user_role() = 'admin') WITH CHECK (current_user_role() = 'admin');

-- members: view = any authenticated; insert/update = admin+receptionist; delete = admin
DROP POLICY IF EXISTS "Authenticated users can view members" ON members;
DROP POLICY IF EXISTS "Staff can insert members" ON members;
DROP POLICY IF EXISTS "Staff can update members" ON members;
DROP POLICY IF EXISTS "Admins can delete members" ON members;
CREATE POLICY "View members" ON members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert members" ON members FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Update members" ON members FOR UPDATE
  USING (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Delete members" ON members FOR DELETE
  USING (current_user_role() = 'admin');

-- memberships: view = any authenticated; insert/update = admin+receptionist; delete = admin
DROP POLICY IF EXISTS "Authenticated users can view memberships" ON memberships;
DROP POLICY IF EXISTS "Staff can manage memberships" ON memberships;
CREATE POLICY "View memberships" ON memberships FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert memberships" ON memberships FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Update memberships" ON memberships FOR UPDATE
  USING (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Delete memberships" ON memberships FOR DELETE
  USING (current_user_role() = 'admin');

-- payments: view = any authenticated; insert = admin+receptionist; update/delete = admin
DROP POLICY IF EXISTS "Authenticated users can view payments" ON payments;
DROP POLICY IF EXISTS "Staff can manage payments" ON payments;
CREATE POLICY "View payments" ON payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert payments" ON payments FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Update payments" ON payments FOR UPDATE
  USING (current_user_role() = 'admin');
CREATE POLICY "Delete payments" ON payments FOR DELETE
  USING (current_user_role() = 'admin');

-- coaches: view = any authenticated; insert/update = admin+receptionist; delete = admin
DROP POLICY IF EXISTS "Authenticated users can view coaches" ON coaches;
DROP POLICY IF EXISTS "Staff can manage coaches" ON coaches;
CREATE POLICY "View coaches" ON coaches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert coaches" ON coaches FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Update coaches" ON coaches FOR UPDATE
  USING (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Delete coaches" ON coaches FOR DELETE
  USING (current_user_role() = 'admin');

-- coach_members: view = any authenticated; insert/delete = admin+receptionist
DROP POLICY IF EXISTS "Authenticated users can view assignments" ON coach_members;
DROP POLICY IF EXISTS "Staff can manage assignments" ON coach_members;
CREATE POLICY "View coach assignments" ON coach_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert coach assignments" ON coach_members FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));
CREATE POLICY "Delete coach assignments" ON coach_members FOR DELETE
  USING (current_user_role() IN ('admin', 'receptionist'));

-- whatsapp_logs: view = any authenticated; insert = admin+receptionist
DROP POLICY IF EXISTS "Authenticated users can view logs" ON whatsapp_logs;
DROP POLICY IF EXISTS "Staff can insert logs" ON whatsapp_logs;
CREATE POLICY "View whatsapp logs" ON whatsapp_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert whatsapp logs" ON whatsapp_logs FOR INSERT
  WITH CHECK (current_user_role() IN ('admin', 'receptionist'));

-- staff_salaries: admin only, full stop
DROP POLICY IF EXISTS "Authenticated users can manage staff_salaries" ON staff_salaries;
CREATE POLICY "Admin manage staff_salaries" ON staff_salaries FOR ALL
  USING (current_user_role() = 'admin') WITH CHECK (current_user_role() = 'admin');

-- ============================================================
-- DATA INTEGRITY CONSTRAINTS
-- ============================================================
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_amount_positive;
ALTER TABLE memberships ADD CONSTRAINT memberships_amount_positive CHECK (amount > 0);

-- Audit columns: who recorded this record
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE staff_salaries ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- At most one active membership per member at a time
DROP INDEX IF EXISTS one_active_membership_per_member;
CREATE UNIQUE INDEX one_active_membership_per_member ON memberships(member_id) WHERE status = 'active';

-- coach_id generated atomically instead of app-level "parse last id and increment"
CREATE SEQUENCE IF NOT EXISTS coach_id_seq START 1;
ALTER TABLE coaches ALTER COLUMN coach_id SET DEFAULT
  ('C' || LPAD(nextval('coach_id_seq')::TEXT, 3, '0'));
