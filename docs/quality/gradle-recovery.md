# Android Studio Gradle 복구 검증

- 실행일: 2026-09-26 (Asia/Seoul)
- 상태: 완료 — 사용자 시작 메뉴 일반 실행과 Studio·에뮬레이터 재시작 후 전체 흐름 검증 통과
- 계획·시간·최종 결과: [기존 환경 실행 기록의 후속 실행](../history/executed-plans/2026-09-25-android-environment.md)

## 확인한 원인과 설정 변경

- Studio의 이전 동기화가 `CreateProcess error=2`로 실패했다. 프로젝트 Node는 설치되어 있었으나 저장된 Windows Path에는 없었다.
- `android/local.properties`는 사용자 SDK를 가리켰고, 그 SDK의 플랫폼은 API 37.0이었다. 기존 빌드에 쓴 프로젝트 SDK의 플랫폼은 API 36이다.
- `android/gradle/gradle-daemon-jvm.properties`에 `toolchainVersion=25`가 생겨 있었다. JDK 17을 지정한 CLI에서도 25 다운로드를 요구하는 것을 재현했다.
- 기존 사용자 Path의 원문·자료형과 IDE·SDK·JVM 기준·Pixel 7 설정을 `.cache/gradle-repair/2026-09-26-1151/`에 백업했다. 해당 폴더는 Git 공유 대상이 아니다.
- 사용자 Path에 기존 Node 폴더만 추가했다. Gradle JDK는 `GRADLE_LOCAL_JAVA_HOME`과 로컬 `java.home`으로 프로젝트 JDK 17을 지정하고, SDK와 Gradle 캐시도 프로젝트 도구로 맞췄다. JDK 25 기준 파일은 백업 후 제거했다.
- 기존 Pixel 7의 이미지 참조를 원래 Android 36.1 이미지의 절대 경로로 지정했다. AVD 사용자 데이터와 원래 이미지 파일은 유지했다.

## 현재 확인된 결과

- 저장된 Windows 사용자·시스템 Path를 적용한 새 프로세스에서 Node `v24.21.0`, npm `11.19.0` 인식.
- 시작 메뉴 바로가기 재실행 후 Studio 로그에서 프로젝트 JDK 17을 Gradle에 지정하는 것을 확인.
- Studio의 실제 새 터미널에서 Node·npm 버전을 확인했다. Gradle 설정 화면에서도 JDK 17을 확인했다.
- 이 Studio 버전의 Gradle user home은 예전 `.idea/gradle.xml`의 `serviceDirectoryPath` 항목으로 저장되지 않는다. GUI 설정에서 프로젝트 캐시를 지정하고 설정 화면 재진입으로 유지되는 것을 확인했다. `GradleLocalSettings`와 IDE의 `gradle.settings.xml`에 저장되는 방식이다. 이전 캐시로 시작한 다운로드는 정상 종료 확인 창을 거쳐 중단하고 IDE를 재시작했다.
- 첫 재실행용 프로세스에 빈 Android 환경 변수가 전달되어 Studio 시작 오류가 발생했다. 해당 프로세스의 빈 변수를 제거하여 재실행했다. 이 임시 실행 오류를 사용자 영구 설정이나 앱 오류로 간주하지 않는다.

동기화·Run·화면·재실행 결과는 아래에 기록한다. 기존 [2026-09-25 환경 검증](setup-verification.md)은 당시의 기록으로 유지한다.

## Gradle 및 IDE 검증

- `. scripts/env.ps1` 환경에서 `android/gradlew.bat -p android help --offline --console=plain --max-workers=2`: **성공**, 1분 53초, 33개 태스크 중 32개 캐시 재사용. API 36·NDK 27.1.12297006 설정 확인. 샌드박스의 Android 분석 설정 위치 경고는 있었으며 빌드는 성공했다.
- 재실행 과정의 `.port` 파일 제거·이름 변경은 Windows 오류 1920으로 실패했다. 이후 Studio가 정상적으로 열린 것을 확인했다. 이 파일의 문제가 영구적으로 수정됐다고 단정하지 않는다.
- Studio Gradle 동기화: **2026-09-26 12:31:15 성공**, 9분 34초. 자동으로 `Running Art` 프로젝트와 `app` 실행 구성이 인식되고 Run 버튼이 활성화됐다.
- 동기화 지연 시 Gradle 스레드는 의존성 보조 소스 아티팩트의 HTTP HEAD 응답을 기다리고 있었다. 진단 중 `Advanced Settings → Build Tools. Gradle → Download sources` 해제를 시도했다. 최종 사용자 일반 실행의 동기화 로그에는 `idea.gradle.download.sources=true`가 남아 있었으므로 영구 해제를 완료했다고 간주하지 않는다. 이 상태에서도 동기화는 성공했고 앱 빌드 의존성 다운로드는 유지했다.
- Studio의 Run 버튼으로 기존 Pixel 7을 재시작했고 ADB에서 `device` 연결을 확인했다. 앱 빌드·실행·화면 검증은 이어서 기록한다.

## Run 빌드에서 발견한 Windows 경로 제한

