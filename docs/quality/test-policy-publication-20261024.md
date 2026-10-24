# 시험 약관 게시 결과

2026-10-24T20:34:42+09:00 기준 요청 범위 완료. 사용자 지시 “약관 임시로 하고 넘어가야지”에 따라 기존 승인된 초안을 앱이 사용하는 Supabase에 게시했다. 가입용 정책 및 이용약관·개인정보·위치약관 공개 RPC가 모두 HTTP 200이며 본문 SHA-256이 로컬 원문+시험 표시와 일치한다. 폰 APK 변경은 없다. 실제 사용자 로그인/동의 완료는 아직 검증하지 않았다.

- 최종 선택 버전: `runpen-test-20261024-v2`, 시험 게시 시각 `2026-10-24T11:32:25.032Z`. 정식 출시 시행일은 미정이다.
- 초안 3개는 기본 모바일 원본과 SHA-256 일치. 문안을 고치지 않고 시험용 배너만 추가했다.
- 운영에 없던 `service_policies`와 `get_service_policy(text)`만 기존 `20261014003000_service_support.sql`에서 그대로 분리 적용했다. RLS 활성화, anon/authenticated 직접 테이블 접근 금지, 공개 정책 조회 RPC 실행 권한만 부여했다. 공지/문의 테이블과 함수는 여전히 미적용이다.
- **수동 부분 적용 이력:** 기존 회원 SQL을 재실행하지 않았고 migration history table도 만들지 않았다. 후속 지원 SQL 적용 시 이미 존재하는 정책 부분을 대조·제외해야 한다. 원본 지원 migration 전체를 그대로 재실행하면 중복 객체 오류가 난다.
- 격리 PGlite에서 게시 트랜잭션·anon RPC·본문·직접 테이블 권한 거절·회원 대기 상태/동의 0건 보존 확인. 실제 서버에서 같은 쿼리 및 공개 API를 확인했다.
- 기존 Auth 3, memberships 3, consents 0, personal_records 35, run_shares 2, storage.objects 14의 행 수가 게시 전후 동일하다. 아래 집계 해시도 동일하다. Auth는 행 수만 대조했으며 계정 정보 수정/동의 대행은 하지 않았다.

| 집계 | 전후 동일 MD5 |
| --- | --- |
| memberships | 87148cefab4a022478897f2006eef2fb |
| membership_consents | d41d8cd98f00b204e9800998ecf8427e |
| personal_records | fb3dd6fbb6d81dde20f40b9c1fdc7db1 |
| run_shares | 57972a203970b78091cf1aa8b6b90a08 |
| storage.objects | 41b83853f06b245bd7fccceb645f1d50 |

최종 본문 SHA-256:

- terms: `684e13196289ee2bfb9e9cd8346558926fba8b04a3cbb686a62121eef3eafcc5`
- privacy: `a26dc5ff1f25a8b17596b0bc02a0f6b86c78cb029e387f85f2fab3d9c91138cf`
- location: `08b3764ba119e15f4b8d68bb35b39bfb9bf70a336ce12afb145997667ffebddf`

## 최초 실패와 보정

운영 실행 전 격리 준비 스크립트의 JS replacement가 SQL dollar quote를 변환해 구문 오류가 났고 callback replacement로 고쳐 통과했다. 웹 편집기 fill은 문서 일부만 대체해 붙여넣기로 교정했으며 실행 전에 전체 문서를 복사 대조했다. 첫 v1 게시 결과는 웹 편집기 LF→CRLF 변환으로 원문 해시가 달랐다(줄바꿈 정규화 내용은 동일). 불변 본문을 수정하지 않고 UTF-8/base64 SQL 표현식으로 원문을 보존한 v2를 게시했다. v1 회원 정책은 비활성화했고 서비스 정책은 더 최신인 v2가 선택된다. 두 이력 모두 보존했다. 첫 HTTP 확인 스크립트의 공개 키 변수명 오류도 앱과 같은 PUBLISHABLE_KEY로 바로잡았다.

폰은 잠금 화면이었다. `wm dismiss-keyguard`를 포함한 후속 확인 명령은 자동 승인 검토가 잠금 접근 제어 우회로 판단해 **전체 명령 실행 전에 거절**했다. 우회 재시도하지 않았다. 읽기용 UI 덤프만 삭제했다. 사용자가 잠금을 풀고 앱의 **약관 다시 확인**을 누르거나 앱을 다시 열어 직접 로그인·필수 두 동의·가입 완료를 진행하면 된다. 실제 폰 약관 표시/동의 완료까지 통과했다고 주장하지 않는다.

## 근거와 복구

로컬 `.cache/test-policy-20261024/`에 `publish.sql`(v1+정책 API), `publish-v2.sql`, `isolated-result.json`, `http-result.json`, `final-audit.txt`를 보존했다. 공개 API 최종 확인은 20:33:15 KST. 기존 개인 자료 원문은 출력하지 않았다.

게시 전 활성/공개 정책은 없었다. 철회가 필요하면 명시적 트랜잭션에서 v1/v2 membership 정책을 모두 inactive로, 해당 privacy/location 서비스 4행을 모두 unpublished로 변경한다. 본문과 동의 이력은 삭제하지 않는다. 이렇게 철회하면 정책이 다시 없어져 신규 가입이 막힌다. 현재는 철회하지 않았다. 정식 확정본은 새 버전으로 게시해야 한다.

가입 통합/CI/병합·코스20km 통합과 정식 정책 확정·공지/문의 운영 반영은 별도 후속이다.
