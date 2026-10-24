import { ServiceStack } from '@/features/auth/ServiceStack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontGate } from '@/theme/FontGate';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useServiceTheme } from '@/theme/use-service-theme';
import { AppText, Button } from '@/components/ui';
import { authentication } from '@/modules/auth/runtime';
import { running } from '@/modules/running/runtime';
import { runErrorMessage } from '@/modules/running/model';
import { useAuth } from '@/features/auth/use-auth';
import { personalSync } from '@/modules/sync/runtime';
import { accountWithdrawal } from '@/modules/account/withdrawal-runtime';
import { membership } from '@/modules/membership/runtime';
import { MembershipPrompt } from '@/features/membership/MembershipPrompt';

// A cold detail/deep link has a stable service-home destination for Back.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  const auth=useAuth();
  const theme = useServiceTheme();
  const recoveryScope = auth.ready ? auth.account?.id ?? 'guest' : 'loading';
  const [recovery, setRecovery] = useState({ scope: '', message: '' });
  const recoveryError = recovery.scope === recoveryScope ? recovery.message : '';
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  useEffect(() => {
    void authentication.start();
    membership.start();
    void accountWithdrawal.start();
    personalSync.start();
    personalSync.setActive(AppState.currentState==='active');
    authentication.setActive(AppState.currentState === 'active');
    const links = Linking.addEventListener('url', ({ url }) => { void authentication.handleUrl(url); });
    void Linking.getInitialURL().then(url => { if (url) return authentication.handleUrl(url); }).catch(() => undefined);
    const lifecycle = AppState.addEventListener('change', state => {
      authentication.setActive(state === 'active'); personalSync.setActive(state === 'active');
      // Returning from the photo picker must not reset the open consent form.
      if (state === 'active' && membership.getSnapshot().status !== 'required') void membership.reload();
    });
    return () => { links.remove(); lifecycle.remove(); authentication.setActive(false);personalSync.setActive(false); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !auth.ready || !auth.account) return;
    let mounted = true;
    const recover = () => { void running.monitor().then(() => { if (mounted) setRecovery({ scope: recoveryScope, message: '' }); }).catch(error => { if (mounted) setRecovery({ scope: recoveryScope, message: runErrorMessage(error) }); }); };
    recover();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') recover(); });
    return () => { mounted = false; subscription.remove(); };
  }, [auth.ready,auth.account,recoveryScope,recoveryAttempt]);
  return (
    <ThemeProvider palette={theme.palette}><FontGate><SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.palette.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {!!auth.account && !!recoveryError && <View style={{ padding: 12, gap: 8 }}>
        <AppText accessibilityRole="alert" style={{ color: theme.palette.danger }}>러닝 복원: {recoveryError}</AppText>
        <Button label="복원 다시 시도" compact onPress={() => setRecoveryAttempt(value => value + 1)} />
      </View>}
      <ServiceStack />
      <MembershipPrompt />
    </SafeAreaView></FontGate></ThemeProvider>
  );
}
