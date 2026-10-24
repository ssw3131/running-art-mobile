import type { StorageDatabase } from '../storage/types.ts';
import type { OwnerScope } from '../sync/ownership.ts';
import type { CourseRepository } from '../courses/repository.ts';
import { encodeSnapshot, decodeSnapshot, courseName, type CourseSnapshot } from '../courses/model.ts';
import { AllowanceError, assertAllowed, type UsageAccess } from './model.ts';

type Pending = { id: string; owner_id: string; snapshot_json: string; snapshot_hash: string; name: string; course_id: string; kind: string };
/** Durable staging does not enter saved_courses, home counts or sync until server confirmation. */
export function meteredCourses(db: StorageDatabase, raw: CourseRepository, scope: OwnerScope, access: UsageAccess): CourseRepository {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => { const task = tail.then(fn); tail = task.catch(() => {}); return task; };
  async function finish(pending: Pending) {
    const check = () => { if (scope() !== pending.owner_id) throw new AllowanceError('계정이 바뀌었어요. 다시 시도해 주세요.'); };
    check();
    const value = decodeSnapshot(pending.snapshot_json, pending.snapshot_hash);
    let op = await access.command('read', { id: pending.id }); check();
    if (!op) op = await access.command('reserve', { id: pending.id, kind: 'save', fingerprint: pending.snapshot_hash });
    check();
    if (op?.state === 'cancelled' || op?.state === 'exhausted') {
      await db.runAsync('DELETE FROM usage_pending WHERE id=? AND owner_id=?', pending.id, pending.owner_id);
      assertAllowed(op);
    }
    op = assertAllowed(op);
    if (op.state === 'reserved') {
      const confirmed = await access.command('commit', { id: pending.id, courseId: pending.course_id });
      if (confirmed?.state === 'exhausted') {
        await access.command('cancel', { id: pending.id });
        await db.runAsync('DELETE FROM usage_pending WHERE id=? AND owner_id=?', pending.id, pending.owner_id);
      }
      op = assertAllowed(confirmed);
    }
    check();
    if (op.state !== 'committed' && op.state !== 'existing') throw new AllowanceError('저장 확인 중이에요. 온라인에서 다시 시도해 주세요.');
    const result = await raw.save(value, pending.name, op.courseId ?? pending.course_id); check();
    await db.runAsync('DELETE FROM usage_pending WHERE id=? AND owner_id=?', pending.id, pending.owner_id);
    return result;
  }
  async function flushDeletes(owner: string) {
    const pending = await db.getAllAsync<Pending>('SELECT * FROM usage_pending WHERE owner_id=? AND kind=?', owner, 'delete');
    for (const row of pending) {
      if (scope() !== owner) throw new AllowanceError('계정이 바뀌었어요.');
      await access.command('delete_course', { courseId: row.course_id });
      await db.runAsync('DELETE FROM usage_pending WHERE id=? AND owner_id=?', row.id, owner);
    }
  }
  return { ...raw,
    save(value: CourseSnapshot, title: string) { return serial(async () => {
      const owner = scope(), encoded = encodeSnapshot(value), name = courseName(title);
      const existing = await raw.findHash(encoded.hash);
      if (scope() !== owner) throw new AllowanceError('계정이 바뀌었어요.');
      if (existing) return { id: existing, created: false };
      if (!owner) throw new AllowanceError('가입과 로그인을 완료한 뒤 저장해 주세요.');
      await flushDeletes(owner);
      let pending = await db.getFirstAsync<Pending>('SELECT * FROM usage_pending WHERE owner_id=? AND snapshot_hash=? AND kind=?', owner, encoded.hash, 'save');
      if (!pending) {
        const id = access.uuid();
        pending = { id, owner_id: owner, snapshot_json: encoded.json, snapshot_hash: encoded.hash, name, course_id: id.replaceAll('-', ''), kind: 'save' };
        await db.runAsync('INSERT INTO usage_pending(id,owner_id,kind,snapshot_json,snapshot_hash,name,course_id) VALUES(?,?,?,?,?,?,?)', id, owner, 'save', encoded.json, encoded.hash, name, pending.course_id);
      }
      return finish(pending);
    }); },
    remove(id: string) { return serial(async () => {
      const owner = scope();
      // Both writes use the same exclusive transaction, so a failed deletion cannot retire a live course remotely.
      await db.withExclusiveTransactionAsync(async tx => {
        const row = await tx.getFirstAsync<{ id: string }>('SELECT id FROM saved_courses WHERE owner_id=? AND id=?', owner, id);
        if (!row) throw new AllowanceError('삭제할 코스를 찾지 못했어요.');
        await tx.runAsync('INSERT INTO usage_pending(id,owner_id,kind,snapshot_json,snapshot_hash,name,course_id) VALUES(?,?,?,?,?,?,?)', access.uuid(), owner, 'delete', '', '', '', id);
        await tx.runAsync('DELETE FROM saved_courses WHERE owner_id=? AND id=?', owner, id);
      });
      await flushDeletes(owner).catch(() => {}); // Offline deletion remains usable; the next online save reconciles it first.
    }); },
    async recover() { return serial(async () => {
      const owner = scope(); if (!owner) return false;
      await flushDeletes(owner);
      const rows = await db.getAllAsync<Pending>('SELECT * FROM usage_pending WHERE owner_id=? AND kind=? ORDER BY rowid', owner, 'save');
      for (const row of rows) { await finish(row); }
      return rows.length > 0;
    }); },
  };
}
