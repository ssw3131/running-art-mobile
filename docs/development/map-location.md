# 지도·현재 위치 테스트

현재 앱은 핵심 기능을 확인하는 개발용 앱입니다. 실제 서비스 기획·디자인은 사용자가 이후 전달하며, 현재 화면을 최종 서비스 화면으로 확정하지 않습니다.

## 실행 준비

1. 모바일 루트의 `.env.example`을 `.env.local`로 복사합니다. 기존 `.env.local`이 있으면 덮어쓰지 말고 필요한 항목만 추가합니다.
2. `EXPO_PUBLIC_MAPTILER_API_KEY`에 MapTiler 클라이언트 지도 키를 설정합니다.
3. 처음 설치하거나 네이티브 의존성이 변경됐다면 `powershell -ExecutionPolicy Bypass -File .\dev.ps1 build`로 APK를 다시 빌드·설치합니다. Expo Go에서는 MapLibre를 실행할 수 없습니다.
4. Metro를 재시작하고 앱의 **지도 열기**를 누릅니다. 평소 Android Studio·CLI 실행 방법은 [중심 안내](android-studio.md)를 따릅니다.

키 파일은 Git 제외 대상이며 앱 코드에서 키 값을 화면·문서·콘솔에 출력하지 않습니다. Expo 자체의 `.expo/dev/logs/`에는 환경 변수 값이 포함될 수 있으므로 원문을 공유하지 않고 필요한 부분을 가립니다. `.expo/` 역시 Git 제외 대상입니다. `EXPO_PUBLIC_` 값은 앱 번들에 포함되므로 서버 비밀 키 대신 MapTiler 지도용 클라이언트 키를 사용합니다. 지도 키 설정 여부는 **개발 환경** 화면에서 확인합니다.

## 현재 동작

- MapLibre React Native 11.4.0에서 MapTiler Streets v2 지도를 표시합니다. 초기 화면은 한국의 개요이며 사용자의 현재 위치로 간주하지 않습니다.
- Android 테스트 구성은 공식 Expo plugin의 Vulkan 렌더러를 사용합니다. Pixel 7 에뮬레이터의 OpenGL에서 지명 글자가 누락되어 선택했으며 실제 휴대폰 호환성은 후속 검증 대상입니다.
- **현재 위치 확인**을 눌렀을 때만 전경 위치 권한을 요청합니다. 위치 권한 없이도 지도 이동·확대가 가능합니다.
- 위치를 얻으면 파란 점과 정확도를 표시하고 해당 위치로 지도를 이동합니다. 대략적 위치도 제공된 정확도와 함께 사용합니다.
- 한 번 위치를 얻으면 GPS 구독을 해제합니다. 이동 후 **내 위치 다시 확인**으로 갱신합니다.
- 권한 거부 시 재시도 안내, 재요청 불가 시 앱 설정 이동, 기기 위치 꺼짐 시 위치 설정 이동을 제공합니다. 설정에서 돌아오면 권한을 다시 확인하며 자동으로 권한 창을 반복하지 않습니다.
- 위치 신호는 최대 15초 기다립니다. 유효하지 않거나 30초 이상 지난 위치를 현재 위치로 표시하지 않습니다.
- 화면 이탈·백그라운드 진입 시 요청을 취소하고 GPS 구독을 정리합니다. 백그라운드에서 복귀할 때 이미 위치를 요청했던 화면만 다시 확인합니다.
- 지도 키가 없으면 설정 안내를 표시합니다. 지도 로딩 실패·20초 지연 시 재시도 버튼을 표시합니다. MapTiler·OSM 출처와 MapTiler 로고를 표시합니다.

이 지도 화면의 현재 위치는 한 번만 읽고 메모리에서 사용합니다. 별도 화면에 구현한 지속 러닝 추적·백그라운드 위치·SQLite 기록은 [러닝 기록](running-tracking.md), 경로 계산·도로 다운로드는 [지도 중심 계산](route-center.md)을 따릅니다.

## 검사 명령

```powershell
. .\scripts\env.ps1
npm.cmd run check
npm.cmd run test:location
npm.cmd run doctor
npm.cmd run export:android
powershell -ExecutionPolicy Bypass -File .\dev.ps1 build
```

`test:location`은 Node 내장 테스트로 권한·위치 실패·시간 초과·취소와 GPS 구독 정리를 확인합니다. 외부 지도 요청이나 실제 위치를 사용하지 않습니다. Jest·Maestro·CI/CD 구축을 포함하지 않습니다.

현재 `prebuild:android`는 `--no-clean`으로 기존 네이티브 폴더에 설정을 적용합니다. 기본 Expo prebuild는 폴더를 재생성하므로 IDE 설정·캐시 보존을 위해 위 프로젝트 명령을 사용합니다.

수동 확인은 지도 초기 표시 → 권한 거부 → 다시 요청 → 허용 → 위치 점·지도 이동 → 설정에서 권한 변경 후 복귀 순서로 진행합니다. 에뮬레이터 위치 주입은 실제 휴대폰 GPS 수신 검증과 구분합니다. 결과는 [지도·위치 검증 기록](../quality/map-location-verification.md)에 남깁니다.

## 참고

- [MapLibre Expo 설치](https://maplibre.org/maplibre-react-native/docs/setup/expo/)
- [MapLibre v11 API 변경](https://maplibre.org/maplibre-react-native/docs/setup/migrations/v11/)
- [Expo SDK 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [MapTiler 출처 표시](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/)
