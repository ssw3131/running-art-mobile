import { useMemo } from 'react';
import { Switch, Text, View } from 'react-native';
import GuidanceMap from '@/features/guidance/GuidanceMap';
import { createGuidance } from '@/modules/guidance/engine';
import { guidanceNative } from '@/modules/guidance/native';
import type { Coordinate } from '@/modules/guidance/geometry';
import type { GuidanceOptions, RunGuidance } from '@/modules/running/guidance';
import type { Run, RunPoint } from '@/modules/running/model';
import { styles, RunButton } from './ui';

const arrows = { straight: '↑', left: '↰', right: '↱', uturn: '↶', arrival: '✓', unknown: '⌖' };
export default function LiveGuidancePanel({ run, guide, points, now, busy, onOptions }: {
  run: Run; guide: RunGuidance; points: RunPoint[]; now: number; busy: boolean; onOptions(value: GuidanceOptions): void;
}) {
  const state = useMemo(() => {
    const engine = createGuidance(guide.course.snapshot.route, guide.checkpoint);
    const value = run.status === 'running' ? engine.tick(now - run.startedAt) : engine.snapshot();
    const trace: Coordinate[][] = []; let segment = -1;
    for (const point of points) {
      if (point.segment !== segment) { trace.push([]); segment = point.segment; }
      trace.at(-1)!.push([point.longitude, point.latitude]);
    }
    return { ...value, trace };
  }, [guide, now, points, run.startedAt, run.status]);
  const voice = guidanceNative?.liveStatus();
  return <View style={{ gap: 12 }}>
    <Text style={styles.body} testID="run-course-name">{guide.course.name}</Text>
    {guide.options.mode === 'map' && <View style={{ height: 310, borderRadius: 16, overflow: 'hidden' }}><GuidanceMap route={guide.course.snapshot.route} state={state} positionLabel="현재 GPS 위치로 지도 이동" /></View>}
    <View style={styles.card}>
      <Text style={{ fontSize: guide.options.mode === 'focus' ? 78 : 40, color: '#183C32', textAlign: 'center' }}>{arrows[state.direction]}</Text>
      {state.status === 'normal' && ['left', 'right', 'uturn'].includes(state.direction) && <Text testID="run-turn-distance" style={styles.body}>약 {Math.max(5, Math.round(state.instructionM / 5) * 5)}m 앞에서</Text>}
      <Text style={styles.title} testID="run-instruction">{state.instruction}</Text>
      {state.status === 'off-route' && <Text testID="run-return-distance" style={styles.body}>지나온 길로 약 {Math.round(state.returnM)}m 돌아가세요.</Text>}
      {state.status === 'weak' && guide.checkpoint.rejoin && <Text style={styles.body}>멈췄던 코스 지점으로 돌아와 주세요. 기록하지 않은 이동 구간은 안내 경로로 연결하지 않아요.</Text>}
      <Text testID="run-progress" style={styles.body}>코스 진행 {(state.progressM / state.totalM * 100).toFixed(1)}% · 남은 거리 {(state.remainingM / 1000).toFixed(2)} km</Text>
      <Text style={styles.body}>코스 좌표 기준 안내입니다. 실제 도로와 주변 상황을 확인하며 달려 주세요.</Text>
    </View>
    <RunButton id="run-guidance-mode" disabled={busy} title={guide.options.mode === 'map' ? '집중 모드로 보기' : '지도로 보기'} onPress={() => onOptions({ ...guide.options, mode: guide.options.mode === 'map' ? 'focus' : 'map' })} />
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={styles.body}>음성 안내</Text><Switch testID="run-voice" value={guide.options.voice} disabled={busy} onValueChange={voice => onOptions({ ...guide.options, voice })} /></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={styles.body}>화면 꺼짐 안내·기록</Text><Switch testID="run-background" value={guide.options.background} disabled={busy} onValueChange={background => onOptions({ ...guide.options, background })} /></View>
    {!guide.options.background && <Text style={styles.body}>화면을 끄거나 다른 앱으로 이동하면 일시정지합니다. 돌아온 뒤 직접 재개해 주세요.</Text>}
    {guide.options.voice && !!voice?.voiceError && <Text style={styles.body}>{voice.voiceError}</Text>}
  </View>;
}
