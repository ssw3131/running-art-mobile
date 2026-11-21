# 문의 게시판 검증 — 2026-11-21

## 범위

이메일 없는 비공개 문의 목록/상세/수정/삭제와 Supabase 답변. [계약](../development/inquiry-board.md)·[실행 계획](../history/executed-plans/2026-11-21-0837-inquiry-board.md).

## 확인한 결과

- Node 문의 로직 10개 통과: 입력·이메일 제거·미확인 접수/동일 요청 재시도·계정 변경·전송 제한·10초 타임아웃·삭제된 요청 처리.
- 문의 UI 6개 통과: 실패와 빈 목록 구분·이메일 없는 등록/상세 이동·페이지 추가·답변 표시·수정 중 답변 충돌·삭제 확인·계정 변경 시 이전 응답 폐기.
- 기존 공지/FAQ UI·공지 캐시 7개 통과.
- 실제 PGlite PostgreSQL 엔진의 기존 계정/지원 검사와 새 문의 SQL 통과. 별도 부분 S6 마이그레이션 검사 통과: 약관 데이터 보존, 공지 테이블 미생성, 본인 RLS·원장 비공개·답변 트리거·버전 충돌·삭제/제한·페이지 경계·탈퇴 정리.
- 전체 fast 7단계 통과: 타입/린트·서버 타입/린트·Node 619통과/기존1건skip·Jest44묶음256개·OpenAPI·계정/문의/공유 DB 정책. API/Android·운영 반영·실제 휴대폰은 결과를 후속 기입한다.

## 실패와 환경 한계

- cloud.sh setup은 /home/agent/.expo 읽기 전용으로 실패했고 추가 경로 권한으로도 동일했다. HOME을 변경하지 않고 공식 해시로 검증한 Node24.21.0과 npm ci를 사용했다. Expo 검사는 CLI가 지원하는 셸 전용 __UNSAFE_EXPO_HOME_DIRECTORY를 프로젝트의 Git 제외 캐시로 지정한다(기존 인증 없음).
- 최신 Supabase CLI는 ~/.supabase 쓰기 제한, 구 CLI npm 설치는 직접 GitHub 연결 거절로 실패했다. curl로 공식 v2.81.3 CLI를 받아 도움말 확인 후 migration new로 파일을 생성했다.
- 최초 Node 실패 2개는 폐기된 이메일 계약/옛 RPC 모의객체였다. 이메일 미전송·abortSignal 계약으로 수정 후10개 통과.
- 최초 UI 6개 실패는 Jest 모듈 초기화 전에 mockRemote를 값으로 캡처한 fixture 문제였다. 호출 시 위임하도록 수정 후6개 통과.
- 최초 린트에서 effect 내 setState 오류를 발견했다. 외부 문의 컨트롤러 구독 콜백으로 복원 입력을 반영하도록 수정했다.

- 첫 ready44840341351은 fast/API/Android29가 통과했다. API29 화면 육안 검토에서 문의와 기존 공지 카드의 흰색 SVG 화살표가 밝은 배경에서 보이지 않는 문제를 발견해 c.text를 명시했다. 수정 소스의 최종 검사를 위해 draft로 전환했고 진행 중 Android36 실행은 취소됐다. 이 첫 실행을 전체 성공으로 세지 않는다.


## 운영 DB 반영 — 2026-11-21 09:00~09:03 KST

- Supabase `running-art-mobile-dev`에 검증된 문의 전용 SQL을 적용했다. 저장소 파일은 `20261120234216_private_inquiry_board.sql`, MCP 적용 이력의 version은 `20261121000048`, name은 `private_inquiry_board`다. 같은 변경의 대응 관계이며 다시 적용하지 않는다. 기존 부분 적용 이력 때문에 전체 migration push는 여전히 금지하고 실제 객체를 먼저 대조한다.
- 적용 전 문의 테이블·함수·support_private 스키마가 없는 것을 확인했다. 적용 후 문의/접수 원장·RLS·authenticated 접수 실행 허용, 익명 SELECT/접수와 사용자 직접 UPDATE 금지를 확인했다. contact_email 컬럼은 없다.
- 기존 정책 4행의 본문 MD5가 적용 전후 동일했다. v1 location cbf075125b37c622f831f2c0fe79a1f5, v1 privacy fcd0ed5c36f609f582c0f033578abd56, v2 location 4ac409698ad2237175d0ce154af518be, v2 privacy 919b920b7cdbfa070037d4f347fbe9ed. 공지·회원·기록·계산 서버는 이번 배포에서 변경하지 않았다.
- 운영 DB에서 새 임시 UUID의 auth.users 행만 사용하는 단일 트랜잭션으로 등록·동일 요청 재시도·본인 목록·수정·답변 자동 시각/버전·답변 후 삭제 거절을 검증하고 롤백했다. 이후 해당 시험 사용자·문의·원장 모두 0건을 확인했다. 실제 사용자 계정이나 문의를 사용하지 않았다.
- 공개 HTTP API의 list_service_inquiries 호출은 비로그인 HTTP401/42501로 거절되어 새 함수의 스키마 반영과 익명 접근 차단을 확인했다. 실제 인증 HTTP 동시 처리·삭제 재시도는 PR API 검사에서 통과했다.
- 보안 Advisor도 확인했다. 신규 문의 쓰기 RPC 3개의 authenticated SECURITY DEFINER 경고는 직접 테이블 쓰기를 금지하고 auth.uid()/활성 계정·본인·행 잠금을 검사하는 의도된 API다. 익명 실행은 금지하고 search_path는 비워 두었다. 비공개 원장의 RLS/no-policy INFO는 사용자 직접 접근을 허용하지 않는 의도된 차단이다. 기존 공개 약관·공유·계정 함수/비밀번호 관련 경고는 이번 범위에서 변경하지 않았다.
