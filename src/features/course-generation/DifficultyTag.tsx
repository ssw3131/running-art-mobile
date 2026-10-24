import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import { terrainDifficulty } from './recommendation-metrics';
import type { RecommendationTerrain } from './use-recommendation-terrain';

export function DifficultyTag({ state }: { state?: RecommendationTerrain }) {
  const c = useThemeColors();
  const difficulty = state?.profile ? terrainDifficulty(state.profile) : null;
  const colors = difficulty ? [
    { background: '#FFF2CC', text: '#8A5000' }, { background: '#9EFFCB', text: '#006C32' }, { background: '#FFD5D5', text: '#A00000' },
  ][difficulty.level] : { background: c.navigation, text: c.subtle };
  const label = difficulty?.label ?? (state?.kind === 'loading' ? '경사 조회 중' : '난이도 확인 불가');
  return <View style={{ backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
    <AppText variant="caption" weight="bold" style={{ color: colors.text }}>{label}</AppText>
  </View>;
}
