-- Singleton settings row, readable/writable from the server (unlike the old
-- localStorage-only approach, which meant Settings' "Grace Period" field only
-- ever affected the two client dialogs that happened to read the same
-- browser's localStorage — the Dashboard, Members list, and Reports pages are
-- server-rendered and had no way to see it at all, so they silently used a
-- hardcoded 180-day default regardless of what was saved.
-- Run once in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  grace_period_days INTEGER NOT NULL DEFAULT 180,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO app_settings (id, grace_period_days)
VALUES (1, 180)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view settings" ON app_settings;
CREATE POLICY "Authenticated users can view settings" ON app_settings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Staff can update settings" ON app_settings;
CREATE POLICY "Staff can update settings" ON app_settings FOR UPDATE USING (auth.uid() IS NOT NULL);
