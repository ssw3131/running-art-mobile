import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>RUNNING ART</Text>
          <Text style={styles.title}>달리는 길이{'\n'}그림이 되도록.</Text>
          <Text style={styles.description}>핵심 기능을 확인하는 개발용 앱입니다. 서비스 화면과 디자인은 이후 반영합니다.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.badge}>핵심 기능 테스트</Text>
          <Text style={styles.cardTitle}>지도 · 현재 위치</Text>
          <Text style={styles.description}>지도 표시와 위치 권한·현재 위치를 확인합니다.</Text>
          <Link href="/map" asChild>
            <Pressable accessibilityRole="button" testID="open-map" style={styles.button}>
              <Text style={styles.buttonText}>지도 열기</Text>
            </Pressable>
          </Link>
          <Link href="/route-lab" asChild>
            <Pressable accessibilityRole="button" testID="open-route-lab" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>코스 계산 테스트</Text>
            </Pressable>
          </Link>
          <Link href="/courses" asChild>
            <Pressable accessibilityRole="button" testID="open-courses" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>저장한 코스</Text>
            </Pressable>
          </Link>
          <Link href="/run" asChild>
            <Pressable accessibilityRole="button" testID="open-run" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>러닝 GPS 기록</Text>
            </Pressable>
          </Link>
          <Link href="/runs" asChild>
            <Pressable accessibilityRole="button" testID="open-runs" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>러닝 기록 목록</Text>
            </Pressable>
          </Link>
          <Link href="/storage" asChild>
            <Pressable accessibilityRole="button" testID="open-storage" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>저장소 테스트</Text>
            </Pressable>
          </Link>
          <Link href="/road-file-lab" asChild>
            <Pressable accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>도로 파일 로컬 검증</Text>
            </Pressable>
          </Link>
          <Link href="/road-cache-lab" asChild>
            <Pressable accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>영구 도로 캐시 검증</Text>
            </Pressable>
          </Link>
          <Link href="/environment" asChild>
            <Pressable accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>개발 환경 확인</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F0' },
  content: { flexGrow: 1, padding: 24, gap: 40, justifyContent: 'space-between' },
  heading: { gap: 20, paddingTop: 40 },
  eyebrow: { color: '#487A57', fontSize: 14, fontWeight: '700', letterSpacing: 3 },
  title: { color: '#183C32', fontSize: 38, lineHeight: 50, fontWeight: '700' },
  description: { color: '#57675F', fontSize: 16, lineHeight: 25 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 16 },
  badge: { color: '#487A57', fontSize: 13, fontWeight: '600' },
  cardTitle: { color: '#183C32', fontSize: 22, fontWeight: '700' },
  button: { backgroundColor: '#183C32', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: { alignItems: 'center', padding: 12 },
  secondaryText: { color: '#183C32', fontSize: 15, fontWeight: '600' },
});
