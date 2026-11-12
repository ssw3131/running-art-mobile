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
