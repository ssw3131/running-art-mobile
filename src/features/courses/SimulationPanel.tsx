import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { createPlayer, PLAYBACK_SPEEDS, prepareRoute } from '@/modules/course-simulation/player';
import type { CourseSnapshot } from '@/modules/courses/model';
import MapSurface from '@/modules/map/MapSurface';
import { savedCourseOverlay } from '@/modules/courses/model';

const emptyRoads = { type: 'FeatureCollection' as const, features: [] };
const monotonicNow = () => performance.now();
export default function SimulationPanel({ snapshot }: { snapshot: CourseSnapshot }) {
  const prepared = useMemo(() => {
    try { return { route: prepareRoute(snapshot.route), error: '' }; }
    catch (cause) { return { route: null, error: cause instanceof Error ? cause.message : '경로를 확인할 수 없어요.' }; }
  }, [snapshot]);
  const player = useMemo(() => prepared.route ? createPlayer(prepared.route, monotonicNow) : null, [prepared]);
  const [state, setState] = useState(() => player?.snapshot() ?? null);
  const overlay = useMemo(() => savedCourseOverlay(snapshot), [snapshot]);
  const pause = useCallback(() => { if (player) setState(player.pause()); }, [player]);
  useFocusEffect(useCallback(() => pause, [pause]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') pause(); });
    return () => subscription.remove();
  }, [pause]);
  useEffect(() => {
    if (!player || !state?.playing) return;
    const timer = setInterval(() => setState(player.sample()), 100);
    return () => clearInterval(timer);
  }, [player, state?.playing]);
  if (!player || !state) return <Text accessibilityRole="alert">{prepared.error}</Text>;
  return <View style={styles.panel}>
    <Text style={styles.title}>코스 시뮬레이션</Text>
    <Text style={styles.description}>파란 점은 시뮬레이션 위치예요. 인터넷·GPS 없이 저장 경로를 재생해요.</Text>
    <View style={styles.map}><MapSurface styleUrl="" position={null} origin={snapshot.origin} routeOverlay={overlay} syntheticRoads={emptyRoads} simulationPosition={state.position} /></View>
    <Text testID="simulation-status" accessibilityLiveRegion="polite">{state.finished ? '도착했어요' : state.playing ? '재생 중' : state.meters > 0 ? '일시정지' : '재생 준비'}</Text>
    <Text testID="simulation-progress">이동 {(state.meters / 1000).toFixed(2)} / {(state.totalMeters / 1000).toFixed(2)}km · {(state.progress * 100).toFixed(1)}%</Text>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: state.progress * 100 }} accessibilityLabel="코스 진행률" style={styles.track}><View style={[styles.fill, { width: `${state.progress * 100}%` }]} /></View>
    <View style={styles.row}>
      <Pressable testID="simulation-play" accessibilityRole="button" accessibilityState={{ disabled: state.finished }} disabled={state.finished} style={styles.button} onPress={() => { if (AppState.currentState === 'active') setState(state.playing ? player.pause() : player.play()); }}><Text>{state.playing ? '일시정지' : '재생'}</Text></Pressable>
      <Pressable testID="simulation-restart" accessibilityRole="button" style={styles.button} onPress={() => setState(player.restart())}><Text>처음부터 · 일시정지</Text></Pressable>
    </View>
    <Text style={styles.description}>기준 속도 6분/km · 재생 속도 {state.speed}배</Text>
    <View style={styles.row}>{PLAYBACK_SPEEDS.map(speed => <Pressable key={speed} testID={`simulation-speed-${speed}`} accessibilityRole="button" accessibilityLabel={`재생 속도 ${speed}배`} accessibilityState={{ selected: speed === state.speed }} style={[styles.button, speed === state.speed && styles.selected]} onPress={() => setState(player.setSpeed(speed))}><Text>{speed}배</Text></Pressable>)}</View>
    <Text style={styles.description}>거리는 저장 좌표로 측정해 계산 당시 거리와 조금 다를 수 있어요. 화면을 떠나거나 앱을 내리면 일시정지해요. 실제 러닝 기록은 저장하지 않아요.</Text>
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 12 }, title: { fontSize: 20, fontWeight: '700', color: '#183C32' }, description: { color: '#57675F', lineHeight: 21 }, map: { height: 300, borderRadius: 12, overflow: 'hidden' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { padding: 12, borderRadius: 10, backgroundColor: '#E8EDE7' }, selected: { borderColor: '#23694C', borderWidth: 2 }, track: { height: 8, backgroundColor: '#D7DFD8', borderRadius: 4, overflow: 'hidden' }, fill: { height: 8, backgroundColor: '#23694C' } });
