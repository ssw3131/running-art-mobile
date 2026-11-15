# PR62 Android36 화면 준비 실패 근거

원본 실행: [Verify43672071317](https://github.com/ssw3131/running-art-mobile/actions/runs/43672071317). 제품 head4d74ccc, 테스트 checkout78d5456(merge ref), 두 회차 동일 소스. GitHub 원본 아티팩트는 android-36-1/14146046613, android-36-2/14146329356이다.

- [1회 보고서](attempt1-report.json): 기능15단계·자료 보존·정리 통과. prepare-visual-home의12초 동안18개 표본에서 fullSignal=false. [관측](attempt1-systembar.json)·[마지막 원본 PNG](attempt1-systembar.png).
- [2회 보고서](attempt2-report.json): 기능15단계·자료 보존·정리 통과. 홈/러닝/보관함 촬영 준비 후 prepare-visual-account에서18개 표본 fullSignal=false, 남은0.06045초의 screencap 호출이 시간 초과. [관측](attempt2-systembar.json)·[마지막 원본 PNG](attempt2-systembar.png).

보고서는 단계별 screenshots 파일명 목록만 생략하고 원본 값·실패·보존 결과를 유지했다. PNG는 원본 바이트 그대로다. 관측 JSON의 파일명은 원본 아티팩트 안의 경로다. 표본은 격리 QA 계정/공개 fixture이며 사용자 휴대폰 자료가 아니다.

실패 위치는 SystemUI 신호 아이콘 준비이며 앱 기능 회귀 실패로 확인된 것은 아니다. 신호가 준비되지 않은 근본 원인은 미확정이다. 두 회차 모두 전체 게이트 실패이며 통과로 간주하지 않는다. 화면 마스크·기준·허용 오차·시간 제한을 변경하지 않았다. 다음 단계는 독립 visual 진단에서 OS 준비를 재현·해결한 후 필수 전체 검사를 통과시키는 것이다.
