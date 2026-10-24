import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Tabs } from '@/components/ui';
import CoursesScreen from '@/features/courses/CoursesScreen';
import RunsScreen from '@/features/running/RunsScreen';
import { archiveView } from './navigation';
import { useThemeColors } from '@/theme/ThemeProvider';

const options = [{ value: 'courses', label: '저장 코스' }, { value: 'runs', label: '완주 기록' }];
export default function ArchiveScreen() {
  const c = useThemeColors();
  const params = useLocalSearchParams<{ view?: string }>();
  const view = archiveView(params.view);
  return <View style={{ flex: 1, backgroundColor: c.background }}>
    <Tabs options={options} value={view} onChange={value => router.setParams({ view: value })} />
    <View style={{flex:1,display:view==='courses'?'flex':'none'}}><CoursesScreen embedded /></View>
    <View style={{flex:1,display:view==='runs'?'flex':'none'}}><RunsScreen embedded /></View>
  </View>;
}
