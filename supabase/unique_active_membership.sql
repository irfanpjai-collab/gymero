-- Prevents a member from ever having two simultaneously 'active' membership
-- rows. renewMembership() already expires the old row before inserting the
-- new one (two separate statements, not in a transaction), so two renewal
-- submissions fired close together for the same member — a double-click, or
-- two staff members at once — can both read the old row as active before
-- either expires it, and both insert a new active row. This closes that race
-- at the database level: the second INSERT fails loudly with a constraint
-- violation (surfaced to the submitter as an error) instead of silently
-- leaving two active memberships and two payment records on file.
--
-- Verified before adding: no existing member currently has 2+ active rows
-- (checked 2026-07-12), so this can be added without a data cleanup step.
--
-- Not applied to pt_memberships — unlike regular memberships, assigning a
-- new PT package there intentionally does not expire the prior row (see
-- assignPtMembership in src/app/actions/pt.ts), so multiple 'active'-status
-- PT rows per member is expected, not a bug.

CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_active_per_member
  ON memberships (member_id)
  WHERE status = 'active';
