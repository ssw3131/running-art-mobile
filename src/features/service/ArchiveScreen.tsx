import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Tabs } from '@/components/ui';
import CoursesScreen from '@/features/courses/CoursesScreen';
import RunsScreen from '@/features/running/RunsScreen';
import { archiveView } from './navigation';

const options = [{ value: 'courses', label: '저장 코스' }, { value: 'runs', label: '러닝 기록' }];
export default function ArchiveScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const view = archiveView(params.view);
  return <View style={{ flex: 1 }}>
    <Tabs options={options} value={view} onChange={value => router.setParams({ view: value })} />
    {view === 'runs' ? <RunsScreen embedded /> : <CoursesScreen embedded />}
  </View>;
}
