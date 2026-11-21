import { useCallback } from 'react';
import { router } from 'expo-router';
import { AppText } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { InquiryForm } from '@/features/support/InquiryForm';
import { SupportPage } from '@/features/support/SupportPage';
export default function ServiceInquiryWrite() {
  const auth = useAuth();
  const submitted = useCallback((id: string) => router.replace({ pathname: '/service-inquiry-detail', params: { id } }), []);
  return <SupportPage title="문의 및 의견 보내기">{auth.account ? <InquiryForm key={auth.account.id} owner={auth.account.id} onSubmitted={submitted} /> : <AppText>로그인 후 문의를 남길 수 있어요.</AppText>}</SupportPage>;
}
