import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui';
import { durationLabel, paceLabel, type Run } from '@/modules/running/model';
import { useThemeColors } from '@/theme/ThemeProvider';

export function RunMetrics({ run, compact = false }: { run: Run; compact?: boolean }) {
  const colors = useThemeColors();
  const { fontScale } = useWindowDimensions();
  const stats = [
    { label: '총 거리', value: `${(run.distanceM / 1000).toFixed(2)} km`, icon: require('../../../assets/achievements/distance.svg') },
    { label: '활동 시간', value: durationLabel(run.activeMs), icon: require('../../../assets/achievements/timer.svg') },
    { label: '평균 페이스', value: paceLabel(run.activeMs, run.distanceM), icon: require('../../../assets/achievements/pace.svg') },
  ];
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
    {stats.map(stat => <View key={stat.label} style={{ flexGrow: 1, flexBasis: fontScale > 1.2 ? '100%' : compact ? 135 : 145, padding: compact ? 12 : 16, gap: 6, borderRadius: 16, backgroundColor: colors.navigation }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Image source={stat.icon} style={{ width: 20, height: 20 }} accessible={false} />
        <AppText variant="label" weight="bold" style={{ color: colors.muted, flexShrink: 1 }}>{stat.label}</AppText></View>
      <AppText family="roboto" weight="black" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: compact ? 24 : 30, lineHeight: compact ? 32 : 40, textAlign: 'center' }}>{stat.value}</AppText>
    </View>)}
  </View>;
}
