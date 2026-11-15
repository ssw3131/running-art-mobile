# PR62 최종 전체43686532773 통과

[PR62](https://github.com/ssw3131/running-art-mobile/pull/62) / [최종 전체](https://github.com/ssw3131/running-art-mobile/actions/runs/43686532773).

- head: f55bd80831258a06a08f9666210249973b40ce1c
- 실제 검사 merge ref: 5706f8da57b2afd2d9ea3912db66d20dd79f3f8e
- 검증 tree: 8fc7c3f5e0fd48f0086a55804329f54a15e90533
- main squash: 3fa67ce1585306512db8ddace968854789d133d8. 로컬 Git에서 동일 tree를 확인했다.

fast7단계(로직582·기존skip1/UI44묶음241개), Schemathesis2경로·pgTAP5·PostgreSQL 정책/보안 probe·Auth/Storage 왕복, Android29 7단계·Android36 15단계, 네 화면 차이0, 원본 자료 보존·정리 및 verification-gate가 통과했다.

Android36 신호16개는 첫 표본에서 모두 준비됐다(0.432~0.504초). 실제 SIM1 repository와 데모999의 primaryLevel/icon.level4 분리를 OS 덤프에서도 확인했다. Android36 UI dump 준비 대기5개·transport 경고0, Android29 준비 대기2개·완료 후 transport 경고2개를 별도 보존한다. Android29 두 경고는 기존 JUnit 성공·새 토큰·XML/PNG 실제 읽기 조건을 만족했고 기준을 바꾸지 않았다.

artifact 출처: fast `14150593339`, API `14150362425`, Android29 `14150668766`, Android36 `14151463829`, 검증 증명 `14151224907`. report의 단계별 screenshot 파일명 배열만 생략했고 상태·출처·환경·검증/정리 결과는 유지했다. JSONL은 배열로, OS 덤프는 파일명/SHA256/전체 본문을 JSON으로 보존했다. `verified.json`은 원본 검증 증명이다.

같은 head의 draft43686527570은 ready 전환으로 취소됐다. 이 실행의 비필수 development-feedback/취소된 matrix 표시를 최신 ready43686532773의 필수 verification-gate와 구분한다. GitHub의 mergeable_state=clean과 필수 게이트 성공을 확인한 뒤 병합했다.

[최초 상태바 실패](../pr62-run43672071317/README.md), [독립 신호 진단/별도 ADB 실패](../pr62-systemui-diagnostic/README.md), [이전 전체 UI 계층 실패와 generation 단독 통과](../pr62-run43682166854/README.md)를 보존한다. UI 계층 실패는 최신 단독/전체에서 미재현이며 근본 원인은 미확정이다. 새로운 휴대폰 설치·실기기 제스처·야외 GPS/장시간 검증·운영 배포는 수행하지 않았다.

## main 확인

[main43689889237](https://github.com/ssw3131/running-art-mobile/actions/runs/43689889237)의 scope/verification-gate가 통과했다. `main-reuse.json`(artifact14151548969)은 PR62/run43686532773/attempt1의 동일 tree 전체 성공 증거를 재사용했음을 기록한다. main에서 native를 다시 실행했다고 표시하지 않는다. 완료 기능 로컬 브랜치를 tree 일치 확인 후 정리했고, 진단용 임시 원격 브랜치도 제거했다. 임시 worktree는 없다.
