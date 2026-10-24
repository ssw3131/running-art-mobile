import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getStorage } from '../storage/database';
import { CourseExportError, createCourseExporter } from './export';

let sequence = 0;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const nativeExporter = {
  isAvailable: () => Sharing.isAvailableAsync(),
  share: (uri: string, options: Sharing.SharingOptions) => Sharing.shareAsync(uri, options),
  async write(fileName: string, xml: string) {
    if (!FileSystem.cacheDirectory) throw new CourseExportError('임시 파일 저장소를 사용할 수 없어요. 앱을 다시 실행해 주세요.');
    const root = `${FileSystem.cacheDirectory}course-exports/`;
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    // Only our timestamped export directories are eligible; keep shared files for at least a day.
    try {
      for (const name of await FileSystem.readDirectoryAsync(root)) {
        const match = /^(\d{13})-\d+-[a-z0-9]+$/.exec(name);
        if (match && Date.now() - Number(match[1]) > MAX_AGE_MS) {
          await FileSystem.deleteAsync(root + name, { idempotent: true });
        }
      }
    } catch { /* Cache maintenance must not prevent a new export. */ }
    const directory = `${root}${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}/`;
    await FileSystem.makeDirectoryAsync(directory);
    const uri = directory + encodeURIComponent(fileName);
    const discard = () => FileSystem.deleteAsync(directory, { idempotent: true });
    try {
      await FileSystem.writeAsStringAsync(uri, xml, { encoding: FileSystem.EncodingType.UTF8 });
      return { uri, discard };
    } catch (error) {
      await discard().catch(() => {});
      throw error;
    }
  },
};
export const shareCourseGpx = createCourseExporter({ ...nativeExporter, load: async id => (await getStorage()).courses.get(id) });
export const shareRunCourseGpx = createCourseExporter({ ...nativeExporter, load: async id => {
  const guide = await (await getStorage()).runs.guidance(id);
  if (!guide) throw new CourseExportError('이 기록에 코스 사본이 없어요.');
  return { ...guide.course, createdAt: Date.now(), updatedAt: Date.now(), shape: guide.course.snapshot.shape, lengthKm: guide.course.snapshot.lengthKm, targetKm: guide.course.snapshot.targetKm, source: guide.course.snapshot.source, score: guide.course.snapshot.score };
} });
