# 실시간 주황 궤적 갱신 누락

- 기록 생성/실행 시작: 2026-11-12T23:27:04+09:00 (Asia/Seoul)
- 상태: 진행 중
- 기록 유형: 실행 시작 시 계획 작성
- 출처: 사용자가 지도 화면 재진입 전 주황 궤적이 갱신되지 않는 현상 보고

## 실행 전 계획

1. GPS/시뮬레이션 좌표부터 native GeoJSON 갱신까지 조사한다.
2. 동일 지도/코스/trace 배열에 좌표가 추가되는 실제 시뮬레이션을 회귀 검사로 재현한다. 배열 참조만 비교하는 캐시를 제거하고 native 전달 도형은 독립 좌표 복사본으로 만든다. 지도/카메라 remount·GPS 필터/공백/완주 판정은 바꾸지 않는다.
3. 관련 검사와 변경 검토 후 기존 PR59에 추가한다. main 미병합을 유지하고 검증된 서명 APK를 폰에 자료 유지 설치한다. 로컬 에뮬레이터는 실행하지 않는다.

## 결과·검증

진행 중. 기존 단위 검사는 trace 배열을 새 객체로 교체해 시뮬레이션의 같은 배열 내부 append를 놓쳤다. 실제 GPS 기록은 새 배열을 쓰므로 이 조사만으로 야외 GPS 증상의 모든 원인이 확정된 것은 아니다.

## 재현 및 수정

- 실제 createRunningSimulation은 loop-engine.snapshot의 같은 trace 배열에 append한다. 안정된 course.route/trace를 전달하는 검사에서 수정 전 native GeoJSON이 첫 Point에 고정되어 실패했다(기존4개는 통과).
- 참조 기반 useMemo를 제거하고 routeTrailData가 독립 좌표를 생성한다. Map/Camera/source ID와 색/굵기/순서 유지.
- 관련 UI13개·타입/린트 통과. 이전 LineString에 다음 engine.update가 영향을 주지 않는 불변 검사도 추가해 재검사한다.

## 2026-11-12T23:35:16+09:00 PR/빌드

- 수정49ff3d0e23ba8ac3481b7160056310fb7bc01396/tree c3a3fd772224f2379adfefc3fa1dd7de16f1c472를 같은 PR59에 추가했다. main 미병합/draft 유지.
- 관련 UI13개(실제 엔진 same trace→첫 점에서 선→연속 이동/이전 전송 자료 불변)·타입/린트·변경 검토 통과. Verify266/43237849670 scope/fast/development-feedback 성공, API/Android draft skip.
- Handset42/43238017199 source_ref49ff3d0 preview 빌드 진행. SM-A102N 연결 및 실제 위치 기록 서비스 없음 확인. 기존216654479 설치본이므로 수정 적용은 새 APK 설치 후 완료다.

## 2026-11-12T23:36:26+09:00 사용자 환경 확인

사용자가 해당 현상은 실제 야외 GPS가 아닌 **러닝 시뮬레이션**에서 발생했다고 확인했다. 실제 엔진 trace의 같은 배열 내부 append/useMemo 누락으로 재현한 원인과 일치한다.

## 폰 수정 전 재현

현재 설치216654479에서 기존3km 저장 코스로 동일 화면을 유지한 채 시뮬레이션2.5/6.5초 캡처했다. 실제 이동거리0.50km가 표시되는데 주황 궤적은 없다. 기존 중앙지도 색상 분석의 frame2 결과 파랑3626/주황0픽셀, 주황 필수 검사 실패로 원본 증상을 확인했다(도구의 GPS 문구와 달리 이번 입력은 시뮬레이션이다). 완주/종료 저장 전에 앱을 중지하고 다시 열었으며, ID 생성만 SELECT이고 저장은 완주/명시적 종료에만 발생하는 코드 경로를 확인했다. 실제 GPS 서비스는 시작하지 않았다. 원본 사적 지도 캡처는 Git 제외 build/live-trail-refresh-20261112/before에만 보관한다.

## 2026-11-12T23:56:09+09:00 첫 설치 미해결 및 후속 범위

