import type { TestNoteRepository } from './test-notes';

export async function getStorage(): Promise<TestNoteRepository> {
  throw new Error('저장소 테스트는 Android 개발용 앱에서 실행해 주세요.');
}
