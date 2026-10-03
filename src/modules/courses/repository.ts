import type { StorageDatabase } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { guestScope, type OwnerScope } from '../sync/ownership.ts';
import { CourseError, courseId, courseName, decodeSnapshot, encodeSnapshot } from './model.ts';
import type { CourseSnapshot, CourseSummary, SavedCourse } from './model.ts';

export const summaryColumns = `id,name,source,shape,target_km AS targetKm,length_km AS lengthKm,score,
  created_at AS createdAt,updated_at AS updatedAt`;
export function createCourseRepository(db: StorageDatabase, now = Date.now, scope: OwnerScope = guestScope) {
  db = serialDatabase(db);
  // Serialize mutations and reads through this shared repository, including save's two statements.
  let tail: Promise<unknown> = Promise.resolve();
  function queue<T>(task: () => Promise<T>) {
    const result = tail.then(task); tail = result.catch(() => {}); return result;
  }
  return {
    async save(value: CourseSnapshot, name: string): Promise<{ id: string; created: boolean }> {
      const { snapshot, json, hash } = encodeSnapshot(value), title = courseName(name);
      const owner = scope();
      return queue(async () => {
        let saved!: { id: string; created: boolean };
        await db.withExclusiveTransactionAsync(async tx => {
          const existing = await tx.getFirstAsync<{ id: string; snapshot_json: string; snapshot_hash: string }>(
            'SELECT id,snapshot_json,snapshot_hash FROM saved_courses WHERE snapshot_hash=? AND owner_id=?', hash, owner);
          if (existing) { decodeSnapshot(existing.snapshot_json, existing.snapshot_hash); saved = { id: existing.id, created: false }; return; }
          const timestamp = now();
          await tx.runAsync(`INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at,owner_id)
            VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,?,?,?)`, title, snapshot.source, snapshot.shape,
          snapshot.targetKm, snapshot.lengthKm, snapshot.score, json, hash, timestamp, timestamp, owner);
          const row = await tx.getFirstAsync<{ id: string }>('SELECT id FROM saved_courses WHERE snapshot_hash=? AND owner_id=?', hash, owner);
          if (!row) throw new Error('Saved course unavailable');
          saved = { id: row.id, created: true };
        });
        return saved;
      });
    },
    list(limit = 30, offset = 0): Promise<CourseSummary[]> {
      const owner = scope();
      return queue(async () => {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new CourseError('validation', '목록 범위가 올바르지 않아요.');
        return db.getAllAsync<CourseSummary>(`SELECT ${summaryColumns} FROM saved_courses WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, owner, limit, offset);
      });
    },
    get(id: string): Promise<SavedCourse> {
      const owner = scope();
      return queue(async () => {
        const row = await db.getFirstAsync<CourseSummary & { snapshot_json: string; snapshot_hash: string }>(
          `SELECT ${summaryColumns},snapshot_json,snapshot_hash FROM saved_courses WHERE id=? AND owner_id=?`, courseId(id), owner);
        if (!row) throw new CourseError('missing', '저장한 코스를 찾지 못했어요. 삭제됐을 수 있어요.');
        const { snapshot_json, snapshot_hash, ...summary } = row;
        const snapshot = decodeSnapshot(snapshot_json, snapshot_hash);
        if (['source', 'shape', 'targetKm', 'lengthKm', 'score'].some(key => summary[key as keyof CourseSummary] !== snapshot[key as keyof CourseSnapshot])) {
          throw new CourseError('corrupt', '코스 요약과 경로 정보가 달라요. 이 코스를 다시 저장해 주세요.');
        }
        return { ...summary, snapshot };
      });
    },
    rename(id: string, name: string) {
      const key = courseId(id), title = courseName(name), owner = scope();
      return queue(async () => {
        const result = await db.runAsync('UPDATE saved_courses SET name=?,updated_at=? WHERE id=? AND owner_id=?', title, now(), key, owner);
        if (!result.changes) throw new CourseError('missing', '이름을 바꿀 코스를 찾지 못했어요.');
      });
    },
    remove(id: string) {
      const key = courseId(id), owner = scope();
      return queue(async () => {
        const result = await db.runAsync('DELETE FROM saved_courses WHERE id=? AND owner_id=?', key, owner);
        if (!result.changes) throw new CourseError('missing', '삭제할 코스를 찾지 못했어요. 목록을 새로고침해 주세요.');
      });
    },
  };
}
export type CourseRepository = ReturnType<typeof createCourseRepository>;
