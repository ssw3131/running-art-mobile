import { Text } from 'react-native';
import { SyncPanel } from '@/features/auth/SyncPanel';
import { useAuth } from '@/features/auth/use-auth';
import { useAccountData } from '@/features/account/use-account';
import { AccountPage, useAccountColors, accountStyles as s } from '@/features/account/ui';

export default function AccountSyncScreen() {
  const auth = useAuth(), data = useAccountData(), colors = useAccountColors(data.preferences.theme);
  return <AccountPage title="개인 기록 동기화" colors={colors}>
    {auth.account ? <SyncPanel colors={colors} /> : <Text style={[s.body, { color: colors.text }]}>개인 기록을 동기화하려면 로그인해 주세요.</Text>}
  </AccountPage>;
}
