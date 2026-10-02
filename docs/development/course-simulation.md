# 저장 코스 시뮬레이션

저장한 코스 상세에서 **코스 시뮬레이션 시작**을 누른다. 파란 점은 저장된 좌표를 따라 이동하는 가상 위치다. 실제 위치·러닝 기록과 구분하며 GPS 권한·인터넷·도로 다운로드·재계산·Supabase를 사용하지 않는다. 시작 시 온라인 배경 지도를 끄고 앱 내부 기본 경로 화면으로 전환한다.

- **재생 / 일시정지:** 현재 위치에서 이어 재생하거나 멈춘다.
- **처음부터 · 일시정지:** 출발점·거리 0·진행률 0으로 돌아간다. 선택한 속도는 유지하고 재생 버튼으로 다시 시작한다.
- **1·5·10·30배:** 재생 중에도 바꿀 수 있다. 기준 속도는 6분/km이며 가속 배율은 실제 러닝 속도가 아니다.
- **이동 / 전체 거리·진행률:** 저장 경로 좌표로 계산한 거리다. 엔진이 계산 당시 기록한 거리와 조금 다를 수 있다. 도착 시 정확히 100%로 멈춘다.

앱 백그라운드 전환과 화면 포커스 이탈 시 일시정지한다. 앱 전경 복귀만으로 자동 재생하지 않는다. 상세 화면 재진입·자료 다시 읽기·이름 변경·패널 닫기 후 다시 열기에는 새 재생 세션으로 시작한다. 앱 종료 후 시뮬레이션 진행 위치는 저장하지 않는다. 저장 코스 원본·GPX·메모·DB 스키마는 변경하지 않는다.

## 구현

`src/modules/course-simulation/player.ts`는 순수 경로 준비·거리별 위치 보간과 주입된 시계 기반 재생 제어를 담당한다. 구간 누적 거리를 만들고 이진 탐색으로 위치를 찾는다. 중복 좌표·닫힌 코스·경도 경계를 처리하며 20,000점 경로를 줄이지 않는다. 전체 거리가 0이면 재생 오류를 표시한다.

`src/features/courses/SimulationPanel.tsx`는 재생 UI·100ms 표시 갱신·AppState/화면 수명을 담당한다. 시간은 `performance.now()`로 측정해 프레임 횟수에 따라 속도가 달라지지 않는다. 생성·초기 렌더에서는 시계를 읽지 않는다. 지도는 기존 `MapSurface`의 별도 `simulationPosition`을 사용하며 GPS 위치·카메라 추적 로직과 분리한다.

## 검사

```powershell
. .\scripts\env.ps1
node --test tests/course-simulation.test.mjs tests/courses.test.mjs tests/course-gpx.test.mjs tests/map-config.test.mjs
npm.cmd run check
```

실제 검증·미검증은 [시뮬레이션 검증](../quality/course-simulation-verification.md)과 [실행 기록](../history/executed-plans/2026-10-02-1433-course-simulation.md)에 기록한다.
