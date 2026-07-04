-- Confirmed fingerprint enrollments, sourced from the device's own OPERLOG
-- push (a "FP PIN=x FID=y Size=z Valid=1 TMP=..." line) the moment someone
-- enrolls a finger at the physical machine. No remote "is this PIN enrolled"
-- query command exists for this firmware (confirmed via live test — it
-- rejects DATA QUERY FP with Return=-1004), so this is populated passively
-- instead of queried on demand.
--
-- The actual biometric template (TMP=...) is deliberately NOT stored — it's
-- sensitive biometric data we have no use for; only existence/validity
-- matters here. Run this once in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS adms_fingerprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_user_id TEXT NOT NULL,
  fid INTEGER NOT NULL,
  valid BOOLEAN NOT NULL DEFAULT true,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_user_id, fid)
);

ALTER TABLE adms_fingerprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view fingerprints" ON adms_fingerprints;
CREATE POLICY "Authenticated users can view fingerprints" ON adms_fingerprints FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Staff can manage fingerprints" ON adms_fingerprints;
CREATE POLICY "Staff can manage fingerprints" ON adms_fingerprints FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_adms_fingerprints_device_user_id ON adms_fingerprints(device_user_id);
