# PR63 최종 원격 검증 근거

- [전체355](https://github.com/ssw3131/running-art-mobile/actions/runs/43702763088): head9682b79, 실제 checkout34f23cc, tree a9051d7dd54e2d19905b71ba211639c4acb7780d.
- [main356](https://github.com/ssw3131/running-art-mobile/actions/runs/43707989113): 제품 main6d4fd6d, 동일 tree의 PR 전체 증거 재사용. main native 재실행으로 보고하지 않는다.
- [검증 요약](verification.json), [전체 성공 영수증](verified.json), [화면 비교 원본](visual-report.json), [main 재사용 원본](main-reuse.json).
- 네 현재 PNG(home/run/archive/account)를 직접 확인했다. 기존 Wi-Fi 마스크 외 차이0이며 마스크/허용오차를 늘리지 않았다. 원본 PNG의 해시는 검증 요약과 비교 원본에 포함한다.
- Android29/36은 첫 회차7/15단계, 자료 보존/정리 통과·재시도0·UI 준비 대기2/8·전송 경고0/0이다. 신호16개는 모두 첫 표본, 최장0.553초다.

검증한 Actions 아티팩트:

| 아티팩트 | ID | SHA-256 |
| --- | --- | --- |
| Android36 | 14158383689 | f2aa8f77d00d17222903efa5a05062540faf5a7873de1fff849eb7b01fac99bc |
| Android29 | 14157901158 | b9780fa14a75743a7b056d507eea899036b9e956968db45201ed6d8af67a4bcd |
| fast | 14156669985 | 100bc65b6e406005ce7a1f8e22d92d5241fda3e633c26e98400cb16846584abd |
| API | 14156669927 | e591c55ceab98fcc6066a2beec6c7ee298c38972a942c2caf1eeea4b6141cca0 |
| 전체 영수증 | 14158162828 | c24ecccdbb1f32207a680ce0d5045713981f8fd2730019a62c46f92dd14dc087 |
| main 재사용 | 14159347148 | 217f7c6d2f9db4a3a0d9bf65863c77b7dcb92be9e3b590f7ecb49c427791d6f1 |

Actions 원본은7일 보관이다. PC의 ZIP/PNG/실패 로그는 Git 제외 `.cache/pr63-pc/`에 보존하며 새 Cloud 작업에 자동 전달되지 않는다. 개인 폰 화면·GPS/주소/계정·토큰·DB는 이 공개 근거에 넣지 않는다.

전체354 취소, 최초 Android29 충돌과1회 재실행, A7 카드 가림 실패 및 수정 재검증, 폰 진행 문구의 관측 실패/오판 폐기와 최종 생성5/5는 [검증 기록](../../nearby-approach-20261115.md)을 따른다. 이 원격 성공을 야외/반복 성능/폰 진행 문구 통과로 확대하지 않는다.
