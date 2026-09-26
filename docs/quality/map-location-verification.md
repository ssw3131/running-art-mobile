# 지도·현재 위치 검증 기록

날짜: 2026-09-26 (Asia/Seoul). 상태: 지도·전경 위치·권한 처리 구현, Android 빌드·에뮬레이터 검증 완료.

## 자동 검사

| 항목 | 명령·확인 방법 | 결과 |
| --- | --- | --- |
| 타입·린트 | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 check` | 통과. RN 0.86의 제거된 `StyleSheet.absoluteFillObject` 사용은 명시적 absolute 스타일로 수정 후 통과 |
| 위치·지도 설정 | `npm run test:location` | 17/17 통과. 권한 거부·재요청 불가·두 번째 거부 직후 OS 재확인·설정 재확인·서비스 비활성·허용·대략적 위치·오래된 좌표·시간 초과·취소·늦은 구독·즉시 콜백·실패 후 재시도·네이티브 실패·키 누락·URL 인코딩 |
| Expo 진단 | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 doctor` | 21/21 통과 |
| Android JS 번들 | `npm run export:android` | 통과 |
| MapTiler 키 연결 | 로컬 키로 Streets v2 style.json 요청. 키·요청 URL 원문 출력 안 함 | HTTP 200, style version 8, source 2개·layer 90개 |
| 키 보관 | `git check-ignore .env.local` | Git 제외 확인 |
| Android APK | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 build` | 최초 OpenGL 빌드 10분 53초·674 tasks 성공. 최종 Vulkan 빌드 8분 2초·674 tasks 성공 |
| APK 서명 | SDK `apksigner verify` | 최종 개발용 APK 검증 통과 |
| 로컬 설정 보존 | `npm run prebuild:android -- --no-install` 전후 SHA-256 비교 | `android/.idea/gradle.xml`, `android/.gradle/config.properties`, `android/local.properties` 3개 모두 동일 |

최종 APK: `android/app/build/outputs/apk/debug/app-debug.apk` (ARM64·x86_64 개발용).

SHA-256: `8B81BCB73D62F929010B7446E15167AF19772BB59808BAE835027125F9EECE49`

## 에뮬레이터

기기: Pixel 7 AVD, `emulator-5554`, Android 16, 1080×2400. 최종 Vulkan APK 업데이트 설치 성공. 테스트용 Metro 8082·ADB reverse로 연결했으며 기존 Metro 8081은 유지했다.

| 시나리오 | 실제 결과 |
| --- | --- |
| 홈 → 지도 | MapTiler 지도·지명·MapTiler 로고·출처 표시 확인. 최종 Vulkan에서 한글·영문 지명 모두 표시 |
| 첫 위치 요청 → 거부 → 재요청 | 초기 APK에서 OS 권한 창과 재요청, 거부 후 지도 유지 확인 |
| 재요청 불가 | 최종 APK에서 권한 안내·앱 설정 열기 확인 |
| 설정에서 허용 → 앱 복귀 | 최종 APK에서 권한을 재확인하고 자동으로 위치 수신 시작 |
| 현재 위치 표시·지도 이동 | 모의 좌표 서울시청 부근(126.9780, 37.5665) 주입. 위치 성공·정확도 약 5m 안내·파란 점·카메라 확대 확인. 실제 사용자 위치가 아님 |
| 위치 서비스 꺼짐 → 현재 위치 요청 | 최종 APK에서 위치 기능 꺼짐 안내·위치 설정 열기 버튼 확인. 테스트 후 OS 위치 서비스 켜짐 복원 확인 |

로컬 화면 증거는 `.cache/map-vulkan-loaded.png`, `.cache/map-vulkan-position.png`, `.cache/map-vulkan-disabled.png`에 있다. `.cache`는 Git 제외 대상이다. 서비스 비활성 검사의 UI 자동 조회가 일시 실패해 해당 화면은 스크린샷으로 확인했다.

## 발견한 문제와 조치

- 두 번째 권한 거부 직후 반환된 `canAskAgain`과 OS 상태가 달랐다. 거부 후 권한을 재조회하도록 수정하고 회귀 테스트를 추가했다. 최종 APK의 재요청 불가 → 설정 이동은 확인했으며, 새 설치부터 두 번 거부하는 전체 순서의 재검증은 하지 않았다.
- 에뮬레이터 OpenGL에서 지도 도형은 나오지만 글자가 누락됐다. [MapLibre 공식 이슈](https://github.com/maplibre/maplibre-native/issues/3648)를 참고해 공식 Expo plugin의 Vulkan 설정으로 변경하고 최종 APK에서 정상 표시를 확인했다.
- Expo 기본 prebuild가 네이티브 폴더를 재생성했고, 재빌드 때 Studio에서 열린 폴더 삭제가 `EBUSY`로 실패했다. 프로젝트 명령에 `--no-clean`을 적용해 빌드를 완료했다. 기존 백업으로 IDE Gradle 설정을 복구하고 로컬 JDK 17·SDK 경로를 복원했으며 재실행 시 파일 보존을 확인했다. 복원 이후 Studio UI의 Sync·Run은 별도 재검증하지 않았다.
- Metro `--localhost`가 IPv6에만 바인딩되어 에뮬레이터의 IPv4 연결이 실패했다. 검증용 서버를 기본 호스트 설정으로 실행해 연결했다.
- MapTiler 스타일의 빈 attribution source 관련 네이티브 경고가 있었지만 최종 지도·지명·현재 위치는 표시됐다. 로고와 출처는 화면에 별도로 제공한다.

## 제한

- 실제 휴대폰 GPS·실외 정확도·배터리는 미검증입니다.
- 대략적 위치·시간 초과·취소·늦은 GPS 구독 정리는 자동 검사로 확인했습니다. 모든 실패 경우의 실제 기기 재현이나 지도 네트워크 장애·재시도 실험까지 완료한 것은 아닙니다.
- iOS·배포용 APK·스토어·CI/CD는 이번 범위가 아닙니다.
- 현재 화면은 핵심 기능 테스트용입니다. 정식 서비스 기획·디자인은 이후 반영합니다.
- 개발용 APK는 Metro가 필요합니다.
