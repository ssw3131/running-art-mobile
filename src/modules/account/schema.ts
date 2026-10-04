// v6 is additive; all existing notes, courses, GPS and sync state stay in place.
export const accountMigration = `
CREATE TABLE account_preferences (
 owner_id TEXT PRIMARY KEY NOT NULL,
 preferences_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
`;
