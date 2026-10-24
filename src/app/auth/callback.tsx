import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { authentication } from '@/modules/auth/runtime';

// Await the shared exchange (also invoked by Root Linking) before routing.
// Callback credentials never appear in UI or logs.
export default function AuthCallbackScreen() {
  const { code, error, error_description: description } = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  useEffect(() => {
    let current = true;
    const complete = async () => {
      await authentication.start();
      const query = new URLSearchParams();
      if (typeof code === 'string') query.set('code', code);
      if (typeof error === 'string') query.set('error', error);
      if (typeof description === 'string') query.set('error_description', description);
      await authentication.handleUrl(`runningart://auth/callback?${query}`);
    };
    void complete().catch(() => undefined).finally(() => {
      if (current) router.replace(authentication.getSnapshot().account ? '/' : '/account-entry');
    });
    return () => { current = false; };
  }, [code, error, description]);
  return <ActivityIndicator accessibilityLabel="로그인 결과 확인 중" />;
}
