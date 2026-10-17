# RunPen 브랜치와 자동 검증 운영

작업은 `feat/*`, `fix/*`, `chore/*`에서 진행하고 PR 검사를 통과한 뒤 `main`에 squash merge한다. 계속 유지하는 브랜치는 main 하나다. UI·API·검사는 기능별로 함께 변경한다. APK 설치와 서버 배포는 별도 작업이다.

2026-10-13 Windows/API 36의 동일 S0 APK에서 핵심 흐름 10회 연속 통과와 독립 Linux 전체 검사·4화면 차이 0을 확인한 뒤 필수 게이트로 승격했다. main 보호와 squash merge 정책을 실제 적용했다. [도입 결과](../quality/verification-ci-20261013.md)에서 실행별 범위와 근거를 확인한다.

## 작업 순서

깨끗한 작업 폴더에서 최신 main을 가져와 기능별 브랜치를 만든다. 이미 수정 중이면 먼저 작업 브랜치를 만들고 변경을 보존한다.

```sh
git switch main
git pull --ff-only
git switch -c feat/signup-home
```

기능·검사·문서를 함께 수정하고 로컬 검사를 마친 뒤 한글 제목으로 커밋한다. 브랜치를 push하고 main 대상 PR을 연다. 기존 PR이 있으면 같은 브랜치에 후속 커밋을 push한다.

```sh
npm run qa:fast
git add <검토한-파일>
git commit -m "feat: 가입 동의와 홈 상태 연결"
git push -u origin feat/signup-home
```

`verification-gate` 통과와 변경 검토 후 squash merge한다. main이 먼저 바뀌면 작업 브랜치에 최신 main을 반영해 다시 검사한다. 병합된 원격 브랜치는 자동 삭제하고 로컬도 main을 갱신한 뒤 정리한다. 실패 시 Actions 아티팩트의 `report.json`과 `index.html`에서 실패 단계·스크린샷·로그를 확인한다. 기준 이미지 갱신으로 실패를 숨기지 않고 변경 의도와 실제 결함을 구분한다.

## 실행 조건

| 행동 | 검사 |
|---|---|
| 파일 저장·로컬 커밋 | 원격 실행 없음. 개발자가 로컬 검사 |
| PR 없는 작업 브랜치 push | 원격 실행 없음 |
| main 대상 PR 생성·재개·추가 push | 빠른 검사·API·API 36 핵심 흐름. QA 도구·워크플로·빌드 설정/의존성 변경이면 API 29도 추가 |
| main push | 전체 회귀·API 36·API 29 호환 smoke |
| workflow_dispatch | all·fast·api·android 선택, 반복 1회 또는 10회 |
| 문서만 변경 | 변경 문서 링크·구조 검사 |

공통 내비게이션·인증·저장·의존성과 미분류 변경은 모두 전체 검사다. 검사 범위를 좁힐 때는 누락을 방지하는 근거가 필요하다. 이전 실행은 같은 PR의 새 실행이 시작되면 취소한다. 자동 배포·예약 실행·유료 러너는 구성하지 않는다. 확인된 저장소는 public이며 표준 GitHub 호스팅 러너만 사용한다. 보고서 보관은 7일이다.

수동 `all`은 빠른 검사·API·Android 묶음 전체를 뜻하며 Android는 API 36을 사용한다. API 29는 main과 QA/빌드 관련 PR에서 자동으로 추가한다. main 후속 검사에 실패하면 실패 증거와 영향 범위를 확인하고 수정 PR에서 재검증한다. 기준 이미지를 자동 교체하거나 필수 게이트를 해제해 통과시키지 않는다.

## 로컬 명령

Node 24.21.0, npm 11.19.0, JDK 17을 사용한다. Windows는 먼저 `. .\scripts\env.ps1`을 실행한다. 새 checkout에서 `npm ci`로 의존성을 설치하며 개인 `.cache`의 기존 패키지를 요구하지 않는다.

```sh
npm run qa:fast
npm run test:components
npm run test:properties
npm run test:api-contract
```

`qa:fast`는 타입·린트, 서버 타입·린트, 기존 Node 검사, UI 상태, OpenAPI 최신 여부, PGlite 정책 검사를 순서대로 실행한다. 독립 검사는 실패 후에도 실행해 모든 실패를 남긴다. 결과는 `test-results/fast/report.json`, `report.md`, 시나리오별 로그다. 실제 DB 통합 결과는 `test-results/integration/`에 저장한다. 재시도하지 않는다.

