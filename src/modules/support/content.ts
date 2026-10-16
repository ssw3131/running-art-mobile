/** Bundled help remains readable without a network connection. */
export const helpContentVersion = '2026-10-14';
export const frequentlyAskedQuestions = [
  { id: 'about', title: 'RunPen은 어떤 앱인가요?', body: '원하는 모양에 가까운 실제 도로 코스를 만들고, GPS로 달린 길을 기록하는 앱이에요. 저장한 코스와 러닝 기록은 기록 보관함에서 다시 확인할 수 있어요.' },
  { id: 'beginner', title: '러닝 초보자도 이용할 수 있나요?', body: '1~10km 중 원하는 목표 거리를 선택할 수 있어요. 목표 거리와 실제 코스 길이는 다를 수 있으니 상세 화면에서 확인해 주세요. 러닝 중에는 일시정지하거나 중도 종료하여 지금까지의 기록을 저장할 수 있어요.' },
  { id: 'shape', title: '원하는 모양의 코스가 나오지 않아요.', body: '주변 도로의 연결과 형태에 따라 후보가 적거나 없을 수 있어요. 지도 중심을 옮기거나 거리·도형을 바꿔 다시 계산해 주세요. 도로 위의 코스이므로 원본 도형과 완전히 같지는 않아요.' },
  { id: 'distance', title: '코스 거리와 실제 러닝 거리는 왜 다른가요?', body: '코스 거리는 계산된 도로 경로, 러닝 거리는 실제로 수신한 GPS 위치를 기준으로 해요. 코스까지 이동한 길·이탈·GPS 오차 등에 따라 달라질 수 있어요. 근거가 없는 예상 시간은 표시하지 않아요.' },
  { id: 'terrain', title: '코스 난이도는 어떤 기준인가요?', body: '현재 난이도 점수는 제공하지 않아요. 코스 상세의 경사 보기에서 고도와 오르막을 참고할 수 있어요. 경사만으로 노면·공사·통행 가능 여부까지 판단할 수는 없어요.' },
  { id: 'permission', title: '위치 권한은 왜 필요한가요?', body: '내 위치 확인과 실제 러닝 기록에 사용해요. 화면을 끈 동안에도 기록하려면 정확한 위치와 백그라운드 위치 권한이 필요해요. 설정에서 현재 권한을 확인하고 기기 앱 설정으로 이동할 수 있어요. 종료·일시정지하면 위치 수집을 멈춰요.' },
  { id: 'gps', title: '현재 위치가 다르거나 러닝 경로가 튀어요.', body: '기기의 위치 서비스와 정확한 위치 권한을 확인해 주세요. 실내·높은 건물 주변 등에서는 GPS가 불안정할 수 있어요. 위치 수신이 회복된 뒤 안내를 확인하고 안전하게 이동해 주세요.' },
  { id: 'blocked-road', title: '안내된 코스로 지나갈 수 없으면 어떻게 해요?', body: '실제 도로의 통제·공사·사유지 여부는 지도 자료와 다를 수 있어요. 현장 안내와 안전을 우선하고, 통행할 수 없는 구간에 들어가지 마세요. 필요하면 일시정지하거나 종료한 뒤 다른 코스를 선택해 주세요.' },
  { id: 'records', title: '러닝 기록은 어디에서 확인하나요?', body: '기록 보관함의 러닝 기록에서 월별로 확인할 수 있어요. 코스 한 바퀴 도착 후 종료·저장을 확인한 기록은 완주로 표시돼요. 중도 종료와 자유 러닝도 남고, 여러 종료 기록을 합쳐 완주로 세지는 않아요.' },
  { id: 'missing', title: '러닝 기록이 보이지 않아요.', body: '기록을 만들었던 계정인지, 러닝이 아직 진행·중단 상태인지 확인해 주세요. 동기화를 사용했다면 마이페이지의 개인 기록 동기화에서 상태를 확인할 수 있어요. 전송 전에는 앱 데이터 삭제나 앱 제거를 하지 말고, 문제가 계속되면 문의해 주세요.' },
] as const;

export type ServiceNotice = { id: string; title: string; body: string; category: string; publishedAt: string };
export function parseNotices(value: unknown, now = Date.now()): ServiceNotice[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid notice list');
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid notice');
    for (const [key, limit] of [['id', 80], ['title', 150], ['body', 30000], ['category', 30]] as const) {
      if (typeof item[key] !== 'string' || !item[key].trim() || item[key].length > limit) throw new Error('Invalid notice');
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.id) || ids.has(item.id) || typeof item.publishedAt !== 'string'
      || !Number.isFinite(Date.parse(item.publishedAt)) || Date.parse(item.publishedAt) > now) throw new Error('Invalid notice');
    ids.add(item.id);
    return { id: item.id, title: item.title, body: item.body, category: item.category, publishedAt: item.publishedAt };
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
}
