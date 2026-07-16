-- Coaches get pushed to the biometric device the same way members do, but
-- need their own PIN namespace so a coach's device PIN never collides with
-- a member_id — starts at 10000 (member IDs are nowhere near that range).
-- Same "DB sequence instead of app-level MAX+1" reasoning as coach_id_seq
-- (security_hardening.sql) and member_id's sequence (accounts_integrity_fixes.sql).
CREATE SEQUENCE IF NOT EXISTS coach_device_number_seq START 10000;

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS device_number INTEGER UNIQUE
  DEFAULT nextval('coach_device_number_seq');

-- Backfill: coaches created before this migration have no device presence.
-- Queue an enroll for each active one, using the device_number the ALTER
-- TABLE above just assigned them, so they aren't left out until someone
-- happens to edit their record. Pri=0 (normal user) — same privilege level
-- as members, no elevated device access. Guarded against re-running this
-- migration twice and double-queuing the same enroll.
INSERT INTO adms_commands (operation, member_id, full_name, requested_by)
SELECT 'enroll', c.device_number, c.name, NULL
FROM coaches c
WHERE c.is_active = true
  AND c.device_number IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM adms_commands ac
    WHERE ac.operation = 'enroll' AND ac.member_id = c.device_number
  );