- Handset42 source49ff3d0/preview216657197을23:46:42 자료 유지 설치, 실제 base.apk SHA256 b079d631cf9f29a2dec3311c03fe8dd6c12dc7c327d45127b4ce37f7b495253b 대조 및 기존 UID/최초 설치 유지 확인. ZIP d7f01039a04f73a8ea5f28c1e4f8d068bbc5f09ec517878bd1be827bf9596d9a/artifact13954720678.
- 같은 폰·코스·2.5/6.5초 moving 캡처에서도 파랑2041/주황0픽셀. 일시정지 후2초에서도 주황선 없음. 단위 데이터 수정 통과가 실제 native 렌더 성공을 뜻하지 않으며 첫 수정만으로 미해결이다. 원본 after/after-pause 이미지와 보고서를 보존한다.
- 후속은 정적 파랑 코스와 동적 주황 궤적을 분리한다. 전체 Map/Camera는 유지하고250ms 주기 최신 궤적 overlay만 새 source/layer ID로 바인딩해 Android의 오래된 source 참조/도형 갱신 경로를 우회한다. 단순 debounce를 쓰면10Hz 입력이 그림을 계속 미루므로 throttle+trailing 최신 샘플을 보장한다. 최초 계획의 source ID 보존은 이 native 미해결 근거 때문에 overlay에 한해 변경한다.
- 전체 지도/배경/카메라 재마운트·GPS·필터·공백/완주 판정은 여전히 유지한다. 후속 native 폰 검증 전 완료로 기록하지 않는다.

## 2026-11-13T00:03:21+09:00 Android 보완 빌드43

source609b5a895d411c4047370c1fa1d882b15791087f/tree7711104789c0f8940d0ebc0cf22b07b9865ed8fd를 같은 PR59에 추가했다. Handset43/43242657721 preview 실행, 전체 UI42 suite225개·타입/린트·변경 검토 및 Verify267/43242571739 scope/fast/development-feedback 통과. API/Android는 draft 정책 skip. 최초 native 실패42는 유지하고43 actual phone positive 확인이 남는다.

## 2026-11-13T07:08:05+09:00 build43 검증·추가 설치

- Handset43/artifact13955524012, ZIP SHA256 6cea62e0b7eb102bde8547bed39d3056e2979ffc1e0319501d57f8e57b74311d를 대조했다. source609b5a8/preview216658800/APK SHA256 bbef7fd1400a14e8732f6453b47b0af6c6f8dc9116507fdb2e238d68241eb0d1, 동일 앱ID/3cf9…서명/OpenGL/ARMv7·64를 독립 검증했다.
- 추가 설치 전 ADB 확인은 자동 승인 검토의 사용량 제한으로 한 차례 미실행이었다. 사용자 계속 요청 후 동일 require_escalated 검토에서 정상 승인됐고, 실제 위치 서비스 없음을 다시 확인해 자료 유지 설치를 시작했다. 우회는 하지 않았다.

## 2026-11-13T07:14:24+09:00 build43 실패·배포 최적화 재현

- Handset43 source609b5a8/preview216658800을2026-11-13 07:07:48 자료 유지 설치하고 APK SHA256 bbef7fd1400a14e8732f6453b47b0af6c6f8dc9116507fdb2e238d68241eb0d1 및 UID/최초 설치 보존을 대조했다. 같은 시뮬레이션 frame2 파랑4030/주황0, 여전히 미해결이며 final 캡처를 보존했다.
- app.json experiments.reactCompiler=true를 확인했다. 개발용 Jest는 컴파일하지 않아 단위14개가 통과했지만 배포 빌드는 GuidanceMap의 RouteTrailLayers JSX 자체를 route/trace 참조로 캐시했다. 내부 갱신/overlay 재생성도 부모가 갱신을 생략하면 실행되지 않는다. SDK 내부 문제라는 앞선 가설은 입증되지 않았으며 철회한다.
- 실제 babel-preset-expo의 Android/Hermes/production/ReactCompiler 설정으로 GuidanceMap을 컴파일해 RNTL에서 같은 실제 엔진을 실행했다. 이 검사만 수정 전 Point 고정으로 실패하고 기존6개는 통과했다.
- loop/legacy 엔진이 공개한 trace 배열을 push/splice로 수정하지 않고, 좌표 추가/공백마다 새 배열을 만드는 copy-on-write로 보완한다. 이전 snapshot은 엔진 다음 입력으로 바뀌지 않는다. 배포 최적화에서도 trace 변경이 감지된다. 지도는 기존 단일 source와 고정 ID로 복귀해 임시250ms overlay 교체를 제거했다. 전체 지도/카메라/기록/필터/완주 판정은 유지한다.
- 배포 컴파일 회귀 포함 관련 UI14개·타입/린트 통과. 엔진/완주 기록 회귀도 실행했다. 최종 추가 빌드·폰 확인이 남으며 완료로 처리하지 않는다.
