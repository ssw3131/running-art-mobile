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
