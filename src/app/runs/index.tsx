import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, ScrollView, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStorage } from '@/modules/storage/database';
import { durationLabel, runErrorMessage, statusLabel, type Run } from '@/modules/running/model';
import { RunButton, styles } from '@/features/running/ui';

export default function RunsScreen() {
  const [rows, setRows] = useState<Run[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false), [more, setMore] = useState(false);
  const generation = useRef(0), loading = useRef(false);
  const fetchPage = useCallback(async (offset: number, reset: boolean) => {
    if (loading.current) return;
    const request = generation.current; loading.current = true; setBusy(true); setError('');
    try {
      const items = await (await getStorage()).runs.list(31, offset);
      if (request !== generation.current) return;
      setRows(previous => reset ? items.slice(0, 30) : [...previous, ...items.slice(0, 30)]); setMore(items.length > 30); setReady(true);
    } catch (cause) { if (request === generation.current) setError(runErrorMessage(cause)); }
    finally { if (request === generation.current) { loading.current = false; setBusy(false); } }
  }, []);
  useFocusEffect(useCallback(() => {
    generation.current++; loading.current = false;
    if (Platform.OS === 'android') void fetchPage(0, true);
    return () => { generation.current++; loading.current = false; };
  }, [fetchPage]));
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>러닝 기록 목록</Text>
    <Text style={styles.body}>이 기기에 저장한 GPS 기록이에요. 앱 삭제·데이터 초기화 시 함께 삭제됩니다.</Text>
    <Link href="/run" style={styles.link}>러닝 시작·계속하기</Link>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {Platform.OS !== 'android' ? <Text>Android 앱에서 확인해 주세요.</Text> : <>
      <RunButton id="runs-refresh" title="목록 새로고침" disabled={busy} onPress={() => void fetchPage(0, true)} />
      {ready && !rows.length && <Text testID="runs-empty">아직 러닝 기록이 없어요.</Text>}
      {rows.map(run => <Link key={run.id} href={{ pathname: '/runs/[id]', params: { id: run.id } }} asChild>
        <Pressable accessibilityRole="button" testID={`run-row-${run.id}`} style={styles.card}>
          <Text style={styles.body}>{new Date(run.startedAt).toLocaleString('ko-KR')}</Text>
          <Text style={styles.title}>{(run.distanceM / 1000).toFixed(2)} km · {statusLabel[run.status]}</Text>
          <Text style={styles.body}>저장된 활동 시간 {durationLabel(run.activeMs)} · {run.pointCount}개 위치</Text>
        </Pressable>
      </Link>)}
      {more && <RunButton id="runs-more" title="더 보기" disabled={busy} onPress={() => void fetchPage(rows.length, false)} />}
    </>}
  </ScrollView></SafeAreaView>;
}
