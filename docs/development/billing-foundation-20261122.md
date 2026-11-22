# 유료 팩 구매 검증 기반

2026-11-22 사용자 요청으로 Play 계정·상품 등록 없이 구현할 수 있는 부분을 준비하고, 후속으로 전달받은 [최종 정책 회신](../product/policy-decision-reply-20261122.md)을 반영했다. Google Play 직접 연동 방향이며 서버 연결은 **검증 원장까지**다. 확정 차감·합산·환불 금액은 순수 계산 모듈로 구현했다. 실제 결제 시작·횟수 지급·차감·환불 회수·앱 내역 화면 연결은 아직 없다. [전체 정책 대조](../product/policy-implementation-20261122.md).

## 코드 경계

- `supabase/functions/_shared/billing-*`는 Request/Response·fetch 기반의 서버 모듈이다. 배포 진입점이나 환경변수로 켜지는 앱 경로를 추가하지 않았다. 후속 전용 Cloud Run 서비스에서 조합할 수 있다.
- `createGooglePurchaseReader`는 고정된 `com.runningart.mobile.dev`의 Google API를 조회한다. 토큰 발급은 서버 런타임 신원 어댑터로 주입한다. 앱의 패키지·가격·혜택·계정 주장을 받지 않는다.
- `createBillingHandler`의 기본 모드는 `disabled`다. `verify-test-only`도 구매 시작은 항상 false이며 서버 허용 계정·가입 상태·Google TEST 구매를 모두 요구한다. 등록 상품 ID와 팩 연결은 서버 설정으로 주입하며 이번 소스에 실제 상품을 등록하거나 가격·혜택을 확정하지 않았다.
- `createBillingBackend`는 Supabase Auth 서버에서 사용자를 확인한 뒤 본인 원장 RPC만 호출한다. 기존 사용량 주체 연결·카운터·운영자 추가 생성 횟수는 건드리지 않는다.
- `src/modules/packs/purchases.ts`는 구매 확인 상태와 내역 페이지를 검증한다. 확인되지 않은 응답을 빈 내역으로 바꾸지 않으며 토큰·계정 식별자 등 추가 필드를 보존하지 않는다. 실제 화면은 기존 준비 상태다.

## 검증 규칙

Google의 `productsv2` 응답에서 TEST/KR 구매, 서버에서 만든 HMAC 계정 식별자, 등록된 단일 상품, 수량1, 구매 상태와 완료 시각을 확인한다. 대여·예약 상품과 알 수 없는 상태는 거절한다. 주문 번호는 없을 수 있으므로 내부 `purchaseId`와 토큰 SHA-256으로 식별한다. 패키지는 서버 API 경로에 고정한다. [Google 응답 규격](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2), [조회 API](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2/getproductpurchasev2).

| 원장 상태 | 의미 | 지급 상태 |
| --- | --- | --- |
| pending | Google 결제 대기 | not_granted |
| verified | Google 구매 확인 | not_granted |
| cancelled | 취소 또는 환불 수량0 확인 | not_granted |

`verified`는 지급 완료가 아니다. 기존 완료 컴포넌트의 `confirmed`는 향후 실제 지급 트랜잭션에서만 생성한다. 이 단계에는 consume/acknowledge 호출이 없다. 지급 전 소비 처리 금지와 주문 번호를 중복 방지 키로 쓰지 않는 원칙은 [Google 보안 지침](https://developer.android.com/google/play/billing/security)을 따른다.

## 원장과 접근

CLI로 생성한 `20261122070123_billing_receipt_foundation.sql`은 검증 원장 하나와 내부 RPC를 추가한다. 토큰 원문은 저장하지 않으며 해시에 전역 UNIQUE 제약을 둔다. 삽입 충돌과 행 잠금으로 재전송을 같은 구매 ID에 수렴시킨다. 같은 토큰의 소유자·상품·이미 확인한 주문/시각을 바꾸지 않는다. 취소는 최종 상태이고 늦은 pending/verified 응답으로 되돌릴 수 없다. 원장에 없는 이미 소비된 영수증은 수용하지 않는다.

RLS를 켜고 anon/authenticated의 테이블·RPC 접근을 차단한다. 함수는 SECURITY INVOKER이고 service_role만 필요한 테이블 권한과 실행 권한을 갖는다. 가입·탈퇴 상태를 트랜잭션 안에서 재확인하고 기존 탈퇴의 `account/` 공유 advisory lock을 사용한다. 탈퇴 시 owner_id는 null로 바뀌며 토큰 해시는 타 계정 재사용 방지용으로 남는다. **보존 기간과 삭제 정책이 확정되기 전 운영에 적용하지 않는다.**

내역은 인증한 본인의 생성 순서로20개씩 반환한다. 다음 페이지는 마지막 구매 ID와 불변 생성 시각을 사용한다. 타 계정 커서는 거절하며 응답에는 토큰 해시·HMAC 계정 값·서버 키가 없다. 외부 오류 본문과 토큰이 포함될 수 있는 URL도 사용자 오류에 전달하지 않는다.

## 후속 연결 순서

1. Play Console·서비스 계정·라이선스 테스터와 상품 등록. 계정 HMAC 비밀값은 서버 전용으로 보관하고 교체 시 기존 영수증 연결을 별도 설계한다.
2. 네이티브 결제 어댑터와 전용 서버 실행/인증·요청 제한·배포 설정. 현재 코어를 단독 공개 결제 서버로 배포하지 않는다.
3. 구매 당시 상품/혜택 스냅샷, 원장과 원자적 지급, 사용량별 예약·확정·취소와 환불 시 해당 구매의 미사용분 회수.
4. 원자적 지급 후 consume 재시도, RTDN·voided 복구와 필요한 서버 토큰 보관. 현재 해시만으로는 Google 재조회/consume 작업을 재구성할 수 없다.
5. 앱 구매·내역/복원·완료 연결과 실제 테스트 결제 검증. 내부 테스트용 잠정 규칙을 출시 정책으로 자동 채택하지 않는다.

운영 DB·서버·정책 게시와 휴대폰 설치는 이번 작업에서 수행하지 않는다. [검증 기록](../quality/billing-foundation-20261122.md)과 [실행 기록](../history/executed-plans/2026-11-22-1559-billing-foundation.md)을 함께 본다.
