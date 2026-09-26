---
name: running-art-android
description: Running Art의 Windows Android Studio 설치·SDK/JDK 설정·Gradle 동기화, 개발용 빌드와 기기 연결 문제를 해결할 때 사용한다. CI/CD 또는 스토어 배포를 시작하는 스킬은 아니다.
---

# Android 환경과 실행

프로젝트 루트의 AGENTS.md와 [Windows 실행 안내](../../../docs/development/windows-android.md), [현재 상태](../../../docs/handoff/status.md)를 읽는다.

Android Studio 설치·열기·GUI 디버깅 작업이면 [Android Studio 안내](../../../docs/development/android-studio.md)도 읽는다. IDE는 `android/`를 시작 메뉴의 일반 실행으로 연다. 이 프로젝트에서 선택한 방식은 `.tools/node`의 사용자 Path 등록과 IDE의 프로젝트 SDK·Gradle 캐시·JDK 17 지정이다. 이미 실행 중인 IDE에는 새 Path가 적용되지 않으므로 정상 종료 후 다시 연다. IDE 자체의 번들 JBR은 유지한다. 설치 안내만 요청했다면 설치 완료로 기록하지 않는다.

1. 현재 요청이 설치, 빌드, 기기 실행 중 어디까지인지 확인하고 기존 코드·도구·기기 상태를 읽는다. 기존 프로젝트 도구를 우선 사용한다.
2. `.tools`가 없으면 안내의 setup을 사용한다. 기존 도구 버전은 `scripts/toolchain.json`과 비교한다. 사용자 Path 등록은 현재 프로젝트의 선택에 따른다. 기존 값·자료형을 백업하고 중복 없이 Node 폴더만 추가하며 시스템 Path나 다른 JDK를 임의로 바꾸지 않는다. 다른 프로젝트로 이 선택을 일반화하지 않는다.
   Gradle 동기화 시 `gradle/gradle-daemon-jvm.properties`도 읽는다. JDK 25 요구가 JDK 17 선택을 덮어쓰면 해당 로컬 생성 설정을 백업하고 원래 JDK 17 구성으로 복구한다. SDK 경로를 바꿀 때 기존 AVD의 상대 이미지 참조를 확인하고 이미지·기기 데이터를 보존한다.
3. 변경에 맞춰 `dev.ps1 check`, 의존성·설정 변경 시 doctor, 네이티브 변경 시 build를 수행한다. 문서만 수정했다면 링크·지침 검증으로 충분하다. 처음부터 모든 캐시를 삭제하지 않는다. Studio의 AGP·Gradle·JVM 자동 전환 제안을 설치 필수 절차로 취급하지 않는다.
   Windows의 `Filename longer than 260 characters`는 SDK CMake의 Ninja 버전도 확인한다. 현재 프로젝트는 `scripts/repair-ninja.ps1`로 원본 백업·공식 체크섬 검증 후 Ninja 1.13.1을 적용하며 setup에서도 실행한다. Windows 긴 경로 지원 여부를 확인하되 시스템 레지스트리를 임의 변경하지 않는다. CMake 재설치 시 복구가 다시 필요할 수 있다.
4. 기기 실행은 `dev.ps1 devices`로 연결·인증 상태를 확인한 뒤 진행한다. 에뮬레이터 가속이 없으면 문서의 관리자 설정과 재부팅 필요성을 설명한다. 이미 연결 가능한 실기기가 있으면 사용한다.
5. 현재 APK는 Metro가 필요한 개발 클라이언트다. APK 생성만으로 화면·권한·터치를 통과했다고 쓰지 않는다. 시작 → 개발 환경 → 뒤로 가기와 재실행을 실제 확인할 수 있을 때 수행한다.
   Studio Run의 APK는 `app/build/intermediates/apk/debug`에 있을 수 있으므로 CLI `outputs`의 이전 파일과 구분한다. Metro는 기본 `npm run start`를 사용한다. 연결 정지 시 실제 HTTP 응답·수신 주소·파일맵 오류를 확인한다. `.tools`·`.cache` 제외와 작업자 제한은 공유 `metro.config.js`에 있으며 캐시 재생성은 Metro에 한정한다.
6. 날짜·환경·명령·결과·미검증을 관련 검증 문서에 남긴다. 별도 계획에 따른 구현을 실행했다면 실행 기록 규칙도 적용한다.
   에이전트 도구로 연 IDE가 이전 Path를 상속할 수 있으므로 도구 실행 결과와 사용자의 시작 메뉴 일반 실행 결과를 구분한다. 임시 Path를 덮어쓴 프로세스로 영구 Path 적용 검증을 대신하지 않는다.

설치가 막히면 실패 지점을 보존하고 필요한 조치만 수행한다. 이 스킬은 외부 계정 생성·배포·CI/CD 재개의 권한을 부여하지 않는다.
