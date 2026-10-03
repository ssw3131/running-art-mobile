// SQLite v4. Original payload columns are copied byte-for-byte.
export const personalSyncMigration = `
ALTER TABLE saved_courses RENAME TO saved_courses_v3;
DROP INDEX saved_courses_created;
CREATE TABLE saved_courses (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK(source IN ('osm','synthetic')), shape TEXT NOT NULL,
  target_km REAL NOT NULL CHECK(target_km>0 AND target_km<=1000),
  length_km REAL NOT NULL CHECK(length_km>0 AND length_km<=1000),
  score REAL NOT NULL CHECK(score>=0 AND score<=100),
  snapshot_json TEXT NOT NULL CHECK(length(snapshot_json) BETWEEN 1 AND 2097152),
  snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  owner_id TEXT NOT NULL DEFAULT '', remote_version INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1, mutation_id TEXT NOT NULL DEFAULT (lower(hex(randomblob(16))))
);
INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at)
 SELECT id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at FROM saved_courses_v3;
DROP TABLE saved_courses_v3;
CREATE INDEX saved_courses_created ON saved_courses(owner_id,created_at DESC,id DESC);
CREATE INDEX saved_courses_hash ON saved_courses(owner_id,snapshot_hash);
ALTER TABLE running_sessions ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE running_sessions ADD COLUMN remote_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE running_sessions ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE running_sessions ADD COLUMN mutation_id TEXT NOT NULL DEFAULT '';
UPDATE running_sessions SET mutation_id=lower(hex(randomblob(16)));
CREATE INDEX running_owner ON running_sessions(owner_id,started_at DESC,id DESC);
CREATE TABLE sync_accounts(owner_id TEXT PRIMARY KEY NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,last_success INTEGER);
CREATE TABLE sync_deletions(
 owner_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('course','run')),id TEXT NOT NULL,
 remote_version INTEGER NOT NULL,mutation_id TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 PRIMARY KEY(owner_id,kind,id)
);
CREATE TABLE sync_conflicts(
 owner_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,remote_json TEXT NOT NULL,
 PRIMARY KEY(owner_id,kind,id)
);
CREATE TRIGGER course_sync_changed AFTER UPDATE OF name ON saved_courses
WHEN NEW.name!=OLD.name BEGIN
 UPDATE saved_courses SET dirty=1,mutation_id=lower(hex(randomblob(16))) WHERE id=NEW.id;
END;
CREATE TRIGGER course_sync_deleted AFTER DELETE ON saved_courses WHEN OLD.owner_id!='' BEGIN
 INSERT OR REPLACE INTO sync_deletions(owner_id,kind,id,remote_version) VALUES(OLD.owner_id,'course',OLD.id,OLD.remote_version);
END;
CREATE TRIGGER run_sync_deleted AFTER DELETE ON running_sessions WHEN OLD.owner_id!='' BEGIN
 INSERT OR REPLACE INTO sync_deletions(owner_id,kind,id,remote_version) VALUES(OLD.owner_id,'run',OLD.id,OLD.remote_version);
END;
CREATE TRIGGER run_sync_started AFTER INSERT ON running_sessions WHEN NEW.mutation_id='' BEGIN
 UPDATE running_sessions SET mutation_id=lower(hex(randomblob(16))) WHERE id=NEW.id;
END;
CREATE TRIGGER run_sync_completed AFTER UPDATE OF status ON running_sessions WHEN NEW.status='completed' AND OLD.status!='completed' BEGIN
 UPDATE running_sessions SET dirty=1,mutation_id=lower(hex(randomblob(16))) WHERE id=NEW.id;
END;
`;
