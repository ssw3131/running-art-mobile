import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { loadNotices } from '@/modules/support/runtime';
export function useNotices() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadNotices>> | null>(null);
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let current = true; setError('');
    void loadNotices().then(value => { if (current) setData(value); }).catch(() => { if (current) { setData(null); setError('공지를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.'); } });
    return () => { current = false; };
    // Explicit retry starts a new request and ignores late responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));
  return { data, error, retry: () => setAttempt(value => value + 1) };
}
