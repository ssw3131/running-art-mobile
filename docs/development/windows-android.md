# Windows 설치 스크립트·CLI 보조 안내

기준일: 2026-09-26. **새 PC 최초 설정과 매일 Android Studio를 사용하는 방법은 [개발 환경 중심 안내](android-studio.md)를 따릅니다.** 이 문서는 설치 스크립트의 동작과 CLI 명령을 설명합니다.

명령은 모두 `package.json`이 있는 `running-art-mobile` 루트에서 실행합니다. CMD 또는 Studio Terminal에서 아래 명령을 사용할 수 있습니다. 스크립트는 Windows x64, PowerShell 5.1 이상과 `tar.exe`를 전제로 합니다.

## 설치 스크립트의 범위

```cmd
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -WithEmulator
```

[setup.ps1](../../scripts/setup.ps1)은 다음 작업을 수행합니다.

- [toolchain.json](../../scripts/toolchain.json)의 공식 URL·체크섬으로 Node·JDK·Android Command-line Tools를 설치합니다.
- `npm ci`로 잠금 파일의 의존성을 설치합니다.
- Platform-Tools, API 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1을 설치합니다.
- `-WithEmulator`가 있으면 Emulator와 `system-images;android-36;google_apis;x86_64`를 추가합니다.
- [repair-ninja.ps1](../../scripts/repair-ninja.ps1)로 Ninja 1.13.1을 적용합니다. 다운로드를 검증하고 기존 바이너리를 `.cache/tool-backups`에 보관합니다.

실제 휴대폰만 사용하면 `-WithEmulator`를 생략할 수 있습니다. SDK 라이선스 안내를 확인하고, 설치 실패 시 해당 오류를 확인한 뒤 같은 명령으로 재개합니다. 스크립트는 기존 실행 파일이 있으면 재사용하므로 버전까지 자동 교정한다고 가정하지 않습니다.

설치 후 Android 프로젝트 생성과 코드 검사는 별도입니다.

```cmd
powershell -ExecutionPolicy Bypass -File .\dev.ps1 prebuild
powershell -ExecutionPolicy Bypass -File .\dev.ps1 check
```

Android Studio 설치, Node 사용자 Path 등록, Studio의 SDK·Gradle JDK·캐시 지정, Device Manager의 Pixel 7 생성은 [중심 안내](android-studio.md)에서 진행합니다. setup이 Windows 환경 변수나 IDE 설정을 자동 변경하지는 않습니다.

## CLI 명령

공통 형식은 `powershell -ExecutionPolicy Bypass -File .\dev.ps1 <명령>`입니다.

| 명령 | 역할 |
| --- | --- |
| `env` | 프로젝트 Node 버전·SDK 위치 출력 |
| `check` | TypeScript·ESLint 검사 |
| `doctor` | Expo 설정·의존성 진단; 네트워크 필요 |
| `prebuild` | Expo 설정에서 Android 프로젝트 생성·갱신, `--no-clean`으로 기존 로컬 설정 보존 |
| `android` | 개발용 앱 빌드·기기 설치·실행, Metro 연결 |
| `start` | 설치된 개발용 앱에 연결할 Metro 시작 |
| `devices` | USB·에뮬레이터 연결 상태 출력 |
| `emulator` | CLI용 RunningArt_API_36 AVD 생성 또는 실행 |
| `build` | prebuild 후 기기 없이 개발용 APK 생성 |
| `web` | 웹에서 화면을 보조 확인 |

Android Studio Run과 CLI 빌드는 동시에 실행하지 않습니다. `doctor`는 npx로 진단 도구를 가져오며 현재 별도 버전 고정이 없습니다. `web`은 Android 네이티브 동작을 검증하지 않습니다.

CLI `build` 결과는 `android/app/build/outputs/apk/debug/app-debug.apk`, Studio Run 결과는 `android/app/build/intermediates/apk/debug/app-debug.apk`에 있을 수 있습니다. Studio의 Build·설치 결과로 실제 실행한 빌드를 확인합니다. 현재 앱 ID는 `com.runningart.mobile.dev`이며 APK는 Metro가 필요한 개발용입니다.

## CLI 기기 사용

### CLI용 AVD

Studio의 Pixel 7을 사용한다면 이 절차는 필요하지 않습니다. CLI AVD를 사용할 때만 다음 명령으로 구성합니다.

