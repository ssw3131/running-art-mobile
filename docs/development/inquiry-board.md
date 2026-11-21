# 이메일 없는 비공개 문의 게시판

2026-11-21 사용자 확정: 본인과 운영팀만 조회, 답변 전 수정·삭제, Supabase에서 운영팀 답변 입력. 이메일·메일 발송·첨부·푸시·실시간 채팅·별도 관리자 UI는 제외한다.

## 사용자 흐름

`service-inquiry`는 정상 조회 결과가 0건일 때만 기존 이미지를 포함한 작성 양식을 표시한다. 실패는 오류/재시도로 구분한다. 게시글이 있으면 공지 카드 형태에 `미확인`/`답변 완료`, 등록일·제목을 표시하고 최신순 20개씩 더 보기한다. 하단 고정 버튼은 `service-inquiry-write`로 이동한다. 등록 후 `service-inquiry-detail`을 열고 목록으로 복귀한다.

상세에는 유형·상태·등록일·제목·내용과 구분선 아래 `RunPen 운영팀 답변`·답변일·답변 내용을 표시한다. 답변이 없을 때만 수정·삭제한다. 수정 충돌/답변 도착 시 최신 상세를 다시 읽는다. `미확인`은 열람 여부가 아닌 미답변이다. 계정 전환/화면 이탈의 늦은 응답은 버리고 공개 공지 파일 캐시는 사용하지 않는다.

작성·수정 입력은 키보드 표시/포커스/화면 크기 변경 시 실제 경계를 측정해 스크롤한다. 제목/내용 입력칸은 헤더와 키보드 사이에 표시하고, 본문은 기본180dp(가용 공간이 작으면 축소) 안에서 긴 내용을 스크롤한다. 키보드가 닫히면 임시 여백을 제거한다. 입력 값·전송/수정 계약은 유지한다.

2026-11-21 신형폰 후속: 암호화 저장된 접수 확인 대기가 있으면 입력 전 상단에 잠금 이유와 재시도/새 문의 작성을 표시한다. 진입 시 기존 상세 조회로 접수를 확인한 경우 대기 사본만 정리하고 빈 새 문의를 연다. 조회 실패·삭제/없음은 전송 실패로 단정하지 않고 동일 번호/내용을 유지한다. ‘새 문의 작성’ 확인창은 이미 접수됐을 가능성과 중복 전송 위험을 안내하며, 확정할 때 기기의 대기 사본만 지운다. 서버 문의·답변은 유지하고 자동 재전송은 하지 않는다. [원인·검증](../quality/inquiry-recovery-save-limit-20261121.md).

## API와 데이터

- `InquiryInput`: category/title/body. 제목 1~100자·본문 1~5,000자, 기존 5개 유형, NFC 정규화. 이메일은 입력 모델과 저장에서 제거한다.
- 기존 `submit_service_inquiry(p_owner,p_request_id,p_category,p_title,p_body,p_email default '')` 형태를 유지한다. 구버전 `p_email`은 무시하며 서버에 저장하지 않는다. 응답 id/receivedAt을 유지하고 삭제된 요청이면 deleted=true를 추가한다. 새 앱은 이를 삭제 안내로 처리한다.
- `list_service_inquiries(p_before_at,p_before_id)`: items(최대20개), next 커서. 정렬은 received_at/request_id 내림차순이며 타임스탬프가 같아도 중복/누락 없이 이동한다.
- `get_service_inquiry(p_request_id)`: id/category/title/body/receivedAt/version/reply/repliedAt/replyUpdatedAt.
- `update_service_inquiry(p_request_id,p_version,p_category,p_title,p_body)`, `delete_service_inquiry(p_request_id,p_version)`: 본인·활성 계정만 호출. 행 잠금 후 답변/버전을 확인한다. 40001은 변경 충돌, P0002는 없음, 42501은 계정 오류, P0001/Inquiry rate limit은 신규 5건/시간 제한이다.
- 본문은 public.service_inquiries, 최소 접수 원장은 비공개 support_private.inquiry_requests에 저장한다. 사용자는 원장 접근·테이블 직접 쓰기·답변 조작 불가다. 원본 지문과 접수 시각은 수정/삭제해도 유지해 최초 요청 재시도와 등록 제한을 보존한다. 탈퇴 시 둘 다 cascade 삭제한다.
- 네트워크 요청은 모두 10초 제한. 전송 전 암호화 저장, 응답 유실은 같은 번호/내용으로 재전송한다. 기존 대기 사본은 이메일을 제거해 다시 저장한다. 명확한 서버 거절은 입력 잠금을 풀고, 불확실한 실패는 대기 사본을 유지한다.

