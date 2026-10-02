import { Pressable, StyleSheet, Text, View } from 'react-native';
import { durationLabel, elapsedMs, paceLabel, type Run } from '@/modules/running/model';

export function RunButton({ title, onPress, disabled, id }: { title: string; onPress(): void; disabled?: boolean; id: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} testID={id} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function RunStats({ run, now }: { run: Run; now: number }) {
  const elapsed = elapsedMs(run, now);
  return <View style={styles.card}>
    <Text style={styles.metric} testID="run-distance">{(run.distanceM / 1000).toFixed(2)} km</Text>
    <Text style={styles.body} testID="run-duration">활동 시간 {durationLabel(elapsed)}</Text>
    <Text style={styles.body} testID="run-pace">평균 페이스 {paceLabel(elapsed, run.distanceM)}</Text>
    <Text style={styles.body}>저장한 위치 {run.pointCount}개 · 제외한 위치 {run.rejectedCount}개</Text>
  </View>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F0' }, content: { padding: 20, gap: 16 },
  title: { color: '#183C32', fontSize: 26, fontWeight: '700' }, metric: { color: '#183C32', fontSize: 32, fontWeight: '700' },
  body: { color: '#57675F', fontSize: 15, lineHeight: 23 }, card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, gap: 10 },
  button: { backgroundColor: '#183C32', padding: 16, borderRadius: 12, alignItems: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  error: { color: '#A12F2F', lineHeight: 23 }, link: { color: '#23694C', padding: 12, fontSize: 16 },
});
