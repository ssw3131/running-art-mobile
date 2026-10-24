/** Test policy identifiers deliberately distinguish publication from launch. */
export function policyPublicationLabel(id: string, timestamp: string): string {
  const date = new Date(timestamp).toLocaleDateString('ko-KR');
  return id.startsWith('runpen-test-')
    ? `시험용 정책 · 시험 게시 ${date} · 정식 출시 시행일 미정`
    : `정책 게시 ${date}`;
}
