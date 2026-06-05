-- SQL script to define staff_salaries table and seed clean June 2026 test data
-- Copy and run this in your Supabase SQL Editor

-- 1. Create the staff_salaries table if it doesn't exist
CREATE TABLE IF NOT EXISTS staff_salaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_name TEXT NOT NULL,
  staff_type TEXT NOT NULL CHECK (staff_type IN ('coach', 'receptionist', 'admin', 'other')),
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  month DATE NOT NULL,          -- first day of month e.g. 2026-06-01
  base_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
  bonus DECIMAL(10,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_salary DECIMAL(10,2) GENERATED ALWAYS AS (base_salary + bonus - deductions) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and create policy
ALTER TABLE staff_salaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage staff_salaries" ON staff_salaries;
CREATE POLICY "Authenticated users can manage staff_salaries" ON staff_salaries FOR ALL USING (auth.uid() IS NOT NULL);

-- Ensure the admission_fee column exists in the members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS admission_fee DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Ensure the payment_type column exists in the payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'membership' CHECK (payment_type IN ('membership', 'admission'));

-- 2. Truncate all existing test data to start fresh (cascades correctly)
TRUNCATE TABLE whatsapp_logs, coach_members, payments, memberships, members, coaches, staff_salaries, membership_plans CASCADE;

-- 3. Re-insert membership plans with static IDs for easy reference
INSERT INTO membership_plans (id, name, duration_months, fee, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Monthly', 1, 1000.00, 'Monthly membership'),
  ('22222222-2222-2222-2222-222222222222', 'Quarterly', 3, 2700.00, '3 month membership - save 10%'),
  ('33333333-3333-3333-3333-333333333333', 'Half-Yearly', 6, 5000.00, '6 month membership - save 17%'),
  ('44444444-4444-4444-4444-444444444444', 'Annual', 12, 9000.00, 'Annual membership - save 25%');

-- 4. Insert coaches
INSERT INTO coaches (id, coach_id, name, mobile, email, specialization, is_active) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'C-101', 'Aarav Sharma', '9876543210', 'aarav@fitness.com', 'Strength & Conditioning', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'C-102', 'Ishaan Patel', '9876543211', 'ishaan@fitness.com', 'Cardio & Weight Loss', true);

-- 5. Insert 10 members with join dates from Oct 2025 to June 2026
INSERT INTO members (id, member_id, full_name, mobile, email, gender, join_date, admission_fee) VALUES
  ('f0000000-0000-0000-0000-000000000001', 1001, 'Amit Verma', '9812345678', 'amit@gmail.com', 'male', '2026-05-06', 1000.00),
  ('f0000000-0000-0000-0000-000000000002', 1002, 'Priya Nair', '9823456789', 'priya@gmail.com', 'female', '2026-05-10', 1000.00),
  ('f0000000-0000-0000-0000-000000000003', 1003, 'Rahul Gupta', '9834567890', 'rahul@gmail.com', 'male', '2026-05-12', 1000.00),
  ('f0000000-0000-0000-0000-000000000004', 1004, 'Sneha Reddy', '9845678901', 'sneha@gmail.com', 'female', '2026-05-28', 1000.00),
  ('f0000000-0000-0000-0000-000000000005', 1005, 'Vikram Malhotra', '9856789012', 'vikram@gmail.com', 'male', '2026-03-30', 1000.00),
  ('f0000000-0000-0000-0000-000000000006', 1006, 'Ananya Mishra', '9867890123', 'ananya@gmail.com', 'female', '2026-05-02', 1000.00),
  ('f0000000-0000-0000-0000-000000000007', 1007, 'Kabir Singh', '9878901234', 'kabir@gmail.com', 'male', '2026-02-28', 1000.00),
  ('f0000000-0000-0000-0000-000000000008', 1008, 'Divya Joshi', '9889012345', 'divya@gmail.com', 'female', '2025-10-15', 1000.00),
  ('f0000000-0000-0000-0000-000000000009', 1009, 'Rohan Das', '9890123456', 'rohan@gmail.com', 'male', '2026-01-05', 1000.00),
  ('f0000000-0000-0000-0000-000000000010', 1010, 'Meera Sen', '9901234567', 'meera@gmail.com', 'female', '2026-06-01', 1000.00);

-- 6. Insert memberships with expiry dates ranging from Jan 2026 to Jan 2027
-- (Note: Today is Simulated as June 5, 2026)
INSERT INTO memberships (id, member_id, plan_id, start_date, expiry_date, amount, status) VALUES
  -- Expiring June 6 (Expiring Soon - within grace period limit/warning)
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-05-06', '2026-06-06', 1000.00, 'active'),
  -- Expiring June 10 (Expiring Soon)
  ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '2026-05-10', '2026-06-10', 1000.00, 'active'),
  -- Expiring June 12 (Expiring Soon)
  ('d0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '2026-05-12', '2026-06-12', 1000.00, 'active'),
  -- Expiring June 28 (Active, expires later in June)
  ('d0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '2026-05-28', '2026-06-28', 1000.00, 'active'),
  -- Expiring June 30 (Active, expires end of June)
  ('d0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', '2026-03-30', '2026-06-30', 2700.00, 'active'),
  -- Expired June 2 (Expired, within grace period)
  ('d0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '2026-05-02', '2026-06-02', 1000.00, 'expired'),
  -- Expired May 28 (Expired, within grace period)
  ('d0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', '2026-02-28', '2026-05-28', 2700.00, 'expired'),
  -- Expired Jan 15 (Expired long ago)
  ('d0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', '2025-10-15', '2026-01-15', 2700.00, 'expired'),
  -- Active (Expires Jan 5, 2027)
  ('d0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000009', '44444444-4444-4444-4444-444444444444', '2026-01-05', '2027-01-05', 9000.00, 'active'),
  -- Active (Recently joined, expires July 1, 2026)
  ('d0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', '2026-06-01', '2026-07-01', 1000.00, 'active');

-- 7. Insert payments matching memberships
INSERT INTO payments (id, member_id, membership_id, amount, payment_method, payment_type, payment_date, notes) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1000.00, 'cash', 'membership', '2026-05-06', 'Paid cash'),
  ('e0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', NULL, 1000.00, 'cash', 'admission', '2026-05-06', 'Admission fee'),
  ('e0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 1000.00, 'upi', 'membership', '2026-05-10', 'GPay transaction'),
  ('e0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 1000.00, 'upi', 'membership', '2026-05-12', 'UPI transaction'),
  ('e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 1000.00, 'upi', 'membership', '2026-05-28', 'UPI transaction'),
  ('e0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 2700.00, 'bank_transfer', 'membership', '2026-03-30', 'Bank IMPS transfer'),
  ('e0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', 1000.00, 'cash', 'membership', '2026-05-02', 'Paid cash'),
  ('e0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', 2700.00, 'upi', 'membership', '2026-02-28', 'UPI transaction'),
  ('e0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000008', 2700.00, 'cash', 'membership', '2025-10-15', 'Cash payment'),
  ('e0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', 9000.00, 'bank_transfer', 'membership', '2026-01-05', 'Bank transfer'),
  ('e0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', 1000.00, 'upi', 'membership', '2026-06-01', 'UPI transaction');

-- 8. Assign coaches to members
INSERT INTO coach_members (coach_id, member_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-000000000001'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-000000000002'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-000000000003'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-000000000004'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-000000000005'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f0000000-0000-0000-0000-000000000006'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f0000000-0000-0000-0000-000000000007'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f0000000-0000-0000-0000-000000000009'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f0000000-0000-0000-0000-000000000010');

-- 9. Insert staff salary records for June 2026
INSERT INTO staff_salaries (staff_name, staff_type, coach_id, month, base_salary, bonus, deductions, status, paid_at, notes) VALUES
  ('Aarav Sharma', 'coach', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-06-01', 25000.00, 2000.00, 500.00, 'paid', '2026-06-05', 'Paid via bank transfer'),
  ('Ishaan Patel', 'coach', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-06-01', 22000.00, 1500.00, 300.00, 'pending', NULL, 'Awaiting approval'),
  ('Sunita Sharma', 'receptionist', NULL, '2026-06-01', 15000.00, 0.00, 100.00, 'pending', NULL, NULL),
  ('Sameer Khan', 'admin', NULL, '2026-06-01', 35000.00, 5000.00, 1000.00, 'paid', '2026-06-02', 'Salary processed early');