## 운영팀 답변 절차

1. Supabase 프로젝트 `running-art-mobile-dev`의 Table Editor에서 `public.service_inquiries`를 연다. `status = 미확인`을 필터링하고 received_at 순으로 확인한다.
2. 문의 유형·제목·내용을 읽고 해당 행의 **reply_body만** 입력한다(1~5,000자, 일반 텍스트). 저장 즉시 사용자에게 공개된다. 초안 저장은 지원하지 않는다.
3. DB가 replied_at·reply_updated_at·version·status를 자동 갱신한다. 사용자는 화면 재진입 또는 최신 내용 확인으로 답변을 본다.
4. 오탈자 정정은 reply_body를 수정한다. 최초 답변일은 유지하고 수정 시각/버전을 갱신한다. 등록된 답변을 공백으로 지우거나 답변된 문의 원문을 바꾸는 작업은 거절된다.
5. owner_id/request_id/received_at/version/status/답변 시각은 수동 수정하지 않는다. 계정 ID·문의 본문을 외부 로그/공개 문서에 복사하지 않는다. 별도 자동 보관기간은 추가하지 않으며 권리 행사 요청은 기존 개인정보 절차로 처리한다.

## 마이그레이션·배포·복구

`20261120234216_private_inquiry_board.sql`은 기존 S6 전체 적용 DB와 약관만 부분 적용된 운영 DB를 모두 지원한다. 기존 문의 테이블은 확장하고 없으면 생성한다. 과거 지원 SQL 전체를 재실행하지 않으며 공지/약관 객체를 변경하지 않는다. contact_email 컬럼은 제거하고 기존 행의 원본 지문을 원장에 초기화한다. 2026-11-21 운영 적용 전 문의 객체가 없던 상태를 대조했고 문의 전용 SQL만 적용했다. 저장소 파일 시각은 20261120234216, 관리 API가 기록한 동일 변경의 migration version은 20261121000048(name: private_inquiry_board)이다. 두 항목은 같은 변경을 가리키므로 중복 적용하지 않는다. 부분 S6 이력 전체가 정합화되기 전에는 전체 db push를 실행하지 않는다.

로컬·API·Android 검사 후 문의 전용 SQL을 먼저 적용한다. 권한/함수/트리거를 확인하고 새 앱을 반영한다. 장애 시 문의/답변을 삭제하는 역마이그레이션을 하지 않는다. 새 앱 배포를 중단하고 접수 권한을 제한하는 운영 복구를 선택하며 기존 원장과 본문을 보존한다. 구버전 앱은 접수 함수 호환은 유지하지만 이메일 답변 안내가 오래된 상태이므로 새 앱 적용이 필요하다.

## 검증

`tests/support*.test.mjs`, `tests/inquiry-board-migration.test.mjs`, `tests/components/inquiry-board.test.tsx`, `supabase/tests/inquiry_board.sql`, `tests/integration/support.test.mjs`를 사용한다. 격리 Android S56에서 `scripts/qa/inquiry_board.py`가 앱 등록/수정/삭제·운영팀 답변·목록/상세·큰 글씨/다크를 검증하고 합성 데이터만 정리한다. 실제 휴대폰 결과와 CI 결과는 분리해 기록한다.

## 실제 휴대폰에서 남은 확인

1. 최종 검증 기록의 APK·metadata.json을 확인하고 기존 앱에 자료를 유지한 채 업데이트한다. 현재 클라우드에서는 휴대폰 설치를 실행하지 않았다.
2. 로그인 후 `문의 및 의견 보내기`에서 문의를 등록하고 상세·목록 복귀를 확인한다.
3. Supabase의 해당 문의 행에서 reply_body를 저장한다.
4. 앱에서 화면에 재진입하거나 최신 내용을 확인해 `답변 완료` 태그와 `RunPen 운영팀 답변`·작성일을 확인한다. 기기·설치본·결과는 검증 기록에 추가한다.
