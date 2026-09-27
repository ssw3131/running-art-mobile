# 현재 상태와 인수인계

갱신일: 2026-09-26 (Asia/Seoul)

## 현재 작업 목적과 지도·위치

사용자는 현재 **핵심 기능 테스트용 개발**을 요청했습니다. 실제 서비스 기획·디자인은 이후 전달받아 반영합니다. 현재 화면을 최종 사용자 흐름·디자인으로 확정하지 않습니다.

지도 화면·MapLibre/MapTiler 연결·전경 현재 위치 확인·권한 거부 및 설정 이동·시간 초과·요청 취소를 구현했습니다. 타입·린트, 위치·설정 테스트 17개, Expo 진단 21개, Android JS 번들·개발용 APK 빌드·서명 검증이 통과했습니다. Pixel 7 에뮬레이터에서 지도·지명, 권한 거부와 설정 이동, 설정 허용 후 복귀, 모의 GPS 위치 점·지도 이동, 기기 위치 꺼짐 안내를 확인했습니다. 실제 휴대폰 GPS는 미검증입니다. 사용자 로컬 MapTiler 키 연결은 HTTP 200을 확인했습니다. 자세한 내용은 [사용법](../development/map-location.md), [검증 기록](../quality/map-location-verification.md), [실행 계획](../history/executed-plans/2026-09-26-1518-map-location.md)에 있습니다.

현재 Android 지도는 에뮬레이터 OpenGL의 글자 누락 문제를 해결한 Vulkan 설정입니다. `prebuild:android`에 `--no-clean`을 적용했고 지도 단계에서 기존 IDE/JDK/SDK 로컬 설정 보존을 확인했습니다. 지도 단계는 Metro 8082로 검증했으며 최신 SQLite APK·검증 연결은 아래 저장소 항목을 따릅니다. 아래 Studio 검증 이력은 이전 환경 단계의 결과이며 이번 설정 복원 후 Studio UI Sync·Run을 다시 확인한 것은 아닙니다.

## SQLite 저장 기반

Expo SQLite `~57.0.3`으로 앱 전용 `running-art.db`를 추가했습니다. 지연 초기화·동시 요청 공유·스키마 버전 1·트랜잭션 마이그레이션·실패 롤백·미래 버전 보호·재시도를 구현했습니다. 홈의 **저장소 테스트**에서 테스트 메모를 저장·조회·수정·삭제할 수 있습니다. 테스트 메모만 저장하며 코스·러닝 기록 스키마는 아직 구현하지 않았습니다.

전체 로직 테스트 29개(저장소 12개 + 기존 위치·설정 17개), 타입·린트, Expo 진단 21개, Android JS 번들·개발용 APK 빌드·서명 검증이 통과했습니다. Pixel 7 Android 16 에뮬레이터에서 빈 입력·CRUD·삭제 취소를 확인했고, 프로세스 강제 종료·새 PID 재실행 후 수정 내용과 삭제 결과가 유지됐습니다. 실제 Android DB를 읽어 `user_version=1`, `integrity_check=ok`, 수정한 메모 1개를 확인했습니다. 기존 지도·모의 GPS 현재 위치도 정상입니다. 실제 휴대폰·iOS는 미검증입니다.

최신 APK는 `android/app/build/outputs/apk/debug/app-debug.apk`, 검증용 Metro는 **8083**입니다. SQLite 네이티브 모듈 추가 전 APK를 사용하는 경우 다시 빌드·설치해야 합니다. 사용법·DB 위치는 [저장소 안내](../development/storage.md), 증거·제한은 [저장소 검증](../quality/storage-verification.md), 계획 원문·실행 결과는 [실행 기록](../history/executed-plans/2026-09-26-1745-sqlite-storage.md)에 있습니다.

## 완료된 개발 환경

| 항목 | 최종 구성·완료 여부 |
| --- | --- |
| 앱 기반 | Expo SDK 57·React Native 0.86.3·TypeScript 6·Expo Router, 시작/실행 환경 화면 구현 완료 |
| 프로젝트 도구 | Node 24.21.0·npm 11.19.0·JDK 17·SDK 36, 설치·실행 스크립트 구성 완료 |
| 네이티브 빌드 | Gradle 9.3.1·AGP 8.12.0·NDK 27.1.12297006·CMake 3.22.1·Ninja 1.13.1 |
| Studio 실행 | Windows 사용자 Path의 프로젝트 Node, 시작 메뉴 일반 실행, IDE는 번들 JBR |
| Studio 연결 | Gradle JDK는 `.tools/java`, SDK는 `.tools/android-sdk`, Gradle user home은 `.cache/gradle` |
| 가상 기기 | WHPX 가속·Studio Pixel 7 (Android 36.1), CLI용 RunningArt_API_36 (API 36) |
| 앱 실행 검증 | Studio Sync·Run 빌드·설치·Metro 연결·시작 → 실행 환경 → 뒤로 가기 통과 |
| 재실행 검증 | 시작 메뉴로 다시 연 Studio의 Node·npm, Sync·Run·화면 이동 및 Pixel 7 재시작 확인 |
| 코드·빌드 검사 | TypeScript·ESLint·Expo 진단·Android JS 번들·개발용 APK 빌드·서명 검증 통과 |

