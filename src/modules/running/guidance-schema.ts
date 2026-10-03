// SQLite v5: preserve every existing course, run and point in place.
export const runningGuidanceMigration = `
ALTER TABLE running_sessions ADD COLUMN course_id TEXT;
ALTER TABLE running_sessions ADD COLUMN course_name TEXT;
ALTER TABLE running_sessions ADD COLUMN course_outcome TEXT CHECK(course_outcome IN ('active','arrival-pending','finished','stopped'));
ALTER TABLE running_sessions ADD COLUMN course_snapshot_json TEXT;
ALTER TABLE running_sessions ADD COLUMN course_snapshot_hash TEXT;
ALTER TABLE running_sessions ADD COLUMN guidance_json TEXT;
ALTER TABLE running_sessions ADD COLUMN guidance_options_json TEXT;
`;
