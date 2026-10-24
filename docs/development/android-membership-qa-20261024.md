# 실제 격리 회원 상태를 사용하는 Android QA — 소스 준비 / 미실행

2026-10-24 작성. 기존 `runpen-ci.invalid` 모의 로그인 fixture를 실제 격리 Supabase Auth/회원 RPC로 교체하는 **실행 가능한 소스**를 준비했다. 서버 호출·계정 생성·SQL·인증·테스트·빌드·CI를 이번에 실행하지 않았다. 아래 명령은 사용자 검증 지시 이후 실행할 절차다.

## 구성과 경계

| 구간 | 주소/입력 | 역할 |
| --- | --- | --- |
| 호스트 Supabase CLI | `http://127.0.0.1:54321` 또는 `http://localhost:54321` | 기존 `supabase/config.toml`의 `runpen-ci`, 전체 migrations. 기존 integration harness와 같은 실제 Auth/RLS/RPC |
| 비공개 status 파일 | `.cache/qa-supabase-status.json` 또는 `QA_SUPABASE_STATUS` 절대경로 | 로컬 `ANON_KEY`·`SERVICE_ROLE_KEY`. 저장소/결과 artifact에 포함 금지 |
| 호스트 HTTPS adapter | `127.0.0.1:54431` | localhost 인증서로 실제 upstream에 중계. 회원 성공을 생성하지 않음 |
| Android APK API 주소 | `EXPO_PUBLIC_SUPABASE_URL=https://localhost:54431` | `adb reverse tcp:54431 tcp:54431`로 같은 호스트에 연결 |
| APK 공개키 | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_isolated_ci` | localhost adapter가 실제 로컬 ANON_KEY로 변환. service role은 전달하지 않음 |
| QA TLS | `.cache/qa-membership/tls/` | 임시 CA/서버 인증서, native QA APK의 localhost 도메인만 신뢰. 앱 HTTPS 검증을 끄지 않음 |

`isolated-supabase.mjs`는 loopback HTTP/54321 외의 API 주소를 거부한다. `tests/integration/membership.test.mjs`와 새 Android fixture가 같은 환경 검증·client 생성을 공유한다. Android 도우미도 전용 에뮬레이터·앱 ID·합성 이메일·관리자 표시 run ID·loopback JWT issuer를 확인하고 기존 세션 덮어쓰기를 거부한다. 과거 운영용 `DisposableAuth.java`의 하드코딩된 운영 프로젝트는 사용하지 않는다.

## 시나리오 분리

- `prepare-membership-fixture.mjs prepare`: 새 무작위 run ID와 시험 정책을 만들고 service 계정을 생성한다. 정상 profile API와 `accept_membership`에 시험 계정의 명시적 두 동의를 전달한 뒤 실제 완료 영수증을 확인한다. 이것은 홈/서비스 **준비 fixture**이며 가입 화면 통과 근거가 아니다. 기존 활성 정책이 있으면 거부하며 비활성화하거나 덮어쓰지 않는다.
- `new-signup`: 매 반복마다 새 pending 계정을 생성한다. 동의 RPC를 호출하지 않는다.
- `signup_membership.py`: pending 세션을 주입한 뒤 private 딥링크 차단, 무동의/1개동의의 완료 비활성, 약관 열람이 동의가 아님, 화면에서 두 체크/완료 터치, 호스트에서 실제 영수증 확인, 앱 재시작 후 홈을 검사한다.
- `--signup-only`: 게스트 진입/큰 글씨와 위 실제 가입 절차 후 해당 반복을 종료한다. service 계정으로 바꾸거나 홈/기록/정적 화면 검사까지 실행한 것으로 보고하지 않는다.
- 전체/default 및 `--smoke`: 가입 시나리오 뒤 앱을 정리하고 **별도 service 계정**으로 바꾼 다음 기존 홈/코스/러닝 검사를 수행한다. `q.OWNER`는 실제 Auth UUID로 갱신한다. visual capture에도 실제 service 세션을 새로 공급한다.
- `--home-only`, `--home-states-only` 등 기존 개별 서비스 진단: 가입 UI 단계를 생략하고 실제 완료 service fixture를 사용한다. 서비스 준비를 가입 통과로 기록하지 않는다.
- `session service/signup`는 매 주입마다 정상 로그인을 수행하고 회원 상태를 조회한 후 짧은 실제 세션을 파일로 전달한다. `assert-complete signup`는 앱에서 쓴 영수증을 조회한다. 검증용 별도 세션은 local signOut만 하므로 앱 세션을 전역 폐기하지 않는다.

## 선행 조건

다른 통합검사와 동시에 같은 Supabase stack을 사용하지 않는다. Docker·Supabase CLI 2.120.0·Node24·Python3·OpenSSL·JDK17·SDK36/전용 AVD(RunPen_CI 또는 RunningArt_UI_QA)가 필요하다. `.github/workflows/verify.yml`의 Android job은 별도 runner에서 같은 준비/실행/정리 소스를 호출하도록 수정했다. **workflow 파일만 수정했으며 CI 실행/푸시는 없다.**

생성 native 폴더의 QA 신뢰 설정은 `android-membership-tls.py restore`로 원상복구한다. 이 APK는 localhost QA 전용이며 휴대폰/운영 설치본으로 사용하지 않는다. 기본 앱 소스/Expo 설정에는 QA 인증 우회·가짜 완료·테스트 서버 분기가 없다.

## 나중에 실행할 Windows 준비 명령

별도 QA checkout에서 시작한다. 환경 파일/상태 파일을 출력하거나 원래 앱의 환경값을 덮지 않는다. 아래 환경값은 현재 PowerShell 프로세스 범위다.

```powershell
. .\scripts\env.ps1
New-Item -ItemType Directory -Force .cache | Out-Null
supabase start -x studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor
supabase status -o json | Set-Content -Encoding utf8 .cache/qa-supabase-status.json
$env:QA_SUPABASE_STATUS = (Resolve-Path .cache/qa-supabase-status.json).Path
$env:EXPO_PUBLIC_SUPABASE_URL = 'https://localhost:54431'
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_isolated_ci'
$env:EXPO_PUBLIC_PROFILE_PHOTOS_ENABLED = 'false'
npm run prebuild:android
python scripts/qa/android-membership-tls.py prepare
Push-Location android
try { .\gradlew.bat assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=2 } finally { Pop-Location }
python scripts/qa/check-apk.py android/app/build/outputs/apk/release/app-release.apk
```

기본 CI와 같이 사진 업로드는 이 회원/홈 fixture에서 끄고 profile update API를 사용한다. 프리셋/사진 실제 업로드는 별도 후속 사진 검증에서 켜며, 현재 React Native 컴포넌트 검사 소스와 체크리스트를 유지한다. 에뮬레이터는 위 허용 AVD로 먼저 실행하고 serial을 확인한다.

```powershell
# 가입만 / 홈만 / 전체 중 필요한 하나를 실행한다.
python scripts/qa/run-membership-android.py --serial emulator-5554 --apk android/app/build/outputs/apk/release/app-release.apk --signup-only --output test-results/signup
python scripts/qa/run-membership-android.py --serial emulator-5554 --apk android/app/build/outputs/apk/release/app-release.apk --home-only --output test-results/home
python scripts/qa/run-membership-android.py --serial emulator-5554 --apk android/app/build/outputs/apk/release/app-release.apk --output test-results/android
```

wrapper가 TLS adapter 시작/인증서 검사→실제 fixture 준비→기존 Android 호출→fixture 정리→adapter 종료를 수행한다. Android 쪽은 세션을 전달하기 전에 ADB reverse를 설정하고 finally에서 이를 제거한다. 가입 화면 검사는 OAuth 공급자 자체의 인증 UI 검증을 뜻하지 않는다.

## 정리와 실패 복구

wrapper의 finally는 자신이 기록한 합성 이메일과 관리자 run ID가 둘 다 일치하는 계정만 삭제한다. Auth cascade로 해당 회원/동의를 정리한 뒤 자신이 만든 정책 ID만 삭제한다. 생성 응답이 유실돼도 사전에 기록한 이메일로 해당 run의 계정을 찾는다. 원래 회원 테이블을 직접 완료시키거나 다른 정책을 변경하지 않는다. 성공 후 private-state.json을 제거하며 실패하면 재시도를 위해 남긴다. 자격증명은 stdout/보고서에 쓰지 않는다.

정리 결과는 `.cache/qa-membership/cleanup.json`, 화면/실행 근거는 `--output` 폴더다. `.cache`와 session 파일을 artifact로 업로드하지 않는다. 준비/실행 오류에도 아래 정리를 각각 수행한다. 실패한 명령이 있어도 나머지 정리를 건너뛰지 않는다.

```powershell
# 상태가 남았을 때만, 동일 loopback stack이 실행 중인 상태에서 재시도.
if (Test-Path .cache/qa-membership/private-state.json) {
  node scripts/qa/prepare-membership-fixture.mjs cleanup
}
python scripts/qa/android-membership-tls.py restore
# 중단 때문에 남은 경우 지정한 전용 emulator에서만 해제.
adb -s emulator-5554 reverse --remove tcp:54431
supabase stop --no-backup
Remove-Item -LiteralPath .cache/qa-supabase-status.json -ErrorAction SilentlyContinue
Remove-Item -LiteralPath .cache/qa-membership/tls/ca.key,.cache/qa-membership/tls/server.key -ErrorAction SilentlyContinue
```

강제 종료로 wrapper까지 사라진 경우 그 실행에서 시작한 localhost adapter PID만 확인해 종료한다. 모든 Node 프로세스를 일괄 종료하지 않는다. native manifest가 준비 이후 다른 작업으로 변경됐으면 restore는 덮어쓰지 않고 거절한다. `.cache/qa-membership/native-trust-backup.json`과 현재 manifest를 대조해 QA 속성/두 자산만 제거한다.

현재 상태는 **준비 소스 작성 완료 / 실행 결과 없음**이다. [가입 체크리스트](../quality/signup-membership-figma-checklist.md)에 따라 나중에 검증한다.
