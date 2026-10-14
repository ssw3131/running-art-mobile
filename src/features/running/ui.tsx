import { AppText as Text } from '@/components/ui';
import { fonts } from '@/theme/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { durationLabel, elapsedMs, paceLabel, type Run } from '@/modules/running/model';
import { useThemeColors } from '@/theme/ThemeProvider';

export function RunButton({ title, onPress, disabled, id }: { title: string; onPress(): void; disabled?: boolean; id: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} testID={id} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function RunStats({ run, now }: { run: Run; now: number }) {
  const styles = useRunStyles();
  const elapsed = elapsedMs(run, now);
  return <View style={styles.card}>
    <Text style={styles.metric} testID="run-distance">{(run.distanceM / 1000).toFixed(2)} km</Text>
    <Text style={styles.body} testID="run-duration">활동 시간 {durationLabel(elapsed)}</Text>
    <Text style={styles.body} testID="run-pace">평균 페이스 {paceLabel(elapsed, run.distanceM)}</Text>
  </View>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, content: { padding: 24, gap: 16 },
  title: { color: '#000000', fontSize: 26, fontWeight: '700' }, metric: { color: '#000000', fontSize: 36, fontFamily: fonts.roboto.black, lineHeight:44 },
  body: { color: '#757575', fontSize: 15, lineHeight: 23 }, card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 20, gap: 10, boxShadow: '0px 0px 5px rgba(0,0,0,0.15)' },
  button: { backgroundColor: '#FB5603', minHeight:50, padding: 14, borderRadius: 30, alignItems: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  error: { color: '#A12F2F', lineHeight: 23 }, link: { color: '#FB5603', padding: 12, fontSize: 16 },
});

export function useRunStyles() {
  const c = useThemeColors();
  return { ...styles, screen: { ...styles.screen, backgroundColor: c.background },
    title: { ...styles.title, color: c.text }, metric: { ...styles.metric, color: c.text },
    body: { ...styles.body, color: c.muted }, card: { ...styles.card, backgroundColor: c.surface },
    error: { ...styles.error, color: c.danger }, link: { ...styles.link, color: c.selected } };
}