```cmd
powershell -ExecutionPolicy Bypass -File .\scripts\emulator.ps1 -CreateOnly
powershell -ExecutionPolicy Bypass -File .\dev.ps1 emulator
```

`RunningArt_API_36`은 프로젝트 `.cache/android/avd`에 저장되고 API 36 Google APIs x86_64 이미지를 사용합니다. Studio가 기본 사용자 프로필에 만든 Pixel 7과 별개의 기기입니다. 가속 기능은 [중심 안내](android-studio.md)에 따라 먼저 설정합니다.

CLI로 가속 기능을 설정하려면 관리자 권한 터미널에서 `powershell -ExecutionPolicy Bypass -File .\scripts\enable-emulator-acceleration.ps1`을 실행합니다. 이 스크립트는 자동 재부팅하지 않습니다.

기기가 실행되면 다른 터미널에서 다음 명령으로 빌드·설치합니다.

```cmd
powershell -ExecutionPolicy Bypass -File .\dev.ps1 android
```

### 실제 Android 휴대폰

휴대폰의 개발자 옵션에서 USB 디버깅을 켜고 PC에 USB로 연결한 뒤 디버깅 허용 요청을 승인합니다.

```cmd
powershell -ExecutionPolicy Bypass -File .\dev.ps1 devices
powershell -ExecutionPolicy Bypass -File .\dev.ps1 android
```

`devices` 결과가 `device`여야 합니다. `unauthorized`면 휴대폰의 승인 화면을 확인합니다. 목록이 비어 있으면 케이블·제조사 USB 드라이버를 확인합니다. 실제 휴대폰에는 에뮬레이터 가속이 필요하지 않습니다. 이 절차의 실제 휴대폰 검증은 아직 수행하지 않았습니다.

## 환경 변수와 유지 관리

[env.ps1](../../scripts/env.ps1)은 CLI 프로세스에 다음 환경을 적용합니다. `dev.ps1`과 설치·에뮬레이터 스크립트에서 불러옵니다.

| 변수 | 프로젝트 루트 기준 값 |
| --- | --- |
| `JAVA_HOME` | `.tools/java` |
| `ANDROID_HOME`, `ANDROID_SDK_ROOT` | `.tools/android-sdk` |
| `GRADLE_USER_HOME` | `.cache/gradle` |
| `ANDROID_USER_HOME` | `.cache/android` |
| `ANDROID_AVD_HOME` | `.cache/android/avd` |
| `npm_config_cache` | `.cache/npm` |

Node·Java·SDK 도구의 Path도 해당 프로세스에만 적용합니다. 시작 메뉴로 여는 Studio에는 [중심 안내](android-studio.md)의 영구 사용자 Node Path와 IDE 설정이 필요합니다.

PowerShell에서 직접 npm을 실행할 때는 다음처럼 적용합니다.

```powershell
. .\scripts\env.ps1
npm.cmd run check
```

| 상황 | 조치 |
| --- | --- |
| Studio에서 Node·npm을 찾지 못함 | 사용자 Path의 프로젝트 Node 위치 확인 후 Studio 완전 종료·시작 메뉴 재실행 |
| JDK 설정 불일치 | Gradle JDK 17과 로컬 Daemon JVM criteria 확인; 개인 설정의 변경 전 백업 유지 |
| SDK·CMake 재설치 | 프로젝트 루트에서 `powershell -ExecutionPolicy Bypass -File .\scripts\repair-ninja.ps1` 재실행 |
| Windows 긴 경로 오류 | Ninja 버전과 Windows 긴 경로 지원 정책 확인; 설치 스크립트는 시스템 레지스트리를 변경하지 않음 |
| Metro 캐시 읽기 오류 | 기존 Metro 종료 후 `npm run start -- --clear`로 재생성; 평소에는 `npm run start` |
| 프로젝트 폴더 이동 | 사용자 Node Path, Studio SDK·JDK·캐시 경로, AVD 이미지 참조 갱신 |
| 기존 AVD가 이미지를 찾지 못함 | 원래 시스템 이미지 위치와 AVD 설정 확인; 기기 데이터를 지우기 전에 경로 수정 |

프로젝트의 확정 버전과 설정 위치는 [개발 환경 기준](android-studio.md), 완료·미완료는 [현재 상태](../handoff/status.md)를 참고합니다. 과거 진단과 검증 결과는 quality에 보존하며 이 안내의 실행 전제는 아닙니다.
