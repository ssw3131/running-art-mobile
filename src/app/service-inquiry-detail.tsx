import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { inquiryError } from '@/modules/support/model';
import { InquiryEditor } from '@/features/support/InquiryForm';
import { SupportPage } from '@/features/support/SupportPage';
import { inquiryRemote, useInquiryResource } from '@/features/support/use-inquiry-resource';
import { useThemeColors } from '@/theme/ThemeProvider';
export default function ServiceInquiryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(), auth = useAuth();
  return auth.account ? <Detail key={`${auth.account.id}:${id}`} owner={auth.account.id} id={id} /> : <SupportPage title="문의 상세"><AppText>로그인 후 문의를 확인할 수 있어요.</AppText></SupportPage>;
}
function Detail({ owner, id }: { owner: string; id: string }) {
  const c = useThemeColors(), load = useCallback(() => inquiryRemote().detail(id), [id]);
  const { data, error, busy, reload } = useInquiryResource(load);
  const [editing, setEditing] = useState(false), [removing, setRemoving] = useState(false), [message, setMessage] = useState('');
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && authentication.getSnapshot().account?.id === owner;
  const refresh = () => { setEditing(false); reload(); };
  async function remove() {
    if (!data || pending.current || !current()) return;
    pending.current = true; setRemoving(true); setMessage('');
    try { await inquiryRemote().remove(data.id, data.version); if (current()) router.dismissTo('/service-inquiry'); }
    catch (e) { if (current()) { setMessage(inquiryError(e)); refresh(); } }
    finally { pending.current = false; if (current()) setRemoving(false); }
  }
  return <SupportPage title={editing ? '문의 수정' : '문의 상세'}>
    {!!message && <AppText accessibilityRole="alert">{message}</AppText>}
    {!data && busy && <ActivityIndicator accessibilityLabel="문의 불러오는 중" color={c.action} />}
    {!!error && <><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 확인" variant="outline" onPress={refresh} /></>}
    {data && editing ? <InquiryEditor owner={owner} inquiry={data} onSaved={refresh} onCancel={() => setEditing(false)} onConflict={text => { setMessage(text); refresh(); }} /> : data && <>
      <AppText variant="label" style={{ color: c.selected }}>{data.category} · {data.reply ? '답변 완료' : '미확인'} · {new Date(data.receivedAt).toLocaleDateString()}</AppText>
      <AppText variant="heading" weight="bold">{data.title}</AppText><View style={{ borderBottomWidth: 1, borderColor: c.divider }} />
      <AppText testID="inquiry-detail-body" selectable style={{ lineHeight: 28 }}>{data.body}</AppText>
      {data.reply ? <><View style={{ borderBottomWidth: 1, borderColor: c.divider }} /><AppText variant="heading" weight="bold">RunPen 운영팀 답변</AppText>
        <AppText variant="label">{new Date(data.repliedAt!).toLocaleDateString()}{data.replyUpdatedAt !== data.repliedAt ? ' · 수정됨' : ''}</AppText>
        <AppText testID="inquiry-reply" selectable style={{ lineHeight: 28 }}>{data.reply}</AppText>
      </> : <><AppText>운영팀의 답변을 기다리고 있어요.</AppText>
        <Button label="문의 수정" testID="inquiry-edit" variant="outline" disabled={removing} onPress={() => { setMessage(''); setEditing(true); }} />
        <Button label="문의 삭제" testID="inquiry-delete" variant="outline" loading={removing} onPress={() => Alert.alert('문의를 삭제할까요?', '삭제한 문의는 복구할 수 없어요.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { void remove(); } }])} />
      </>}
      <Button label="최신 내용 확인" variant="outline" disabled={removing} onPress={refresh} />
    </>}
    {!editing && <Button label="목록으로 돌아가기" disabled={removing} onPress={() => router.dismissTo('/service-inquiry')} />}
  </SupportPage>;
}
