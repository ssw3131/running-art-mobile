import { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Checkbox } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { useAccountData } from '@/features/account/use-account';
import { AccountButton, AccountCard, AccountPage, accountStyles as s, useAccountColors } from '@/features/account/ui';
import { accountWithdrawal } from '@/modules/account/withdrawal-runtime';

export default function AccountWithdrawScreen() {
  const auth = useAuth(), data = useAccountData();
  const state = useSyncExternalStore(accountWithdrawal.subscribe, accountWithdrawal.getSnapshot, accountWithdrawal.getSnapshot);
  const colors = useAccountColors(data.preferences.theme);
  const [acknowledged, setAcknowledged] = useState(false);
  const confirm = () => Alert.alert('RunPen에서 탈퇴할까요?',
    '계정과 서버에 보관한 개인 자료가 삭제되며 복구할 수 없어요. 이 기기의 코스와 러닝 기록은 비로그인 기록으로 남습니다. 서버에만 있는 기록은 남지 않습니다.',
    [{ text: '취소', style: 'cancel' }, { text: '탈퇴하고 기기 기록 보관', style: 'destructive', onPress: () => { void accountWithdrawal.begin(); } }]);
  return <AccountPage title="회원 탈퇴" colors={colors}>
    <View style={{ alignItems: 'center', gap: 20, paddingVertical: 12 }}>
      <Image source={require('../../assets/support/withdraw-warning.svg')} style={{ width: 64, height: 64 }} accessible={false} />
      <Text style={[s.title, { color: colors.text }]}>탈퇴 전 확인해주세요</Text>
    </View>
    <AccountCard colors={colors}>
      <Text style={[s.heading, { color: colors.text }]}>기기의 기록은 남겨둘게요</Text>
      <Text testID="withdraw-retention-policy" style={[s.body, { color: colors.text }]}>탈퇴하면 계정과 서버에 보관한 개인 코스·러닝 자료를 삭제합니다. 이 기기에 저장된 코스, 러닝 기록, GPS 경로는 삭제하지 않고 비로그인 기록으로 보관합니다.</Text>
      <Text style={[s.body, { color: colors.muted }]}>보관한 기록은 이 기기에서 계속 열 수 있어요. 나중에 다른 계정으로 로그인하더라도 기기 기록 연결을 직접 선택하기 전에는 그 계정에 업로드하지 않습니다.</Text>
      <Text style={[s.body, { color: colors.muted }]}>서버에만 있고 이 기기에 저장되지 않은 기록은 탈퇴 후 복원할 수 없어요. 진행 중인 러닝은 먼저 종료해 주세요.</Text>
      <Text testID="withdraw-usage-retention" style={[s.body, { color: colors.muted }]}>같은 소셜 계정으로 재가입해도 생성·저장 사용 횟수는 유지됩니다. 무료 혜택 정책 운영 기간 동안 원본 이메일·소셜 ID 대신 비밀키로 변환한 식별값과 누적 사용량을 별도로 보관합니다. 총량 변경으로 보관 기간이 끝나지는 않습니다.</Text>
    </AccountCard>
    <AccountButton id="withdraw-policy" title="데이터 삭제 · 보관 안내" colors={colors} secondary onPress={() => router.push({ pathname: '/service-policy', params: { kind: 'privacy' } })} />
    <AccountCard colors={colors}>
      {!!state.message && <Text testID="withdraw-message" accessibilityRole="alert" style={[s.body, { color: colors.text }]}>{state.message}</Text>}
      {state.busy && <ActivityIndicator color={colors.accent} accessibilityLabel="탈퇴 상태 확인 중" />}
      {!state.ready ? <AccountButton id="withdraw-load" title="요청 불러오기" colors={colors} disabled={state.busy} onPress={() => { void accountWithdrawal.start(); }} />
        : state.pending ? <>
          <Text style={[s.body, { color: colors.muted }]}>이 기기에 보관한 탈퇴 요청이 있습니다. 연결이 끊겼거나 앱이 종료되었다면 완료 여부부터 다시 확인합니다. 처리가 끝나기 전에는 탈퇴한 것으로 표시하지 않습니다.</Text>
          <AccountButton id="withdraw-resume" title="탈퇴 상태 확인 · 이어서 처리" colors={colors} disabled={state.busy || auth.busy} onPress={() => { void accountWithdrawal.resume(); }} />
        </> : (!state.complete || auth.account) && <>
          {!state.available && <Text testID="withdraw-unavailable" style={[s.body, { color: colors.muted }]}>회원 탈퇴 서비스 연결을 준비 중입니다. 준비가 끝나면 이 화면에서 요청할 수 있어요.</Text>}
          {!auth.account && <Text style={[s.body, { color: colors.muted }]}>탈퇴할 계정으로 먼저 로그인해 주세요.</Text>}
          <Checkbox testID="withdraw-acknowledge" label="탈퇴 안내사항을 확인했어요." checked={acknowledged} onChange={setAcknowledged} disabled={state.busy || auth.busy} />
          <AccountButton id="withdraw-back" title="돌아가기" colors={colors} disabled={state.busy || auth.busy} onPress={() => router.back()} />
          <AccountButton id="withdraw-confirm" title="탈퇴하고 기기 기록 보관" colors={colors} secondary disabled={!acknowledged || !state.available || !auth.account || state.busy || auth.busy} onPress={confirm} />
        </>}
    </AccountCard>
  </AccountPage>;
}
