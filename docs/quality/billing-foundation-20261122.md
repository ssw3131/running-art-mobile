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

[PR95](https://github.com/ssw3131/running-art-mobile/pull/95)의 최종 전체 [485](https://github.com/ssw3131/running-art-mobile/actions/runs/45000059628)가 통과했다. `DB-BILLING-01`은 실제 Auth/가입, 12개 동시 영수증 제출, 취소/늦은 응답 경합, 탈퇴 장벽과 직접 Auth 삭제 경합, 타 계정 재사용 차단, 기존 사용량 보존을 확인했다. 회원 정책을 만드는 기존 통합 검사와 같은 파일에서 순서대로 실행해 임시 active 정책 충돌을 피한다.

| 최종 전체 검사 | 결과 |
| --- | --- |
| 타입/린트·빠른7단계 | 통과. 로직652통과/기존skip1, UI49묶음299개, Python 도구39개 |
| API/격리 Supabase | 통과. 실제 DB4개와 기존 PostgreSQL/권한·HTTP 검사 |
| Android29 | [8단계·보존/정리 통과](evidence/billing-foundation-20261122/android-29-report.json), 전체 재시도0. UI 수집 준비 대기5건·종료 코드134/139 경고4건을 원본에 보존. fresh XML 및 수집 완료를 확인하는 기존 조건 유지 |
| Android36 | [16단계·보존/정리 통과](evidence/billing-foundation-20261122/android-36-report.json), 재시도/수집 경고0 |
| 정적 화면·필수 게이트 | [기존4화면 비교 차이0](evidence/billing-foundation-20261122/android-36-visual.json), 기준/마스크 변경 없음, verification-gate 통과 |

두 Android 원본에서 약관 동의 후에도 연령 미확인이면 완료가 비활성인 상태, 가격 구분과 큰 글씨 줄바꿈, 고도 행이 없는 완주 화면을 직접 검토했다. [연령 확인](evidence/billing-foundation-20261122/android-29-age-required.png)·[큰 글씨 가격](evidence/billing-foundation-20261122/android-29-large-price.png)·[완주 화면](evidence/billing-foundation-20261122/android-36-completed.png). 기존 큰 글씨의 헤더/탭 줄바꿈은 유지한다. 화면 속 게시일은 격리 합성 정책이며 운영 정책 게시 증거가 아니다.

PR95는 main `e011264`에 병합됐다. [main486](https://github.com/ssw3131/running-art-mobile/actions/runs/45003577481)은 같은 Git tree `79e7e364b1862cfa1c242e11721d2fbe1cd1eeca`의 전체485 성공 증거를 확인·재사용해 필수 게이트를 통과했다. main에서 Android를 새로 실행한 결과로 기록하지 않는다. 최종 문서 전용 PR의 검사·병합·자료 보존/임시 체크아웃 정리는 해당 PR 본문에 실제 결과를 남긴다.

첫 ready [478](https://github.com/ssw3131/running-art-mobile/actions/runs/44998562052)의 DB-BILLING-01이 실패했다. 기존 가입·동기화·문의 DB3개와 HTTP424개는 통과했다. 격리 진단 [481](https://github.com/ssw3131/running-art-mobile/actions/runs/44998977641)에서 `42501 permission denied for table users`를 확인했다. 로컬 PGlite 준비 코드가 실제로 없는 Auth SELECT/UPDATE 권한을 줘 결함을 놓쳤다. 권한 추가/SECURITY DEFINER 전환 없이 회원 외래키·원장 외래키/잠금·기존 탈퇴 장벽을 사용하도록 수정하고 로컬 권한도 실제와 맞췄다. 관리 API의 직접 Auth 삭제 경합까지 검사한다. 실패한 실행의 다른 진행 중 검사는 draft 복귀로 취소했고, 원본 API 아티팩트와 진단 결과를 보존했다.

후속 입력 검토에서 구매 상태/팩 ID의 배열이 문자열 변환으로 통과할 수 있음을 발견해 엄격한 문자열 검사와 회귀를 추가했다. 수정 후 관련 Node18개가 통과했다. 최초 signup 네이티브 검사에서는 필수 연령 확인 전 비활성 완료 버튼도 탐색하도록 조정했으며 실제 완료 차단 기대는 유지한다.

수정본 `7c87d43`의 draft [482](https://github.com/ssw3131/running-art-mobile/actions/runs/44999406834) 빠른 검사가 통과했다. API 단독 [483](https://github.com/ssw3131/running-art-mobile/actions/runs/44999408935)은 GitHub 소스 다운로드에서443포트 연결이 두 차례 시간 초과됐다. 5분 넘게 지연된 뒤 같은 소스로1회 재실행을 요청했고, 직후 원래 checkout은 복구됐지만 API는 대체 실행으로 취소됐다. 검사 기준/기한은 변경하지 않았다. 대체 [484](https://github.com/ssw3131/running-art-mobile/actions/runs/44999805615)에서 실제 DB4개(신규 결제와 기존 가입/동기화/문의) 및 API 검사가 통과했다. 원본 로그와 아티팩트는 `D:\running-art\output\billing-foundation-20261122\billing-ci`에 보존한다. 단독 진단은 필수 전체 PR 검사를 대체하지 않는다.

## 범위와 한계

앱 ID·서명·기존 사용량·게시 정책 내용은 유지한다. 팩 가격 안내/가입 확인과 고도 제거의 의도된 화면 변경이 있으며 화면 기준/마스크/기한은 변경하지 않는다. Google 조회는 공식 응답 형식의 격리 합성 자료와 fetch 경계 검사이며 실제 Play 영수증 통과가 아니다. 운영 배포·실제 결제·지급/환불·휴대폰 검증은 미실행이다.