현재 APK는 Metro가 필요한 **개발용 앱**이며 배포용이 아닙니다. 자세한 설정과 실행은 [Android 개발 환경 중심 안내](../development/android-studio.md), CLI 작업은 [Windows 보조 안내](../development/windows-android.md)를 따릅니다. 기존 검증 증거는 [환경 검증](../quality/setup-verification.md)과 [Studio 실행 검증](../quality/gradle-recovery.md)에 보관합니다.

## 문서와 작업 지침

프로젝트 목표·구현 방법·개발 순서, AGENTS.md, 프로젝트 Codex 설정과 Android·알고리즘 이식·실행 기록 스킬을 구성했습니다. Codex의 AGENTS·세 스킬 로딩과 문서 링크·설정·스킬 형식을 확인했습니다.

개발 환경 문서는 **확정 구성 → 새 PC 최초 설정 → 매일 실행 → 정상 확인** 순서로 정리했습니다. README와 문서 목차에서 중심 안내로 바로 연결합니다. 이번 문서 정리는 [환경 실행 기록](../history/executed-plans/2026-09-25-android-environment.md), 기존 인수인계 구성은 [문서·Codex 실행 기록](../history/executed-plans/2026-09-25-1822-project-handoff.md)에 있습니다.

현재 기본 앱은 이 폴더의 소스·잠금 파일·설치 스크립트로 재구성하도록 되어 있습니다. 도구·캐시·의존성·APK·개인 설정 경로는 Git 공유 대상이 아닙니다.

## Git 저장소

최초 커밋을 생성하고 [GitHub 저장소](https://github.com/ssw3131/running-art-mobile)에 업로드했습니다. 원격 이름은 `origin`이며 로컬 `main`이 `origin/main`을 추적합니다. `.env.local`의 실제 지도 키와 로컬 도구·생성물은 제외했습니다. 타입·린트 검사가 통과했으며 자세한 결과는 [Git 업로드 실행 기록](../history/executed-plans/2026-09-26-1644-git-publication.md)에 있습니다.

후속 요청에 따라 `.gitignore`에 IDE 개인 파일·캐시·로그·테스트 결과·앱 패키지·서명키 제외 규칙을 보강했습니다. 제외 경로 58개와 필수 공유 경로 20개를 검증했으며 이미 추적 중인 제외 대상은 없습니다. `.env.example`, VS Code 공통 설정, Codex 설정·스킬, 앱 소스·문서·잠금 파일은 계속 공유합니다.

사용자가 제공한 정보에 따라 이 저장소의 커밋 작성자를 `ssw3131 <ssw3131@daum.net>`으로 정정했습니다. 최초 세 커밋의 작성자·커미터도 수정해 GitHub에 반영했으며 각 커밋의 파일 내용·메시지·시각은 유지했습니다. 커밋 해시가 바뀌었으므로 이전 이력을 이미 내려받은 동료는 로컬 작업을 보존한 채 새 이력으로 동기화해야 합니다. 복구 자료와 이전·이후 커밋 대응은 위 실행 기록에 있습니다. 동료 PC에서는 각자 본인의 Git 이름·이메일을 설정합니다.

## 미구현·미검증과 보류 범위

- SQLite 저장 기반·테스트 메모는 구현했습니다. 경로 알고리즘·러닝 추적·실제 코스 및 러닝 기록 저장은 미구현입니다. 지도·전경 위치·저장소의 검증 상태는 위 현재 작업 항목을 확인합니다.
- 다른 PC의 최초 전체 설치, 실제 휴대폰, iOS, 배포용 빌드는 미검증입니다.
- CI/CD는 **계획 저장·실행 보류**입니다. GitHub 원격 연결과 소스 업로드는 완료했으며 워크플로·Jest·Maestro·preview 서명·배포는 미구성입니다.
- 아이콘·스플래시는 Expo 기본 자산입니다.
- MapTiler 지도 키는 사용자 로컬 `.env.local`에 설정되어 있으며 Git 공유 대상이 아닙니다. 새 PC에서는 별도 설정합니다. 도로 데이터 주소·정식 앱 ID·서명·코스 및 러닝 저장 스키마는 해당 구현 단계에서 정합니다.
- 실제 이식에는 [프로토타입 출처](../architecture/prototype-migration.md)의 원본이 필요합니다. 원본 전체를 모바일 폴더에 복제하지 않았습니다.
- 의존성 취약점 수치는 [환경 검증 기록](../quality/setup-verification.md)의 측정일 기준입니다.

## 다음 담당자의 시작 순서

1. [첫 안내](../../README.md)와 [제품 목표·결정 이유](../product/overview.md)를 읽습니다.
2. [Android 개발 환경 안내](../development/android-studio.md)에서 새 PC는 최초 설정, 기존 PC는 매일 실행 절차를 진행합니다.
3. [구현 구조](../architecture/implementation.md)와 [단계별 계획](../planning/roadmap.md)을 확인하고 사용자가 선택한 작업을 진행합니다.
4. 실행한 계획에 날짜·결과를 남기고 이 문서를 갱신합니다. CI/CD 계획의 보관을 구축 재개로 해석하지 않습니다.

완료·미완료는 이 문서, 실행 방법은 development, 앞으로의 순서는 planning, 검증 증거는 quality, 실행 계획·결과는 history에 기록합니다.
