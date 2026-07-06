-- Google Form intake sync had no way to represent "join date unknown" — the
-- column's NOT NULL + DEFAULT CURRENT_DATE meant any row synced without a
-- JOIN DATE value silently got stamped with today's (the sync date), which
-- misrepresents when the member actually joined. Dropping NOT NULL lets that
-- stay genuinely blank instead of quietly wrong. DEFAULT CURRENT_DATE is left
-- in place — the manual "Add Member" form still explicitly wants today as its
-- own default when staff create a record in person with no date entered.
-- Safe to re-run.

ALTER TABLE members ALTER COLUMN join_date DROP NOT NULL;
