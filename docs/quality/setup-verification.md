# 개발 환경 검증 기록

검증일: 2026-09-25 (Windows, AMD Ryzen 7 5800H, 메모리 16GB)

| 항목 | 결과 |
| --- | --- |
| 공식 Node·JDK·Android 명령줄 도구 다운로드 해시 | 일치 |
| Node / npm | 24.21.0 / 11.19.0 |
| Java | Temurin 17.0.20.1+1 |
| TypeScript / ESLint | 통과 |
| Expo Doctor | 21/21 통과 |
| Android JavaScript/Hermes 번들 | 생성 성공 |
| Android prebuild | 생성 성공 |
| Android SDK 36 / Build Tools 36 | 설치·인식 확인 |
| NDK 27.1.12297006 / CMake 3.22.1 | 설치 및 네이티브 컴파일 성공 |
| SDK 관리 도구 19.0 재실행 | 종료 코드 0 |
| Android 36 Google APIs x86_64 이미지 | 설치 완료 |
| 가상 기기 RunningArt_API_36 | Pixel 7 프로필로 생성·목록 확인 |
| PowerShell 스크립트 구문 | 검사 통과 |
| 네이티브 개발용 APK | 성공 — 첫 빌드 25분 23초, 642개 작업 실행 |
| APK 서명 | apksigner 검증 통과 (v2, 개발용 서명) |
| APK 식별자 / 버전 | com.runningart.mobile.dev / 0.1.0 (versionCode 1) |
| APK 지원 CPU / 크기 | arm64-v8a, x86_64 / 약 142MB |
| 실기기 연결 | 현재 연결된 기기 없음 |
| 에뮬레이터 가속 | 드라이버 미설치, accel-check 종료 코드 1 |
| Android 앱 화면·터치·뒤로가기 | 아직 실행 검증하지 않음 |

## 실행을 위해 남은 PC 설정

CPU의 펌웨어 가상화는 켜져 있다. Windows Hypervisor Platform을 활성화한 뒤 Windows를 재부팅하고 `dev.ps1 emulator`, `dev.ps1 android`를 실행한다. 관리자용 설정 스크립트는 `scripts/enable-emulator-acceleration.ps1`이며 자동 실행하거나 재부팅하지 않았다. USB 디버깅이 허용된 실제 Android 기기를 연결하는 방법도 사용할 수 있다.

## 구현 범위

이 단계에서는 Expo development build 기반 시작 화면·개발 환경 화면·화면 이동과 로컬 개발 명령을 구성했다. 지도·GPS·백그라운드 추적·SQLite·알고리즘은 아직 연결하지 않았다. 이전 두 프로토타입은 수정하지 않았다.

## 재현 가능한 검증 명령

```powershell
powershell -ExecutionPolicy Bypass -File .\dev.ps1 check
powershell -ExecutionPolicy Bypass -File .\dev.ps1 doctor
powershell -ExecutionPolicy Bypass -File .\dev.ps1 build
```

검증 로그는 `.cache/android-build.log`, `.cache/android-export.log`, `.cache/expo-doctor.log`, `.cache/android-installed.log`에 있다. 캐시는 Git에 포함하지 않는다.

생성 파일: `android/app/build/outputs/apk/debug/app-debug.apk`

SHA-256: `4a18a1907e509e5def2ee1622f91eb75fb90b039afaad8cee281426e3c6821b4`

APK는 Expo development build이며 실행 시 Metro에 연결한다. APK 생성·서명 검증과 실제 Android 화면 실행 검증은 별도다. 이번 단계에서는 생성·서명까지 확인했다. 다른 PC에서 설치 스크립트 전체를 처음부터 실행하는 검증은 수행하지 않았다.

## 현재 의존성 상태

`npm audit`는 moderate 14건, high/critical 0건을 보고한다. `decode-uri-component`와 `uuid`의 전이 의존성에서 파생된 항목을 포함한 수치다. 자동 수정은 Expo 주요 버전의 다운그레이드를 제안하므로 적용하지 않았다. 네이티브 호환성을 유지하는 상위 패키지 업데이트를 출시 준비 때 다시 확인한다.
