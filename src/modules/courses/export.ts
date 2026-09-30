import { CourseError, type SavedCourse } from './model.ts';
import { courseGpx, GPX_MIME_TYPE } from './gpx.ts';

export class CourseExportError extends Error {
  constructor(message: string) { super(message); this.name = 'CourseExportError'; }
}
export function exportErrorMessage(error: unknown) {
  return error instanceof CourseExportError || error instanceof CourseError ? error.message
    : 'GPX 파일을 내보내지 못했어요. 저장 공간과 공유할 앱을 확인한 뒤 다시 시도해 주세요.';
}
type ExportFile = { uri: string; discard(): Promise<void> };
export type CourseExportServices = {
  load(id: string): Promise<SavedCourse>;
  isAvailable(): Promise<boolean>;
  write(fileName: string, xml: string): Promise<ExportFile>;
  share(uri: string, options: { mimeType: string; UTI: string; dialogTitle: string }): Promise<void>;
};

/** Serialize shares across screens; OS completion does not confirm a recipient saved the file. */
export function createCourseExporter(services: CourseExportServices) {
  let active = false;
  return async (id: string, signal?: AbortSignal): Promise<'closed' | 'cancelled'> => {
    if (signal?.aborted) return 'cancelled';
    if (active) throw new CourseExportError('이미 GPX 내보내기가 진행 중이에요. 공유 창을 닫은 뒤 다시 시도해 주세요.');
    active = true;
    let file: ExportFile | undefined, handedOff = false;
    try {
      const available = await services.isAvailable();
      if (signal?.aborted) return 'cancelled';
      if (!available) throw new CourseExportError('이 기기에서 파일 공유를 사용할 수 없어요.');
      const course = await services.load(id);
      if (signal?.aborted) return 'cancelled';
      const document = courseGpx(course);
      file = await services.write(document.fileName, document.xml);
      if (signal?.aborted) return 'cancelled';
      // A target can still be reading after the chooser returns, including on a native error.
      handedOff = true;
      await services.share(file.uri, { mimeType: GPX_MIME_TYPE, UTI: 'com.topografix.gpx', dialogTitle: 'GPX 코스 내보내기' });
      return signal?.aborted ? 'cancelled' : 'closed';
    } catch (error) {
      if (signal?.aborted) return 'cancelled';
      throw error;
    } finally {
      try { if (file && !handedOff) await file.discard(); }
      catch { /* An unshared temporary file can be reclaimed with the cache later. */ }
      active = false;
    }
  };
}
