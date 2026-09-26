# 검증 기준

## 현재 가능한 검증

프로젝트 루트에서 실행합니다. 아래 명령은 구현되어 있습니다.

| 변경 | 확인 방법 | 의미 |
| --- | --- | --- |
| TypeScript·화면 | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 check` | 타입·ESLint |
| 위치·권한·지도 설정 | `npm run test:location` | Node 내장 테스트, 권한 실패·취소·구독 해제·키 설정 회귀 검사 |
| Expo 의존성·설정 | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 doctor` | 호환성 진단, 네트워크 필요 |
| 네이티브 설정·패키지 | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 build` | prebuild·개발용 APK |
| 화면·권한·네이티브 동작 | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 android` | 기기에서 실행 |
| Studio 개발 환경 | [Studio 안내](../development/android-studio.md)의 동기화 → Run → Metro 연결 | CLI 빌드와 별도로 IDE·에뮬레이터 동작 확인 |
| 문서·Codex 지침·스킬 | 링크·경로·명령·TOML/YAML·실행 이력 확인 | 앱 빌드로 문서 정확성을 대신하지 않음 |

`npm run test:location`과 `npm run export:android`는 `scripts/env.ps1`을 현재 셸에 적용한 후 실행할 수 있습니다. 웹 확인은 Android 검증을 대신하지 않습니다. 지도·위치 결과는 [기능 검증 기록](map-location-verification.md)에 있습니다.

현재 Jest·React Native Testing Library·Maestro·GitHub Actions는 없습니다. `test:ci`, `verify`, `android:preview`, `test:e2e`는 [CI/CD 계획](../planning/ci-cd-validation-plan.md)의 예정 명령입니다.

## 기능별 추가 검증

- 알고리즘: 연결성·보행 제한·거리·중복·후보 없음·점수 회귀를 고정 그래프로 검증합니다.
- 도로 데이터: 버전·손상·다운로드 실패·지역 경계·오프라인 캐시를 확인합니다.
- 러닝: 권한 거부·GPS 공백·중단·재개·종료와 실제/가상 기록 구분을 확인합니다.
- 저장: 재시작 복원과 스키마 변경을 확인합니다.
- 앱 흐름: 단독 실행 APK에서 설치·시작·이동·뒤로 가기·재시작을 확인합니다.

공개 Overpass·지도 서비스의 실시간 응답을 순수 로직 검사의 필수 조건으로 두지 않습니다. 형식적인 테스트 수보다 사용자 동작과 회귀를 잡는 검증을 우선합니다.

## 실기기와 결과 기록

화면 잠금·백그라운드 위치, GPS 정확도, 배터리, 제조사 절전은 Android 실기기에서 확인합니다. 에뮬레이터 통과만으로 완료 처리하지 않습니다.

검증 결과에는 날짜·기기·OS·명령 또는 동작·통과/실패·미검증 이유를 남깁니다. 과거 기록은 [환경 검증 기록](setup-verification.md)에 보존하며 새 실행 없이 날짜만 갱신하지 않습니다.
