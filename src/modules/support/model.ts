/** Shared by the form and server contract. No local success without a receipt. */
export const inquiryCategories = ['사용 방법', '오류 신고', '계정·개인정보', '의견·제안', '기타'] as const;
export type InquiryCategory = typeof inquiryCategories[number];
export type InquiryInput = { category: InquiryCategory; title: string; body: string; email: string };
export type InquiryReceipt = { id: string; receivedAt: string };

export class InquiryValidationError extends Error {}

export function validateInquiry(input: InquiryInput): InquiryInput {
  if (!input || !inquiryCategories.includes(input.category)) throw new InquiryValidationError('문의 유형을 선택해 주세요.');
  const title = typeof input.title === 'string' ? input.title.normalize('NFC').trim() : '';
  const body = typeof input.body === 'string' ? input.body.normalize('NFC').trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if ([...title].length < 1 || [...title].length > 100 || /[\p{Cc}\p{Cf}]/u.test(title)) {
    throw new InquiryValidationError('제목은 줄바꿈 없이 1~100자로 입력해 주세요.');
  }
  if ([...body].length < 1 || [...body].length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) {
    throw new InquiryValidationError('문의 내용은 1~5,000자로 입력해 주세요.');
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new InquiryValidationError('답변받을 이메일 주소를 확인해 주세요.');
  }
  return { category: input.category, title, body, email };
}
