-- Adds a device-wide "unlock door" command, separate from any specific
-- member. member_id stays NOT NULL (existing column), so this uses 0 as a
-- sentinel — real member_ids start well above that (see getNextMemberId)
-- and coach device numbers start at 10000, so 0 can never collide with a
-- real PIN. Run after adms.sql. Safe to re-run.

ALTER TABLE adms_commands DROP CONSTRAINT IF EXISTS adms_commands_operation_check;
ALTER TABLE adms_commands ADD CONSTRAINT adms_commands_operation_check
  CHECK (operation IN ('enroll', 'remove', 'block', 'unblock', 'unlock_door'));
