import { router } from 'expo-router';
import { useLinkingURL } from 'expo-linking';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { authentication } from '@/modules/auth/runtime';
import { openServiceTab } from '@/features/service/open-service-tab';
import { membership } from '@/modules/membership/runtime';
import { membershipAccess } from '@/modules/membership/access';

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
      if (authentication.getSnapshot().account) await membership.reload();
    };
    void complete().catch(() => undefined).finally(() => {
      if (!current) return;
      const access = membershipAccess(authentication.getSnapshot().account?.id ?? null, membership.getSnapshot());
      if (access === 'service') openServiceTab('/');
      else router.replace(access === 'signup' ? '/account-signup' : '/account-entry');
    });
    return () => { current = false; };
  }, [url]);
  return <ActivityIndicator accessibilityLabel="로그인 결과 확인 중" />;
}
