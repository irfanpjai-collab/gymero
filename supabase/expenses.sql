-- Daily operating expenses (rent, electricity, supplies, etc.), tracked the
-- same way as staff_salaries: a fixed category set instead of free text (acts
-- as a lightweight chart of accounts), a pending/paid status with a "mark
-- paid" action, and admin-only RLS since this is sensitive financial data —
-- mirrors staff_salaries' policy exactly (see security_hardening.sql).

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category        TEXT NOT NULL CHECK (category IN (
                    'rent', 'electricity', 'water', 'maintenance',
                    'equipment', 'supplies', 'marketing', 'staff_welfare', 'other'
                  )),
  description     TEXT NOT NULL,
  amount          DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'bank_transfer')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at         DATE,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage expenses" ON expenses;
CREATE POLICY "Admin manage expenses" ON expenses FOR ALL
  USING (current_user_role() = 'admin') WITH CHECK (current_user_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
