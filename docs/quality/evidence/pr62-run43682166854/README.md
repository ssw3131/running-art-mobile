# PR62 전체43682166854의 첫 회차

[원본 실행](https://github.com/ssw3131/running-art-mobile/actions/runs/43682166854/attempts/1), head1362187, 실제 검사 merge ref0f3b192581fb087793d873e92b5336d1f6bb1b0a. 전체 verification-gate는 실패했다.

- fast: 로직582·기존skip1, UI44묶음241개 등7단계 통과. artifact14149290826.
- API: Schemathesis2경로·pgTAP5·PostgreSQL 정책/보안 probe·실제 Auth/Storage 왕복 통과. artifact14149385520.
- Android29: 7단계·자료 보존·정리 통과. 완료 후 비정상 shell 종료6개는 기존 JUnit 성공/새 토큰/XML·PNG 읽기 조건을 통과한 transport 경고다. 원문을 JSON 배열로 보존했으며 준비 대기4개도 별도다. artifact14149687549.
- Android36: 6단계 통과 뒤 S0-04-save의 이름 편집→탭 왕복→후보 상세 재진입에서 `No fresh UI hierarchy`. 시스템 촬영 이전이며 전체 기능·자료 보존·화면 비교는 미완료다. cleanup은 통과했다. artifact14149508597.

Android36의 원본 실패 PNG와 window/activity/logcat(파일명·SHA256·전체 원문)을 보존했다. 실제 화면은 추천 목록이고 MainActivity는 visible/resumed/focused다. 새로운 계층을20회 관측하는 연결3회가 실패했으며 실패 화면의 UI 캡처도 같은 이유로 실패했다. 독립 PNG/window/activity/logcat 수집은 성공했다. logcat800행은06:09:33 이후라06:09:08 전환을 포함하지 못해 근본 원인은 미확정이다. 이를 환경 실패나 제품 성공으로 바꾸지 않는다.

각 report의 단계별 screenshot 파일명 배열만 생략했다. UI 관측 JSONL은 JSON 배열로 변환했다. 화면 준비 단독 통과와 신호 분리는 [별도 근거](../pr62-systemui-diagnostic/README.md)를 따른다. 실패 시 접근성 상태와4000행 logcat을 남기는 관측 보완 뒤 generation 단독 진단을 진행한다.
