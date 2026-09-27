# SQLite 저장소 테스트

현재는 핵심 기능 테스트용 저장 기반입니다. 테스트 메모만 저장하며 실제 코스·러닝 기록의 데이터 형식은 해당 기능을 구현할 때 정합니다.

## 실행과 사용

`expo-sqlite`를 추가했으므로 기존 지도 전용 APK를 쓰고 있다면 네이티브 앱을 다시 빌드·설치합니다. [Android 개발 안내](android-studio.md)에 따라 Metro를 실행하고 Studio Run을 사용하거나, 프로젝트 루트에서 `powershell -ExecutionPolicy Bypass -File .\dev.ps1 android`를 실행합니다.

1. 홈에서 **저장소 테스트**를 엽니다. DB를 처음 열 때 마이그레이션을 실행하고 준비 상태·저장 목록을 표시합니다.
2. 1~200자 메모를 입력하고 **메모 저장**을 누릅니다. 앞뒤 공백을 제거하며 빈 입력은 저장하지 않습니다.
3. 메모의 **수정**을 눌러 내용을 바꾸고 **수정 저장**을 누릅니다. **수정 취소**는 DB를 변경하지 않습니다.
4. **삭제**를 누르면 확인 창이 열립니다. 취소하면 유지하고, 삭제를 확정하면 해당 메모만 지웁니다.
5. **목록 새로고침**으로 DB를 다시 조회합니다. 화면을 나갔다 돌아올 때도 목록을 조회합니다.
6. Android 설정에서 앱을 강제 종료하고 다시 실행한 뒤 저장소 테스트를 엽니다. 메모와 수정·삭제 결과가 유지되어야 합니다. 개발용 앱은 재실행할 때도 Metro 연결이 필요합니다.

작업 중에는 중복 제출을 막습니다. 저장·수정·삭제 성공은 실제 DB 작업 완료 후 표시합니다. 작업 실패 시 입력 내용을 유지하고 재시도할 수 있습니다. 쓰기는 완료됐지만 목록 조회가 실패했다면 완료 사실과 새로고침 필요성을 구분해 안내합니다. 초기화 오류가 있어도 홈·지도는 사용할 수 있습니다. 웹에서는 Android 앱 사용 안내만 표시합니다.

## DB가 남는 위치

DB 이름은 `running-art.db`, 위치는 Expo SQLite의 앱 전용 기본 디렉터리입니다. 확인한 Android 개발 앱 경로는 다음과 같습니다.

```text
/data/user/0/com.runningart.mobile.dev/files/SQLite/running-art.db
```

실제 휴대폰에서는 그 휴대폰에, 에뮬레이터에서는 해당 가상 기기의 내부 저장소에 남습니다. 앱 종료·재시작으로 지워지지 않습니다. 앱 데이터 삭제·앱 제거는 로컬 DB를 지웁니다. 서버 전송·다른 기기 동기화·앱 자체 백업 기능은 없습니다.

WAL 모드이므로 실행 중에는 `running-art.db-wal`·`running-art.db-shm` 파일이 함께 있을 수 있습니다. 로컬 검증용 복사본과 스크린샷은 Git에서 제외된 `.cache/sqlite-qa/`에 둡니다.

## 모듈과 마이그레이션

- `src/modules/storage/database.ts`: 필요할 때 네이티브 모듈을 불러오고 DB를 엽니다. `client.ts`는 동시 초기화 요청을 하나로 합치고, 실패한 연결을 닫아 재시도를 허용합니다.
- `migrations.ts`: `PRAGMA user_version`으로 버전을 관리합니다. 현재 버전은 **1**이며 `storage_test_notes` 테이블을 생성합니다. `id`, `content`, `created_at`, `updated_at`을 저장하고 시각은 Unix 밀리초입니다.
- 이미 적용한 마이그레이션은 수정하지 않고 배열 끝에 새 SQL을 추가합니다. 미적용 변경과 버전 갱신을 하나의 배타적 트랜잭션에서 처리해 실패 시 함께 롤백합니다. 더 높은 버전의 DB는 삭제·다운그레이드하지 않고 앱 업데이트 안내를 표시합니다.
- `test-notes.ts`: 테스트 메모의 `list`, `create`, `update`, `remove` API입니다. SQL 값 바인딩, 입력 검증, 존재하지 않는 ID 처리를 포함합니다. UI와 Expo에 직접 의존하지 않습니다.

라이브러리 사용 기준은 [Expo SDK 57 SQLite 공식 문서](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)와 설치된 `expo-sqlite ~57.0.3` 소스입니다.

## 검증 명령

```powershell
. .\scripts\env.ps1
npm.cmd run test:storage
npm.cmd test
npm.cmd run check
npm.cmd run doctor
npm.cmd run export:android
```

저장소 자동 테스트는 Node 내장 SQLite에 실제 운영 SQL을 실행합니다. 초기화·업그레이드·실패 롤백·미래 버전 보호·CRUD·입력 검증·재열기·연결 재시도를 검사합니다. Node와 Expo의 반환값 차이는 테스트 어댑터에서 변환합니다. `.ts` 모듈을 Node에서 직접 검사하도록 `allowImportingTsExtensions`를 사용하며 앱 타입 검사는 기존처럼 `noEmit`입니다.

네이티브 브리지와 Android 프로세스 재시작은 자동 SQL 테스트와 별도로 확인합니다. 실제 결과는 [저장소 검증 기록](../quality/storage-verification.md)에 남깁니다.
