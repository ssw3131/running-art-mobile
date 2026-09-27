# Running Art CI/CD·검증 자동화 구축 계획

작성일: 2026-09-25  
상태: **계획 저장 완료 · 구축 미착수 · 추후 사용자 요청 시 실행**

이 문서는 합의한 개발 자동화 계획을 보관한다. 문서 저장으로 GitHub 저장소 생성, 워크플로 실행, 서명키 등록 또는 APK 배포를 시작하지 않는다. 자동 실행 일정도 설정하지 않는다.

## 1. 목표와 선택 이유

기능 개발 전에 **코드 변경 → 자동 검증 → Android 빌드 → 앱 실행 테스트 → 검증된 테스트 APK 배포** 흐름을 마련한다. 웹 개발 경험을 바탕으로 모바일 개발을 진행할 수 있도록 로컬과 CI에서 같은 검증 명령을 사용한다.

| 결정 | 이유 |
| --- | --- |
| 새 모바일 프로젝트만 GitHub 비공개 저장소로 관리 | 기존 두 프로토타입과 모바일 앱의 개발·빌드 이력을 분리한다. |
| GitHub Actions 중심으로 CI/CD 구성 | 소스 관리, 검증, 빌드, 테스트 APK 전달을 한곳에서 관리한다. 초기에는 EAS 계정이나 별도 클라우드 테스트 서비스를 요구하지 않는다. |
| PR에서는 빠른 검사, `main` 반영 후 Android 빌드·실행 테스트 | 일상적인 수정 피드백은 빠르게 받고, 비용과 시간이 큰 검증은 통합된 코드에 수행한다. |
| 자동 배포 범위는 비공개 테스트 APK | 먼저 설치 가능한 결과물을 반복적으로 확보한다. Play Store 배포, iOS 배포, OTA 업데이트는 후속 단계로 남긴다. |
| 실제 검증한 APK를 그대로 배포 | 테스트 이후 다시 빌드하면서 배포 파일이 달라지는 문제를 막는다. |
| 알고리즘·지도 데이터 테스트는 고정 데이터 사용 | 외부 지도 서비스나 공개 Overpass의 일시 장애 때문에 코드 검증 결과가 흔들리지 않게 한다. |

이번 구축은 개발 기반에 한정한다. 지도·GPS·알고리즘·러닝 기록 등의 제품 기능 구현은 포함하지 않는다. 앱 내부에서 경로를 계산한다는 기존 결정도 유지한다.

## 2. 개발 흐름과 실행 조건

- 기본 브랜치는 `main`으로 정리하고, 기능 브랜치에서 작은 단위의 PR을 만든다.
- PR 생성·수정 시 타입 검사, ESLint, 단위·통합 테스트, Expo 호환성 검사, Android JavaScript 번들 생성을 실행한다.
- `main` 반영 시 빠른 검사를 다시 실행한 뒤 서명된 preview APK를 빌드하고 Android 에뮬레이터에서 E2E 테스트를 실행한다.
- 모든 필수 단계가 성공했을 때만 비공개 GitHub Releases에 APK를 게시한다. 하나라도 실패하면 배포하지 않고 진단 자료를 남긴다.
- 수동 실행은 `main`의 검증·빌드·배포 흐름을 재실행하는 용도로 제공한다. 실행 시작 시 확정된 동일 커밋과 동일 APK를 끝까지 사용한다.
- 오래된 중복 실행은 취소하고 npm·Gradle 캐시를 사용한다.

### 공통 개발 명령

아래는 구축 시 제공할 명령의 계약이다. 현재 모두 구현되어 있다는 의미는 아니다.

| 명령 | 역할 |
| --- | --- |
| `npm run check` | TypeScript와 ESLint 검사 |
| `npm run test:ci` | 단위·통합 테스트를 CI 방식으로 실행 |
| `npm run verify` | 빠른 검증 전체 실행: 정적 검사, 테스트, Expo 진단, Android JS 번들 생성 |
| `npm run android:preview` | Metro 없이 실행할 수 있는 테스트용 APK 빌드 |
| `npm run test:e2e` | 준비된 Android 기기·에뮬레이터에서 Maestro 흐름 실행 |

Codex·Claude 등 개발 도구도 같은 명령을 사용한다. 작업 완료 보고에는 실행한 검증과 실행하지 못한 검증을 구분해 기록한다.

## 3. Android 빌드와 설정

### 재현 가능한 빌드

