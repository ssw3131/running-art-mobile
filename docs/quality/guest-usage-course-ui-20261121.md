# 게스트·횟수 안내·추천 UI 검증

- 기준 main: `040427ec61b18314452fe915c49120bb1a278a84`
- 사용자 범위: 별도 PR 등록, main 미반영. 폰 설치·운영 서버 변경 없음.
- Figma 파일: `QYRGII8OdvQB1SrtH3BA08`. high fidelity 원문·스크린샷 확인: `253:7124`, `253:7200`, `542:2573`, `795:3195`, `795:3493`, `795:3658`, `599:2804`, `191:14560`, `35:4724`, `268:9518`.
- 원본 SVG5개와 크기/해시/출처는 `assets/usage/figma-20261121/manifest.json`. ArrowRight24px·생성wand22px·인증 브랜드/소셜 아이콘은 기존 원본 재사용. 지도/잔량/코스는 정적 화면 이미지로 대체하지 않음.

## 결정·보존 조건

신규 안내는 생성5회·저장10회. 저장10회 정책은 최신main에 이미 존재하므로 추가 SQL/운영 변경을 하지 않았다. 예시 사용량으로 덮지 않고 서버 계정별 총량을 표시한다. 유료 결제 대신 추가 안내와 구매 준비 중 알림을 적용한다. 기존 사용량/코스/러닝·동기화·원장·미확인 저장 복구·중복 저장 미차감은 유지한다.

## 검증과 제한

- 타입/린트 `npm run check`: 통과.
- 컴포넌트: 게스트 가입·인증 경계/회원 기록 보호, 생성 조건/잔량 로딩/소진, 저장 확인/취소/소진/중복/오프라인/계정 전환/서버 소진 경합, 정렬 후 동일 후보 상세/저장, 보관함 잔량 및 초과 사용량, 기존 관련 화면을 검증했다. 최종47묶음276개 통과.
- 관련 Node/SQLite/PostgreSQL12개 통과: `tests/archive-usage.test.mjs`, `tests/course-generation.test.mjs`, `tests/usage-db.test.mjs`, `tests/usage-generation-credit.test.mjs`. 첫 로컬 실행은 loopback listen 권한 부족으로 중단됐고 허용된 로컬 테스트 서버로 재실행해 통과했다.
- Android 번들 `npm run export:android`: 통과. APK 빌드/설치 성공과 구분한다.
- 원본 Figma 스크린샷과 실제 `AllowanceSheets`를 Noto/Roboto·원본SVG로 렌더링한 412×917/360×800 웹 미리보기를 직접 대조했다. 가입 카드/제목/원본 아이콘, 생성5/5·저장10/10 소진, 저장2→1 차감, 확인·취소와 작은 화면 잘림을 확인했다. 라벨 행간을 조정해101px 차감 카드를 맞췄다. 비공개 근거는 Git 제외 `build/guest-usage-ui-20261121/{guest-360,save-exhausted-360,save-confirmation-360}.png`에 보존한다. 구매 안내 문구·저장10회는 사용자 결정으로 디자인의 예시와 다르다.
- 전체 웹 앱은 기존 Expo SQLite wasm/worker 해결 오류로 실행되지 않았다. 저장/서버 없는 임시 독립 컴포넌트 진입점으로 위 안내창만 확인한 후 `index.js`, Metro 설정을 원복하고 임시 공개 HTML을 제거했다. 전체 Android 픽셀 비교·실기기·게스트 OAuth 왕복은 미검증이며 draft PR은 빠른 검사만 실행한다. 기존 Android 화면 기준 이미지를 임의 갱신하지 않았다.

PR의 ready 전환·main 병합은 사용자 지시에 따라 수행하지 않는다. 이전 로컬 설치 기록은 별도 보존한 원래 브랜치로 복원한다.
