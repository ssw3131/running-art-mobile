# RunPen 브랜치와 자동 검증 운영

작업은 `feat/*`, `fix/*`, `chore/*`에서 진행하고 PR 검사를 통과한 뒤 `main`에 squash merge한다. 계속 유지하는 브랜치는 main 하나다. UI·API·검사는 기능별로 함께 변경한다. APK 설치와 서버 배포는 별도 작업이다.

2026-10-13 도입 진행 중이다. 로컬 빠른 검사와 HTTP Fuzz는 통과했고, Android 반복 검사·Linux CI·브랜치 보호의 실제 적용 결과는 [실행 기록](../history/executed-plans/2026-10-12-2354-verification-ci.md)에 이어 기록한다. 핵심 흐름 10회 연속 통과 전에는 Android를 필수 검사로 승격하지 않는다.

## 실행 조건

| 행동 | 검사 |
|---|---|
| 파일 저장·로컬 커밋 | 원격 실행 없음. 개발자가 로컬 검사 |
| PR 없는 작업 브랜치 push | 원격 실행 없음 |
| main 대상 PR 생성·재개·추가 push | 빠른 검사·API·API 36 핵심 흐름 |
| main push | 전체 회귀·API 36·API 29 호환 smoke |
| workflow_dispatch | all·fast·api·android 선택, 반복 1회 또는 10회 |
| 문서만 변경 | 변경 문서 링크·구조 검사 |

공통 내비게이션·인증·저장·의존성과 미분류 변경은 모두 전체 검사다. 검사 범위를 좁힐 때는 누락을 방지하는 근거가 필요하다. 이전 실행은 같은 PR의 새 실행이 시작되면 취소한다. 자동 배포·예약 실행·유료 러너는 구성하지 않는다. 확인된 저장소는 public이며 표준 GitHub 호스팅 러너만 사용한다. 보고서 보관은 7일이다.

## 로컬 명령

Node 24.21.0, npm 11.19.0, JDK 17을 사용한다. Windows는 먼저 `. .\scripts\env.ps1`을 실행한다. 새 checkout에서 `npm ci`로 의존성을 설치하며 개인 `.cache`의 기존 패키지를 요구하지 않는다.

```sh
npm run qa:fast
npm run test:components
npm run test:properties
npm run test:api-contract
```

`qa:fast`는 타입·린트, 서버 타입·린트, 기존 Node 검사, UI 상태, OpenAPI 최신 여부, PGlite 정책 검사를 순서대로 실행한다. 독립 검사는 실패 후에도 실행해 모든 실패를 남긴다. 결과는 `test-results/fast/report.json`, `report.md`, 시나리오별 로그다. 재시도하지 않는다.

fast-check 기본 seed는 `20261013`이다. 실패 출력의 seed와 path를 `FC_SEED`, `FC_PATH`로 지정하면 축소된 실패 순서를 재현한다. 충돌 선택은 사용자 동작으로 모델링하며, 응답 유실 뒤 수정한 기록을 자동으로 덮어쓰는 것을 성공으로 간주하지 않는다.

Python 격리 환경에 `scripts/qa/requirements.txt`를 설치하고 `python scripts/qa/fuzz.py`를 실행한다. Schemathesis 4.31.0이 실제 `/healthz`, `/v1/routes` HTTP 처리기를 검사한다. 계산 결과는 공개 격자에서 실제 엔진으로 생성하며, 호스팅 서버를 호출하지 않는다. OpenAPI의 사용자 도형 폐곡선·둘레 조건은 의미 검증으로 남고 400 응답을 허용한다.

## 실제 DB 통합

Docker와 Supabase CLI 2.120.0이 필요하다. 전용 `runpen-ci` 로컬 스택에 네 마이그레이션을 적용하고 pgTAP, 기존 SQL 정책 검사, 실제 Auth·Storage·RPC와 두 빈 SQLite의 전체 내용 왕복을 검사한다. 서비스 키는 로컬 상태 파일에서만 읽고 아티팩트에 올리지 않는다. URL은 loopback만 허용한다.

