import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { personalSync } from '@/modules/sync/runtime';
import { providerLabel } from '@/modules/account/model';
import { signInProviderLabels } from '@/modules/auth/providers';
import { accountWithdrawal } from '@/modules/account/withdrawal-runtime';
import { useAccountData } from '@/features/account/use-account';
import { AccountButton, AccountCard, AccountPage, AccountRow, ProfileAvatar, accountStyles as s, useAccountColors } from '@/features/account/ui';

export default function AccountScreen() {
  const auth = useAuth(), data = useAccountData();
  const withdrawal = useSyncExternalStore(accountWithdrawal.subscribe, accountWithdrawal.getSnapshot, accountWithdrawal.getSnapshot);
  const sync = useSyncExternalStore(personalSync.subscribe, personalSync.getSnapshot, personalSync.getSnapshot);
  const colors = useAccountColors(data.preferences.theme);
  const disabled = !auth.ready || auth.busy || !auth.configured;
  const signOut = () => Alert.alert('로그아웃할까요?',
    `이 기기의 로그인만 종료합니다. 코스와 러닝 기록은 삭제되지 않으며 같은 계정으로 다시 로그인하면 볼 수 있어요.${sync.status?.pending ? `\n아직 전송하지 않은 변경 ${sync.status.pending}건도 기기에 남습니다.` : ''}`,
    [{ text: '취소', style: 'cancel' }, { text: '로그아웃', onPress: () => { void authentication.signOut(); } }]);
  const stat = (label: string, value: string) => <View key={label} style={{ width: '47%', gap: 5 }}><Text style={[s.heading, { color: colors.text }]}>{value}</Text><Text style={[s.caption, { color: colors.muted }]}>{label}</Text></View>;
  return <AccountPage title="마이페이지" colors={colors}>
    <AccountCard colors={colors}>
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <ProfileAvatar account={auth.account} colors={colors} />
        <View style={{ flex: 1, gap: 5 }}><Text testID="account-name" style={[s.title, { color: colors.text }]}>{auth.account?.name ?? '나의 러닝, RunPen'}</Text>
          <Text testID="account-email" selectable style={[s.caption, { color: colors.muted }]}>{auth.account?.email || (auth.account ? '이메일 정보가 없는 계정' : '로그인하고 내 기록을 이어가세요.')}</Text></View>
      </View>
      {auth.account ? <>
        <Text style={[s.body, { color: colors.muted }]}>연결 계정 · {auth.account.providers.map(providerLabel).join(', ') || '소셜 계정'}</Text>
        <AccountButton id="edit-profile" title="프로필 편집" colors={colors} disabled={auth.busy} secondary onPress={() => router.push('/account-profile')} />
      </> : <>
        <Text style={[s.body, { color: colors.muted }]}>로그인 없이도 기기에 코스와 러닝 기록을 저장할 수 있어요. 로그인 후 동기화를 선택하면 내 기록을 서버에 보관하고 복원할 수 있습니다.</Text>
        {auth.providers.map(provider => <AccountButton key={provider} id={`${provider.replace('custom:', '')}-sign-in`}
          title={`${signInProviderLabels[provider]}로 계속하기`} colors={colors} disabled={disabled}
          onPress={() => { void authentication.signIn(provider); }} />)}
      </>}
      {!auth.configured && <Text accessibilityRole="alert" style={[s.body, { color: colors.danger }]}>{Platform.OS === 'web' ? '로그인은 Android 앱에서 이용할 수 있어요.' : '로그인 연결 설정이 없는 앱입니다. 설정이 포함된 버전으로 업데이트해 주세요.'}</Text>}
      {(auth.busy || !auth.ready) && <ActivityIndicator color={colors.accent} accessibilityLabel="계정 처리 중" />}
      {!!auth.message && <Text testID="auth-message" accessibilityRole="alert" style={[s.body, { color: colors.text }]}>{auth.message}</Text>}
      {withdrawal.complete && !auth.account && <Text accessibilityRole="alert" style={[s.body, { color: colors.text }]}>{withdrawal.message}</Text>}
    </AccountCard>
    <AccountCard colors={colors}>
      <Text style={[s.heading, { color: colors.text }]}>{auth.account ? '내 러닝 기록' : '이 기기의 러닝 기록'}</Text>
      {data.statistics ? <View testID="account-statistics" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
        {stat('누적 거리', `${(data.statistics.distanceM / 1000).toFixed(2)} km`)}
        {stat('총 러닝 시간', `${Math.floor(data.statistics.activeMs / 3600000)}시간 ${Math.floor(data.statistics.activeMs / 60000) % 60}분`)}
        {stat('저장한 러닝', `${data.statistics.runs}회`)}{stat('코스 완주', `${data.statistics.finishedCourses}회`)}
      </View> : !data.error && <ActivityIndicator color={colors.accent} accessibilityLabel="기록 집계 중" />}
      <Text style={[s.caption, { color: colors.muted }]}>이 기기에 저장·복원된 종료 기록 기준입니다. 코스 완주는 안내를 따라 도착 후 완주를 확인한 기록만 셉니다.</Text>
      {!!data.error && <><Text accessibilityRole="alert" style={[s.body, { color: colors.danger }]}>{data.error}</Text><AccountButton id="account-retry" title="다시 불러오기" colors={colors} onPress={data.reload} /></>}
      <AccountRow id="account-runs" title="러닝 기록 보기" colors={colors} onPress={() => router.push('/runs')} />
      <AccountRow id="account-courses" title="저장한 코스" detail={data.statistics ? `${data.statistics.courses}개` : undefined} colors={colors} onPress={() => router.push('/courses')} />
    </AccountCard>
    <AccountCard colors={colors}>
      {auth.account && <AccountRow id="account-sync" title="개인 기록 동기화" detail="전송 상태 · 기기 기록 연결 · 충돌 해결" colors={colors} onPress={() => router.push('/account-sync')} />}
      <AccountRow id="account-settings" title="설정" detail="화면 · 러닝 안내 · 위치 권한" colors={colors} onPress={() => router.push('/account-settings')} />
      {auth.account && <AccountRow id="sign-out" title="로그아웃" colors={colors} disabled={auth.busy} onPress={signOut} />}
      {(auth.account || withdrawal.pending || !withdrawal.ready) && <AccountRow id="account-withdraw" title={withdrawal.pending ? '탈퇴 요청 확인' : '회원 탈퇴'} detail="이 기기의 코스·러닝 기록은 보관합니다" colors={colors} danger disabled={auth.busy} onPress={() => router.push('/account-withdraw')} />}
    </AccountCard>
  </AccountPage>;
}