- CI는 GitHub 호스팅 `ubuntu-24.04` 러너를 사용한다. 로컬 개발은 현재 Windows 환경을 유지한다.
- 현재 프로젝트의 Node·JDK·Android SDK·NDK·Gradle 버전을 기준으로 도구 버전을 고정한다. npm 의존성은 잠금 파일과 `npm ci`로 설치한다.
- Expo Doctor와 테스트 도구도 버전을 고정하고, 매 실행 시 `latest`를 가져오는 방식은 사용하지 않는다.
- Expo CNG 방식을 유지한다. `android/`는 Git에서 제외하고 CI에서 prebuild로 생성한다.
- 지속해야 하는 네이티브 설정과 서명 설정은 Expo 설정 또는 config plugin에 남긴다. 생성된 Android 파일만 수동으로 수정하지 않는다.
- 네이티브 빌드와 에뮬레이터 테스트는 별도 작업으로 나누고, 빌드한 APK를 작업 간 전달한다. 러너의 메모리와 디스크 사용량을 관리한다.

### 개발용 앱과 테스트용 앱

`app.config.ts`에서 `APP_VARIANT=development|preview`를 처리한다.

| 구분 | Android application ID | 실행 방식 |
| --- | --- | --- |
| development | `com.runningart.mobile.dev` | 기존 개발 클라이언트, Metro 연결 |
| preview | `com.runningart.mobile.preview` | JavaScript가 포함된 단독 실행 APK |

- preview는 전용 서명키를 계속 사용하여 업데이트 설치를 가능하게 한다. 키와 암호는 GitHub Secrets로 관리하며 저장소에 커밋하지 않는다.
- preview 서명 정보가 없으면 빌드를 실패시킨다. 템플릿의 debug 서명으로 대체하지 않는다.
- APK에는 ARM64와 x86_64를 포함하여 실제 휴대폰과 CI 에뮬레이터를 지원한다.
- Android 빌드 번호는 고정된 배포 워크플로의 실행 번호를 바탕으로 증가시킨다. 버전, 빌드 번호, 커밋 SHA, APK SHA-256을 결과물에 기록한다.
- preview APK는 배포 전 서명, application ID, 버전, 지원 아키텍처, 번들 포함 여부를 검사한다.

## 4. 검증 자동화

### 초기 프로젝트에 추가할 검증

- Expo SDK 57과 호환되는 Jest, `jest-expo`, React Native Testing Library를 구성한다. 테스트 파일은 Expo Router의 화면 경로 폴더 밖에 둔다.
- 시작 화면과 개발 환경 화면의 핵심 표시 및 버튼·화면 이동을 검증한다.
- Maestro CLI는 계획 기준 `2.10.0`으로 고정한다. CI 에뮬레이터는 Android API 34 x86_64 한 종류를 기본으로 사용한다. 앱 compile/target SDK 36과 로컬 API 36 AVD는 유지한다.
- E2E는 preview APK를 새로 설치하고 **Metro 없이 시작 → 시작 화면 확인 → 개발 환경 화면 이동 → Android 뒤로 가기 → 앱 재실행**을 검증한다.
- UI 요소에는 안정적인 `testID`를 사용하고 테스트 전에 에뮬레이터 상태를 초기화한다. 실패한 검증을 자동 재시도로 숨기지 않는다.
- 실패 시 화면 캡처, Maestro 보고서, Android logcat, 빌드 로그를 남긴다. 실패 진단 자료는 7일 보관한다.
- 의존성 검사에서 high·critical 취약점은 통과를 막는다. 기존 moderate 14건은 확인 날짜와 함께 기록하고, 호환성을 깨는 강제 수정은 하지 않는다.

### 기능 개발에 맞춰 확장할 검증

| 대상 | 검증할 시나리오 |
| --- | --- |
| 앱 내부 경로 알고리즘 | Codex v0.2 기준 회귀 테스트, 경로 연결성, 목표 거리·중복 구간·크기 범위, v0.1 기준 후보 보존, 경로 생성 불가 |
| 주변 도로 데이터와 캐시 | 다운로드 실패, 손상된 데이터, 버전 변경, 캐시 재사용 |
| 위치 권한과 러닝 상태 | 권한 허용·거부, 위치 획득 실패, 시작·일시정지·종료 상태 전환 |
| 기록 저장 | 저장·조회, 앱 재시작 후 복원, 데이터 마이그레이션 |

테스트는 고정된 그래프·위치·응답 데이터로 실행한다. 살아 있는 Overpass나 지도 서비스의 응답을 필수 CI 통과 조건으로 두지 않는다.

