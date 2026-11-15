# PR62 Android16 SystemUI 독립 진단

최초 두 전체 검사 실패는 [원본 근거](../pr62-run43672071317/README.md)에 보존한다. 이번 진단은 화면 준비 문제만 다루며 전체 기능 게이트를 대신하지 않는다.

## 수정 전

- [43678651486](https://github.com/ssw3131/running-art-mobile/actions/runs/43678651486), source `c92ad2b26c46f859333b6ddb4b8556e8bde05840`, visual-only 1회.
- Android36 전용 emulator, 자료 보존·정리·네 화면 차이0 통과. 신호 관측16개 모두 첫 표본에서 준비 완료(0.365~0.520초).
- `before-report.json`, `before-visual-report.json`, `before-systembar-readiness.json`은 artifact `android-36-visual-1`(ID14148155921)에서 가져왔다. report의 단계별 screenshot 파일명 배열만 생략했고 상태·환경·출처는 유지했다. readiness JSONL은 JSON 배열로 보존했다.
- 이전 동일 제품의 전체 검사 두 번은 실패했고 이번 단독은 통과했다. 단독 통과가 기존 실패를 해소하거나 캐시 가설을 직접 입증하지는 않는다.

## 수정 후보와 확인 범위

Android16 AOSP는 demo의 기본 subscription ID1을 사용하며 표시 interactor를 ID별로 재사용한다. repository는 interactor 생성 시 실제/데모 중 선택된다. 실제 SIM과 데모가 같은 ID이면 실제 repository를 계속 참조할 수 있으므로 후보 `bedd6bd`는 API36 데모에 별도 ID999를 지정한다. API29 명령·실제 모뎀 profile4·원본 PNG·8픽셀 관측·12초 준비/정착·기준/마스크/허용오차를 유지한다.

[43679426258](https://github.com/ssw3131/running-art-mobile/actions/runs/43679426258)에서 후보의 visual-only 및 촬영 전후 SystemUI/telephony 상태를 확인 중이다. 앞선 두 실패 실행에는 이 내부 상태 덤프가 없으므로 당시 객체 바인딩까지 확인한 것으로 기록하지 않는다. 소스 근거는 [실행 기록](../../../history/executed-plans/2026-11-15-1212-running-map-explore.md)에 연결했다.

## 첫 후보 진단의 별도 실패

43679426258은 guest gate·원본 보존·visual usage 준비 뒤, 데모를 설정하기 전 `before-demo` 기본 SystemUI dump에서 ADB 연결이 끊겼다. `adbd host-19: connection terminated: write failed`(05:22:02.219), EPIPE와 offline이 남았고 연결은 05:22:02.526에 다시 생성됐다. 신호999 명령이나 화면 비교에 도달하지 않았으므로 후보의 효과를 판정할 수 없다. backend forwarding 제거도 오류여서 전체 cleanup을 성공으로 바꾸지 않는다.

artifact14148471649의 `candidate1-report.json`과 logcat 원문 781행 이후의 `candidate1-adb-excerpt.json`를 보존한다. EPIPE는 연결 끊김의 결과이며 연결 끊김의 근본 원인은 미확정이다. AOSP SystemUIService는 무인자 dump를 CRITICAL로 치환해 필요한 NORMAL 모바일 상태를 누락하므로, 후속은 `DemoModeController`, `MobileConnectionsRepository`, `DemoMobileConnectionLog[999]` 대상만 읽도록 줄인다. 기존 신호 준비/실패 판정은 유지한다.
