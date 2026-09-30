# 프로토타입 이식 기준

기능·이식 방향은 이 문서에 보존합니다. v0.2 독립 알고리즘 묶음은 `tests/reference/v02/`에 원문과 해시를 보존했고, TypeScript 이식과 고정 표본 회귀를 구현했습니다. 프로토타입 전체를 복제하지는 않았습니다. 현재 앱의 설치·빌드·고정 표본 테스트는 형제 폴더에 의존하지 않습니다.

2026-09-30 사용자 결정: 두 프로토타입은 알고리즘·기능 참고로만 사용합니다. 기존 서버·DB·배포 설정·키를 모바일 운영에 공유하지 않습니다. 현재 모바일의 주변 도로 조회는 기존 테스트 사이트에 의존하므로 런타임의 완전 분리는 미완료이며 [독립 서버 전략](../planning/server-strategy.md)에 따라 교체합니다. 원본·표본·해시를 보존하는 것은 출처·회귀 검증 목적입니다.

2026-09-27 사용자 결정으로 알고리즘 기준을 **Codex v0.2**로 정정했습니다. 사용자 표현의 **v2.0 / V3.0**은 이 저장소의 **v0.2 / v0.3**에 대응합니다. 루트 v0.3은 테스트 버전이며 모바일 이식 대상에서 제외합니다.

## 역할과 원본 위치

경로는 모바일 루트 기준이며 다른 환경에서는 해당 원본을 따로 확보합니다.

| 기준 | 원본 | 사용 방법 |
| --- | --- | --- |
| 기능·흐름 | `../running-art2-google-/FEATURES.md`, `IA.md`, `src/App.tsx` | AI Studio 웹 프로토타입의 도형·코스·러닝·기록 흐름을 재구현 |
| 알고리즘 | `../running-art/exports/running-art-algorithm/src/route-engine.js` | **v0.2 이식 원본**, `options.version: '0.2'` 명시 |
| 실행 연결 | `../running-art/exports/running-art-algorithm/src/route-worker.js` | 그래프·탐색·진행률 참고. Worker 자체를 RN에 복사하지 않음 |
| 도형·점수 명세 | `../running-art/exports/running-art-algorithm/ALGORITHM.md`, 같은 묶음의 `src/route-engine.js` | v0.2 엔진에 포함된 도형·점수 사용 |
| 회귀 검증 | `../running-art/exports/running-art-algorithm/tests/route-engine.test.js`, 같은 묶음의 `tests/refinement.test.js`, `examples/grid.json` | 연결·점수·후보 보존·크기 탐색 검증. 합성 그래프는 실제 도시 성능과 구분 |
| 버전 보관본 | `../running-art/versions/v0.2/` | 엔진·Worker가 독립 묶음과 동일한지 대조하고 필요 시 당시 웹 동작 참고 |
| 테스트 버전 | `../running-art/` 루트의 v0.3 엔진·`pixel-shapes.js`·`V0.3.md`·`tests/v03.test.js` | 이식 원본·회귀 기준에서 제외 |

독립 묶음의 `package.json` 버전은 `0.2.0`입니다. 도형 정의는 v0.2 엔진 안에 있으므로 루트 v0.3의 `pixel-shapes.js`를 가져오지 않습니다. v0.3 엔진의 옵션만 `'0.2'`로 바꾸는 것으로 원본을 대체하지 않습니다.

## 기능별 이전

| 웹 요소 | 모바일 적용 |
| --- | --- |
| DOM·CSS·모달 | React Native 화면·컴포넌트 |
| Leaflet·폴리라인 | MapLibre React Native + MapTiler |
| Canvas 직접 그리기 | 모바일 입력을 도형 좌표로 정규화 |
| Overpass 실시간 요청 | 정적 OSM 지역 파일·캐시 |
| `watchPosition` | Expo Location·TaskManager·Android 권한 |
| localStorage·보관 서버 | SQLite 우선 저장과 신규 모바일 회원·기록 서버. 기존 보관 서버는 이식하지 않음 |
| 시뮬레이션 | 실제 GPS 기록과 구분 |
| 웹 다운로드 | 모바일 GPX 파일·공유 |
| Gemini·Express API | 현재 이식 범위 제외 |

