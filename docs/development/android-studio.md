# Android 개발 환경 설정과 실행

기준일: 2026-09-26. **Windows x64에서 Android Studio로 개발하는 중심 안내**입니다. 새 PC는 ‘2. 새 PC 최초 설정’부터, 설정된 PC는 ‘3. 매일 개발 시작’부터 진행합니다. 설치 스크립트와 CLI의 상세 설명은 [Windows 보조 안내](windows-android.md)에 있습니다.

이 문서의 **프로젝트 루트**는 `package.json`과 `dev.ps1`이 있는 `running-art-mobile` 폴더입니다. 설정 화면에는 본인 PC의 절대 경로를 입력합니다. 현재 PC의 루트인 `D:\02_work\running-art\running-art-mobile`은 예시이며, 다른 PC에서 같은 경로를 만들 필요는 없습니다.

## 1. 개발 환경 기준

### 도구의 역할과 버전

| 구성 | 기준 | 역할 |
| --- | --- | --- |
| React Native | 0.86.3 | Android·iOS의 네이티브 화면 구현 |
| Expo | SDK 57 / 57.0.25 | 앱 설정, 네이티브 프로젝트 생성, 개발 도구 |
| React / TypeScript | 19.2.3 / 6.0.3 | 화면·로직 작성과 타입 검사 |
| Expo Router | 57.0.23 | 화면 경로와 이동 |
| Node / npm | 24.21.0 / 11.19.0 | 의존성 설치, Expo·Metro 실행 |
| Android Studio | 현재 검증본 Quail 4 / 2026.1.4 Patch 1 | Gradle 동기화·빌드, 에뮬레이터, Logcat |
| Gradle JDK | Temurin 17.0.20.1+1 (JDK 17) | Gradle과 Android 빌드 실행 |
| Gradle / Android Gradle Plugin (AGP) | 9.3.1 / 8.12.0 | 네이티브 빌드 |
| Android SDK | compile/target API 36 | 앱의 빌드·대상 API |
| Android Build Tools | 36.0.0 | APK 생성에 필요한 도구 |
| NDK / CMake / Ninja | 27.1.12297006 / 3.22.1 / 1.13.1 | 네이티브 라이브러리 빌드 |
| Android Command-line Tools | 19.0 | 설치 스크립트의 SDK·AVD 관리 |

앱 의존성은 [package.json](../../package.json)과 [package-lock.json](../../package-lock.json), 다운로드 도구는 [toolchain.json](../../scripts/toolchain.json), SDK 패키지는 [setup.ps1](../../scripts/setup.ps1)이 기준입니다. Gradle은 생성된 `android/gradle/wrapper/gradle-wrapper.properties`의 wrapper를 사용합니다. Platform-Tools·Emulator의 세부 리비전은 SDK 설치 시점에 따라 달라질 수 있습니다.

**Android Studio 자체는 번들 JBR, Gradle 빌드는 프로젝트 JDK 17을 사용합니다.** 두 설정은 별개입니다. IDE 업데이트 알림을 따라 Gradle·AGP·SDK·JDK를 함께 변경하지 않습니다.

Metro는 PC에서 JavaScript 코드를 묶어 개발용 앱에 전달하는 서버입니다. 현재 앱은 Expo development build이므로 Metro를 켜야 합니다. 기본 화면 실행에는 API 키나 Expo 계정이 필요하지 않습니다. 지도에는 [MapTiler 키 설정](map-location.md)이 필요합니다.

### 도구와 캐시 위치

아래 위치는 모두 프로젝트 루트 기준입니다.

| 위치 | 용도 |
| --- | --- |
| `.tools/node` | Node·npm; Windows 사용자 Path에 등록 |
| `.tools/java` | Gradle JDK 17 |
| `.tools/android-sdk` | Studio와 CLI가 사용하는 SDK |
| `.cache/gradle` | Gradle user home·배포본·캐시 |
| `.cache/npm` | npm 캐시 (`.npmrc`에서 지정) |
| `.cache/android/avd` | CLI로 만든 AVD |
| `.cache/tool-backups` | Ninja 원본 백업 |
| `node_modules` | 잠금 파일로 설치한 앱 의존성 |
| `android` | Expo prebuild로 생성한 Android Studio 프로젝트 |

