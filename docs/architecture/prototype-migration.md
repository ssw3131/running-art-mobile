# 프로토타입 이식 기준

기능·이식 방향은 이 문서에 보존합니다. 원본 코드 전체는 모바일 폴더에 복제하지 않았으므로 실제 이식 시 확보해야 합니다. 현재 앱의 설치·빌드는 형제 폴더에 의존하지 않습니다.

## 역할과 원본 위치

경로는 모바일 루트 기준이며 다른 환경에서는 해당 원본을 따로 확보합니다.

| 기준 | 원본 | 사용 방법 |
| --- | --- | --- |
| 기능·흐름 | `../running-art2-google-/FEATURES.md`, `IA.md`, `src/App.tsx` | AI Studio 웹 프로토타입의 도형·코스·러닝·기록 흐름을 재구현 |
| 알고리즘 | `../running-art/route-engine.js` | 현재 루트 **v0.3** 사용 |
| 실행 연결 | `../running-art/route-worker.js` | 그래프·탐색·진행률 참고. Worker 자체를 RN에 복사하지 않음 |
| 도형·점수 | `../running-art/pixel-shapes.js`, `V0.3.md` | 도형 처리와 v0.3 정의 확인 |
| 회귀 검증 | `../running-art/tests/route-engine.test.js`, `tests/v03.test.js` | 계산 검증 선별 이식. 웹·서버·보관본 검사는 구분 |
| 이전 내보내기 | `../running-art/exports/running-art-algorithm/` | **v0.2**이므로 v0.3 대신 사용하지 않음 |

## 기능별 이전

| 웹 요소 | 모바일 적용 |
| --- | --- |
| DOM·CSS·모달 | React Native 화면·컴포넌트 |
| Leaflet·폴리라인 | MapLibre React Native + MapTiler |
| Canvas 직접 그리기 | 모바일 입력을 도형 좌표로 정규화 |
| Overpass 실시간 요청 | 정적 OSM 지역 파일·캐시 |
| `watchPosition` | Expo Location·TaskManager·Android 권한 |
| localStorage·보관 서버 | SQLite 내부 저장 |
| 시뮬레이션 | 실제 GPS 기록과 구분 |
| 웹 다운로드 | 모바일 GPX 파일·공유 |
| Gemini·Express API | 현재 이식 범위 제외 |

프로토타입 명세의 정확도 %, 도로 안전 보장, 외부 앱 즉시 연동 표현을 검증된 제품 사실로 취급하지 않습니다. v0.3 점수는 후보 비교용이며 통계적 정확도가 아닙니다. 범위는 [최종 결정](../product/overview.md)을 따릅니다.

## v0.3 보존 기준

- OSM 노드 연결·보행 태그, A* 연결, 회전·크기·위치 탐색, 접근·복귀, 닫힌 코스 검증을 확인합니다.
- 점수 가중치는 Hausdorff 0.45, Fréchet 0.15, 꺾임 0.10, Section-8 방향 0.20, 거리 0.10, 반복 비율 감점 0.20을 회귀 기준으로 사용합니다.
- 목표 거리 ±25%, 반복 도로 30% 이하, 후보 간 도로 중복 80% 미만은 원본 조건입니다. 모바일 제품 약속·사용자 설정으로 자동 확정하지 않습니다.
- 첫 이식은 계산 의미를 보존합니다. 이후 고도화는 기준 변경과 비교 결과를 별도로 기록합니다.

## 출처 확인값

2026-09-25 SHA-256입니다. 원본 변경 시 차이를 검토하고 이식 기준을 기록합니다. 해시는 소스를 대신하지 않습니다.

| 원본 | SHA-256 |
| --- | --- |
| Codex `route-engine.js` | `3c2f9abcfb1390885f8b7f8c88bb60f5aa18931b6089c734a5d4e6b6fb622834` |
| Codex `pixel-shapes.js` | `809e618a5e6034b982465eca3780cd638a3fe315e8dae9e2ead9867d73184adb` |
| Codex `V0.3.md` | `47c227ea4e0841d11602ef2af556909edc772b2381de208c75cc2caf7a24a167` |
| AI Studio `FEATURES.md` | `ada96b6d17bda013b95b1dbd85d4150fb31bda288363adc97f19e32bf8dc2abe` |
| AI Studio `IA.md` | `6dca59b767e4f539ed99083ec1d2ebafb80175334bfb88381da7fea482d66bad` |
