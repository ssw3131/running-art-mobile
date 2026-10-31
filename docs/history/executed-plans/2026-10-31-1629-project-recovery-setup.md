# D: 복구 파일에서 Android 개발 환경 재구성

- 기록 생성: 2026-10-31T16:29:49+09:00 (Asia/Seoul)
- 실행 시작: 2026-10-31T16:29:49+09:00
- 상태: 부분 완료 — 전체 로컬 복구 중단, Cloud/실기 확인 후속
- 기록 유형: 실행 시작 시 계획 작성
- 요청·계획 출처: 사용자 요청 “D:\running-art 기존 파일에서 이정도 살려놨어 프로젝트 세팅 다시해보려고해”

## 실행 전 계획

복구된 `D:\running-art\running-art-mobile`은 덮어쓰지 않고 그대로 보존한다. 현재 폴더에 소스·Git 이력이 없으므로 GitHub `main` 최신본을 별도 경로에 복제하고 HEAD를 확인한다. 복구된 로컬 설정은 값이 출력되지 않도록 키 이름만 최신 `.env.example`과 대조한 뒤 새 checkout에 안전하게 보존·적용한다. 저장소의 Windows Android 안내에 따라 pinned Node/JDK/Android SDK/에뮬레이터와 잠금 파일 의존성을 설치하고, `prebuild`와 `check`를 실행한다. 새 기본 경로와 환경이 정상인지 확인하고 실패 지점·사용자 수동 단계(예: Android Studio 설치/GUI 설정)를 기록한다. 운영 배포·정책 게시·휴대폰 설치는 범위에서 제외한다.

## 실행 결과

진행 중.

## 검증

- 2026-10-31: `D:\running-art\running-art-mobile`에 82개 파일(약 1.98 MB)이 남아 있으나 `src`, `scripts`, `docs`, `android`, `.git`, `node_modules`, `.tools`, `.cache`가 없어 단독 checkout/개발 환경이 아님을 확인했다. `.env.local`의 값은 열람·출력하지 않았다.
- GitHub에서 `main`을 `D:\running-art\running-art-mobile-main`에 복제했다. 초기 HEAD는 `c04963e` (`docs: 누락 검증 기록 통합과 단일 작업 폴더 운영 기준 정리 (#31)`)다. 저장소 전체 소스와 설치 스크립트가 존재한다.
- PowerShell 기본 PATH에는 Node v24.22.1만 확인되고 npm·Java는 없다.

## 남은 작업과 종료

계속 진행 중: 복구된 환경 설정 대조·필요 파일 보존, 전용 경로 확정, Android 도구/의존성 설치, prebuild·검사, 기록 갱신.

## 2026-10-31T17:34:40.7698461+09:00 사용자 승인 계획 변경·재개

전체 로컬 Android 환경 복구는 중단한다. 사용자가 승인한 클라우드 중심 개발·기존 폴더 백업/정리 계획을 실행한다. Codex 클라우드는 고정 Node와 빠른 검사, GitHub Actions는 기존 자동 검사와 별도 수동 개발용/독립 실행용 ARM64·ARMv7 APK, PC는 Node/npm/ADB/Metro와 안전한 브랜치 동기화를 담당한다. 운영 API·데이터 형식·서버·Play 배포는 변경하지 않는다. 설정/서명은 CI 보호 환경과 별도 암호화 백업으로 관리하고 APK는 7일 산출물 및 커밋/해시/서명/설치 안내를 제공한다. 다른 PC에서는 개발 도구 없이 다운로드 가능해야 한다. 실제 기기와 새로운 클라우드 환경에서 실행한 결과만 통과로 기록한다. 필수 PR/main 확인과 백업 검증·최소 환경 확인 후 정리한다. 불명 파일과 기존 전역 도구는 보존하고 비용 추가는 승인 없이 발생시키지 않는다.

실행 전 백업: C:\Users\ssw31\Documents\RunningArtBackups\20261031-172813 (C disk0 / D disk1). 6,727파일 약1.355GiB의 복사 SHA256 대조, Git bundle 검증/복원, 미커밋 diff 복원·원본 줄바꿈 파일 해시 대조 완료. 유지할 node_modules는 제외. 첫 binary diff 출력 인자 오류와 줄바꿈 차이는 수정·재검증했다. 삭제는 아직 하지 않았다.