- 첫 Studio Run은 12:38에 실패했다. React Native 헤더 파일의 긴 경로를 CMake 3.22.1 내 Ninja 1.10.2가 거부했다. 이전 APK가 기기에 남아 있어 화면이 보이는 것만으로 새 빌드 성공이라 판단하지 않았다.
- Windows `LongPathsEnabled=1`을 읽기 확인했다. SDK·프로젝트·캐시를 이동하거나 레지스트리를 바꾸지 않고 Ninja만 1.13.1로 교체했다.
- 공식 GitHub 릴리스 API가 제공한 `ninja-win.zip`의 SHA-256 `26a40fa8595694dec2fad4911e62d29e10525d2133c9a4230b66397774ae25bf`와 실제 파일이 일치했다. 구 버전으로 같은 오류를 재현하고 신 버전의 dry run으로 해당 경로 오류가 사라짐을 확인했다.
- `scripts/repair-ninja.ps1`은 구 바이너리를 `.cache/tool-backups/ninja-1.10.2-20260926-124718795.exe`에 백업하고 교체했다. 두 번째 실행은 이미 적용되었음을 확인하고 변경 없이 끝났다. setup에도 연결해 새 설치 시 동일한 버전을 사용한다.

## 빌드·Metro·화면 검증

- Studio Run 재빌드: **12:56:41 성공, 8분 42초**. 설치는 약 16초 걸렸으며 IDE가 `MainActivity`를 실행했다. 기기 `lastUpdateTime=2026-09-26 03:56:52 UTC`도 확인했다.
- Studio가 설치한 APK는 `android/app/build/intermediates/apk/debug/app-debug.apk`이며 생성 시각은 12:56:39, 크기는 187,620,412바이트다. CLI용 `outputs/apk/debug`의 이전 파일과 구분한다.
- 최초 Metro 프로세스가 응답하지 않았고 재시작 시 파일맵 캐시 역직렬화 오류가 발생했다. `metro.config.js`에서 Expo 기본 설정을 보존하며 `.tools`·`.cache`를 제외하고 작업자를 2개로 제한했다. Metro 캐시 재생성 후 `npm run start`에서 `packager-status:running` 응답과 Android 1,104개 모듈 번들 성공을 확인했다.
- 진단 중 `--localhost`는 이 PC에서 `::1`에만 바인딩되어 IPv4 연결이 거부됐다. 최종 방식은 안내대로 기본 `npm run start`이며, `--localhost`를 필수 실행 옵션으로 추가하지 않았다.
- Studio 터미널의 Metro와 Pixel 7에서 시작 화면 → 개발 환경의 `실행 환경`·`android 36` → Android 뒤로 가기 → `RUNNING ART` 복귀를 UI 요소와 스크린샷으로 확인했다.
- 시작 화면 검증용 버튼의 스타일 콜백이 Link 내부에서 반영되지 않아 흰 배경에 흰 글자가 표시됐다. 정적 스타일 참조로 수정하고 Fast Refresh 후 녹색 버튼과 글자를 확인했다. 화면·이동 경로·제품 기능은 추가하지 않았다.

## 재시작 결과

- Pixel 7을 정상 종료하고 Studio의 Exit 확인을 거쳐 닫았다. 13:14에 Windows Shell을 통해 시작 메뉴 바로가기를 다시 열었고 `.port` 오류 없이 프로젝트가 열렸다. JDK 17·SDK·프로젝트 캐시·`app`·Pixel 7 선택이 유지됐다.
- 다시 Run한 빌드는 **13:18:31 성공, 1분 54초**, 설치 약 4초, `MainActivity` 실행까지 확인했다. AVD 이미지·데이터를 재생성하지 않았다.
- 다만 이 도구 실행 경로는 Codex 쪽의 기존 프로세스 환경을 상속했다. 새 Studio Terminal에서 Node 24.19.0과 `npm` 미인식을 확인했다. Windows 사용자 Path의 프로젝트 Node 경로는 여전히 정확히 한 번 저장돼 있다.
- Studio를 정상 종료하고 사용자에게 시작 메뉴 직접 실행을 요청했다. 사용자가 ‘열었어’라고 답한 새 Studio 프로세스에서 **Node 24.21.0·npm 11.19.0**을 터미널로 확인했다. 별도로 임시 Path를 덮어쓰지 않았다.
- 해당 일반 실행의 Gradle 동기화는 **13:24:32 성공, 2분 36초**. JDK 17·SDK 36·프로젝트 캐시를 유지했고 JDK 25 기준 파일은 다시 생기지 않았다.
- 같은 Studio의 Terminal에서 `cmd` → 안내의 `ANDROID_HOME` 설정 → 기본 `npm run start`를 실행했다. `http://127.0.0.1:8081/status`의 `packager-status:running`과 개발 앱의 정상 연결을 확인했다.
- 같은 Studio의 Run: **13:29:01 성공, 3분 4초**. 13:29:02 `MainActivity` 실행. 재시작한 Pixel 7에서 녹색 `개발 환경 확인` 버튼 → `실행 환경` → Android 뒤로 가기 → `RUNNING ART` 복귀를 **13:30:33에 통과**했다. 최종 UI XML과 스크린샷은 로컬 백업 폴더의 `final-*` 파일에 보관했다.
- 변경 후 `dev.ps1 check`의 TypeScript·ESLint, 문서 링크·Codex 설정·Android 스킬 형식·`git diff --check`를 통과했다. 다른 PC의 최초 설치, 실기기, 배포용 APK와 CI/CD는 이번 검증 대상이 아니다.
