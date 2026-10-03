import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';

export default function AccountScreen() {
  const state = useAuth();
  const disabled = !state.ready || state.busy || !state.configured;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>{state.account ? '로그인한 계정' : 'Google 로그인'}</Text>
        {!state.ready && <Text style={styles.body}>로그인 상태 확인 중…</Text>}
        {state.account ? <>
          <Text testID="account-name" style={styles.name}>{state.account.name}</Text>
          <Text testID="account-email" selectable style={styles.body}>{state.account.email}</Text>
          <Text style={styles.body}>앱을 다시 열어도 로그인이 유지됩니다.</Text>
        </> : <Text style={styles.body}>Google 계정으로 로그인할 수 있습니다. 로그인 없이도 기기에 저장한 코스와 러닝 기록을 사용할 수 있습니다.</Text>}
        {!state.configured && <Text accessibilityRole="alert" style={styles.error}>{Platform.OS === 'web' ? 'Google 로그인은 Android 앱에서 확인해 주세요.' : '이 빌드에는 로그인 연결 설정이 없습니다. 설정을 포함한 앱으로 업데이트해 주세요.'}</Text>}
        {(state.busy || !state.ready) && <ActivityIndicator accessibilityLabel="로그인 처리 중" color="#183C32" />}
        {!!state.message && <Text testID="auth-message" accessibilityRole="alert" style={styles.body}>{state.message}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
          testID={state.account ? 'sign-out' : 'google-sign-in'}
          onPress={() => { void (state.account ? authentication.signOut() : authentication.signIn()); }}
          style={[styles.button, disabled && styles.disabled]}>
          <Text style={styles.buttonText}>{state.account ? '이 기기에서 로그아웃' : 'Google로 로그인'}</Text>
        </Pressable>
      </View>
      <Text style={styles.body}>코스와 러닝 기록은 현재 이 기기에 저장됩니다. 계정 간 동기화는 아직 제공하지 않으며 로그아웃해도 기기 기록은 유지됩니다.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#F6F5F0', padding: 24, gap: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 20 },
  title: { color: '#183C32', fontSize: 24, fontWeight: '700' },
  name: { color: '#183C32', fontSize: 20, fontWeight: '600' },
  body: { color: '#57675F', fontSize: 16, lineHeight: 25 },
  error: { color: '#A12F2F', fontSize: 16, lineHeight: 25 },
  button: { backgroundColor: '#183C32', borderRadius: 14, padding: 18, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
