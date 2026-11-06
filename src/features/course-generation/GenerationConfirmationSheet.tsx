import type { RefObject } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { AppModal, AppText, Button } from '@/components/ui';
import { useUsage } from '@/features/usage/use-usage';
import { courseShapes } from '@/modules/courses/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import type { GenerationConditions } from './model';

const icons = {
  arrow: { source: require('../../../assets/generation/confirmation/arrow.svg'), width: 24, height: 24 },
  pin: { source: require('../../../assets/generation/confirmation/pin.svg'), width: 12, height: 14 },
  map: { source: require('../../../assets/generation/confirmation/map.svg'), width: 12, height: 13 },
  flag: { source: require('../../../assets/generation/confirmation/flag.svg'), width: 13, height: 12 },
  generate: { source: require('../../../assets/generation/confirmation/generate.svg'), width: 20, height: 20 },
};
function SheetIcon({ name }: { name: keyof typeof icons }) {
  const icon = icons[name];
  return <Image source={icon.source} contentFit="contain" accessible={false} style={{ width: icon.width, height: icon.height }} />;
}
export function GenerationConfirmationSheet({ conditions, location, regenerating, onClose, onConfirm, returnFocusRef }: {
  conditions: GenerationConditions | null; location: string; regenerating: boolean; onClose(): void; onConfirm(): void; returnFocusRef: RefObject<View | null>;
}) {
  const c = useThemeColors(), usage = useUsage();
  const remaining = usage.data ? Math.max(0, usage.data.generation.total - usage.data.generation.used) : null;
  const dark = c.background !== '#FFFFFF';
  return <AppModal presentation="sheet" sheetHandle dismissOnBackdrop visible={!!conditions}
    title={regenerating ? '같은 조건으로 다시 생성할까요?' : '현재 설정으로 코스 생성할까요?'} onClose={onClose} returnFocusRef={returnFocusRef}
    contentContainerStyle={{ gap: 0 }} footer={<View style={{ gap: 6 }}>
      <Button label="코스 생성하기" testID="generation-confirm" leading={<SheetIcon name="generate" />} disabled={remaining === 0} onPress={onConfirm} />
      <Button label="취소" testID="generation-confirm-cancel" variant="secondary" contentStyle={{ backgroundColor: c.surface, minHeight: 50 }} labelStyle={{ fontSize: 16 }} onPress={onClose} />
    </View>}>
    <AppText style={[styles.subtitle, { color: c.subtle }]}>설정한 조건을 바탕으로 추천 코스 5개를 만들어요.</AppText>
    {conditions && <View style={styles.body}>
      <View style={[styles.summary, { backgroundColor: dark ? c.navigation : '#F2F2F2' }]}>
        {([
          ['pin', '출발지', location],
          ['map', '목표 러닝 거리', `${conditions.targetKm}Km`],
          ['flag', '코스 모양', `${courseShapes[conditions.shape]} 코스`],
        ] as const).map(([icon, label, value]) => <View key={icon} style={styles.row}>
          <SheetIcon name={icon} /><AppText weight="bold" style={styles.summaryLabel}>{label} :</AppText>
          <AppText testID={`generation-summary-${icon}`} style={[styles.summaryValue, { color: c.muted }]}>{value}</AppText>
        </View>)}
      </View>
      <View style={[styles.allowance, { backgroundColor: dark ? '#39241E' : '#FFEDE8' }]}>
        <View style={styles.countRow}>
          <View style={styles.count}><AppText weight="bold" style={styles.countLabel}>현재 남은 횟수</AppText>
            <AppText testID="generation-remaining" family="roboto" weight="black" style={[styles.number, { color: c.selected }]}>{remaining ?? '—'}<AppText weight="black" style={{ fontSize: 14, color: c.selected }}>회</AppText></AppText></View>
          <SheetIcon name="arrow" />
          <View style={styles.count}><AppText weight="bold" style={styles.countLabel}>생성 후</AppText>
            <AppText testID="generation-after" family="roboto" weight="black" style={[styles.number, { color: c.selected }]}>{remaining === null ? '—' : Math.max(0, remaining - 1)}<AppText weight="black" style={{ fontSize: 14, color: c.selected }}>회</AppText></AppText></View>
        </View>
        <View style={styles.charge}><AppText style={{ fontSize: 10, lineHeight: 14, color: '#AB7C64' }}>코스 생성 1회 차감</AppText></View>
      </View>
      {remaining === 0 && <AppText accessibilityRole="alert" variant="caption" style={{ color: c.danger }}>사용 가능한 생성 횟수를 모두 사용했어요.</AppText>}
      {!!usage.error && <Button compact variant="outline" label="횟수 다시 확인" onPress={() => void usage.refresh()} />}
      <AppText style={[styles.notes, { color: c.muted }]}>{'· 코스는 1번 생성하면 최대 5개가 생성돼요.\n· 조건을 바꿔 다시 생성하면 이용 횟수가 추가로 차감돼요.\n· 생성에는 잠시 시간이 걸릴 수 있어요.'}</AppText>
    </View>}
  </AppModal>;
}
const styles = StyleSheet.create({
  subtitle: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6, marginBottom: 22 },
  body: { width: '100%', maxWidth: 288, gap: 22 },
  summary: { borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, minHeight: 88, justifyContent: 'center', gap: 2 },
  row: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  summaryLabel: { fontSize: 12, lineHeight: 20 }, summaryValue: { fontSize: 11, lineHeight: 20, flexShrink: 1 },
  allowance: { minHeight: 101, borderRadius: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 5 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, count: { minWidth: 72, alignItems: 'center' },
  countLabel: { fontSize: 10, lineHeight: 16 }, number: { fontSize: 32, lineHeight: 38 },
  charge: { backgroundColor: '#FFD0B9', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 2 },
  notes: { fontSize: 11, lineHeight: 18 },
});
