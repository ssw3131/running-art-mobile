import { CourseError, courseId, courseName, courseShapes, validateSnapshot, type SavedCourse } from './model.ts';

export const GPX_MIME_TYPE = 'application/gpx+xml';

function xmlText(text: string) {
  // XML 1.0 excludes isolated UTF-16 surrogates and some characters accepted by SQLite.
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (!(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) {
      throw new CourseError('validation', '코스 이름에 GPX에서 사용할 수 없는 문자가 있어요. 이름을 바꾼 뒤 다시 시도해 주세요.');
    }
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function compatibleDecimal(text: string) {
  // Some GPX readers have bounded decimal precision. Never round a saved coordinate silently.
  if ((text.split('.')[1]?.length ?? 0) > 20) {
    throw new CourseError('validation', 'GPX에서 호환되는 좌표 정밀도를 넘는 코스예요. 경로를 반올림하지 않고 내보내기를 중단했어요.');
  }
  return text;
}
function decimal(value: number) {
  // GPX uses xsd:decimal, which does not accept JS exponential notation.
  const text = String(value);
  if (!/[eE]/.test(text)) return compatibleDecimal(text);
  const [mantissa, exponent] = text.split('e');
  const negative = mantissa.startsWith('-');
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ''] = unsigned.split('.');
  const digits = whole + fraction, position = whole.length + Number(exponent);
  const expanded = position <= 0 ? `0.${'0'.repeat(-position)}${digits}`
    : position >= digits.length ? digits + '0'.repeat(position - digits.length)
      : `${digits.slice(0, position)}.${digits.slice(position)}`;
  return compatibleDecimal((negative ? '-' : '') + expanded);
}

/** A planned course, not an activity: no fabricated timestamps, elevations or speeds. */
export function courseGpx(course: SavedCourse) {
  const id = courseId(course.id), name = courseName(course.name), snapshot = validateSnapshot(course.snapshot);
  const synthetic = snapshot.source === 'synthetic';
  const title = xmlText(synthetic ? `가상 테스트 코스: ${name}` : name);
  const description = xmlText(`${synthetic ? '가상 테스트 코스이며 실제 달릴 길이 아닙니다.' : 'OSM 보행 도로로 계산한 예정 코스입니다.'} ` +
    `실제 러닝 기록이 아닙니다. ${courseShapes[snapshot.shape]} · 목표 ${snapshot.targetKm}km · 경로 ${snapshot.lengthKm}km.`);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Running Art" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>', `    <name>${title}</name>`, `    <desc>${description}</desc>`];
  if (!synthetic) lines.push('    <copyright author="OpenStreetMap contributors">',
    '      <license>https://opendatacommons.org/licenses/odbl/1-0/</license>', '    </copyright>',
    '    <link href="https://www.openstreetmap.org/copyright"><text>© OpenStreetMap contributors</text></link>');
  lines.push('  </metadata>', '  <trk>', `    <name>${title}</name>`, `    <desc>${description}</desc>`,
    `    <src>${synthetic ? 'Running Art synthetic test data' : 'OpenStreetMap contributors · ODbL'}</src>`,
    '    <type>planned-course</type>', '    <trkseg>');
  for (const [longitude, latitude] of snapshot.route) {
    // GPX longitude is [-180, 180); +180 and -180 identify the same meridian.
    lines.push(`      <trkpt lat="${decimal(latitude)}" lon="${decimal(longitude === 180 ? -180 : longitude)}"/>`);
  }
  lines.push('    </trkseg>', '  </trk>', '</gpx>', '');
  const stem = Array.from(name.normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-'))
    .slice(0, 40).join('').replace(/^-+|-+$/g, '') || 'course';
  return { fileName: `running-art-${stem}-${id.slice(0, 8)}.gpx`, xml: lines.join('\n') };
}
