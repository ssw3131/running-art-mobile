import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { inquiryError } from '@/modules/support/model';
import { supportRemote } from '@/modules/support/runtime';

export function inquiryRemote() {
  if (!supportRemote) throw new Error('Inquiry unavailable');
  return supportRemote;
}

/** Private, memory-only data. A blur invalidates every pending response. */
export function useInquiryResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const generation = useRef(0), pending = useRef(false);
  useFocusEffect(useCallback(() => {
    const version = ++generation.current;
    pending.current = true; setBusy(true); setData(null); setError('');
    void Promise.resolve().then(load).then(value => { if (version === generation.current) setData(value); })
      .catch(e => { if (version === generation.current) setError(inquiryError(e)); })
      .finally(() => { if (version === generation.current) { pending.current = false; setBusy(false); } });
    return () => { generation.current++; pending.current = false; };
    // A requested refresh invalidates the previous focus request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, attempt]));
  const more = async (next: () => Promise<T>, merge: (previous: T, incoming: T) => T) => {
    if (pending.current || !data) return;
    const version = generation.current;
    pending.current = true; setBusy(true); setError('');
    try { const value = await next(); if (version === generation.current) setData(previous => previous ? merge(previous, value) : previous); }
    catch (e) { if (version === generation.current) setError(inquiryError(e)); }
    finally { if (version === generation.current) { pending.current = false; setBusy(false); } }
  };
  return { data, error, busy, more, reload: () => setAttempt(value => value + 1) };
}