```sh
supabase start
supabase status -o json > .cache/qa-supabase-status.json
supabase test db supabase/tests/database
python scripts/qa/postgres.py
npm run qa:integration
supabase stop --no-backup
```

실행 뒤 상태 파일을 삭제한다. `--linked`나 운영 DB 주소는 사용하지 않는다. 실제 소셜 공급자 인증·야외 GPS·배터리·TalkBack 발화는 실기기 검사로 유지한다.

## Android 동작과 화면

`python scripts/qa/install-maestro.py`는 Maestro 2.11.0 배포본의 SHA-256을 확인하고 저장소 안 `.tools`에 설치한다. Java·전역 PATH를 바꾸지 않는다. Android SDK 36·build-tools 36.0.0에서 공개 소스의 UI 덤프 도우미를 빌드한다.

```sh
python scripts/qa/android.py --serial emulator-5554 --apk android/app/build/outputs/apk/release/app-release.apk --repeat 10
```

전용 `RunPen_CI` 또는 `RunningArt_UI_QA` 에뮬레이터만 받으며 물리 폰은 거부한다. 전용 에뮬레이터의 앱 데이터를 매 회 초기화한다. 공개 fixture 생성부터 탭·입력 보존·OAuth 취소·저장/재실행·출발 준비·주입 GPS·중단 복원·GPX 취소·큰 글씨/키보드까지 검사하고, 실패해도 시험 자료와 도우미를 정리한다. 테스트 상태를 주입하는 제품 코드나 별도 앱 ID를 추가하지 않는다. CI APK는 개발 머신의 서명·환경값을 사용하지 않으므로 사용자 폰 설치용으로 배포하지 않는다.

시나리오 재실행은 이전 실패를 지우지 않는다. `--output`을 바꾸어 새 진단 실행을 보존한다. UI 계층이 준비될 때까지 기다리는 동작과 시나리오 전체 재시도를 구분한다.

`scripts/qa/visual.mjs baseline.json actual.json output-dir`는 환경이 같은 검토된 기준만 비교한다. pixelmatch 색상 임계값은 0.1이고 안티앨리어싱은 제외한다. 이 값은 화면의 10% 변경 허용 비율이 아니다. 시스템 시계의 작은 영역만 명시적으로 가리고, 화면 내부 버튼·경로·텍스트는 가리지 않는다. 지도 배경은 별도 기준을 준비할 때까지 동작 검사와 분리한다.

기준이 없거나 환경이 다르면 `not_run`으로 기록하고 실패 종료한다. 기준 자동 갱신 명령은 없다. S0 기존 화면은 현재 동작의 회귀 기준이며 전체 Figma 이관 완료가 아니다. 새 기준 이미지는 Figma·기존 승인 화면과 대조해 PR에 등록한다.

## 결과와 승격

결과는 passed·failed·environment_failure·not_run으로 구분한다. 소스·APK·fixture 해시, OS/API/화면 크기·배율, 실패 단계, PNG/XML/JUnit/로그를 남긴다. 개인 계정·실제 GPS 원본·서비스 키는 업로드하지 않는다.

필수 CI 게이트로 승격하려면 동일 조건에서 핵심 시나리오가 재시도 없이 10회 연속 통과해야 한다. 환경 장애나 실패 후 성공은 이 이력을 대체하지 못한다. 브랜치 보호는 PR·필수 검사·관리자 적용을 함께 설정하고 직접 push·강제 push·삭제를 제한한다. 1인 개발이므로 타인 리뷰 승인을 강제해 작업을 막지 않는다.

S1부터 정상·빈 상태·로딩·오류, 계약, 저장 내용, 실패 후 재진입, 스크린샷을 기능 PR에 추가한다. S5 공유 웹은 Playwright를 추가할 단계다.

## 참고

[GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow), [워크플로 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Expo UI 검사](https://docs.expo.dev/develop/unit-testing/), [Supabase 로컬 검사](https://supabase.com/docs/guides/local-development/testing/overview), [Schemathesis CLI](https://schemathesis.readthedocs.io/en/stable/reference/cli/).