fast-check 기본 seed는 `20261013`이다. 실패 출력의 seed와 path를 `FC_SEED`, `FC_PATH`로 지정하면 축소된 실패 순서를 재현한다. 충돌 선택은 사용자 동작으로 모델링하며, 응답 유실 뒤 수정한 기록을 자동으로 덮어쓰는 것을 성공으로 간주하지 않는다.

Python 격리 환경에 `scripts/qa/requirements.txt`를 설치하고 `python scripts/qa/fuzz.py`를 실행한다. Schemathesis 4.31.0이 실제 `/health`, `/v1/routes` HTTP 처리기를 검사한다. 계산 결과는 공개 격자에서 실제 엔진으로 생성하며, 호스팅 서버를 호출하지 않는다. OpenAPI의 사용자 도형 폐곡선·둘레 조건은 의미 검증으로 남고 400 응답을 허용한다.

## 실제 DB 통합

Docker와 Supabase CLI 2.120.0이 필요하다. 전용 `runpen-ci` 로컬 스택에 저장소의 전체 마이그레이션을 적용하고 pgTAP, SQL 정책 검사, 실제 Auth·Storage·RPC와 두 빈 SQLite의 전체 내용 왕복을 검사한다. S1 회원/동의의 기존 계정 이관·동시 제출·본인 접근·탈퇴 검사도 포함한다. 서비스 키는 로컬 상태 파일에서만 읽고 아티팩트에 올리지 않는다. URL은 loopback만 허용한다.

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

API 36은 위 전체 흐름과 4개 정적 화면 비교를 실행한다. API 29의 `--smoke`는 5탭/메뉴, S1 홈 3상태, 상세/뒤로/입력 보존, OAuth 취소 복귀, S1 가입 진입/게스트 복귀/큰 글씨, S5/S6 실제 PNG·저장/공유·지원·테마의 6단계와 원본 보존·정리·화면 캡처를 실행한다. 네이티브 이미지 기능의 이전 Android 호환도 확인하기 위해 S5/S6를 포함한다. API 29의 전체 GPS 회귀나 정적 픽셀 기준 통과로 해석하지 않는다.

