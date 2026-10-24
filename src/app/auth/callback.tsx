import { router } from 'expo-router';
import { useLinkingURL } from 'expo-linking';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { authentication } from '@/modules/auth/runtime';
import { openServiceTab } from '@/features/service/open-service-tab';

// Await the shared exchange (also invoked by Root Linking) before routing.
// Callback credentials never appear in UI or logs.
export default function AuthCallbackScreen() {
  const url = useLinkingURL();
  useEffect(() => {
    let current = true;
    const complete = async () => {
      await authentication.start();
      // Preserve duplicate parameters, fragments and host for the shared validator.
      if (url) await authentication.handleUrl(url);
    };
    void complete().catch(() => undefined).finally(() => {
      if (!current) return;
      if (authentication.getSnapshot().account) openServiceTab('/');
      else router.replace('/account-entry');
    });
    return () => { current = false; };
  }, [url]);
  return <ActivityIndicator accessibilityLabel="로그인 결과 확인 중" />;
}
