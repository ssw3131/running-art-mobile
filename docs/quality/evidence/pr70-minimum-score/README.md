# PR70 검증 근거

- 전체 실행: https://github.com/ssw3131/running-art-mobile/actions/runs/43878480608 (최종 attempt2 성공)
- head29ecabd / PR merge checkout7f8b058 / 검증 treebbdc194fe1a7cf6966edb66e7053c7dca7c2b09a.
- Android36 artifact14233814472: 기능15단계·자료 보존/정리·네 화면 차이0, 도우미 준비 대기10건/완료 덤프 전송 경고0건. `recommendation.png`의 추천 설명·선택 상태·합류/코스 거리 배치를 직접 확인했다. 빈 결과/먼 대안 문구는 별도 UI 회귀로 검증했다.
- Android29 최초 artifact14232791000: 게스트/회원 확인 후 Maestro 첫 흐름의 deviceInfo에서 실패. 기기 로그에 grpcServer 포트46251 bind 실패/Address already in use가 있어 검사 도구 포트 충돌로 분류한다. 자료 보존/정리 통과. 연결을 점유한 프로세스는 확정하지 않았다.
- Android29 재실행 artifact14235409343: 같은 소스에서 해당 job만1회 재실행,7단계/자료 보존·정리 통과, 준비 대기3건/전송 경고0건. 앱·검사 코드/기한/화면 기준 변경 없음.
- 최초 전체가 실행 중일 때 job 재실행 요청은 GitHub403(already running)으로 거절됐다. 전체 종료 후 재요청이 실제 attempt2이며, 거절된 요청을 별도 검사 실행으로 세지 않는다.
- draft43877733196은 후속 커밋으로 취소, draft43878111061은 ready 전환으로 fast 취소/development-feedback 실패 이력을 남겼다. 이를 최종 ready 검사 실패와 혼동하지 않는다.
- main9dcd638 실행43890837738은 동일 tree의 PR 성공 증거를 재사용해 통과했다. main에서 Android를 새로 실행한 것은 아니다.

원본 압축파일/로그는 `.cache/nearby-ci` 및 Actions 아티팩트에 보존했다. 여기에는 공개 고정 입력·격리 시험 결과만 포함하며 사용자 폰/계정/실제 GPS 자료는 없다. 운영 서버 배포와 휴대폰 설치는 수행하지 않았다.
