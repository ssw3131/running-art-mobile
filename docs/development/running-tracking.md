# 실제 러닝 GPS 추적·기록

Android 설치 앱의 **러닝 GPS 기록**에서 실제 위치 수신을 시작한다. 핵심 기능 테스트용 화면이며 최종 서비스 디자인은 후속이다. 검증 결과는 [러닝 검증](../quality/running-tracking-verification.md)에 기록한다.

## 사용 흐름

1. 홈 → 러닝 GPS 기록 → 러닝 시작 → 위치 사용 안내의 계속을 누른다.
2. 정확한 위치·알림·위치 항상 허용 권한을 허용한다. 기기 위치 기능이 켜져 있어야 한다. 권한을 거부하면 이유와 앱 설정 이동을 제공하며 새 러닝을 만들지 않는다.
3. GPS 수신 후 궤적·거리·활동 시간·평균 페이스를 표시한다. 하늘이 열린 곳에서 사용하며 신호가 없으면 대기 안내를 확인한다.
4. 일시정지하면 시간과 좌표 기록을 멈춘다. 재개하면 새 구간으로 이어 기록한다. 잠금 화면·다른 화면·다른 앱으로 이동해도 실행 중인 Android 위치 서비스가 수신한다.
5. 러닝 종료·저장 → 종료·저장으로 완료한다. 취소하면 러닝을 계속한다. 종료된 기록은 러닝 기록 목록에서 다시 열거나 삭제할 수 있다.

자유 러닝의 GPS 기록·기본 궤적 표시는 인터넷과 지도 타일을 사용하지 않는다. 2026-10-03 후속으로 저장 코스→출발 준비→지도/집중·방향/이탈/복귀 안내→완주 확인을 연결했다. [코스 생성·GPS 안내](course-gps-guidance.md)의 흐름과 SQLite v5 계약을 따른다. 로그인·개인 자료 동기화도 후속 구현했다. [동기화 사용법](personal-sync.md)을 참고한다. 모의 시험은 실제 GPS 러닝과 별개이며 러닝 GPX 내보내기는 후속이다.

## 시간·거리·수신 기준

- 활동 시간은 시작/재개부터 일시정지/종료까지다. GPS 신호 대기 시간은 포함하고 일시정지 시간은 제외한다. 평균 페이스는 활동 시간/누적 거리이며 10m 미만은 `—`로 표시한다.
- 좌표는 수신 시각·위경도·정확도와 구간 번호를 보존한다. 거리 계산은 같은 구간의 허용된 좌표 간 구면 거리다. 정지 중 흔들림은 직전 저장 좌표를 기준으로 3~10m 정확도 기반 문턱으로 억제한다.
- 정확도 50m 초과·좌표 범위/유한성 오류·음수/없는 정확도·60초보다 오래된 위치·5초 넘게 미래인 시각을 제외한다. 같은 시각·순서가 지난 수신과 시작/재개 전 좌표는 반영하지 않는다.
- 같은 구간에서 초당 12m가 넘는 위치 점프는 제외한다. 제외된 위치 뒤, 15초 넘는 GPS 공백 뒤, 일시정지/중단 후 재개는 새 구간의 시작점으로 저장하고 직선 이동을 합산하지 않는다.
- 이 수치는 초기 보수적 처리 기준이다. 실기기 야외 정확도·정지 드리프트·터널/고층 환경의 실측으로 조정해야 한다. 운동 성능이나 GPS 정확도를 보장하는 수치가 아니다.
- 한 기록은 최대 100,000점을 저장한다. 한도 또는 저장 실패에서는 수신을 중단하고 기존에 저장한 기록을 보존한다.

## 저장·중단·복원

사용자 `running-art.db`에 버전 3 마이그레이션을 추가했다. `running_sessions`는 상태·시간·거리·수신 기준, `running_points`는 전체 좌표를 저장한다. 기존 메모·저장 코스와 도로 캐시는 유지한다. 하나의 미완료 세션만 허용한다.

