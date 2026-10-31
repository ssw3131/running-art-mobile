# D: 복구 파일에서 Android 개발 환경 재구성

- 기록 생성: 2026-10-31T16:29:49+09:00 (Asia/Seoul)
- 실행 시작: 2026-10-31T16:29:49+09:00
- 상태: 진행 중
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
