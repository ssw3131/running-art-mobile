import { encodeSnapshot, type CourseSnapshot } from '../../modules/courses/model.ts';
import type { Origin, Point, ShapeId } from '../../modules/route-engine/types.ts';

export type GenerationConditions = { origin: Origin; shape: ShapeId; targetKm: number; customTemplate?: Point[] | null };
export const centerLabel = (origin: Origin) => `${origin.lat.toFixed(5)}, ${origin.lng.toFixed(5)}`;
export function sameConditions(a: GenerationConditions, b: GenerationConditions) {
  return a.origin.lat === b.origin.lat && a.origin.lng === b.origin.lng && a.shape === b.shape && a.targetKm === b.targetKm
    && (a.shape !== 'custom' || JSON.stringify(a.customTemplate) === JSON.stringify(b.customTemplate));
}

/** At most five account-scoped drafts. A URL alone cannot restore a private draft. */
export function createCandidateDrafts() {
  let sequence = 0;
  type Draft = { id: string; scope: string; hash: string; snapshot: CourseSnapshot; rank: number; candidateCount?:number; name?: string; savedId?: string };
  const drafts = new Map<string, Draft>();
  return {
    put(snapshot: CourseSnapshot, rank: number, scope: string, candidateCount?:number) {
      const copy = encodeSnapshot(snapshot);
      const existing = [...drafts.values()].find(item => item.scope === scope && item.hash === copy.hash);
      if (existing) { existing.rank = rank;if(candidateCount!==undefined)existing.candidateCount=candidateCount;return existing.id; }
      const id = `${Date.now()}-${++sequence}`;
      drafts.set(id, { id, scope, snapshot: copy.snapshot, hash: copy.hash, rank, candidateCount });
      while (drafts.size > 5) drafts.delete(drafts.keys().next().value!);
      return id;
    },
    get(id: string | undefined, scope: string) {
      const current = id ? drafts.get(id) : undefined;
      return current && current.scope === scope
        ? { ...current, snapshot: encodeSnapshot(current.snapshot).snapshot } : null;
    },
    edit(id: string, scope: string, value: { name?: string; savedId?: string }) {
      const current = drafts.get(id);
      if (current?.scope === scope) Object.assign(current, value);
    },
    discardUnsaved(scope: string) { for (const [id, draft] of drafts) if (draft.scope === scope && !draft.savedId) drafts.delete(id); },
    count(scope: string) { return [...drafts.values()].filter(draft=>draft.scope===scope).length; },
    clear() { drafts.clear(); },
  };
}
export const candidateDrafts = createCandidateDrafts();