### 최소 환경·구현 검증
- Node24.21.0/npm ci/ADB37.0.1 설치 성공. Java/전체 SDK 없이 동작하는 preview.ps1 및 Linux cloud.sh, 수동 Handset APK 워크플로 추가.
- qa:fast의 타입/린트·서버 타입·로직·컴포넌트·OpenAPI·계정/공유 정책 모두 통과. 설정 차단·Git 줄바꿈 정규화 지문 4개 추가 검사 통과. YAML 파싱 통과.
- 미커밋 수정이 있는 실제 기본 폴더의 Sync는 변경 없이 중단 확인. USB 기기는 아직 연결되지 않았다.
- npm audit은 기존 의존성 62건(낮음6/중간48/높음7/심각1)을 보고했다. 범위를 벗어난 일괄 자동 업그레이드는 하지 않았다.
- GitHub 공개 저장소, 필수 verification-gate 및 관리자 적용/strict 유지. 기존 산출물 94개 조회 응답 기준 약355MB. Billing API는 현재 인증 user scope 부족으로404여서 계정 총량·예산 확인은 미완료. 유료 한도나 예산은 변경하지 않았다.
- main 제한 handset-build 환경 생성. 기존 키는 발견되지 않아 새 RSA3072 PKCS12 테스트 키를 C: 접근 제한 백업에 생성했다. 암호는 DPAPI 보호 파일로 보존하며 다른 PC 복원을 위한 별도 비밀번호 관리자 보관은 사용자 후속이다. 서명키는 소스/Codex 클라우드에 넣지 않는다.
- 복구 .env.local의 공개 설정은 CI 검증을 통과했다. ROAD_BASE_URL은 현재 소스의 기본 공개 주소와 동일한 값으로 CI에 명시했다. 기존 로컬 .env.local 원본은 유지했다.


- 임시 Git 저장소로 Sync의 미커밋 차단·clean fast-forward·로컬 ahead 보존을 검증했다. 첫 시험의 PowerShell7→5 모듈 경로 상속 오류는 시험 환경을 분리해 재통과했다. 변경 후 타입/린트 재통과.
- 고정 키와 공개 앱 설정의 handset-build 등록 완료. 클라우드 환경은 현재 저장된 구성이 없어 실제 신규 작업 검증은 후속이다.

### PR #32 병합·첫 휴대폰 빌드 실패 후속
- PR #32 ac4c9b9의 전체 Verify 41186053089(타입/린트/로직/UI·격리 API·Android29/36·화면 비교·verification-gate) 통과 후 squash merge. main ad36ab2로 기본 폴더를 안전한 Sync 명령으로 전환, 추적 파일 차이 없음.
- development 41188727820에서 sdkmanager가 hosted runner의 PATH에 없어 exit127로 실패했다. preview 41188782463도 같은 단계에서 종료됐다. 설정 검증/신뢰 커밋 확인은 통과했고 APK 생성 단계는 실행되지 않았다. 실패 로그는 C: 백업에 보존했다.
- 독립 sdkmanager 호출을 제거하고 기존 Verify에서 두 Android 빌드가 성공한 Gradle의 SDK/NDK 준비 경로를 그대로 사용한다. 생성된 네이티브 프로젝트의 버전 설정을 따른다. 필수 검사를 생략하지 않는다.

- 최초 main ad36ab2의 Android29는 에뮬레이터 연결 소실 뒤 adb install 180초 시간 초과로 종료했다. 보고서 생성 전 실패이며 원본 job 로그를 C:에 보존했다.
- PR33의 새 서명 검증은 앱 빌드·인증서 일치까지 통과했으나 기존 instrumentation 도우미가 기본 QA 키로 서명되어 앱의 임의 새 키와 불일치했다. AUTH-guest-gate 통과 이후 SecurityException과 정리 통과를 기록했다.
- 검사 도우미와 대상의 기존 QA 인증서를 유지하도록 기본 debug.keystore를 임시 PKCS12로 변환해 공통 서명 경로를 검사한다. CI 전용 versionCode2 적용도 실제 APK에서 확인해 초기화 실행을 증명한다. 실제 휴대폰 고정 키는 계속 PR 검사에 제공하지 않는다.


