# 현재 결정과 회귀 검사 연결

이 문서는 최근 통합에서 확인한 **변경된 기대 동작**의 출발점이다. 제품 전체 기획이나 실기기 검증 완료 목록은 아니다. 2026-11-09 기준 구현·검증 근거는 [PR50 실행 기록](../history/executed-plans/2026-11-08-2020-pr49-ci.md), 작업 상태는 [현재 상태](../handoff/status.md)를 따른다. 새 사용자 결정이 나오면 해당 행과 관련 검사/문서를 같은 PR에서 갱신한다.

과거 개발 계약에는 그 날짜 당시의 결정과 미병합/미배포 상태가 남아 있다. `course-archive-running.md`의 1~10km·유사도 미표시, `course-generation-figma-20261024.md`의 제한 없음, `account-mypage.md`의 화면 꺼짐 설정 등 과거 문구를 그대로 최신 테스트 정답으로 삼지 않는다. 최신 명시적 사용자 결정과 변경 근거를 먼저 확인하고, 충돌이 해소되지 않으면 기대 동작을 확정한다. Figma 예시 숫자를 실제 기록·잔량으로 복사하지 않는다.

| 분야 | 현재 확인한 기대 동작·보존 조건 | 관련 회귀와 진단 |
| --- | --- | --- |
| 홈 → 코스 생성 | 항상 조건 설정을 연다. 현재 입력과 이전 추천 결과는 보존하고 결과 보기로 돌아간다. 새 생성 확정 전에는 재계산하지 않는다. 일반 탭 이동의 화면 보존과 홈 CTA를 구분한다. 임시 추천 결과를 앱 종료 후 영구 보존한다고 가정하지 않는다. | `generation-home-entry`, `home`, `open-service-tab`; home 진단 |
| 생성 조건·확인 | 거리1~10km 슬라이더/11~20km 입력, 폼 아래 스크롤 생성 버튼. 주소 조회값/상태는 폼과 확인창에서 일치해야 하고 조회 실패가 선택 좌표를 바꾸면 안 된다. 확인 취소·스크롤·그리기 취소 후 좌표를 보존한다. | `generation-distance`, `course-generation`, `course-location-picker`, `point-address`; generation/accessibility 진단 |
| 러닝 준비·잠금 | 저장 코스를 선택해 준비한다. 준비 취소와 종료 복귀를 구분한다. 현재 러닝의 잠금 해제 저장과 다음 러닝의 계정 기본값은 별개다. 기존 종료 기록·새 재도전 ID·자료 보존을 검사한다. | `running-chooser`, `running-preparation`, `live-running`, `run-settings`; service 진단 |
| 배경 기록 | 제거된 화면 꺼짐 기록 옵션을 다시 만들지 않는다. 실제 러닝의 배경 기록과 시뮬레이션의 배경 일시정지 동작을 구분한다. 권한 안내와 실제 야외/배터리 검증 여부도 구분한다. | `run-settings`, `live-running`, 러닝 로직 회귀; service 진단 |
| 배지·이미지 공유 | 실제 배지 자산과 표시 완료/실패/재시도를 확인한다. 9:16·4:5 PNG의 규격, 공유/저장한 바이트, 계정 변경 시 차단을 보존한다. 스크롤 아래 옵션·저장 버튼은 실제로 찾는다. | `achievements`, `share-card-readiness`, `run-card-export`, `achievement-image`; achievements 진단 |
| 화면 기준 | 의도된 변경은 현재 기획·사용자 결정과 기준/현재/차이를 직접 대조한다. 원본 PNG·환경·정착·검토 출처를 함께 남긴다. 마스크/허용 오차 확대나 예시 수치 삽입으로 통과시키지 않는다. | `tests/visual/android-linux-api36/baseline.json`; visual 후보 검토 + 최종 전체 CI |

위 UI 회귀 이름은 `tests/components/<이름>.test.tsx`를 뜻한다. `qa:plan`은 관련 파일 경로를 출력한다. 진단 선택은 [검증 운영](verification-ci.md)의 범위대로 사용하며 전체 게이트를 대신하지 않는다.

## 기획 변경을 남기는 최소 단위

- 결정 일시와 근거: 사용자 결정/기획 링크 및 이전 어느 동작을 대체하는지.
- 변경 전 → 변경 후 사용자 흐름과 그대로 보존할 자료·설정·실패 복구 조건.
- 수정한 UI/로직/네이티브 검사, 변경이 필요 없는 검사는 그 이유.
- 화면 변경이면 원본/기준/차이 검토와 출처. 운영 API·자료 형식 변경이면 별도 영향 범위.
- 실행한 검사의 실제 범위와 결과, 미검증 사항. 코드 구현·CI·폰 설치·운영 배포를 각각 구분.

관련 세부 문서는 날짜별 근거로 읽는다: [생성 상태 수명](course-generation.md), [거리/도형 변경](course-generation-figma-20261024.md), [홈 상태](home-states.md), [러닝 설정 후속](../history/executed-plans/2026-11-08-1248-live-running-design.md), [배지/공유 후속](../history/executed-plans/2026-11-08-1711-completion-sharing.md). 이 연결이 과거 각 실행의 남은 폰 검증을 완료로 바꾸지는 않는다.