좌표 묶음과 요약을 같은 SQLite 트랜잭션으로 저장한다. 실패하면 묶음 전체를 롤백하고 위치 서비스를 중단한다. 일시정지/종료 상태를 먼저 저장해 늦게 도착한 위치가 기록을 바꾸지 않게 한다. 삭제 시 좌표와 요약을 같은 트랜잭션에서 명시적으로 지운다. Expo 전용 트랜잭션 연결의 foreign key 설정에 의존하지 않는다.

위치 콜백마다 활동 시간을 저장하고 러닝 화면 전경에서는 5초마다 상태·시간을 확인한다. 새 JS 프로세스에서 다시 시작하면 전경/백그라운드 실행 모두 마지막 저장 시점으로 기록을 중단하고 GPS 서비스를 해제한다. **자동으로 추적을 재개하지 않는다.** 사용자가 재개 또는 종료를 선택한다. 앱 강제 종료·OS 프로세스 제거·재부팅 중 이동은 복원할 수 없고 마지막 저장 이후 일부 시간은 제외될 수 있다.

현재 서버 동기화는 없다. 앱 삭제·데이터 초기화 시 로컬 기록도 사라진다. GPS 좌표는 앱 로그나 공용 도로 저장소로 보내지 않는다. 에뮬레이터 검증의 좌표는 명시적인 합성 주입 자료다.

## 코드와 네이티브 구성

- `modules/running/model.ts`: 상태·거리·GPS 판정·표시 단위.
- `repository.ts`: 직렬화한 SQLite 작업·트랜잭션·구간·시간·목록·상세·삭제.
- `controller.ts`: 권한 준비·서비스 시작/정지·실패·프로세스 복원.
- `native-driver.ts`: Expo Location·알림/위치 권한·Android foreground service.
- `task.ts`: 화면 밖 GPS 작업. `index.js`에서 Expo Router보다 먼저 등록한다.
- `app/run.tsx`, `app/runs/`, `features/running/`: 제어·조회·오프라인 궤적. 화면용 좌표는 간격을 줄여 그려도 전체 저장 좌표를 변경하지 않는다.

Expo SDK 57 호환 `expo-task-manager`를 추가했다. `app.json`에서 백그라운드 위치·위치 foreground service·알림·`RECEIVE_BOOT_COMPLETED` 권한을 설정한다. 마지막 권한은 TaskManager의 지속 작업 예약에 필요하며 앱의 자동 러닝 시작을 의미하지 않는다. Android 13 이상은 알림 허용도 확인한다. 네이티브 설정은 `npm run prebuild:android`로 반영한다.

## 검증 명령

```powershell
. .\scripts\env.ps1
npm.cmd run test:running
npm.cmd test
powershell -ExecutionPolicy Bypass -File .\dev.ps1 check
npm.cmd run prebuild:android
```

`scripts/qa/running-emulator.py`는 API 36 `emulator-5556`만 대상으로 UI·합성 GPS 주입·DB 증거를 수집한다. `scenario`는 단계별 상태를 `.cache/running-qa/phase.json`에 저장하며 마지막 통과한 단계 다음을 실행한다. APK 설치·권한 상태 준비 후 사용하고 기존 자료 및 기기 설정 보존 여부는 별도로 대조한다. 실제 휴대폰에 이 도우미를 적용하지 않는다.

화면 초시계 때문에 일반 `uiautomator dump`는 idle 대기에서 실패할 수 있다. `powershell -File scripts/qa/build-running-ui.ps1`로 `RunningUiDump.java`를 빌드하고 생성한 `.cache/running-qa/ui-dump.jar`를 에뮬레이터의 `/data/local/tmp/running-ui-dump.jar`로 복사한다. 도우미는 Android 기본 UIAutomator의 대기 시간을 0으로 설정해 현재 화면을 읽고 실제 수행 성공을 확인한다. 앱의 테스트 전용 GPS 주입/조작 API는 추가하지 않는다.

`pretypecheck`는 설치된 Expo 공식 생성기로 `.expo/types/router.d.ts`를 현재 화면에서 재생성한다. Windows watcher가 새 파일 경로 구분자를 잘못 저장한 경우에도 현재 경로로 타입 검사를 수행한다.

참고: [Expo Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/) · [TaskManager](https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/). 휴대폰 야외 수신·장시간 잠금·배터리·제조사 절전·iOS 검증은 후속이다.
