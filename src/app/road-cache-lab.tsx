import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getRoadCache } from '@/modules/road-data/cache-database';
import { roadBounds } from '@/modules/road-data/client';
import type { RoadCacheRequest } from '@/modules/road-data/persistent-cache';
import { cacheLabSamples, createCacheLabDownloads, ROAD_CACHE_LAB_SOURCE } from '@/features/road-cache-lab/source';
import { mobileScheduler } from '@/features/route-lab/scheduler';

export default function RoadCacheLabScreen() {
  const [index, setIndex] = useState(0), [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('처음에는 PC 로컬 표본을 받아 저장하세요. 저장 후에는 연결 없이 읽을 수 있어요.');
  const [usage, setUsage] = useState(''), [details, setDetails] = useState('');
  const [clearing, setClearing] = useState(false);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const supported = Platform.OS !== 'web';
  async function updateUsage() {
    const value = await (await getRoadCache()).status();
    if (mounted.current) setUsage(`${value.files}개 파일 · ${(value.bytes / 1024 / 1024).toFixed(2)} / ${(value.maxBytes / 1024 / 1024).toFixed(0)} MiB`);
  }
  useEffect(() => {
    mounted.current = true;
    if (supported) void updateUsage().catch(error => { if (mounted.current) setStatus(error instanceof Error ? error.message : '캐시를 열지 못했어요.'); });
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [supported]);
  async function run(mode: RoadCacheRequest['mode']) {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setDetails(''); setStatus(mode === 'offline' ? '저장 자료 확인 중…' : '자료를 확인하고 저장하는 중…');
    try {
      const sample = cacheLabSamples[index], cache = await getRoadCache();
      const result = await cache.load({ source: ROAD_CACHE_LAB_SOURCE, bounds: roadBounds(sample.origin, 2000),
        signal: current.signal, mode, ...(mode === 'offline' ? {} : createCacheLabDownloads()),
        yieldToHost: mobileScheduler.yieldToHost });
      if (!mounted.current || current.signal.aborted) return;
      setStatus(`${sample.label} · ${mode === 'offline' ? '네트워크 없이 저장 자료 읽기 완료' : '조회·저장 완료'}`);
      setDetails(`${result.files}개 파일 · 저장 자료 재사용 ${result.reused}개 · 새로 받음 ${result.downloaded}개\n도로 ${result.elements.length.toLocaleString()}개\n${result.stale ? '오래된 저장 자료' : '유효 기간 내 자료'}${result.updateFailed ? ' · 갱신 실패로 저장 자료 사용' : ''}\n자료 버전: ${result.release}`);
      await updateUsage();
    } catch (error) { if (mounted.current) setStatus(error instanceof Error ? error.message : '도로 캐시 작업에 실패했어요.'); }
    finally { controller.current = null; if (mounted.current) setBusy(false); }
  }
  async function clear() {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setClearing(true);
    try {
      await (await getRoadCache()).clear();
      if (mounted.current) { setStatus('도로 캐시를 비웠어요. 다시 받기 전에는 저장 자료를 읽을 수 없어요.'); setDetails(''); }
      await updateUsage();
    } catch { if (mounted.current) setStatus('캐시를 비우지 못했어요. 다시 시도해 주세요.'); }
    finally { controller.current = null; if (mounted.current) { setBusy(false); setClearing(false); } }
  }
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>영구 도로 캐시 검증</Text>
    <Text>서울·부산·경계 표본을 기기에 저장합니다. 앱을 종료한 뒤 다시 열어 저장 자료 읽기를 확인하세요. 현재 위치는 사용하지 않습니다.</Text>
    {!supported && <Text>이 검증은 Android 앱에서 실행해 주세요.</Text>}
    <View style={styles.row}>{cacheLabSamples.map((sample, i) => <Pressable key={sample.id} accessibilityRole="button" disabled={busy}
      onPress={() => setIndex(i)} style={[styles.option, index === i && styles.selected]}><Text>{sample.label}</Text></Pressable>)}</View>
    {(['refresh', 'prefer-cache', 'offline'] as const).map((mode, i) => <Pressable key={mode} accessibilityRole="button" disabled={busy || !supported}
      style={styles.button} onPress={() => void run(mode)}><Text style={styles.buttonText}>{['받아 저장·갱신', '저장 자료 우선 조회', '네트워크 없이 저장 자료 읽기'][i]}</Text></Pressable>)}
    {busy && !clearing && <Pressable accessibilityRole="button" style={styles.option} onPress={() => controller.current?.abort()}><Text>취소</Text></Pressable>}
    <Text testID="road-cache-status" selectable>{status}</Text><Text selectable>{usage}</Text><Text selectable>{details}</Text>
    <Pressable accessibilityRole="button" disabled={busy || !supported} style={styles.option}
      onPress={() => Alert.alert('도로 캐시 비우기', '저장한 도로 표본을 삭제합니다. 테스트 메모와 다른 기록은 유지됩니다.', [
        { text: '취소', style: 'cancel' }, { text: '비우기', style: 'destructive', onPress: () => void clear() },
      ])}><Text>도로 캐시 비우기</Text></Pressable>
    <Text>처음 받기는 PC 로컬 표본 서버와 연결이 필요합니다. 배경 지도 오프라인 표시와 일반 코스 계산의 공급 전환은 후속입니다.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: 24, gap: 18, backgroundColor: '#F6F5F0' },
  title: { fontSize: 24, fontWeight: '700', color: '#183C32' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { padding: 12, borderWidth: 1, borderColor: '#7B8B80', borderRadius: 10 }, selected: { backgroundColor: '#CFE3D1' },
  button: { padding: 18, backgroundColor: '#183C32', borderRadius: 12 }, buttonText: { color: 'white', textAlign: 'center' } });