Android 10의 시스템 SQLite에는 `-json`이 없어 전용 에뮬레이터에서 [온라인 백업](https://www.sqlite.org/backup.html)으로 WAL까지 일관된 사본을 만든 뒤 호스트 Python으로 조회한다. 문자열/줄바꿈·숫자·NULL 타입을 보존하고 성공/실패 모두 임시 사본을 삭제한다. 제품 앱 DB 구현을 바꾸는 기능이 아니다.

API 36은 Pixel 5의 프레임워크/SystemUI 오버레이를 명시하고, 시스템 UI 프로세스를 갱신한 뒤 실제 시스템 바와 cutout 여백이 정해진 값이 될 때까지 기다린다. Linux 1080×2340 기준은 상단 136px·하단 63px다. Maestro와 배율 검사 뒤에도 다시 적용한다. 촬영 중 여백이 바뀌면 실패하며 원래 오버레이는 정리 단계에서 복원한다. `display-profile.txt`, `display-overlays.txt`, 화면별 display 진단과 `displayGeometry`를 보존한다. 앱 전체를 이동시키는 환경 차이를 이미지 마스크로 숨기지 않는다.

시나리오 재실행은 이전 실패를 지우지 않는다. `--output`을 바꾸어 새 진단 실행을 보존한다. UI 계층이 준비될 때까지 기다리는 동작과 시나리오 전체 재시도를 구분한다.

10-13 S1 검사에서 API 29의 UI 덤프가 JUnit 성공을 출력한 뒤 비정상 shell 종료 코드를 반환하는 문제가 반복되어 캡처 완료 증명을 추가했다. 각 요청은 새 UUID 토큰을 보내고, Java 도우미는 이전 XML/토큰을 지운 뒤 새 XML이 생성된 경우에만 토큰을 기록한다. 호스트는 JUnit 성공·동일 토큰·실제 XML/PNG 읽기를 모두 확인한다. 이 조건을 충족한 비정상 shell 종료는 `ui-dump-transport.jsonl`과 보고서의 `uiDumpTransportWarnings`에 보존한다. 미완료 실행·이전 토큰·오프라인·실패한 읽기는 계속 실패하며 시나리오를 자동 재시도하지 않는다.

10-14 S234에서 같은 유형의 활성 루트 미준비 캡처 실패가 Windows와 Linux에 남아, Java 도우미의 한 접근성 연결에서 최대 5초·250ms 간격으로 새 XML을 기다린다. 과거/빈 파일 제거와 호출별 UUID 영수증·JUnit 성공·XML/PNG 실제 읽기 조건은 유지한다. `ui-dump-readiness.jsonl`/`uiDumpReadinessWaits`는 준비 대기를, 기존 `uiDumpTransportWarnings`는 완료 후 비정상 shell 종료를 별도로 기록한다. 전체 시나리오 재시도와 혼동하지 않는다. 한계를 넘으면 계속 실패하며, 계층 덤프가 실패해도 독립 PNG·window/activity·logcat을 정리 전에 수집한다. 제품 결함이나 빈 화면을 환경 실패로 자동 분류하지 않는다. 앱 초기화 후 시드를 넣기 전에는 실제 DB 파일과 필요한 9개 테이블을 최대 30초 읽기 전용으로 확인한다. 도우미가 테이블을 대신 만들지 않으며 부분 스키마·오프라인은 준비 완료로 인정하지 않는다.

`--signup-only`는 가입 진입/복귀·큰 글씨 진단 한 단계와 자료 보존·정리를 실행하고 보고서 모드도 별도로 표기한다. 전체/호환 검사 통과를 대신하지 않으며 PR CI의 기존 전체·smoke 선택은 유지한다. Windows의 임시 드라이브가 부족하면 해당 명령에서만 `TEMP`/`TMP`와 Java `java.io.tmpdir`를 작업 폴더의 임시 경로로 지정한다.

`scripts/qa/visual.mjs baseline.json actual.json output-dir`는 환경이 같은 검토된 기준만 비교한다. pixelmatch 색상 임계값은 0.1이고 안티앨리어싱은 제외한다. 이 값은 화면의 10% 변경 허용 비율이 아니다. 촬영 중에만 Android 공식 상태 표시줄 데모 모드로 시계 12:00·배터리 100·신호 세기를 고정하고 촬영 뒤 해제한다. 마스크는 근거를 기록한 작은 시스템 시계/Wi-Fi 영역만 허용한다. 현재 기준에는 main 실행에서 네 화면 모두 같은 가장자리 차이가 난 Wi-Fi 아이콘의 41×33px(`x=817,y=53`)만 제외했고 원본 PNG는 유지했다. 마스크의 위치/최대 크기를 검사하며 앱 영역·상태 표시줄 전체 가림은 거부한다. 화면 내부 버튼·경로·텍스트는 가리지 않는다. 지도 배경은 별도 기준을 준비할 때까지 동작 검사와 분리한다.

`node scripts/qa/visual-suite.mjs test-results/android-36 tests/visual/android-linux-api36/baseline.json`으로 각 회차를 비교하고, `node scripts/qa/gallery.mjs test-results/android-36`으로 기준·현재·차이와 실패 화면을 연결한 `index.html`을 만든다. `--visual-only`는 후보 촬영 전용이며 기능/안정성 통과 횟수에 포함하지 않는다.

기준이 없거나 환경이 다르면 `not_run`으로 기록하고 실패 종료한다. 기준 자동 갱신 명령은 없다. S0 기존 화면은 현재 동작의 회귀 기준이며 전체 Figma 이관 완료가 아니다. 새 기준 이미지는 Figma·기존 승인 화면과 대조해 PR에 등록한다.

## 결과와 승격

결과는 passed·failed·environment_failure·not_run으로 구분한다. 소스·APK·fixture 해시, OS/API/화면 크기·배율, 실패 단계, PNG/XML/JUnit/로그를 남긴다. 개인 계정·실제 GPS 원본·서비스 키는 업로드하지 않는다.

PR/main의 집계 이름은 `verification-gate`다. 일부 묶음만 선택한 수동 실행은 `manual-verification`으로 따로 집계하므로 PR 필수 검사 성공을 대신하지 못한다.

필수 CI 게이트로 승격하려면 동일 조건에서 핵심 시나리오가 재시도 없이 10회 연속 통과해야 한다. 환경 장애나 실패 후 성공은 이 이력을 대체하지 못한다. 브랜치 보호는 PR·필수 검사·관리자 적용을 함께 설정하고 직접 push·강제 push·삭제를 제한한다. 1인 개발이므로 타인 리뷰 승인을 강제해 작업을 막지 않는다.

S1부터 정상·빈 상태·로딩·오류, 계약, 저장 내용, 실패 후 재진입, 스크린샷을 기능 PR에 추가한다. S5 공유 웹은 Playwright를 추가할 단계다.

## 참고

[GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow), [워크플로 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Expo UI 검사](https://docs.expo.dev/develop/unit-testing/), [Supabase 로컬 검사](https://supabase.com/docs/guides/local-development/testing/overview), [Schemathesis CLI](https://schemathesis.readthedocs.io/en/stable/reference/cli/), [Android 상태 표시줄 고정](https://android.googlesource.com/platform/frameworks/base/+/android16-qpr2-release/packages/SystemUI/docs/demo_mode.md).
