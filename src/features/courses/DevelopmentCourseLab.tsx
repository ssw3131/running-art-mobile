import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { getStorage } from '@/modules/storage/database';
import type { CourseSummary, SavedCourse } from '@/modules/courses/model';
import SimulationPanel from './SimulationPanel';

export default function DevelopmentCourseLab() {
  const [courses, setCourses] = useState<CourseSummary[]>([]), [course, setCourse] = useState<SavedCourse | null>(null), [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let current = true;
    void getStorage().then(db => db.courses.list(100)).then(rows => { if (current) setCourses(rows); }).catch(() => { if (current) setError('코스를 불러오지 못했어요.'); });
    return () => { current = false; setCourse(null); };
  }, []));
  return <View style={{ gap: 12 }}>
    <AppText weight="bold">저장 코스 모의 주행</AppText>
    {!!error && <AppText accessibilityRole="alert">{error}</AppText>}
    {course ? <><SimulationPanel snapshot={course.snapshot}/><Button label="모의 주행 닫기" onPress={() => setCourse(null)}/><Button label="안내 시험" onPress={() => router.push({ pathname: '/guidance', params: { courseId: course.id } })}/></> :
      courses.map(row => <Button key={row.id} label={row.name} variant="outline" onPress={() => { void getStorage().then(db => db.courses.get(row.id)).then(setCourse).catch(() => setError('코스를 열지 못했어요.')); }}/>) }
  </View>;
}
