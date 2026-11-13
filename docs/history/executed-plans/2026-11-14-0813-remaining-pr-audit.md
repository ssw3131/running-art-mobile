# 남은 PR 전체 반영 확인과 중복 PR 정리

- 실행 시작: 2026-11-14T08:13:35.657733+09:00 (Asia/Seoul)
- 상태: 완료
- 종료 기록: 2026-11-14T08:15:22.403658+09:00 (중복 PR 종료 확인 기준)
- 기록 유형: 실행 시작 시 계획 작성
- 요청 출처: 사용자의 “다 머지 된 거야? 남은 모든 PR”. 앞선 PR59/60 외 남은 전체 PR을 확인한다.

## 실행 전 계획

열린 PR24·46·48의 실제 head와 변경 파일·기존 통합 이력을 대조한다. 아직 반영되지 않은 변경만 현재 기획·검사와 함께 통합한다. 이미 통합된 변경은 최신 제품을 과거 상태로 되돌리지 않고 반영 근거를 남겨 중복 PR을 종료한다. 원본 브랜치와 기존 기록을 보존한다. 결과·목록·인수인계를 문서 PR로 반영하고 필수 검사와 main 확인 후 열린 PR 전체 상태를 재확인한다. 휴대폰 설치·운영 배포는 포함하지 않는다.

## 변경 전 대조 근거

시작 main은 a43f7e5dde405dcb7d6b725a0940d530de4ac017이다. 세 PR 모두 현재 main과 충돌하며 과거 개별 CI 성공을 최신 통합 검증으로 간주하지 않는다. main의 최신 제품은 PR59의 전체308/43505321295(API29 7단계·API36 15단계·네 화면 차이0·보존/정리/필수 게이트)와 main309/최종 문서 main311/43512446638을 통과했다.

| 남은 PR | 원본 head | main 반영 근거 |
| --- | --- | --- |
| [24](https://github.com/ssw3131/running-art-mobile/pull/24) | eeeab81d5d1af31fd0d6e66f96329528493c6b0e | 제품 최종 c3285e1f50e3bbbc310f28576ccbddffed3bcdd7을 포함한13개 커밋이 PR27 head30eb814d287aab46c9313398728dbb01e551e7b8의 조상이다. 마지막 eeeab81은 제품 변경 없는 문서 병합이며 최종 home-auth 검증 문서는 현재 main과 바이트가 같다. |
| [46](https://github.com/ssw3131/running-art-mobile/pull/46) | abcae7d8ea6b5a90dcffa8f18fd51a41f6e42a18 | head 전체가 PR50 head571979d3ca7e52c434dad7b898afeb8194491876의 조상이다. |
| [48](https://github.com/ssw3131/running-art-mobile/pull/48) | e1e046cde519f0c3401565071eb6fd7a6ea01b44 | head 전체가 같은 PR50 head571979d의 조상이다. |

PR27 head의 tree e01fc207464d17a1442262445a4af5d7127281f1은 main squash00f7f83의 tree와 일치한다. PR50 head의 tree ece0b93acf1bab4aca0ba3894f8f5bd7545c84e6도 main squash7b2f01b2d8ef9082ecc85b8e6088f6eb621ee6a3와 일치한다. 두 squash 커밋 모두 현재 main의 조상이다. PR24/46/48이 추가한 파일22/102/4개는 현재 main에 모두 존재한다. 마지막 문서 병합의 제품 경로 차이는0이며 domain 자료는 기존 main 이력으로 보존되어 있다.

[기존 PR50 통합 기록](2026-11-08-2020-pr49-ci.md)과 [PR27 통합 기록](2026-10-24-2059-archive-usage.md)을 함께 확인했다. 파일 존재만으로 기능 반영을 추정하지 않고 커밋 조상·squash tree·기록을 대조했다. 각 원본 PR을 이번에 개별 merge한 것으로 보고하지 않는다.

## 실행 결과

2026-11-14T08:14:27+09:00에 PR24,08:14:34에 PR46,08:14:41에 PR48을 closed로 종료했다. 각 본문에 기존 통합 PR·실제 source/tree 근거·후속 검증과 중복 종료 이유를 추가했고 원래 본문/검사/실패 이력을 유지했다. 세 PR은 이번에 개별 merge한 것이 아니므로 merged=false인 상태를 정확히 기록한다. 이미 main에 통합된 기능을 재적용하거나 기존 최신 제품·워크플로·검사를 되돌리지 않았다.

원본 원격 feat/home-auth-gate/eeeab81, codex/figma-course-map-picker-20261105/abcae7d, codex/bottom-tab-spacing/e1e046c를 보존하고 변경 전 head와 일치함을 재확인했다. docs/remaining-pr-audit-20261114에서 이 기록·목록·인수인계3개 Markdown만 변경한다. 새 제품 변경이 없으므로 문서 링크·공백·docs-only 분류와 문서 PR/main 필수 게이트를 확인한다. 과거 PR의 중단된 CI를 새로운 성공으로 기록하지 않는다. 마감 문서 PR 반영 후 열린 PR 전체를 다시 조회한다.
