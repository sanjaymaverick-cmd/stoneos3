-- LPM does two process steps, not one: Grinding (first), then Polishing
-- (after epoxy is applied — a manual, untracked step in between). Existing
-- rows are backdated as 'polishing', which is correct: everything recorded
-- before this migration was in fact a polishing-finish run.
ALTER TABLE polishing_session ADD COLUMN stage TEXT NOT NULL DEFAULT 'polishing';

-- finish_type (glossy/leather) only makes sense for the polishing stage —
-- a grinding entry has no finish.
ALTER TABLE polishing_session ALTER COLUMN finish_type DROP NOT NULL;
