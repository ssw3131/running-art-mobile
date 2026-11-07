import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { candidateDrafts } from '@/features/course-generation/model';
import { savedCourseOverlay } from '@/modules/courses/model';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { useThemeColors } from '@/theme/ThemeProvider';
import TerrainPanel from './TerrainPanel';
import { useTerrain } from './use-terrain';

export default function CourseTerrainScreen() {
  const params = useLocalSearchParams<{ draft?: string }>(), auth = useAuth(), c = useThemeColors();
  const owner = auth.account?.id ?? 'guest';
  const draft = useMemo(() => candidateDrafts.get(params.draft, owner), [params.draft, owner]);
  const overlay = useMemo(() => draft ? savedCourseOverlay(draft.snapshot) : undefined, [draft]);
  const terrain = useTerrain(draft?.snapshot.source === 'osm' ? draft.snapshot.route : undefined, true);
  return <ScrollView testID="course-terrain" style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 40 }}>
    {draft ? <>
      <View style={{ height: 288, borderRadius: 16, overflow: 'hidden' }}>
        <MapSurface styleUrl={mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY) ?? ''} position={null} origin={draft.snapshot.origin}
          routeOverlay={overlay} terrainOverlay={terrain.overlay} showTarget={false} interactive
          syntheticRoads={draft.snapshot.source === 'synthetic' ? { type: 'FeatureCollection', features: [] } : undefined} />
      </View>
      <TerrainPanel controller={terrain.controller} state={terrain.state} />
    </> : <><AppText>코스 정보가 만료됐어요. 상세 화면에서 다시 열어 주세요.</AppText><Button label="뒤로" onPress={() => router.back()} /></>}
  </ScrollView>;
}