프로토타입 명세의 정확도 %, 도로 안전 보장, 외부 앱 즉시 연동 표현을 검증된 제품 사실로 취급하지 않습니다. v0.2 점수는 후보 비교용이며 통계적 정확도가 아닙니다. 범위는 [최종 결정](../product/overview.md)을 따릅니다.

## v0.2 보존 기준

- OSM 노드 연결·보행 태그, A* 연결, 회전·크기·위치 탐색, 접근·복귀, 닫힌 코스 검증을 확인합니다.
- 점수 가중치는 윤곽(Hausdorff) 0.45, 진행 흐름(Fréchet) 0.25, 꺾임 0.20, 거리 적합 0.10, 반복 비율 감점 0.20입니다. `raw = 100 × clamp01(윤곽 × 0.45 + 흐름 × 0.25 + 꺾임 × 0.20 + 거리 × 0.10 - 반복 비율 × 0.20)`이며 반올림 전 점수와 후보 순위도 비교합니다. v0.3의 Section-8 방향 점수는 포함하지 않습니다.
- 목표 거리 ±25%, 반복 도로 30% 이하, 후보 간 도로 중복 80% 미만은 원본 조건입니다. 모바일 제품 약속·사용자 설정으로 자동 확정하지 않습니다.
- v0.1의 전체 유효 후보 풀을 유지한 채 크기·위치·회전을 추가 탐색합니다. 크기는 기준 둘레 대비 85~115%이며 최대 경로 평가 수는 기본 200개 + 추가 140개 + 미세 조정 80개입니다. 동일 입력에서 v0.2 최상위 평가 점수가 v0.1보다 낮아지지 않는지 확인합니다.
- 최대 5개 추천은 상한이며 후보 수를 보장하지 않습니다. 도로가 단절되면 가짜 직선으로 연결하지 않고, 유효한 코스가 없으면 후보 없음으로 처리합니다.
- 첫 이식은 계산 의미를 보존합니다. 이후 고도화는 기준 변경과 비교 결과를 별도로 기록합니다.

## 출처 확인값

2026-09-27 확인한 v0.2 출처입니다. 아래 경로는 `../running-art/exports/running-art-algorithm/` 기준이며, SHA-256은 **UTF-8 소스의 CRLF를 LF로 정규화한 값**입니다. 묶음의 `SHA256SUMS.txt` 9개 항목 모두 이 방식으로 일치했습니다. Windows 체크아웃의 줄바꿈 때문에 파일 바이트 해시는 다를 수 있으므로 줄바꿈 차이와 실제 코드 변경을 구분합니다. 원본 파일과 보존 매니페스트는 수정하지 않습니다.

| 원본 | SHA-256 |
| --- | --- |
| `src/route-engine.js` | `43a5a0f6bff98b6697d98ee10be85865a9328225b87345e613f8707864ab2fbf` |
| `src/route-worker.js` | `980359fa4a6112baba13b4d2289f7d4a907cdf33742e4d89f9034e932741b0fa` |
| `ALGORITHM.md` | `8acdc9d63ef1f38d81d3bef0e6cc598e72ea88b570987eb6fbcf575eed11c276` |
| `tests/route-engine.test.js` | `62c5b4bd9be7560724cfb2bc1b383be7e2cf615a46887de6e52a36ea34a140e2` |
| `tests/refinement.test.js` | `ee0e1917bdac5ad1c69b3f4a0d089c6aa041e4df5c7b58adc54e9878fe7db4c0` |
| `examples/grid.json` | `d0161d84a34dcc0f7afe822e0564bcc492a810acb4d5778b5d040111c5e4a251` |

엔진·Worker의 LF 해시는 `../running-art/versions/v0.2/manifest.json`과도 일치합니다. 현재 체크아웃에서는 보관본과 독립 묶음의 두 파일이 각각 바이트 단위로도 동일합니다. 실제 이식 시 파일·명세·테스트를 함께 확보하고 다시 대조합니다. 해시는 소스를 대신하지 않습니다.

AI Studio 기능 문서의 기존 확인값은 2026-09-25 파일 SHA-256이며 이번 결정으로 기능·흐름 기준을 바꾸지 않습니다.

| 원본 | SHA-256 |
| --- | --- |
| AI Studio `FEATURES.md` | `ada96b6d17bda013b95b1dbd85d4150fb31bda288363adc97f19e32bf8dc2abe` |
| AI Studio `IA.md` | `6dca59b767e4f539ed99083ec1d2ebafb80175334bfb88381da7fea482d66bad` |