실제 GPS 정확도, 화면 잠금 중 기록, 배터리 소모, 제조사별 절전 동작은 자동화만으로 완료 처리하지 않는다. 해당 기능 개발 시 실제 휴대폰의 현장 검증을 별도로 수행한다.

## 5. 테스트 APK 배포와 접근

- 모든 검증을 통과한 `main` 실행마다 `preview-<실행 번호>` 형태의 비공개 prerelease를 만든다.
- 저장소 접근 권한이 있는 사용자가 APK, 체크섬, 대응 커밋을 확인하고 내려받도록 한다.
- E2E에서 사용한 APK 파일을 그대로 게시한다. 배포 직전에 새로 빌드하지 않는다.
- PR 검증에는 서명용 비밀정보를 전달하지 않는다. 릴리스 게시에 필요한 쓰기 권한은 배포 작업에만 부여한다.
- 실패하면 이전의 정상 릴리스를 유지한다. 수정 또는 되돌리기 후 더 높은 빌드 번호로 새 APK를 배포한다.
- 작업 간 전달을 위한 중간 APK 아티팩트는 사용 후 정리한다. 실패 진단 자료와 배포한 릴리스 파일은 구분해 관리한다.
- 초기에는 GitHub Free의 비공개 저장소를 전제로 하되, Actions 실행 시간과 저장 공간의 요금제 한도를 고려한다. 무제한 무료로 가정하지 않는다.
- 비공개 저장소의 브랜치 보호는 실제 요금제에서 지원하면 적용한다. 지원 여부와 관계없이 배포 작업은 필수 검증 작업의 성공을 명시적으로 요구한다.

## 6. 추후 구축 순서와 완료 조건

### 구축 순서

1. 모바일 프로젝트의 GitHub 비공개 저장소 연결, `main` 브랜치 정리, 도구 버전과 공통 검증 명령 확정.
2. Jest·컴포넌트/화면 이동 테스트와 PR용 빠른 CI 구성.
3. development/preview 설정 분리, preview 서명, 단독 실행 APK 빌드 구성.
4. Maestro Android E2E와 실패 진단 자료 수집 구성.
5. 전체 검증 성공에 연동한 비공개 테스트 APK 배포 구성.

### 완료 조건

- 로컬의 `.tools`, `.cache`, `node_modules`에 의존하지 않는 깨끗한 CI 환경에서 설치·검증·빌드가 성공한다.
- 의도적으로 넣은 타입 오류와 테스트 실패가 해당 검증 단계를 실패시킨다.
- 네이티브 빌드나 E2E가 실패하면 릴리스가 생성되지 않는다.
- 배포한 APK와 E2E에서 테스트한 APK의 SHA-256이 일치한다.
- 테스트 APK가 Metro 없이 실제 Android 기기에서 실행된다.
- 같은 preview 서명키로 만든 이전 버전 위에 새 빌드가 업데이트 설치된다.
- 실패 원인을 확인할 수 있는 로그와 화면 자료가 남는다.

### 현재 상태와 재개 시 확인 사항

2026-09-25 기준 로컬 개발 도구와 개발용 APK 빌드는 준비되어 있다. GitHub 원격 저장소 연결, Actions 워크플로, Jest·Maestro 구성, preview 빌드·서명·배포는 아직 구축하지 않았다. 에뮬레이터 또는 실기기에서의 실제 화면 실행 확인도 남아 있다.

실행을 재개할 때 도구 호환성과 서비스 지원 범위를 다시 확인하고, 선택한 버전을 잠금 파일과 설정에 기록한다. 이 문서는 계획 당시의 버전·검증 상태를 기록한 것이며 향후에도 그대로 유효하다고 가정하지 않는다.

## 공식 참고 자료

- [Expo 단위 테스트](https://docs.expo.dev/develop/unit-testing/)
- [Expo Router 테스트](https://docs.expo.dev/router/reference/testing/)
- [Expo 앱 변형 구성](https://docs.expo.dev/build-reference/variants/)
- [Expo 로컬 릴리스 빌드](https://docs.expo.dev/guides/local-app-production/)
- [GitHub Actions 사용량과 과금](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub 브랜치 보호](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub 호스팅 러너](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Maestro 설치](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)
- [Maestro CLI 2.10.0](https://github.com/mobile-dev-inc/maestro/releases/tag/cli-2.10.0)
- [Android Emulator Runner](https://github.com/ReactiveCircus/android-emulator-runner)
