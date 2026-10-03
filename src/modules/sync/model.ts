import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { strToU8 } from 'fflate';
import { courseId, courseName, encodeSnapshot, type CourseSummary } from '../courses/model.ts';
import { distanceMeters, type Run, type RunPoint } from '../running/model.ts';
import { ownerId } from './ownership.ts';

export type RecordKind = 'course' | 'run';
export type RecordSummary = CourseSummary | Run;
export type RemoteRecord = {
  owner_id: string; kind: RecordKind; record_id: string; version: number; mutation_id: string;
  deleted: boolean; summary: RecordSummary | null; payload_path: string | null; payload_hash: string | null;
};
export type PendingRecord = {
  kind: RecordKind; id: string; remoteVersion: number; mutationId: string; deleted: boolean;
  summary: RecordSummary | null; payload: string | null;
};
export const SYNC_BUCKET = 'personal-records';
export const PAYLOAD_BYTES_MAX = 24 * 1024 * 1024;
export const digest = (text: string) => bytesToHex(sha256(strToU8(text)));
export const tableFor = (kind: RecordKind) => kind === 'course' ? 'saved_courses' : 'running_sessions';
export class SyncError extends Error {}
export function syncErrorMessage(error: unknown) {
  return error instanceof SyncError ? error.message : '동기화를 완료하지 못했어요. 기기 기록과 전송 대기는 유지됩니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
}
const fail = (): never => { throw new SyncError('서버 기록의 형식이나 무결성을 확인하지 못했어요. 앱을 업데이트하거나 다시 시도해 주세요.'); };
function integer(value: unknown, min = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= min; }
function finite(value: unknown, min = 0): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min; }
export function validateRemote(value: unknown, owner: string): RemoteRecord {
  const row = value as RemoteRecord;
  if (!row || typeof row !== 'object' || row.owner_id !== ownerId(owner) || !owner ||
    !['course', 'run'].includes(row.kind) || !integer(row.version, 1) || typeof row.deleted !== 'boolean' ||
    typeof row.mutation_id !== 'string' || !/^[a-f0-9]{32}$/.test(row.mutation_id)) return fail();
  courseId(row.record_id);
  if (row.deleted) {
    if (row.summary !== null) return fail();
  } else {
    if (!row.summary || row.summary.id !== row.record_id) return fail();
    if (row.kind === 'course') {
      const s = row.summary as CourseSummary;
      if (courseName(s.name) !== s.name || !integer(s.createdAt) || !integer(s.updatedAt)) return fail();
    } else validateRun(row.summary as Run);
  }
  if (row.payload_path !== null || row.payload_hash !== null) {
    if (typeof row.payload_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.payload_hash) ||
      row.payload_path !== `${owner}/${row.kind}/${row.record_id}/${row.payload_hash}.json`) return fail();
  } else if (!row.deleted) return fail();
  return row;
}
function validateRun(run: Run) {
  if (run.status !== 'completed' || !integer(run.startedAt) || !integer(run.endedAt) || run.endedAt < run.startedAt ||
    !finite(run.activeMs) || !finite(run.distanceM) || !integer(run.checkpointAt) || !integer(run.resumedAt) ||
    !integer(run.pointCount) || run.pointCount > 100000 || !integer(run.rejectedCount) || !integer(run.lastTimestamp) ||
    !integer(run.segment) || ![0, 1].includes(run.breakPending) || (run.reason !== null && (typeof run.reason !== 'string' || run.reason.length > 500))) return fail();
}
export function decodePayload(row: RemoteRecord, payload: string) {
  if (strToU8(payload).length > PAYLOAD_BYTES_MAX || digest(payload) !== row.payload_hash) return fail();
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { return fail(); }
  if (row.kind === 'course') {
    const encoded = encodeSnapshot(parsed), s = row.summary as CourseSummary;
    if (['source', 'shape', 'targetKm', 'lengthKm', 'score'].some(key => s[key as keyof CourseSummary] !== encoded.snapshot[key as keyof typeof encoded.snapshot])) return fail();
    return { kind: 'course' as const, ...encoded };
  }
  const run = row.summary as Run;
  validateRun(run);
  if (!Array.isArray(parsed) || parsed.length !== run.pointCount) return fail();
  let last: RunPoint | undefined, distance = 0;
  const points = parsed.map((value, index): RunPoint => {
    const p = value as RunPoint;
    if (!p || p.sequence !== index + 1 || !integer(p.segment) || !integer(p.timestamp) ||
      !finite(p.latitude, -90) || p.latitude > 90 || !finite(p.longitude, -180) || p.longitude > 180 ||
      !finite(p.accuracy) || p.accuracy > 50 || p.timestamp < run.startedAt || p.timestamp > run.endedAt! + 5000 ||
      (last && (p.timestamp <= last.timestamp || p.segment < last.segment))) return fail();
    if (last && p.segment === last.segment) distance += distanceMeters(last, p);
    last = p;
    return { sequence: p.sequence, segment: p.segment, timestamp: p.timestamp, latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy };
  });
  if (Math.abs(distance - run.distanceM) > Math.max(0.01, run.distanceM * 1e-9)) return fail();
  return { kind: 'run' as const, points };
}
