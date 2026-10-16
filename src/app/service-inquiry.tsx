import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator } from 'react-native';
import { AppText, Button, SelectField, TextField } from '@/components/ui';
import { SupportPage } from '@/features/support/SupportPage';
import { SupportArt } from '@/features/support/SupportArt';
import { useAuth } from '@/features/auth/use-auth';
import { accountSecureStorage, authentication } from '@/modules/auth/runtime';
import { createInquiryController } from '@/modules/support/inquiry';
import { inquiryCategories, type InquiryInput } from '@/modules/support/model';
import { supportRemote } from '@/modules/support/runtime';
import { useThemeColors } from '@/theme/ThemeProvider';

const empty: InquiryInput = { category: '사용 방법', title: '', body: '', email: '' };
export default function ServiceInquiry() {
  const auth = useAuth();
  return <SupportPage title="문의 및 의견 보내기"><SupportArt kind="inquiry" />
    <AppText variant="heading" weight="bold">궁금한 점이나{'\n'}제안하고 싶은 내용이 있으신가요?</AppText>
    <AppText>소중한 의견을 보내주세요.</AppText>
    {!auth.ready ? <ActivityIndicator accessibilityLabel="계정 확인 중" /> : !auth.account ? <>
      <AppText>문의 접수 내역을 확인하려면 로그인해 주세요.</AppText><Button label="회원가입 · 로그인" testID="inquiry-sign-in" onPress={() => router.push('/account-entry')} />
    </> : <InquiryForm key={auth.account.id} owner={auth.account.id} />}
  </SupportPage>;
}
function InquiryForm({ owner }: { owner: string }) {
  const c = useThemeColors(), [input, setInput] = useState<InquiryInput>(empty);
  const controller = useMemo(() => createInquiryController({ owner, currentOwner: () => authentication.getSnapshot().account?.id ?? null,
    storage: accountSecureStorage, uuid: Crypto.randomUUID,
    send: async (...args) => { if (!supportRemote) throw new Error('문의 연결을 사용할 수 없어요.'); return supportRemote.submit(...args); },
  }), [owner]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { void controller.load(); }, [controller]);
  const value = state.pending?.input ?? input, locked = state.busy || !!state.pending || !state.ready;
  if (state.receipt) return <>
    <AppText testID="inquiry-receipt" accessibilityRole="alert" weight="bold">문의를 접수했어요.</AppText>
    <AppText selectable variant="label">접수번호 {state.receipt.id}{'\n'}접수 시각 {new Date(state.receipt.receivedAt).toLocaleString()}</AppText>
    <AppText>답변받을 이메일을 입력한 경우 해당 주소로 답변을 받을 수 있어요.</AppText>
    <Button label="새 문의 작성" onPress={() => { setInput(empty); controller.newInquiry(); }} />
  </>;
  return <>
    <SelectField label="문의 유형" testID="inquiry-category" value={value.category} disabled={locked} options={inquiryCategories.map(category => ({ value: category, label: category }))} onChange={category => setInput({ ...input, category: category as InquiryInput['category'] })} />
    <TextField label="제목" testID="inquiry-title" value={value.title} onChangeText={title => setInput({ ...input, title })} editable={!locked} maxLength={200} placeholder="제목을 입력해 주세요" hint="1~100자" />
    <TextField label="연락처 (선택)" testID="inquiry-email" value={value.email} onChangeText={email => setInput({ ...input, email })} editable={!locked} maxLength={254} keyboardType="email-address" autoCapitalize="none" placeholder="답변받을 이메일" hint="연락처 없이도 접수할 수 있지만 개별 답변을 받을 수 없어요." />
    <TextField label="내용" testID="inquiry-body" value={value.body} onChangeText={body => setInput({ ...input, body })} editable={!locked} maxLength={10000} multiline style={{ minHeight: 180 }} placeholder="문의 내용을 입력해 주세요" hint="1~5,000자 · 비밀번호나 불필요한 개인정보는 적지 마세요." />
    <AppText variant="caption" style={{ color: c.muted }}>보내기를 누르면 계정 식별값·문의 내용·선택한 이메일을 문의 처리 목적으로 서버에 전송합니다. GPS 경로나 사진은 첨부하지 않아요.</AppText>
    {!!state.message && <AppText testID="inquiry-message" accessibilityRole="alert">{state.message}</AppText>}
    {state.busy && <ActivityIndicator accessibilityLabel="문의 접수 확인 중" color={c.action} />}
    <Button testID={state.ready ? 'inquiry-submit' : 'inquiry-reload'} label={state.ready ? state.pending ? '같은 문의 접수 확인 · 재시도' : '문의 보내기' : '이전 문의 다시 불러오기'} disabled={state.busy} onPress={() => { if (state.ready) void controller.submit(input); else void controller.load(); }} />
  </>;
}
