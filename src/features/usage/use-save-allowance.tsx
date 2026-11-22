import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { getStorage } from '@/modules/storage/database';
import { encodeSnapshot, type CourseSnapshot } from '@/modules/courses/model';
import { AllowanceError, exhaustedMessage, type UsageSummary } from '@/modules/usage/model';
import { readUsage } from '@/modules/usage/runtime';
import { ExhaustedAllowanceSheet, SaveConfirmationSheet } from './AllowanceSheets';

// This is a consent gate only. The existing metered repository remains the
// authority for reservations, duplicate saves, commits and recovery.
export function useSaveAllowance(snapshot: CourseSnapshot | null, saved: boolean, commit: (intent: 'save' | 'run') => Promise<void>) {
  const owner = useAuth().account?.id ?? '';
  const key = snapshot ? encodeSnapshot(snapshot).hash : '';
  const revision = useRef(0), working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ data: UsageSummary; intent: 'save' | 'run'; key: string; owner: string } | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [target, setTarget] = useState(`${owner}:${key}`);
  if (target !== `${owner}:${key}`) { setTarget(`${owner}:${key}`); setSheet(null); setExhausted(false); }
  useEffect(() => { revision.current++; }, [owner, key]);
  useFocusEffect(useCallback(() => () => { revision.current++; setSheet(null); }, []));
  const close = () => { if (!working.current) { setSheet(null); setExhausted(false); } };
  const execute = async (intent: 'save' | 'run', consent: boolean) => {
    if (working.current || !snapshot || !owner) return;
    working.current = true; setBusy(true);
    const ticket = revision.current;
    const valid = () => ticket === revision.current && authentication.getSnapshot().account?.id === owner;
    try {
      if (!saved && !consent) {
        const db = await getStorage();
        const existing = await db.courses.findHash(key);
        if (!valid()) return;
        if (!existing) {
          const data = await readUsage();
          if (!valid()) return;
          setSheet({ data, intent, key, owner }); setExhausted(data.save.used >= data.save.total);
          return;
        }
      }
      if (!valid()) return;
      setSheet(null); await commit(intent);
    } catch (error) {
      if (!valid()) return;
      if (error instanceof AllowanceError && error.message === exhaustedMessage) {
        try {
          const data = await readUsage();
          if (valid()) { setSheet({ data, intent, key, owner }); setExhausted(true); }
        } catch { if (valid()) Alert.alert('횟수를 확인하지 못했어요', '온라인에서 다시 확인해 주세요.'); }
      } else Alert.alert('코스를 저장하지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요.');
    } finally { working.current = false; setBusy(false); }
  };
  const current = sheet?.key === key && sheet.owner === owner ? sheet : null;
  const remaining = current ? Math.max(0, current.data.save.total - current.data.save.used) : 0;
  return { busy, request: (intent: 'save' | 'run' = 'save') => void execute(intent, false), sheets: <>
    <SaveConfirmationSheet visible={!!current && !exhausted} remaining={remaining} busy={busy} onClose={close} onConfirm={() => { if (current && remaining > 0) void execute(current.intent, true); }} />
    <ExhaustedAllowanceSheet visible={!!current && exhausted} kind="save" data={current?.data ?? null} onClose={close} />
  </> };
}
