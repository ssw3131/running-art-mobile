# RunPen 정책 개정 초안 — 2026-11-22

## 2026-11-22 정책 회신 이후의 읽기 기준

이 폴더는 정책 회신 전에 작성한 검토 초안과 질문의 이력이다. 이후 사용자가 전달한 [확정 회신 원문](../policy-decision-reply-20261122.md)과 [항목별 구현·남은 검증](../policy-implementation-20261122.md)을 현재 기준으로 먼저 읽는다. 아래 본문의 ‘미정’, ‘미구현’, ‘현행’은 최초 작성 시점의 설명이며 이후 결정·구현을 되돌리지 않는다. [결정표 후속](decisions.md)에 D01~D10의 현재 근거를 연결했다.

정렬 PR91·팩 진입 PR93·정책 구현 PR95·검증 기록 PR96·PC 기록 PR97은 main에 반영됐다. 가격 표시·환불/FIFO 계산·만19세 자기확인·고도 조회 제거와 테스트 구매 검증 기반이 구현됐으며, 실제 결제·지급/차감·복원/환불 연결 및 운영 반영은 별도 후속이다. 최신 전송 설명은 [데이터 흐름](../policy-dataflows-20261122.md)을 따른다.

PR92 병합은 검토 이력을 저장소에 통합하는 작업이다. 아래 약관·환불·개인정보 본문을 고객 대상 최종 문안으로 승인하거나 운영 정책 뷰어에 게시하지 않는다. 공고일·시행일, 실제 공급자 계약·보존 설정·법률 검토는 완료로 처리하지 않는다. 초기 초안 본문과 당시 확인 근거는 아래에 보존한다.

## 최초 초안 안내 — 정책 회신 전

**검토용·미게시.** 이 문서는 기존 게시 정책을 대체하지 않는다. 운영 정책 버전, 가입 동의 이력, 서버 데이터와 앱의 정책 뷰어를 변경하지 않았다. 시행일·공고일은 미정이다.

| 문서 | 내용 |
| --- | --- |
| [이용약관](terms.md) | 실제 모바일 서비스, 가입 최초 혜택, 준비 중인 단건 팩, 계정·기기 변경 |
| [환불정책](refunds.md) | 묶음 상품의 미사용·부분 사용·지급 실패·중복 결제 검토안 |
| [개인정보처리방침](privacy.md) | 실제 처리 항목·목적·저장·공유·삭제 경계 |
| [결정표](decisions.md) | 게시·결제 연결 전에 확정할 운영 조건과 확인 근거 |
| [피그마 정정 요청 목록](figma-corrections.md) | 현재 결정과 다른 디자인 문구 4건 |

## 기준과 보존

- 제품 구현은 main `040427e`를 대조했다. PR #90의 게스트·가입·무료 혜택 문구는 `22b7edd`를 참고했으며, 이 문서 작성 시점에는 미병합이다. PR #91은 코스 표시 순서만 바꾼다.
- 상품 수치는 사용자가 승인한 이번 계획을 따른다. 기본 1,900원/생성 10회/저장 20회, 플러스 2,900원/30회/**60회**, 확장 4,900원/60회/120회. 가입 최초 무료 생성 5회·저장 10회이며 월별 추가·초기화는 없다.
- 실제 결제·구매 복원·지급·환불은 아직 미구현이다. 장래 상품 조항을 현재 제공 중인 계약처럼 게시하지 않는다.
- [10월 24일 원문·확정 운영 정보](../policies-draft-20261024/README.md), [시험 정책 게시 이력](../../development/test-policy-publication-20261024.md), [과거 대조](../policy-reconciliation-20261014.md)를 수정하지 않고 보존했다. 위치정보 이용약관은 이번 개정 대상 밖이며, 새 개인정보 문안과 함께 후속 검토해야 한다.
- [실행 계획](https://github.com/ssw3131/running-art-mobile/blob/dd64075735ba8ae4b77ee1de88534b270d47e5cf/docs/history/executed-plans/2026-11-22-1016-course-packs-policy.md)에 따른 별도 문서 변경이다. Figma 수정·디자이너 메시지 발송은 없다.

## 구현 대조 근거

| 항목 | 코드·계약 |
| --- | --- |
| 소셜 계정·프로필·선택 체중 | [계정 모델](../../../src/modules/account/model.ts), [사진 처리](../../../src/modules/account/photo.ts), [사진 선택](../../../src/modules/account/photo-picker.ts), [계정 계약](../../development/account-mypage.md) |
| GPS·동기화·기기 보관 | [러닝 형식](../../../src/modules/running/model.ts), [개인 동기화](../../development/personal-sync.md), [탈퇴 처리](../../../src/modules/account/withdrawal.ts), [기기 보존](../../../src/modules/account/withdrawal-repository.ts) |
| 계산·지도·검색 | [계산 인증](../../../src/modules/route-compute/mobile.ts), [장소 검색·주소](../../../src/modules/map/place-search.ts), [지도 설정](../../../src/modules/map/config.ts) |
| 공유 | [공개 사본](../../../src/modules/run-sharing/model.ts), [개별 기록 업로드](../../../src/modules/run-sharing/synchronize-record.ts), [이미지 카드](../../../src/modules/achievements/card.ts), [링크 공유 계약](../../development/run-link-sharing.md) |
| 동의·문의·사용량 | [가입 동의](../../development/signup-consent.md), [문의 계약](../../development/inquiry-board.md), [사용량 식별](../../../supabase/functions/_shared/usage-backend.ts), [사용량 DB](../../../supabase/migrations/20261024120000_usage_allowances.sql) |

과거 대조표의 ‘체중 없음’, ‘장소 검색 없음’, ‘계산에 인증정보를 보내지 않음’, ‘PNG에 지도·주소 없음’은 최신 구현 설명으로 사용하지 않았다. 새 초안은 코드의 처리 사실과 미확정 운영 조건을 구분한다. 코드에 삭제 호출이 있다고 공급자 백업·접근 로그까지 즉시 사라진다고 해석하지 않는다.

## 검토에 사용한 공식 자료

2026-11-22에 [개인정보 보호법 제30조](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1006185717), [개인정보보호위원회 2026년 4월 작성지침 안내](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=&nttId=12018), [Google Play 환불 정책 안내](https://support.google.com/googleplay/answer/2479637?hl=ko)를 확인했다. 지침 PDF 전체 검토나 최종 법률 검토를 완료한 것은 아니다. 게시 전 확인 항목은 결정표에 남겼다.
