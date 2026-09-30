import { CourseExportError } from './export';

export async function shareCourseGpx(_id: string, _signal?: AbortSignal): Promise<'closed' | 'cancelled'> {
  throw new CourseExportError('GPX 내보내기는 Android 앱에서 사용해 주세요.');
}
