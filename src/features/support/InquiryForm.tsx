import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator } from 'react-native';
import * as Crypto from 'expo-crypto';
import { AppText, Button, SelectField, TextField } from '@/components/ui';
import { accountSecureStorage, authentication } from '@/modules/auth/runtime';
import { createInquiryController } from '@/modules/support/inquiry';
import { inquiryCategories, inquiryError, type Inquiry, type InquiryInput } from '@/modules/support/model';
import { SupportArt } from './SupportArt';
import { inquiryRemote } from './use-inquiry-resource';

const empty: InquiryInput = { category: '사용 방법', title: '', body: '' };
function Fields({ value, locked, onChange }: { value: InquiryInput; locked: boolean; onChange(value: InquiryInput): void }) {
  return <>
    <SelectField label="문의 유형" testID="inquiry-category" value={value.category} disabled={locked} options={inquiryCategories.map(category => ({ value: category, label: category }))} onChange={category => onChange({ ...value, category: category as InquiryInput['category'] })} />
    <TextField label="제목" testID="inquiry-title" value={value.title} onChangeText={title => onChange({ ...value, title })} editable={!locked} maxLength={200} placeholder="제목을 입력해 주세요" hint="1~100자" />
    <TextField label="내용" testID="inquiry-body" value={value.body} onChangeText={body => onChange({ ...value, body })} editable={!locked} maxLength={10000} multiline style={{ minHeight: 180 }} placeholder="문의 내용을 입력해 주세요" hint="1~5,000자 · 비밀번호나 불필요한 개인정보는 적지 마세요." />
  </>;
}
export function InquiryForm({ owner, onSubmitted }: { owner: string; onSubmitted(id: string): void }) {
  const [input, setInput] = useState<InquiryInput>(empty);
  const delivered = useRef<string | null>(null);
  const controller = useMemo(() => createInquiryController({ owner,
    currentOwner: () => authentication.getSnapshot().account?.id ?? null,
    storage: accountSecureStorage, uuid: Crypto.randomUUID,
    send: (...args) => inquiryRemote().submit(...args),
  }), [owner]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    const unsubscribe = controller.subscribe(() => {
      const pending = controller.getSnapshot().pending;
      if (pending) setInput(pending.input);
    });
    void controller.load();
    return unsubscribe;
  }, [controller]);
  useEffect(() => {
    if (state.receipt && delivered.current !== state.receipt.id) { delivered.current = state.receipt.id; onSubmitted(state.receipt.id); }
  }, [state.receipt, onSubmitted]);
  return <>
    <SupportArt kind="inquiry" />
    <AppText variant="heading" weight="bold">궁금한 점이나{'\n'}제안하고 싶은 내용이 있으신가요?</AppText>
    <AppText>본인과 RunPen 운영팀만 볼 수 있어요. 답변은 문의 상세에서 확인해 주세요.</AppText>
    <Fields value={state.pending?.input ?? input} locked={state.busy || !!state.pending || !state.ready} onChange={setInput} />
    <AppText variant="caption">계정 식별값과 문의 내용을 문의 처리 목적으로 서버에 전송합니다. 이메일을 받지 않으며 GPS 경로나 사진은 첨부하지 않아요.</AppText>
    {!!state.message && <AppText testID="inquiry-message" accessibilityRole="alert">{state.message}</AppText>}
    {state.busy && <ActivityIndicator accessibilityLabel="문의 접수 확인 중" />}
    <Button testID={state.ready ? 'inquiry-submit' : 'inquiry-reload'} label={state.ready ? state.pending ? '같은 문의 접수 확인 · 재시도' : '문의 보내기' : '이전 문의 다시 불러오기'} disabled={state.busy} onPress={() => { if (state.ready) void controller.submit(input); else void controller.load(); }} />
  </>;
}

export function InquiryEditor({ owner, inquiry, onSaved, onCancel, onConflict }: { owner: string; inquiry: Inquiry; onSaved(): void; onCancel(): void; onConflict(message: string): void }) {
  const [input, setInput] = useState<InquiryInput>(inquiry), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && authentication.getSnapshot().account?.id === owner;
  async function save() {
    if (pending.current || !current()) return;
    pending.current = true; setBusy(true); setMessage('');
    try { await inquiryRemote().update(inquiry.id, inquiry.version, input); if (current()) onSaved(); }
    catch (e) {
      if (current()) {
        const code = (e as { code?: string }).code;
        if (code === '40001' || code === 'P0002') onConflict(inquiryError(e)); else setMessage(inquiryError(e));
      }
    } finally { pending.current = false; if (current()) setBusy(false); }
  }
  return <><SupportArt kind="inquiry" /><Fields value={input} locked={busy} onChange={setInput} />
    {!!message && <AppText accessibilityRole="alert">{message}</AppText>}
    <Button label="수정 저장" testID="inquiry-save" loading={busy} onPress={() => { void save(); }} />
    <Button label="취소" variant="outline" disabled={busy} onPress={onCancel} />
  </>;
}
