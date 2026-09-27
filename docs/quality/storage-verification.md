# SQLite 저장 기반 검증 기록

날짜: 2026-09-26 (Asia/Seoul). 상태: 구현·Android 에뮬레이터 검증 완료.

## 코드·빌드 검사

| 항목 | 명령·방법 | 결과 |
| --- | --- | --- |
| 저장소·기존 기능 테스트 | `npm test` | 29/29 통과: 저장소 12개, 기존 위치·지도 설정 17개 |
| 타입·린트 | `npm run check` (`dev.ps1 check`와 동일 스크립트) | TypeScript·ESLint 통과 |
| Expo 진단 | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 doctor` | 21/21 통과 |
| Android JS 번들 | `npm run export:android` | 통과. Hermes 번들·자산을 `dist/`에 출력 |
| Android APK | `powershell -ExecutionPolicy Bypass -File .\dev.ps1 build` | 성공, 1분 51초, 674 tasks 중 57개 실행 |
| APK 서명 | SDK `apksigner verify --verbose` | APK Signature Scheme v2 검증 통과 |
| Android DB 실물 | 앱 종료 후 DB·WAL을 로컬로 읽어 Node SQLite에서 확인 | `user_version = 1`, `integrity_check = ok`, 수정된 메모 1개·삭제한 메모 없음 |

APK: `android/app/build/outputs/apk/debug/app-debug.apk` (ARM64·x86_64, Metro가 필요한 개발용).

SHA-256: `B13030F58A64881D0D725FBEA8721A02B657CAE241D973C3045FF1A61612A553`

저장소 테스트는 프로덕션 모듈의 SQL을 실제 Node SQLite에 실행합니다. 새 DB 초기화·중복 초기화·추가 마이그레이션 순서·실패 시 스키마/데이터/버전 롤백·수정 후 재시도·미래 버전 거부·값 바인딩·대상 행만 수정/삭제·입력/ID 검증·DB 제약·파일 재열기·동시 초기화·연결 실패 재시도·쓰기 실패 전파를 확인했습니다. Expo 네이티브 브리지는 아래 기기 검사로 별도 확인했습니다.

## Android 화면과 프로세스 재시작

환경: 기존 Pixel 7 AVD (`emulator-5554`), Android 16, 1080×2400. APK를 `adb install -r`로 업데이트 설치했습니다. 별도 Metro **8083**과 ADB reverse를 사용했으며 기존 8081·8082 서버는 유지했습니다.

| 시나리오 | 실제 결과 |
| --- | --- |
| 홈 → 저장소 테스트 | DB 준비 완료, 빈 목록 0개 표시, 앱 전용 DB·WAL·SHM 생성 |
| 빈 내용 저장 | 1~200자 입력 안내, 데이터 추가 없음 |
| 메모 생성·조회 | ID 1 생성, 저장 성공 안내와 저장 목록 확인 |
| 메모 수정 | `sqlite-pers-updated`로 수정, 생성 시각 유지·수정 시각 증가 |
| 강제 종료·재실행 | PID 12031 종료·프로세스 없음 확인 후 PID 12739로 재실행, ID 1의 수정된 내용 복원 |
| 두 번째 메모 저장 | `delete-me` 추가, 목록 2개 확인 |
| 삭제 취소 | 확인 창에서 취소 후 메모 2개 유지 |
| 삭제 확정 | ID 2만 삭제, ID 1과 수정 내용 유지 |
| 삭제 후 재실행 | 다시 강제 종료·재실행, ID 1만 복원되고 삭제한 ID 2는 없음 |
| 기존 지도·현재 위치 | 지도·지명·출처 표시 확인. 서울시청 부근 모의 GPS 입력 후 현재 위치 성공·정확도 약 5m·파란 점 표시 |

실물 DB의 확인 경로는 `/data/user/0/com.runningart.mobile.dev/files/SQLite/running-art.db`입니다. 앱 종료 상태에서 DB와 WAL을 함께 로컬에 읽었으며 원본 DB는 수정하지 않았습니다. 확인 결과는 버전 1, 무결성 정상, ID 1의 내용 `sqlite-pers-updated`, `updated_at > created_at`입니다. 테스트 메모 1개를 에뮬레이터에 남겼습니다.

로컬 증거는 Git 제외 경로 `.cache/sqlite-qa/`에 있습니다.

- `01-empty.png`, `05-created.png`, `14-updated.png`: 초기화·생성·수정 화면.
- `16-restored.png`, `restart.json`: 새 Android 프로세스에서 수정 데이터 복원과 PID 증거.
- `23-deleted.png`, `25-deletion-persisted.png`: 삭제와 재실행 후 보존 상태.
- `29-map-location.png`: 기존 지도·모의 GPS 회귀 확인.
- 단계별 XML: 실제 UI 텍스트·버튼·목록 확인. `device-state.json`: 실물 DB 버전·무결성·행 조회 결과.
- `.cache/sqlite-android-build.log`: 네이티브 빌드 출력. `.cache/sqlite-metro-*.log`: 검증용 Metro 출력.

## 검증 중 발견한 사항

- 첫 타입 검사에서 Node 직접 실행용 `.ts` import가 설정과 맞지 않았습니다. `allowImportingTsExtensions`를 명시해 `noEmit` 타입 검사와 Node 직접 테스트를 함께 지원하도록 수정했습니다.
- Node SQLite의 `lastInsertRowid`와 Expo의 `lastInsertRowId` 이름 차이를 테스트 어댑터에서 변환한 뒤 실제 CRUD 검사 전체가 통과했습니다.
- Android 키보드의 스타일러스 첫 사용 안내가 입력을 가로채 초기 자동 입력이 일부만 반영됐습니다. 스크린샷으로 원인을 확인하고 안내를 닫은 뒤 수정·새 메모 입력과 저장을 다시 검증했습니다. 앱 입력 코드를 우회하거나 DB에 직접 테스트 데이터를 삽입하지 않았습니다.
- 최초 Metro 연결은 준비 전에 열려 로딩 오류가 났습니다. `/status` 응답 확인 후 재실행해 정상 연결했습니다. Metro의 오래된 직렬화 캐시는 자동 재수집되었고 최종 번들·앱 실행이 통과했습니다.

## 검증 범위

실제 휴대폰·iOS·배포용 빌드·Studio UI Sync/Run의 재검증은 수행하지 않았습니다. 화면 잠금·백그라운드 GPS·배터리는 이번 저장 기반 작업의 범위가 아닙니다. 기존 권한 거부·설정 이동의 전체 기기 시나리오는 이전 [지도 검증](map-location-verification.md)에 있으며 이번에는 자동 회귀와 지도·모의 GPS 표시를 확인했습니다.

UI에서의 디스크 부족·DB 손상 재현은 하지 않았습니다. 실패 전파·초기화 재시도와 마이그레이션 롤백은 자동 테스트로 확인했습니다. 현재 데이터는 테스트 메모이고, 실제 코스·러닝 기록 저장과 서버 동기화는 구현하지 않았습니다. CI/CD·알고리즘 이식은 보류 범위를 유지했습니다.
