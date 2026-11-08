import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { DifficultyTag } from '@/features/course-generation/DifficultyTag';
import type { RecommendationTerrain } from '@/features/course-generation/use-recommendation-terrain';
import { useThemeColors } from '@/theme/ThemeProvider';

const assets = {
  flag: require('../../../assets/generation/figma-20261107-detail/flag.svg'),
  edit: require('../../../assets/generation/figma-20261107-detail/edit.svg'),
  pin: require('../../../assets/generation/figma-20261107-detail/pin.svg'),
  map: require('../../../assets/generation/figma-20261107-detail/map.svg'),
  watch: require('../../../assets/generation/figma-20261107-detail/watch.svg'),
  difficulty: require('../../../assets/generation/figma-20261107-detail/difficulty.svg'),
  slope: require('../../../assets/generation/figma-20261107-detail/slope.svg'),
  clip: require('../../../assets/generation/figma-20261107-detail/clip.svg'),
  down: require('../../../assets/generation/figma-20261107-detail/down.svg'),
};
export function DetailIcon({ name }: { name: keyof typeof assets }) {
  return <Image source={assets[name]} style={{ width: 16, height: 16 }} accessible={false} contentFit="contain" />;
}
export function courseDuration(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:00`;
}
export function InformationRow({ icon, label, children }: { icon: keyof typeof assets; label: string; children: ReactNode }) {
  const c = useThemeColors();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 26 }}>
    <View style={{ width: 90, flexDirection: 'row', alignItems: 'center', gap: 10 }}><DetailIcon name={icon} /><AppText weight="bold" style={{ color: c.subtle, fontSize: 16 }}>{label}</AppText></View>
    <View style={{ flex: 1 }}>{children}</View>
  </View>;
}
export function CourseInformation({ name, address, distance, minutes, terrain, onEdit, onTerrain, editor }: {
  name: string; address: string; distance: number; minutes: number; terrain: RecommendationTerrain;
  onEdit(): void; onTerrain(): void; editor?: ReactNode;
}) {
  const c = useThemeColors();
  return <View style={{ gap: 17 }}>
    <InformationRow icon="flag" label="코스명"><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><AppText weight="bold" style={{ flexShrink: 1 }}>{name}</AppText><Pressable testID="course-edit-name" accessibilityRole="button" accessibilityLabel="코스 이름 수정" onPress={onEdit} hitSlop={16}><DetailIcon name="edit" /></Pressable></View></InformationRow>
    {editor}
    <InformationRow icon="pin" label="출발지"><AppText weight="bold">{address}</AppText></InformationRow>
    <InformationRow icon="map" label="전체 거리"><AppText weight="bold">{distance.toFixed(2)} km</AppText></InformationRow>
    <InformationRow icon="watch" label="예상 시간"><AppText weight="bold">{courseDuration(minutes).replaceAll(':', ' : ')}</AppText></InformationRow>
    <InformationRow icon="difficulty" label="난이도"><View style={{ alignItems: 'flex-start' }}><DifficultyTag state={terrain} large /></View></InformationRow>
    <InformationRow icon="slope" label="경사 정보"><Pressable testID="course-terrain-open" accessibilityRole="button" accessibilityLabel="경사 정보 자세히 보기" onPress={onTerrain} style={{ alignSelf: 'flex-start', minHeight: 26, paddingLeft: 8, paddingRight: 4, borderRadius: 6, backgroundColor: c.outline, flexDirection: 'row', alignItems: 'center', gap: 3 }} hitSlop={10}><AppText weight="bold" style={{ color: c.onAction, fontSize: 15 }}>자세히 보기</AppText><Image source={require('../../../assets/generation/figma-20261107/chevron.svg')} tintColor={c.onAction} style={{ width: 20, height: 20 }} contentFit="contain" accessible={false} /></Pressable></InformationRow>
    <View testID="course-difficulty-criteria" style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:32}}><DetailIcon name="clip"/><AppText weight="bold" style={{color:c.subtle}}>난이도 기준</AppText></View>
    <View testID="course-difficulty-content" style={{ padding: 16, gap: 10, backgroundColor: c.navigation, marginHorizontal: 5 }}>
      <AppText variant="label" weight="bold" style={{ color: c.muted }}>경사 기준 난이도</AppText>
      <AppText variant="caption" style={{ color: c.muted }}>코스의 난이도는 경사를 기준으로 안내해요.{'\n'}코스를 달리는 동안 만나는 오르막과 내리막의 기울기를 종합해 분류했어요.</AppText>
      <AppText variant="caption" style={{ color: c.muted }}>• 초급 : 비교적 평탄하게 달릴 수 있는 코스예요.{'\n'}• 중급 : 완만한 오르막과 내리막이 포함될 수 있어요.{'\n'}• 상급 : 경사가 있는 구간이 있어 러닝 강도가 높을 수 있어요.</AppText>
      <AppText variant="label" weight="bold" style={{ color: c.muted }}>알아두세요</AppText>
      <AppText variant="caption" style={{ color: c.muted }}>• 난이도는 경사만을 기준으로 계산해요.{'\n'}• 거리, 날씨, 노면 상태, 개인 체력에 따라 실제 체감 난이도는 달라질 수 있어요.{'\n'}• 짧은 급경사 구간이 있다면 코스 상세 정보에서 별도로 확인할 수 있어요.{'\n'}• 고도 정보를 확인할 수 없는 코스는 난이도를 표시하지 않아요.</AppText>
    </View>
  </View>;
}
