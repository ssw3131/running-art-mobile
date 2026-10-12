import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator } from 'react-native';
import { openServiceTab } from '@/features/service/open-service-tab';

// Root Linking handlers exchange the code; never render or log callback credentials.
export default function AuthCallbackScreen() {
  useFocusEffect(useCallback(() => { openServiceTab('/account'); }, []));
  return <ActivityIndicator accessibilityLabel="계정으로 돌아가는 중" />;
}
