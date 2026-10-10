import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { nearestTerrainPoint, terrainBand, terrainBands, type TerrainProfile } from '@/modules/terrain/model';
import type { TerrainController, TerrainState } from '@/modules/terrain/controller';

function ElevationChart({ profile, selected, onSelect }: { profile: TerrainProfile; selected: number; onSelect(index: number): void }) {
  const [width, setWidth] = useState(0);
  const low = Math.floor(profile.minimum / 10) * 10, high = Math.max(low + 10, Math.ceil(profile.maximum / 10) * 10);
  const y = (elevation: number) => 12 + (high - elevation) / (high - low) * 112;
  const x = (distance: number) => distance / profile.length * width;
  return <View>
    <Text style={styles.small}>고도(m) · {high.toFixed(0)}</Text>
    <View testID="terrain-chart" accessibilityRole="adjustable" accessibilityLabel="고도 변화 그래프. 좌우로 조절해 지점을 선택하세요."
      accessibilityValue={{ min: 0, max: profile.points.length - 1, now: selected, text: `${(profile.points[selected].distance / 1000).toFixed(2)}km, 고도 ${Math.round(profile.points[selected].elevation)}m` }}
      accessibilityActions={[{ name: 'increment', label: '다음 지점' }, { name: 'decrement', label: '이전 지점' }]}
      onAccessibilityAction={event => onSelect(Math.max(0, Math.min(profile.points.length - 1, selected + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={event => { if (width) onSelect(nearestTerrainPoint(profile, event.nativeEvent.locationX / width)); }}
      onResponderMove={event => { if (width) onSelect(nearestTerrainPoint(profile, event.nativeEvent.locationX / width)); }}
      style={styles.chart}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {width > 0 && profile.points.slice(1).map((point, index) => {
          const a = profile.points[index], dx = x(point.distance) - x(a.distance), dy = y(point.elevation) - y(a.elevation);
          const length = Math.hypot(dx, dy);
          return <View key={index} style={{ position: 'absolute', left: (x(point.distance) + x(a.distance) - length) / 2,
            top: (y(point.elevation) + y(a.elevation)) / 2 - 1.5, width: length, height: 3,
            backgroundColor: terrainBands[terrainBand(profile.segments[index].grade)].color,
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
        })}
        {width > 0 && <View style={[styles.cursor, { left: Math.max(0, Math.min(width - 2, x(profile.points[selected].distance))) }]} />}
      </View>
    </View>
    <Text style={styles.small}>{low.toFixed(0)}</Text>
    <View style={styles.axis}><Text style={styles.small}>0</Text><Text style={styles.small}>거리(km) · {(profile.length / 1000).toFixed(2)}</Text></View>
  </View>;
}

export default function TerrainPanel({ controller, state }: { controller: TerrainController; state: TerrainState }) {
  const open = state.status !== 'hidden', profile = state.profile;
  const point = profile?.points[state.selected], grade = profile?.segments[Math.min(state.selected, profile.segments.length - 1)].grade;
  return <View testID="terrain-panel" style={styles.panel}>
    <Pressable testID="terrain-toggle" accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.button}
      onPress={() => { if (open) controller.hide(); else void controller.show(); }}>
      <Text style={styles.buttonText}>{open ? '경사 보기 닫기' : '경사 보기'}</Text>
    </Pressable>
    {!open && <Text style={styles.small}>선택한 코스의 지형을 인터넷으로 조회해요.</Text>}
    {open && <>
      <Text style={styles.title}>코스 지형</Text>
      {state.status === 'loading' && <View testID="terrain-loading" accessibilityLiveRegion="polite" style={styles.row}><ActivityIndicator color="#167D9A" /><Text style={styles.body}>지형 정보를 불러오는 중…</Text></View>}
      {state.status === 'error' && <><Text testID="terrain-error" accessibilityRole="alert" style={styles.body}>{state.error}</Text>
        <Pressable testID="terrain-retry" accessibilityRole="button" style={styles.button} onPress={() => void controller.show()}><Text style={styles.buttonText}>다시 시도</Text></Pressable></>}
      {state.status === 'ready' && profile && point && grade !== undefined && <>
        <Text testID="terrain-summary" style={styles.summary}>총 오르막 ↑{Math.round(profile.ascent)}m</Text>
        <Text style={styles.small}>코스에서 올라가는 높이를 모두 더한 값이에요.</Text>
        <View style={styles.legend}>{terrainBands.map(band => <View key={band.label} style={styles.row}><View style={[styles.swatch, { backgroundColor: band.color }]} /><Text style={styles.small}>{band.label} · {band.range}</Text></View>)}</View>
        <Text style={styles.title}>고도 변화</Text>
        <Text testID="terrain-direction" style={styles.small}>지도 화살표 방향 · {state.reversed ? '반대 방향' : '기본 방향'} · 그래프 기준점은 실제 출발점과 달라요.</Text>
        <Pressable testID="terrain-reverse" accessibilityRole="button" style={styles.button} onPress={controller.reverse}><Text style={styles.buttonText}>방향 바꾸기</Text></Pressable>
        <ElevationChart profile={profile} selected={state.selected} onSelect={controller.select} />
        <Text testID="terrain-selection" style={styles.body}>{(point.distance / 1000).toFixed(2)}km · 고도 {Math.round(point.elevation)}m · {Math.abs(grade) < 0.05 ? '경사 0.0%' : `${grade > 0 ? '오르막' : '내리막'} ${Math.abs(grade).toFixed(1)}%`}</Text>
        <Text style={styles.small}>그래프를 누르면 지도에서 같은 지점을 확인할 수 있어요. 구간 경사도는 약 {Math.round(profile.length / (profile.points.length - 1))}m 간격으로 추정해요.</Text>
        <Text style={styles.small}>지형 데이터로 추정한 값이에요. 다리·터널 등 실제 도로 높이와 다를 수 있어요.</Text>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.maptiler.com/copyright/').catch(() => {})}><Text style={styles.link}>고도 데이터 © MapTiler</Text></Pressable>
      </>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 10, padding: 14, borderRadius: 16, borderColor: '#D5DED9', borderWidth: 1, backgroundColor: '#FFFFFF' },
  button: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: '#E8F1EE', minHeight: 44 },
  buttonText: { fontSize: 14, fontWeight: '700', color: '#183C32' },
  title: { fontSize: 17, fontWeight: '700', color: '#183C32' }, summary: { fontSize: 22, fontWeight: '700', color: '#183C32' },
  body: { fontSize: 14, lineHeight: 22, color: '#243E35', flexShrink: 1 }, small: { fontSize: 12, lineHeight: 19, color: '#4B6057' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, legend: { gap: 4 }, swatch: { width: 20, height: 4, borderRadius: 2 },
  chart: { height: 136, backgroundColor: '#F4F7F5', borderBottomWidth: 1, borderColor: '#9FB3A9' },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#183C32' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' }, link: { fontSize: 12, color: '#21684C', textDecorationLine: 'underline' },
});