## 클라우드 구성·백업 정리 결과 (2026-10-31)

- 구현 기준 main: `e8452b6201d8b6e76d675fa6608def974e0be456`. PR [#32](https://github.com/ssw3131/running-art-mobile/pull/32), [#33](https://github.com/ssw3131/running-art-mobile/pull/33)를 필수 검사 통과 후 squash 병합하고 기본 폴더를 동기화했다.
- PR #33 [전체 검사](https://github.com/ssw3131/running-art-mobile/actions/runs/41190879537), 구현 main [전체 검사](https://github.com/ssw3131/running-art-mobile/actions/runs/41193465208)의 빠른 검사·격리 API·Android 29/36·화면 비교·verification-gate가 모두 성공했다. 앞서 실패하거나 취소된 실행은 성공으로 바꾸지 않는다.
- `scripts/cloud.sh setup/fast`가 Linux CI에서 고정 Node24.21.0·잠금 파일 설치·빠른 검사를 통과했다. 저장된 Codex Cloud 환경은 조회 결과 없으므로 실제 신규 Cloud 작업 검증을 대신한 것으로 기록하지 않는다.
- PC의 최초 single-branch fetch 설정을 `+refs/heads/*:refs/remotes/origin/*`로 바꿨다. 작업 브랜치 미리보기를 지원하며 기존 원격 브랜치를 정리하지 않았다.
- `preview.ps1`, `scripts/preview-env.ps1`, `scripts/setup-preview.ps1`, 도구 고정 정보, 클라우드 설치 스크립트, 수동 APK 워크플로·설정/서명/포장 검사, 사용 안내를 구성했다. 기존 제품 소스·API·저장 형식·운영 서버/DB·Play 배포는 변경하지 않았다.

### 휴대폰 APK

두 빌드는 동일한 구현 main에서 생성했다. CI에서 실제 APK 서명·앱 ID·versionCode·ARM ABI를 검사하고, 내려받은 파일의 SHA-256·인증서 메타데이터·네이티브 지문·ZIP의 ARM 라이브러리를 PC에서 대조했다.

| 종류 | 실행 | versionCode | APK 바이트 | 확인 |
| --- | --- | --- | --- | --- |
| development | [성공한 빌드](https://github.com/ssw3131/running-art-mobile/actions/runs/41193485545) | 215606349 | 159263010 | Metro 연결용, JS 내장 없음 |
| preview | [성공한 빌드](https://github.com/ssw3131/running-art-mobile/actions/runs/41193532917) | 215607219 | 115385413 | JS 내장·non-debuggable 확인 |

- 공통 앱 ID는 `com.runningart.mobile.dev`, ARM64·ARMv7을 포함한다. 인증서는 C:에 보관한 새 고정 테스트 키와 일치한다. 네이티브 지문은 두 APK와 PC 모두 `76fbf4d970aa18ca42dee438ab18d55752d919bcb764d2500a7581bb8bae3063`이다.
- APK·메타데이터·설치 안내·해시를 C: 백업의 `apks/development`, `apks/preview`에도 보존했다. GitHub 산출물 보존 기간은 7일이며 로컬 백업은 자동 삭제하지 않는다.
- 이후 PC 시작 스크립트와 기록 보완은 앱에 포함되는 JS·네이티브·설정 변경이 아니다. APK의 실제 소스 커밋은 위 구현 main으로 표시한다.
- 두 종류는 같은 앱을 교체한다. 오래된 development APK는 최신 preview보다 versionCode가 낮으므로 복귀 시 새 development 빌드가 필요할 수 있다. 자료 삭제나 강제 다운그레이드를 자동으로 수행하지 않는다.
- 휴대폰이 연결되지 않아 실제 설치·Metro 새로고침·독립 실행·로그인/GPS·교체 시 자료 보존은 미검증이다.

### 보존·삭제·최소 PC 재검증

백업 위치는 `C:\Users\ssw31\Documents\RunningArtBackups\20261031-172813`이다. C disk0/D disk1 구분과 쓰기·용량·접근 제한을 확인했다. 최초 6,727파일 약1.355GiB의 원본 복사/해시, Git bundle, staged/unstaged binary patch, 새 파일·중요 제외 파일, 복원 안내를 보존했다. 유지하는 node_modules는 백업 대상에서 제외했다.

추가 구현 bundle도 검증하고 `restore-main-e8452b6-proof`에서 clone·fsck·clean checkout을 확인했다. 복구 원본 82파일의 별도 복원 해시도 일치했다. 삭제 후보는 최종 729파일, 867,461,693바이트이며 전체를 먼저 백업했다. 절대 경로·상위/하위 reparse point·파일/디렉터리 목록·원본 및 백업 해시를 삭제 직전 재검증한 뒤 다음 9개 경로만 제거했다.

- `running-art-mobile-recovered-20261031`
- `running-art-mobile/.tools/java`
- `running-art-mobile/.tools/android-sdk/cmdline-tools`
- `running-art-mobile/.cache/android`, `running-art-mobile/.cache/gradle`
- `running-art-mobile/.cache/android-commandline-19.zip`, `running-art-mobile/.cache/jdk.zip`
- `running-art-mobile/.cache/node-v24.21.0-win-x64.zip`, `running-art-mobile/.cache/downloads/preview-platform-tools.zip`

Git worktree는 기본 checkout 하나였고 복구 원본에는 .git이 없었다. Node·ADB·사용 중인 npm 의존성/캐시·.env.local·소스·문서는 유지했다. 기존 Android Studio·다른 프로젝트·전역 도구는 제거하지 않았다. 상위 `스크린샷 2026-10-28 233847.png`는 사용 목적 미확인으로 원위치와 백업에 유지했다. 상위 AGENTS.md는 현재 사용 안내로 갱신하고 이전 원문은 백업에 보존했다.

정리 후 확인에서 Metro는 시작했으나 Windows의 localhost가 IPv6 `::1`에만 바인딩되어 IPv4 프로브가 실패했다. PowerShell의 상태 응답도 byte 배열이어서 명시적 UTF-8 변환이 필요했다. 최초 확인 실패 로그와 진단 자료를 보존했다. `preview.ps1 Start`에서 Metro 실행 중에만 Node의 DNS 선택을 IPv4 우선으로 지정하고 종료 시 기존 NODE_OPTIONS를 복원한다. 이 실제 명령으로 Node24.21.0·ADB37.0.1·IPv4 HTTP 상태·8,707,632바이트 Android 번들을 확인했다. 프로젝트 JDK/명령줄 도구는 없는 상태였고 임시 Metro를 종료했다. 앱 재빌드나 전역 네트워크 설정 변경은 필요하지 않았다.

### 비용·외부 확인·마감 기준

- 앞선 약355MB 수치는 산출물 첫 페이지 기준이었다. 18:09 KST 전체 페이지 확인은 활성91개·719,916,776바이트였으며 이후 검증/APK 생성으로 변동한다. 사용량 자료를 C:에 보존했다.
- 이 공개 저장소는 표준 Ubuntu 러너를 사용한다. 공개 저장소의 표준 러너 실행은 [GitHub 공식 과금 문서](https://docs.github.com/en/billing/concepts/product-billing/github-actions)의 무료 범위다. 계정 총 사용량/예산은 현재 인증의 user scope 부족으로 Billing API가404를 반환해 확인하지 못했다. 계정 전체 과금을 확인한 것으로 기록하지 않는다.
- 추가 Codex 크레딧 구매, 유료 러너/예산/저장 한도 상향은 하지 않았다.
- 남은 필수 확인: 저장된 Codex Cloud 환경 생성과 새 작업에서 setup/check/fast, 실제 대상 휴대폰과 보존할 자료 확인, 작업 브랜치 새로고침·preview 독립 실행·교체 설치·로그인/GPS, 다른 PC의 다운로드/전달, 계정 과금 화면 확인.
- 새 키의 암호는 Windows DPAPI로 보호했다. 다른 PC/Windows 재설치 복원에는 비밀번호 관리자 등 별도 암호 보관이 필요하다. 서명키를 소스나 Cloud 개발 환경에 제공하지 않았다.
- 전체 계획은 **부분 완료**다. 중단된 전체 로컬 Android 환경 복구를 완료로 처리하지 않는다. IPv4 시작 보완과 이 마감 기록도 PR 필수 검사→main 반영→기본 폴더 동기화 절차를 따른다. 완료 로컬 브랜치는 최종 bundle과 병합/트리 일치 확인 후 정리하며 실제 최종 커밋·결과는 C:의 CURRENT-PROGRESS.md와 검증 JSON에 남긴다.

### 사용자 승인 계획 원문

실행 때 별도로 보존한 approved-plan.md의 사용자 승인 원문을 아래에 첨부한다. 최초 로컬 복구 계획은 위에 그대로 남긴다.

```markdown
# 클라우드 중심 개발 환경 구성과 기존 폴더 백업·정리

## 1. 최종 구조

개발은 Codex 클라우드에서 진행하고, 기본 PC에는 빠른 화면 확인에 필요한 최소 환경을 둔다.

| 위치 | 역할 |
|---|---|
| GitHub | 코드·문서·변경 이력 보관 |
| Codex 클라우드 | 코드 수정·타입·린트·자동 검사·PR 작성 |
| GitHub Actions | Android 자동 검사, 개발용·독립 실행용 APK 빌드 |
| 기본 PC | 작업 코드 동기화, Metro 개발 서버, ADB 설치·로그 확인 |
| 휴대폰 | 실제 화면·로그인·GPS·권한·배터리 확인 |
| 다른 PC | 개발 환경 없이 APK 다운로드·휴대폰 전달 |

기본 작업 폴더는 `D:\running-art\running-art-mobile` 하나로 유지한다. PC에는 소스·Node·npm 의존성·ADB를 준비하고, 로컬 Android 빌드와 에뮬레이터는 기본 구성에서 제외한다.

제품 API·데이터 형식·운영 서버·Google Play 배포는 이번 변경 범위에 포함하지 않는다.

## 2. 기존 자료 백업과 불필요한 파일 정리

### 정리 전 조사·백업

- 정리 범위는 `D:\running-art` 안으로 한정한다. 기본 폴더, 복구 원본 폴더, 상위 안내·이미지 등 남은 자료를 조사한다.
- 실행 직전 Git 상태·미반영 커밋·미커밋 수정·새 파일·무시된 파일·junction을 다시 확인한다. 현재 로컬 세팅 브랜치와 진행 기록도 보존한다.
- 백업은 **다른 드라이브인 C:**의 `C:\Users\ssw31\Documents\RunningArtBackups\실행일시`에 만든다. 실제 디스크 구분·여유 공간·쓰기 가능 여부를 먼저 확인한다. 부족하면 삭제하지 않고 백업 위치를 다시 정한다.
- 삭제 대상으로 선정한 파일은 먼저 모두 백업한다. 설정·복구 원본·APK·로그·스크린샷·사용자 작성 자료는 빠짐없이 포함한다.
- Git 이력은 bundle, 미커밋 수정은 바이너리 대응 diff, 새 파일·무시된 중요 자료는 원본으로 보관한다.
- 원래 경로·크기·SHA-256·Git 브랜치/커밋·복원 방법을 기록한다. 비밀 설정은 접근을 제한한 로컬 백업에만 저장한다.
- junction은 링크와 연결 대상을 구분한다. 연결된 외부 폴더를 재귀 복사하거나 삭제하지 않는다.

### 유지·정리 기준

| 대상 | 처리 |
|---|---|
| 최신 소스·Git 이력·문서·사용 중인 설정 | 기본 폴더에 유지 |
| Node·npm 의존성·ADB | 최소 검증 환경에 필요한 버전 유지 |
| 복구 원본 폴더 | 전체 백업과 최신본 대조 후 고유 자료를 보존하고 정리 |
| 이번에 설치한 불필요한 JDK·Android 명령줄 도구 | 새 환경 확인 후 백업하고 제거 |
| 오래된 다운로드 압축파일·사용하지 않는 캐시·중복 생성물 | 용도를 확인하고 백업 후 제거 |
| APK·검증 로그·스크린샷·상위 안내 | 고유 자료는 백업에 보존하고 현재 필요한 안내만 유지 |
| 정체·용도가 불분명한 파일 | 유지하고 미확인 목록에 기록 |

- 파일 이름이나 날짜만으로 불필요하다고 판단하지 않는다.
- 백업 파일 해시, bundle 검증, 임시 경로에서의 복원 확인을 통과한 뒤 제거한다.
- 삭제 직전 원본이 조사 이후 변경되지 않았는지 재확인한다.
- Git worktree가 발견되면 Git 절차로 정리한다. 기존 Android Studio와 다른 프로젝트·사용자 전역 도구는 제거하지 않는다.
- 백업은 자동 삭제하지 않는다.

## 3. 개발·빌드·설치 흐름 구성

### 클라우드 개발과 PC 미리보기

- 저장소의 고정 Node 버전과 잠금 파일로 Codex 클라우드 환경을 구성한다. 기본 설치는 JavaScript 개발·검사 범위로 제한한다.
- 작업 브랜치에서 수정하고, 확인할 시점에 커밋을 GitHub에 반영한다.
- PC는 지정한 브랜치의 코드를 내려받는다. 로컬 수정이 있으면 보존하고 멈추며 강제 초기화하지 않는다.
- PC용 최소 설치·동기화·Metro 시작 절차를 마련한다. 기본 휴대폰 연결은 USB와 ADB 포트 전달을 사용한다.
- 일반적인 화면·JavaScript·TypeScript 변경은 동기화 후 새로고침으로 확인한다. 네이티브 코드·권한·SDK·네이티브 의존성 변경 때 개발용 APK를 다시 만든다.
- 클라우드의 미커밋 수정이 PC로 실시간 전송되는 것으로 안내하지 않는다. main 병합 전에도 작업 브랜치로 미리보기할 수 있게 한다.

### 두 종류의 APK

- 기존 PR의 Android 자동 검사는 유지한다. 기존 x86_64·격리 서버용 검사 APK는 휴대폰용으로 배포하지 않는다.
- 별도 수동 워크플로에서 커밋과 APK 종류를 선택한다.
- **개발용 APK:** Metro에 연결해 화면을 빠르게 반복 확인한다.
- **독립 실행 검증용 APK:** 코드·자산을 포함해 개발 서버 없이 실행한다. 다른 PC·휴대폰 확인과 성능·GPS 검증에 사용한다.
- 휴대폰용은 기존 기기를 고려해 `arm64-v8a`와 `armeabi-v7a`를 지원한다. x86_64 에뮬레이터 검사는 기존 CI에서 수행한다.
- APK마다 커밋·종류·버전·서명 인증서 지문·파일 해시·설치 안내를 제공한다.
- 다운로드는 저장소 접근 권한이 있는 사용자의 GitHub Actions 산출물로 제공하며 보존 기간은 7일로 설정한다. 중요한 설치본은 만료 전에 별도 백업한다.

### 설정과 서명 관리

- 복구된 `.env.local`을 최신 설정과 대조하고, 공개 클라이언트 설정과 서버 비밀 값을 구분한다. 실제 비밀 값은 코드·문서·로그에 넣지 않는다.
- 휴대폰용 APK에 자동 검사 전용 localhost 설정이 들어가지 않도록 한다.
- 기존 서명키를 찾고, 없으면 개발용·검증용에 공통으로 사용할 새 고정 테스트 키를 생성한다.
- 키는 보호된 CI 설정과 별도 암호화 백업에 보관한다. 클라우드 개발 에이전트에 빌드용 개인키를 제공하지 않는다.
- 기존 앱 ID를 유지하고 두 APK는 같은 앱을 교체 설치하는 방식으로 구성한다. 서명과 버전 번호를 일관되게 관리한다.
- 과거 서명키와 달라 재설치가 필요하면 해당 기기의 자료 보존 여부를 먼저 확인한다. 서명 변경에 영향을 받는 로그인 설정도 점검한다.

## 4. 검증과 완료 조건

- 새 Codex 클라우드 작업에서 의존성 설치·타입·린트·빠른 자동 검사가 통과한다.
- PC에서 전체 Android 빌드 도구 없이 Metro와 ADB가 동작한다.
- 작업 브랜치의 화면 변경을 동기화한 후 APK 재빌드 없이 개발용 앱에서 확인한다.
- 독립 실행 APK가 Metro 없이 실행되며 실제 기기의 핵심 흐름을 확인한다. 온라인 기능에는 인터넷이 필요하다는 점을 구분한다.
- 다른 PC에서 소스 클론·Node·Android Studio 없이 설치파일과 안내를 다운로드할 수 있다.
- 개발용↔검증용 교체 설치의 서명·버전·자료 유지 여부를 확인한다. 휴대폰 설치는 대상 기기를 확인한 뒤 진행한다.
- 설정·스크립트·문서 변경은 PR 필수 검사와 main 반영을 확인하고 PC도 해당 버전으로 맞춘다.
- 백업 검증과 최소 환경 동작 확인 후 불필요한 폴더·완료 로컬 브랜치를 정리한다. 미확인 자료는 삭제하지 않는다.
- 완료 보고에 남은 폴더, 최신 커밋, 백업 위치·복원 방법, 일상 실행·동기화·APK 다운로드 방법, 미검증 항목을 명시한다.

## 5. 비용과 기록 원칙

- Codex는 현재 구독 한도로 시작하며 추가 크레딧을 구매하지 않는다.
- GitHub Actions의 계정 한도·사용량·저장 공간을 확인한다. 추가 과금이 필요한 경우 비용을 제시한 뒤 결정한다.
- 설치용 APK는 필요한 시점에 수동 생성하고 기존 필수 PR 검사는 유지한다.
- 기존 실행 기록에는 계획 변경과 실제 수행 결과를 추가한다. 중단됐던 전체 로컬 환경 복구를 완료한 것으로 기록하지 않는다.
- 클라우드 작업 공간과 CI 산출물은 영구 백업으로 간주하지 않는다.

```

- 마지막 갱신: 2026-10-31T20:32:51.1666066+09:00

## 최종 main 후속 검사: 공지 상세 로딩 대기 보완

2026-10-31 21:42 KST, PR #34가 병합된 main `1040e52`의 [전체 검사 41199757163](https://github.com/ssw3131/running-art-mobile/actions/runs/41199757163)에서 빠른 검사·API·Android 29는 통과했으나 Android 36의 S56 공지 상세 본문 검사가 실패했다. `s6-notice-detail.xml/png`와 `s56-action-failure.xml/png` 모두 “공지 불러오는 중” 상태였다. 상세 진입 후 비동기 조회/저장본 로딩 완료를 기다리지 않은 채 본문을 검사했다. 실패를 인프라 오류나 성공으로 바꾸지 않는다.

기존 `service_s56.py`에서 상세 진입 뒤 로딩 표시가 사라질 때까지 최대30초 읽기 전용으로 관찰한다. 각 관찰 PNG/XML을 별도 이름으로 남기며 재탭·시나리오 재실행은 하지 않는다. 본문과 오프라인 저장본에 대한 기존 assertion은 유지한다. 로딩 지속은 시간초과로 실패하고, 로딩 표시가 없는 오류 화면은 즉시 본문 검사로 실패한다. 제품 코드/API/데이터 형식은 변경하지 않았다.

보완한 대기·시간초과·오류 화면·ADB 오류 검사4개를 포함한 QA 도우미 단위14개를 통과했다. 실제 Android와 PR/main 검증 결과는 후속 확인 전까지 미검증이다. 실패 run 정보·전체 산출물·실패 로그는 C: 백업 `validation/final-main-attempt1*`에 보존했다. 앞서 성공한 구현 main `e8452b6`, 두 ARM APK, 정리/Metro 검증의 범위와 구분한다.

최신 main `1040e52`도 bundle/실제 clone/fsck로 복원 확인했으며, 완료된 앞선 로컬 브랜치3개는 각 PR 병합·동일 tree·bundle 복원 확인 후 정리했다. 후속 수정은 동일 기본 폴더의 `codex/notice-readiness-20261031` 브랜치에서 진행한다.

- 마지막 갱신: 2026-10-31T21:48:44.5970157+09:00

## main 재현과 공지 조회 상한 · A7 실제 검증 후속

PR #35의 [검사 41202906223](https://github.com/ssw3131/running-art-mobile/actions/runs/41202906223)는 Android 29/36·빠른 검사·API·필수 게이트를 모두 통과했다. Android 29의 7단계/36의 15단계와 자료 보존·정리도 재시도 없이 통과했다. main a554e6a의 [후속 검사 41206130930](https://github.com/ssw3131/running-art-mobile/actions/runs/41206130930)에서는 Android 36 공지 상세 로딩이 30초를 넘겨 실패했다. 30초 대기만으로 해결됐다고 기록하지 않는다. 전체 산출물·run 정보·실패 로그는 C: 백업 validation/main-a554e6a-*에 보존했다.

loadNotices()는 원격 요청이 실패해야 저장본을 읽는데, 공지 RPC에는 응답 상한이 없었다. 공지 읽기만 10초의 deadline/AbortSignal로 제한해 전송 계층이 취소를 무시해도 기존 저장본/오류 처리로 진행한다. 늦은 응답이 캐시를 덮어쓰지 않으며 정상 빈 목록은 정상 응답으로 유지한다. 서버 RPC 이름·인자·데이터 형식·문의 제출은 그대로다. 정상/빈 응답·정지/취소 무시·늦은 응답·저장본 없음·즉시 실패를 포함한 새 회귀5개와 기존 공지 UI2개, 타입·린트를 로컬에서 통과했다. 최초 회귀 테스트 표의 배열 인자 작성 오류 2건은 테스트 표 수정으로 해결했으며 제품 실패와 구분한다. 이 보완의 PR/main Android 판정은 후속 확인 전까지 미검증이다.

사용자가 기존 앱 자료 삭제를 허용하고 A7(SM-A750N/Android10)을 연결했다. 기존 설치 APK를 C:에 보존했고 새 테스트 키와 서명이 달라 최초 1회 승인된 제거/재설치를 했다. 사용자가 직접 로그인한 후 개발용에서 USB Metro·홈·빈 보관함·로컬 임시 문구 Fast Refresh/원복을 확인했다. preview로 -r 교체 설치해 Metro 없이 홈·보관함·서비스 소개 상세/뒤로와 로그인·UID·최초 설치시각 유지를 확인했다.

최신 a554e6a [개발용 41206135949](https://github.com/ssw3131/running-art-mobile/actions/runs/41206135949)/[preview 41206138228](https://github.com/ssw3131/running-art-mobile/actions/runs/41206138228)도 성공했고, 공통 인증서·ARM64/ARMv7·해시·버전 증가·JS 포함 여부를 대조했다. preview→개발용215616962→preview215617838 순서로 제거 없이 교체했고 매번 로그인·UID·최초 설치시각(22:14:27)이 유지됐다. 마지막 preview는 Metro 종료·ADB 8081 전달 제거 후 홈/빈 보관함/소개 상세/뒤로를 확인했다. 현재 폰 APK에는 위 공지 응답 상한 보완이 아직 없다. 보관함이 비어 있어 비어 있지 않은 코스/러닝 내용 보존, 야외 GPS·배터리는 미검증이다.

GitHub에 검증 브랜치의 문구 변경4520631을 만든 뒤 PC의 preview.ps1 Sync로 내려받아, 같은 개발용 APK/Metro에서 문구 표시와 원복을 확인했다. a816000으로 원복해 제품 소스 tree를 main과 다시 일치시켰다. 클라우드에서 작성한 변경이라고 주장하지 않는다. 첫 Metro 준비 상태 진단은 HTTP200 Content가 Byte[]인데 문자열로 검사해 잘못 실패했고, 응답 디코딩 후 정상 판정했다. 원래 진단 결과도 보존했다.

Codex Cloud 환경 running-art-mobile은 사용자가 게시했고 도구 목록의 runnable=true를 확인했다. 별도 새 클라우드 검증 작업 생성 요청은 진행 중이며 실제 setup/fast 성공으로 기록하지 않는다. 다른 PC의 직접 다운로드도 미검증이다. 실제 폰 화면·로그는 개인 C: 백업 validation/phone-a7에만 보존한다.
