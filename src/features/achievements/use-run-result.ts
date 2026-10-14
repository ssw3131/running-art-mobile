import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { authentication } from '@/modules/auth/runtime';
import { RunError, runErrorMessage, type Run, type RunPoint } from '@/modules/running/model';
import type { RunCourse } from '@/modules/running/guidance';
import type { Achievements } from '@/modules/achievements/model';

export type RunResult = { run: Run; points: RunPoint[]; course: RunCourse | null; achievements: Achievements };
export function useRunResult(id: string) {
  const auth = useAuth(), owner = auth.ready ? auth.account?.id ?? '' : null;
  const key = `${owner}/${id}`;
  const [state, setState] = useState<{ key: string; data: RunResult | null; error: string }>({ key: '', data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (owner === null) return;
    let current = true;
    setState({ key, data: null, error: '' });
    void (async () => {
      try {
        const store = await getStorage();
        const check = () => { if (!current || (authentication.getSnapshot().account?.id ?? '') !== owner) throw new RunError('계정이나 화면이 변경되었어요.'); };
        check(); const run = await store.runs.get(id); check();
        if (run.status !== 'completed') throw new RunError('러닝 종료·저장 후 결과를 확인해 주세요.');
        const points = await store.runs.points(id); check();
        const guide = await store.runs.guidance(id); check();
        const achievements = await store.achievements.read(); check();
        setState({ key, data: { run, points, course: guide?.course ?? null, achievements }, error: '' });
      } catch (error) { if (current) setState({ key, data: null, error: runErrorMessage(error) }); }
    })();
    return () => { current = false; };
    // Retrying invalidates the old load before starting a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, owner, key, attempt]));
  return { ...(state.key === key ? state : { data: null, error: '' }), retry: () => setAttempt(value => value + 1) };
}
