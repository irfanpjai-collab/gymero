-- Personal Training feature: PT plans + PT memberships, tracked independently
-- of the regular gym membership (renewMembership expires any existing active
-- membership on renewal, so PT can't just be another row in membership_plans/
-- memberships without cancelling a member's regular gym access). Run this
-- once in the Supabase SQL editor. Safe to re-run.

-- ============================================================
-- PT PLANS (mirrors membership_plans, sold independently)
-- ============================================================
CREATE TABLE IF NOT EXISTS pt_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  duration_months INTEGER NOT NULL,
  fee DECIMAL(10,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pt_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view pt plans" ON pt_plans;
CREATE POLICY "Authenticated users can view pt plans" ON pt_plans FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Staff can manage pt plans" ON pt_plans;
CREATE POLICY "Staff can manage pt plans" ON pt_plans FOR ALL USING (auth.uid() IS NOT NULL);

INSERT INTO pt_plans (name, duration_months, fee, description)
SELECT * FROM (VALUES
  ('PT - Monthly', 1, 3000::decimal, 'Personal training - 1 month'),
  ('PT - Quarterly', 3, 8000::decimal, 'Personal training - 3 months')
) AS seed(name, duration_months, fee, description)
WHERE NOT EXISTS (SELECT 1 FROM pt_plans);

-- ============================================================
-- PT MEMBERSHIPS (mirrors memberships, but tied to a specific coach and
-- tracked fully separately so it can run alongside a regular membership)
-- ============================================================
CREATE TABLE IF NOT EXISTS pt_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES pt_plans(id) NOT NULL,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  amount_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pt_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view pt memberships" ON pt_memberships;
CREATE POLICY "Authenticated users can view pt memberships" ON pt_memberships FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Staff can manage pt memberships" ON pt_memberships;
CREATE POLICY "Staff can manage pt memberships" ON pt_memberships FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_pt_memberships_member_id ON pt_memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_pt_memberships_coach_id ON pt_memberships(coach_id);
CREATE INDEX IF NOT EXISTS idx_pt_memberships_expiry ON pt_memberships(expiry_date);

-- ============================================================
-- PAYMENTS — widen to record PT payments distinctly from membership/admission
-- ============================================================
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN ('membership', 'admission', 'personal_training'));

ALTER TABLE payments ADD COLUMN IF NOT EXISTS pt_membership_id UUID REFERENCES pt_memberships(id) ON DELETE SET NULL;
