# 개인정보 정책 검토용 데이터 흐름 — 2026-11-22

[정책 회신서](policy-decision-reply-20261122.md) D05/D08의 기술 확인 자료다. PR95의 소스에서 확인한 전송 경로이며 운영 계약·국가·보존 기간 또는 실제 배포본의 네트워크 관측 결과가 아니다. 공급자별 계약과 운영 설정을 대조한 뒤 공개 정책에 반영한다.

| 기능 | 소스에서 확인한 수신처·전송 내용 | 근거 |
| --- | --- | --- |
| 소셜 로그인 | Supabase Auth와 Google·카카오·네이버 인증 흐름. 카카오 요청 범위는 닉네임/프로필 이미지이며 제공자 활성화는 빌드 설정에 따름. 네이버 프로필 보완은 제공자 토큰으로 네이버 API 요청 | [제공자](../../src/modules/auth/providers.ts), [네이버](../../src/modules/auth/naver-profile.ts) |
| 지도 표시 | MapTiler 지도 스타일과 해당 스타일의 지도 자원 요청. 지도 화면에 해당하는 타일 식별자·네트워크 정보의 처리가 있을 수 있으므로 위치 전송이 전혀 없다고 안내하지 않음 | [지도 설정](../../src/modules/map/config.ts) |
| 장소 검색·주소·지역 이름 | MapTiler에 검색어와 검색 중심 경위도를 전송. 역주소/지역 이름은 조회 지점 경위도를 URL에 포함. 고도 제거와 별개로 유지되는 경로 | [장소·주소](../../src/modules/map/place-search.ts), [지역 이름](../../src/modules/map/region-label.ts), [배지 지역](../../src/modules/achievements/regions.ts) |
| 코스 생성 | 설정된 계산 서버에 중심 경위도·도형·목표 거리·사용자 윤곽 등 계산 요청을 전송. 인증된 앱은 **Supabase 세션 액세스 토큰**과 작업 ID를 헤더에 포함. 전체 개인 러닝 이력을 보내는 계약은 아님 | [요청 계약](../../src/modules/route-compute/contract.ts), [인증 연결](../../src/modules/route-compute/mobile.ts), [HTTP](../../src/modules/route-compute/client.ts) |
| 공개 도로 조회 | 도로 공급 주소에서 지역별 목록/도로 파일을 받음. 기본 주소는 RunPen 도메인이며 이전 R2 주소도 코드에 남음. 요청 파일/지역 및 플랫폼 접근 로그의 보존은 별도 확인 | [채널](../../src/modules/road-data/channel.ts), [조회](../../src/modules/road-data/client.ts) |
| 프로필 사진 | Supabase의 비공개 `profile-photos` 버킷과 프로필 메타데이터. 업로드 전 기기 처리 경로 존재 | [사진 처리](../../src/modules/account/photo.ts), [원격 저장](../../src/modules/account/photo-remote.ts) |
| 개인 동기화 | Supabase의 `personal_records` 요약 및 `personal-records` 파일. 코스/종료한 러닝의 경로·GPS 자료, 계정 소유권·버전·해시 등. 동기화 흐름의 자료로서 일반 공개 자료와 구별 | [원격 저장](../../src/modules/sync/remote.ts), [자료 형식](../../src/modules/sync/model.ts) |
| 링크 공유 | 사용자가 공유한 러닝의 제목·거리·활동 시간·GPS 경로와 계획 경로/도형을 Supabase RPC로 전달. 링크 보유자에게 공개하는 사본에는 계정 ID/이메일 및 각 GPS 지점의 시각·정확도를 넣지 않음 | [공유 형식](../../src/modules/run-sharing/model.ts), [원격 요청](../../src/modules/run-sharing/remote.ts) |
| 문의·회원·사용량·탈퇴 | Supabase API/RPC/Edge Functions를 사용. 계정·동의/접수/사용량·삭제 처리를 기능별로 관리. 현재 문의는 탈퇴 후 환불 결과를 보내는 이메일 수집/발송 경로가 아님 | [문의](../../src/modules/support/remote.ts), [회원](../../src/modules/membership/remote.ts), [사용량](../../src/modules/usage/runtime.ts), [탈퇴](../../src/modules/account/withdrawal-remote.ts) |
| 신규 결제 검증 기반 | 서버에서 Google Android Publisher에 구매 토큰을 전달하는 검증기를 준비. Supabase 원장은 토큰 해시·계정 HMAC·상품/구매 상태를 저장하도록 작성. **미배포·앱 미연결**이며 실제 결제/전송 관측 결과가 아님 | [Google 조회](../../supabase/functions/_shared/billing-google.ts), [원장](../../supabase/migrations/20261122070123_billing_receipt_foundation.sql) |
| 고도 | PR95에서 앱 화면과 자동 조회 연결을 제거. 과거 순수 분석/클라이언트 유틸리티 파일은 남지만 현재 앱 진입점에서 사용하지 않음. 실제 설치본 적용 여부는 별도 | [반영 현황](policy-implementation-20261122.md) |

과거 [정책 대조 문서](policy-reconciliation-20261014.md)의 ‘장소 검색 미제공’, ‘계산 서버에 Supabase 자격 증명을 보내지 않음’, ‘경사 조회’는 현재 소스를 설명하는 문구로 재사용하지 않는다. 특히 사용자 세션 토큰과 서버 비밀 키는 다르지만 둘 다 보내지 않는다고 요약해서는 안 된다.

다음 확인은 각 서비스의 계약 주체·처리 국가·재위탁·로그/백업의 실제 기간, 운영 프로젝트와 빌드 설정, 접근 통제/삭제·복원 절차다. 한국 리전 설정만으로 모든 처리가 국내라고 판단하지 않는다. 이 문서는 법률 적합성 판단이나 고객 동의·국외 이전 고지를 대체하지 않는다.
