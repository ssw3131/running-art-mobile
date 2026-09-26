import Constants from 'expo-constants';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function EnvironmentScreen() {
  const details = [
    ['앱 버전', Constants.expoConfig?.version ?? '확인 불가'],
    ['실행 플랫폼', `${Platform.OS} ${Platform.Version}`],
    ['개발 방식', 'React Native · Expo · TypeScript'],
    ['화면 이동', 'Expo Router'],
    ['지도', 'MapLibre · MapTiler'],
    ['지도 키', process.env.EXPO_PUBLIC_MAPTILER_API_KEY?.trim() ? '설정됨 · 실제 연결은 지도에서 확인' : '미설정'],
    ['위치', 'Expo Location · 전경에서 한 번 확인'],
    ['알고리즘 실행 계획', '휴대폰 내부 모듈'],
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>실행 환경</Text>
      <Text style={styles.description}>초기 개발 환경과 화면 이동을 확인하기 위한 개발용 화면입니다.</Text>
      <View style={styles.card}>
        {details.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.description}>지도 키는 모바일 루트의 .env.local에 EXPO_PUBLIC_MAPTILER_API_KEY로 설정한 뒤 Metro를 재시작하세요. 지도 표시에만 필요하며, 현재 위치·권한 처리는 키 없이 확인할 수 있습니다.</Text>
      <Text style={styles.description}>러닝 기록 · 경로 계산 · 저장소는 아직 연결하지 않았습니다.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F0' },
  content: { padding: 24, gap: 20 },
  title: { color: '#183C32', fontSize: 28, fontWeight: '700' },
  description: { color: '#57675F', fontSize: 16, lineHeight: 25 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 20 },
  row: { paddingVertical: 18, gap: 8 },
  label: { color: '#57675F', fontSize: 14 },
  value: { color: '#183C32', fontSize: 16, fontWeight: '600' },
});
