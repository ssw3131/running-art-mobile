/** Shared by the form and server contract. No local success without a receipt. */
export const inquiryCategories = ['사용 방법', '오류 신고', '계정·개인정보', '의견·제안', '기타'] as const;
export type InquiryCategory = typeof inquiryCategories[number];
export type InquiryInput = { category: InquiryCategory; title: string; body: string };
export type InquiryReceipt = { id: string; receivedAt: string };
export type Inquiry = InquiryInput & InquiryReceipt & {
  version: number; reply: string | null; repliedAt: string | null; replyUpdatedAt: string | null;
};
export type InquirySummary = Pick<Inquiry, 'id' | 'receivedAt' | 'category' | 'title'> & { answered: boolean };
export type InquiryCursor = { receivedAt: string; id: string };
export type InquiryPage = { items: InquirySummary[]; next: InquiryCursor | null };

export class InquiryValidationError extends Error {}

export function validateInquiry(input: InquiryInput): InquiryInput {
  if (!input || !inquiryCategories.includes(input.category)) throw new InquiryValidationError('문의 유형을 선택해 주세요.');
  const title = typeof input.title === 'string' ? input.title.normalize('NFC').trim() : '';
  const body = typeof input.body === 'string' ? input.body.normalize('NFC').trim() : '';
  if ([...title].length < 1 || [...title].length > 100 || /[\p{Cc}\p{Cf}]/u.test(title)) {
    throw new InquiryValidationError('제목은 줄바꿈 없이 1~100자로 입력해 주세요.');
  }
  if ([...body].length < 1 || [...body].length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) {
    throw new InquiryValidationError('문의 내용은 1~5,000자로 입력해 주세요.');
  }
  return { category: input.category, title, body };
}

export function inquiryError(error: unknown): string {
  if (error instanceof InquiryValidationError) return error.message;
  const value = error as { code?: string; message?: string } | null;
  if (value?.code === '42501' || value?.code === 'PGRST301' || value?.code === 'PGRST303') return '로그인 상태를 확인하고 다시 시도해 주세요.';
  if (value?.message === 'Inquiry rate limit') return '문의는 한 시간에 5건까지 보낼 수 있어요. 잠시 후 다시 시도해 주세요.';
  if (value?.message === 'Inquiry answered') return '운영팀 답변이 등록되어 수정·삭제할 수 없어요. 최신 내용을 확인해 주세요.';
  if (value?.code === '40001') return '문의가 변경되었어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.';
  if (value?.code === 'P0002') return '문의를 찾을 수 없어요. 삭제되었거나 접근할 수 없는 문의입니다.';
  if (value?.code === 'PGRST202' || value?.code === '42P01') return '문의 서비스를 준비 중이에요. 잠시 후 다시 시도해 주세요.';
  return '연결 상태를 확인하고 다시 시도해 주세요.';
}

export function definiteInquiryRejection(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return ['42501', 'PGRST301', 'PGRST303', 'PGRST202', '42P01', '22023', 'P0001', 'P0002'].includes(code ?? '');
}
