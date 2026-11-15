# PR62 전체43682166854의 첫 회차

[원본 실행](https://github.com/ssw3131/running-art-mobile/actions/runs/43682166854/attempts/1), head1362187, 실제 검사 merge ref0f3b192581fb087793d873e92b5336d1f6bb1b0a. 전체 verification-gate는 실패했다.

- fast: 로직582·기존skip1, UI44묶음241개 등7단계 통과. artifact14149290826.
- API: Schemathesis2경로·pgTAP5·PostgreSQL 정책/보안 probe·실제 Auth/Storage 왕복 통과. artifact14149385520.
- Android29: 7단계·자료 보존·정리 통과. 완료 후 비정상 shell 종료6개는 기존 JUnit 성공/새 토큰/XML·PNG 읽기 조건을 통과한 transport 경고다. 원문을 JSON 배열로 보존했으며 준비 대기4개도 별도다. artifact14149687549.
- Android36: 6단계 통과 뒤 S0-04-save의 이름 편집→탭 왕복→후보 상세 재진입에서 `No fresh UI hierarchy`. 시스템 촬영 이전이며 전체 기능·자료 보존·화면 비교는 미완료다. cleanup은 통과했다. artifact14149508597.

Android36의 원본 실패 PNG와 window/activity/logcat(파일명·SHA256·전체 원문)을 보존했다. 실제 화면은 추천 목록이고 MainActivity는 visible/resumed/focused다. 새로운 계층을20회 관측하는 연결3회가 실패했으며 실패 화면의 UI 캡처도 같은 이유로 실패했다. 독립 PNG/window/activity/logcat 수집은 성공했다. logcat800행은06:09:33 이후라06:09:08 전환을 포함하지 못해 근본 원인은 미확정이다. 이를 환경 실패나 제품 성공으로 바꾸지 않는다.

각 report의 단계별 screenshot 파일명 배열만 생략했다. UI 관측 JSONL은 JSON 배열로 변환했다. 화면 준비 단독 통과와 신호 분리는 [별도 근거](../pr62-systemui-diagnostic/README.md)를 따른다. 실패 시 접근성 상태와4000행 logcat을 남기는 관측 보완 뒤 generation 단독 진단을 진행한다.

## 관측 보완 후 generation 단독 통과

[43684697820](https://github.com/ssw3131/running-art-mobile/actions/runs/43684697820), source3ce2ae2b8458e97daa66436eaa8392ef27cc27a2, artifact14150163338. guest gate·코스 생성/후보 이름 편집/탭 복귀/상세 재진입/저장·큰 글씨/키보드의3단계 및 자료 보존·정리가 통과했다. `s2a-name-restored.xml`에서 실제 course-rename-input의 S0_DRAFT 보존도 대조했다. UI dump 준비 대기와 transport 경고 모두0이었다. 촬영 신호16개 모두 첫 표본에서 준비(0.351~0.446초), 모바일 전후 덤프도 저장됐다. generation 모드는 정적 기준 비교를 실행하지 않으므로 차이0 통과로 표시하지 않는다.

이전 UI 계층 실패는 단독에서 재현되지 않았다. 관측 수집 외에 앱 또는 UI 판정/기한을 변경하지 않았으며 원인은 미확정으로 보존한다. 같은 최신 코드의 최종 ready 전체 검증을 진행한다. 관측 보완 전 generation43684454176은 새 후보 실행으로 교체하여 취소됐으며 결과 표본으로 세지 않는다.