Studio Device Manager의 AVD는 기본적으로 Windows 사용자 프로필에 저장됩니다. CLI AVD와 저장 위치가 다릅니다. 도구·캐시·의존성·네이티브 생성물과 개인 절대 경로는 Git에 포함하지 않습니다.

Gradle은 [scripts/gradle.properties](../../scripts/gradle.properties)의 최대 힙 3GB·작업자 2개를 사용합니다. setup이 이 파일을 프로젝트 Gradle user home에 최초 복사합니다. [Metro 설정](../../metro.config.js)은 작업자 2개와 도구·캐시 폴더의 소스 탐색 제외를 적용합니다.

## 2. 새 PC 최초 설정

### 2-1. 소스와 Android Studio 준비

Windows x64, PowerShell 5.1 이상, `tar.exe`, 인터넷 연결이 필요합니다. 경로가 지나치게 길어지지 않도록 짧은 로컬 경로에 프로젝트 소스와 잠금 파일을 준비합니다. 기존 PC의 도구·캐시를 복사할 필요는 없습니다.

[Android Studio 공식 다운로드](https://developer.android.com/studio)에서 Windows용 안정 버전 설치 파일을 받아 설치합니다. 기본 설치 위치와 IDE 번들 JBR을 사용합니다. IDE 계정·Gemini 연결은 로컬 빌드에 필요하지 않습니다.

### 2-2. 프로젝트 도구·의존성 설치와 Android 프로젝트 생성

탐색기에서 프로젝트 루트를 열고 주소창에 `cmd`를 입력하면 해당 폴더의 명령 프롬프트가 열립니다. 아래 명령을 **한 줄씩**, 앞 명령이 성공한 뒤 실행합니다. PowerShell 창을 별도로 열 필요는 없습니다.

```cmd
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -WithEmulator
powershell -ExecutionPolicy Bypass -File .\dev.ps1 prebuild
powershell -ExecutionPolicy Bypass -File .\dev.ps1 check
```

setup은 Node·JDK·SDK·API 36 에뮬레이터 이미지를 설치하고 `npm ci`와 Ninja 설정을 수행합니다. 다운로드·라이선스 안내를 확인합니다. `prebuild`는 `android/` 생성·갱신, `check`는 TypeScript·ESLint 검사입니다. 프로젝트의 prebuild 명령은 `--no-clean`으로 기존 IDE 로컬 설정·캐시를 보존합니다.

setup은 사용자 Path 등록, Android Studio의 SDK·JDK 설정, Device Manager의 기기 생성을 대신하지 않습니다. 아래 설정을 이어서 적용합니다.

### 2-3. Node 사용자 Path 등록

1. Windows 검색에서 **계정의 환경 변수 편집**을 엽니다.
2. **사용자 변수 → Path → 편집**에서 기존 목록을 복구할 수 있도록 저장해 둡니다.
3. **새로 만들기**로 프로젝트 루트 아래 `.tools\node`의 절대 경로를 추가합니다. 이미 있으면 중복 추가하지 않고 기존 항목을 보존합니다. 시스템 Path는 변경하지 않습니다.
4. 열려 있던 Studio를 완전히 종료한 뒤 **Windows 시작 메뉴에서 Android Studio**를 실행합니다.

예시 등록값은 `D:\02_work\running-art\running-art-mobile\.tools\node`입니다. 프로젝트를 이동하면 이 경로도 갱신합니다.

### 2-4. 프로젝트 열기와 SDK·Gradle 연결

Welcome의 **Open** 또는 **File → Open**에서 프로젝트의 **`android` 폴더**를 엽니다. 코드 편집기·Codex에서는 모바일 프로젝트 루트를 엽니다.

**Tools → SDK Manager**에서 Android SDK Location을 프로젝트 `.tools\android-sdk`의 절대 경로로 지정합니다. Welcome에서는 **More Actions → SDK Manager**로 접근할 수 있습니다. SDK Tools의 **Show Package Details**를 켜면 위 표의 Build Tools·NDK·CMake 버전을 확인할 수 있습니다.

**File → Settings → Build, Execution, Deployment → Build Tools → Gradle**에서 다음과 같이 지정합니다. 메뉴가 다르면 Settings에서 ‘Gradle’을 검색합니다.

| 설정 | 값 |
| --- | --- |
| Gradle 배포 | 프로젝트 wrapper (9.3.1) |
| Gradle JDK | **Add JDK**로 프로젝트 `.tools\java` 지정 |
| Gradle user home | 프로젝트 `.cache\gradle`의 절대 경로 |

JDK 목록에서 `GRADLE_LOCAL_JAVA_HOME`을 사용한다면 `android/.gradle/config.properties`의 `java.home`이 같은 `.tools/java`를 가리켜야 합니다. IDE 자체의 JBR은 기본값을 유지합니다.

이 프로젝트는 Gradle JDK 17을 직접 지정하는 구성을 사용합니다. Daemon JVM criteria로 자동 전환하지 않습니다. `android/gradle/gradle-daemon-jvm.properties`가 이미 있다면 다른 Java 버전을 요구하지 않는지 확인합니다. 이 기준 파일은 다른 JDK 선택보다 우선합니다. [Gradle 공식 설명](https://docs.gradle.org/current/userguide/gradle_daemon.html#sec:daemon_jvm_criteria)

설정 후 **File → Sync Project with Gradle Files**를 실행합니다. 최초 동기화에는 의존성 다운로드 시간이 필요합니다. `app` 모듈이 표시되고 Sync가 성공했는지 확인합니다.

### 2-5. 가속 설정과 Pixel 7 생성

Windows 작업 관리자의 **성능 → CPU → 가상화**가 사용 상태인지 확인합니다. 꺼져 있으면 PC 제조사 안내에 따라 BIOS/UEFI에서 Intel VT-x 또는 AMD-V/SVM을 켭니다. **Windows 기능 켜기/끄기 → Windows 하이퍼바이저 플랫폼**을 활성화하고 필요 시 재부팅합니다. [Android 에뮬레이터 가속 안내](https://developer.android.com/studio/run/emulator-acceleration)

Studio의 **View → Tool Windows → Device Manager**에서 다음과 같이 만듭니다.

1. **+ → Create Virtual Device**를 선택합니다.
2. Phone의 **Pixel 7**을 선택합니다.
3. **API 36 / Google APIs / x86_64** 이미지를 선택합니다. setup에서 설치한 이미지를 사용합니다.
4. 이름을 **Pixel 7**로 정하고 **Finish**를 누릅니다.
5. 목록의 ▶ 버튼으로 실행해 Android 홈 화면이 나오는지 확인합니다.

이미 사용할 Pixel 7이 있으면 재사용합니다. 현재 검증 PC의 Pixel 7은 Android 36.1 이미지이며, 새 PC의 설치 스크립트는 API 36 이미지를 제공합니다. 기기의 OS 이미지와 앱의 compile/target SDK는 별도 항목입니다. 기기 생성·종료 메뉴는 [Device Manager 공식 안내](https://developer.android.com/studio/run/managing-avds)를 참고합니다.

### 2-6. 최초 설정 확인

Studio 하단 **Terminal**을 열고 기본 셸이 PowerShell이면 `cmd`를 입력합니다. 새 CMD 터미널에서 다음 결과를 확인합니다.

```cmd
node --version
npm --version
```

기준 결과는 `v24.21.0`, `11.19.0`입니다. 다른 값이면 `where node`, `where npm`으로 먼저 선택되는 실행 파일을 확인하고 사용자 Path를 점검합니다. 아래 매일 실행 절차로 앱까지 확인하면 최초 설정이 끝납니다.

## 3. 매일 개발 시작

### 3-1. Studio와 프로젝트 열기

**Windows 시작 메뉴 → Android Studio → 최근 프로젝트의 `android`**를 엽니다. 필요한 Gradle 동기화가 끝날 때까지 기다립니다. 직접 동기화하려면 **File → Sync Project with Gradle Files**를 사용합니다.

### 3-2. Studio Terminal에서 Metro 시작

하단 **Terminal**에서 `cmd`를 입력해 CMD를 사용합니다. 아래 첫 줄의 경로를 **본인의 프로젝트 루트**로 바꿉니다. 예시는 현재 검증 PC의 경로입니다.

```cmd
cd /d "D:\02_work\running-art\running-art-mobile"
set "ANDROID_HOME=%CD%\.tools\android-sdk"
npm run start
```

`ANDROID_HOME`은 이 터미널에서 사용할 SDK 경로입니다. Metro가 `Using development build`와 접속 주소를 표시하면 터미널을 켜 둡니다. 새 Metro 터미널을 열 때도 같은 명령을 사용합니다.

### 3-3. 가상 휴대폰에 설치·실행

상단에서 실행 구성 **app**, 기기 **Pixel 7**을 선택하고 **▶ Run**을 누릅니다. 기기가 꺼져 있으면 Device Manager에서 먼저 켭니다. 빌드·설치 후 앱이 실행됩니다.

앱에 개발 서버 선택 화면이 나오면 Running Art 서버를 선택하거나, **Metro 터미널을 클릭하고 `a`**를 누릅니다. 가상 휴대폰에 Android 홈만 보이면 앱 설치·실행까지 완료됐는지 Studio의 Build·Run 결과를 확인합니다.

`Add Configuration`만 보이면 Sync 성공을 먼저 확인합니다. 성공했는데도 구성이 없으면 **Add Configuration → + → Android App**, 이름 `app`, Module `app`, Launch `Default Activity`로 만듭니다.

### 3-4. 수정 반영과 종료

| 작업 | 실행 방법 |
| --- | --- |
| 화면·일반 TypeScript 로직 수정 | 파일 저장 후 Fast Refresh 확인; 필요하면 Metro에서 `r` |
| 네이티브 패키지 또는 네이티브에 영향을 주는 Expo 설정 변경 | Metro를 멈추고 아래 prebuild 명령 실행 → Studio Sync → Metro 시작 → Run으로 재빌드 |
| 로그 확인 | JavaScript·Expo 로그는 Metro, Android 네이티브 로그는 Studio Logcat |
| 개발 종료 | Metro 터미널에서 `Ctrl+C` (종료 확인이 나오면 `Y`) → Device Manager에서 기기 Stop → Studio 종료 |

네이티브 변경을 반영할 때는 프로젝트 루트에서 실행합니다.

```cmd
powershell -ExecutionPolicy Bypass -File .\dev.ps1 prebuild
```

네이티브 설정의 원본은 `app.json`·config plugin으로 관리합니다. `android/`는 생성물이므로 재생성 후에도 Studio의 로컬 SDK·JDK 경로를 확인합니다. Studio Run과 CLI Gradle 빌드를 동시에 실행하지 않습니다. Expo의 개발 빌드 설명은 [로컬 앱 개발 안내](https://docs.expo.dev/guides/local-app-development/)를 참고합니다.

## 4. 정상 동작 확인과 검증 범위

| 확인 항목 | 정상 기준 |
| --- | --- |
| Node·npm | 시작 메뉴로 연 Studio의 새 CMD에서 기준 버전 인식 |
| Gradle Sync | JDK 17·프로젝트 SDK·Gradle user home 사용, Sync 성공 |
| 빌드·설치 | Studio Run 성공, Pixel 7에 앱 설치·실행 |
| Metro | 개발 서버 실행, Android 번들 연결 |
| 화면 이동 | **RUNNING ART → 개발 환경 확인 버튼 → 실행 환경 → Android 뒤로 가기 → 시작 화면** |
| 재실행 | Studio·기기를 다시 열고 같은 실행 절차로 앱 동작 |

2026-09-26에 현재 PC에서 위 항목을 확인했습니다. 타입·린트, Expo 진단, 개발용 APK 빌드·서명 검증도 통과했습니다. 기존 증거는 [환경 검증 기록](../quality/setup-verification.md)과 [Studio 실행 검증 기록](../quality/gradle-recovery.md)에 보관합니다.

**다른 PC의 최초 전체 설치, 실제 휴대폰, iOS, Metro 없이 실행하는 배포용 앱은 아직 검증하지 않았습니다.** 새 PC 안내는 현재 설정·설치 스크립트와 대조한 절차입니다. 현재 APK는 Metro가 필요한 개발용 앱이며, CI/CD는 계획만 저장한 상태입니다. 제품 기능과 다음 작업은 [현재 상태](../handoff/status.md)를 확인합니다.
