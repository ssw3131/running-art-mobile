# 유료 팩 구매 검증 기반 검사

## 로컬 결과 — 2026-11-22

- `check:server`: 서버 TypeScript·ESLint 통과.
- 앱 TypeScript·ESLint 통과. 격리 체크아웃 경로에서 Jest 기본 testMatch가 Windows 경로를 혼합해 파일0개로 실패했다. 명시적 `--testMatch '**/tests/components/**/*.test.tsx'`로 전체49묶음299개를 재실행해 통과했다. 제품 Jest 설정은 변경하지 않았다.
- `node --test tests/billing-foundation.test.mjs tests/billing-db.test.mjs tests/usage-db.test.mjs tests/usage-generation-credit.test.mjs`: 15개 통과. 검증/권한/중복·응답 유실/취소 단조성/커서/탈퇴 재사용 차단과 기존 사용량·추가 생성 횟수 회귀를 포함한다.
- 첫 실행의 Node strip-only 비호환 TypeScript parameter property 오류는 일반 필드 초기화로 수정했다. 기존 모듈 유형 경고는 남아 있으며 통과로 숨기지 않는다.
- PGlite의 Promise 동시 호출 검사는 같은 연결에서 순차 처리될 수 있다. 독립 PostgreSQL 동시 트랜잭션 통과를 뜻하지 않는다. 이를 위해 기존 격리 Supabase 통합 검사에 `DB-BILLING-01`을 추가했다.
- 정책 회신 후 결제/정책 Node18개를 다시 실행해 통과했다. 환불6예시, 모든 팩의 전체 잔여 수량 조합, 실제 결제금액/기환불 상한, 정수 오버플로 방지, 무료/FIFO·예약/환불 잠금 제외를 포함한다. 운영 원장의 유료 차감/환불 통합 검사가 아니다.

## 실제 컴포넌트 화면 검토

기존 웹 어댑터에 현재 소스·원본 폰트/아이콘을 연결해 팩10조건과 가입/가격3조건을 렌더했다. 320/360/412폭·1.6배 글씨·다크/라이트에서 런타임 오류와 가로 넘침0, 세 상품 선택·구매 비활성, 약관만 동의할 때 완료 비활성/연령 확인 후 활성 상태를 확인했다. 가입은 실제 ConsentForm의 합성 정책·프로필 입력이며 전체 네이티브 가입/실제 나이 인증의 증거가 아니다.

[팩 화면](evidence/billing-foundation-20261122/select-1-412x917-1-light.png), [작은 화면·큰 글씨의 가격](evidence/billing-foundation-20261122/policy-select-320-1.6.png), [가입 확인 항목](evidence/billing-foundation-20261122/policy-signup-412-1.png), [가입 큰 글씨](evidence/billing-foundation-20261122/policy-signup-320-1.6.png)를 직접 검토했다. 예정가는 줄바꿈되고 취소선/할인율이 없으며 연령 확인은 필수 약관 전체 동의와 분리돼 있다. [팩10조건](evidence/billing-foundation-20261122/results.json)·[정책3조건](evidence/billing-foundation-20261122/policy-results.json).

첫 웹 가입 검사는 RN의 accessibilityState를 웹 aria-checked 속성으로 직접 읽어 null로 실패했다. 제품/native 체크 상태는 Jest로 확인하고 웹에서는 실제 완료 버튼 상태 전환을 검사하도록 어댑터 검사를 수정했다. 네이티브 TalkBack 검증 완료를 뜻하지 않는다. 기존 정적 화면 기준/마스크는 변경하지 않았다.

## 실제 PostgreSQL·PR/main 검증

진행 중. draft 빠른 검사 뒤 ready PR의 API·Android29/36 필수 검사를 확인한다. `DB-BILLING-01`은 실제 Auth/가입, 12개 동시 영수증 제출, 취소/늦은 응답 경합, 탈퇴 장벽과 타 계정 재사용, 기존 사용량 보존을 확인한다. 회원 정책을 만드는 기존 통합 검사와 같은 파일에서 순서대로 실행해 임시 active 정책 충돌을 피한다.

## 범위와 한계

앱 ID·서명·기존 사용량·게시 정책 내용은 유지한다. 팩 가격 안내/가입 확인과 고도 제거의 의도된 화면 변경이 있으며 화면 기준/마스크/기한은 변경하지 않는다. Google 조회는 공식 응답 형식의 격리 합성 자료와 fetch 경계 검사이며 실제 Play 영수증 통과가 아니다. 운영 배포·실제 결제·지급/환불·휴대폰 검증은 미실행이다.
