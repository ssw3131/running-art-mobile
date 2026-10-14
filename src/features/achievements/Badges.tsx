import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { GenerationIcon, LegacyShapeIcon } from '@/features/course-generation/GenerationIcon';
import { courseShapes } from '@/modules/courses/model';
import type { ShapeBadge } from '@/modules/achievements/model';
import { useThemeColors } from '@/theme/ThemeProvider';

const icons = ['dog', 'person', 'bone', 'turtle', 'icecream', 'strawberry', 'cloud', 'crown', 'heart', 'star', 'cat', 'fish'] as const;
export function Badges({ badges }: { badges: ShapeBadge[] }) {
  const c = useThemeColors();
  if (!badges.length) return <AppText style={{ color: c.muted }}>코스를 한 바퀴 완주하면 도형 배지가 여기에 모여요.</AppText>;
  return <View testID="achievement-badges" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
    {badges.map(badge => {
      const name = courseShapes[badge.shape as keyof typeof courseShapes] ?? '도형';
      const icon = icons.find(value => value === badge.shape);
      return <Pressable key={badge.id} testID={`badge-${badge.shape}`} accessibilityRole="button"
        accessibilityLabel={`${name}, ${badge.count}회 완주, 첫 완주 기록 보기`}
        onPress={() => router.push({ pathname: '/runs/[id]', params: { id: badge.firstRunId } })}
        style={{ width: 96, alignItems: 'center', gap: 6, paddingVertical: 8 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: c.selected, backgroundColor: c.navigation, justifyContent: 'center', alignItems: 'center' }}>
          {icon ? <GenerationIcon name={icon} /> : badge.shape === 'custom' ? <GenerationIcon name="draw" /> : <LegacyShapeIcon shape={badge.shape} />}
        </View>
        <AppText variant="caption" weight="bold" style={{ textAlign: 'center' }}>{name}</AppText>
        <AppText variant="caption" style={{ color: c.muted }}>{badge.count}회 완주</AppText>
      </Pressable>;
    })}
  </View>;
}
