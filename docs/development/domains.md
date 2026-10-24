# 회사·RunPen 도메인 운영

2026-10-24 사용자 승인으로 Cloudflare 연결·배포를 실행했다. 예스닉 등록 도메인은 `alohalab.co.kr`이며 Cloudflare 네임서버 `kayden.ns.cloudflare.com`, `sunny.ns.cloudflare.com`을 사용한다.

| 주소 | 역할 | 배포 대상 |
| --- | --- | --- |
| https://alohalab.co.kr | 회사 소개 준비 안내 | alohalab-web |
| https://runpen.alohalab.co.kr | RunPen 소개 준비 안내 | runpen-service |
| https://runpen.alohalab.co.kr/share/ | 기존 공개 러닝 링크 뷰어 | 동일 Worker 정적 파일 |
| https://runpen.alohalab.co.kr/roads/ | 공개 전국·표본 도로 파일 | 기존 running-art R2 |
| https://runpen.alohalab.co.kr/api/health | 계산 서버 상태 | 기존 서울 Cloud Run |
| https://runpen.alohalab.co.kr/api/v1/routes | 코스 계산 POST | 기존 서울 Cloud Run |

회사·서비스 HTML은 `web/domains/`, Worker와 사용자 도메인 설정은 `infra/domains/`에 있다. 정식 소개 원고·다운로드 링크·정책은 아직 게시하지 않았다. `/policies/privacy`는 404다. `www`는 사용자 승인 범위에 따라 기존 A `118.67.131.217`/Proxied/Auto 그대로이며 이번 회사 페이지 주소가 아니다. HTTPS는 실제 검증했으며 HTTP 강제 전환은 zone에 설정하지 않았다.

## 빌드와 배포

공유 웹에 필요한 공개 Supabase·지도 설정을 로컬 `.env.local`에 둔다. 비밀 키를 넣지 않는다. 공식 Wrangler 4.152.0과 Node 24.21.0에서 확인했다.

```sh
node --env-file=.env.local scripts/build-domain-web.mjs
wrangler deploy --config infra/domains/runpen.jsonc
wrangler deploy --config infra/domains/company.jsonc
node scripts/verify-domains.mjs
```

빌드에는 명시한 안내 HTML·404·헤더와 기존 공유 뷰어만 포함한다. 정책 초안·APK·개인 기록은 포함하지 않는다. Supabase Auth/DB/Storage, MapTiler, Cloud Run 설정·전역 계산 보호 한도는 유지했다. 새 요금제/구독을 신청하지 않았다.

도로 Worker는 GET/HEAD 및 두 공개 prefix만 받는다. gzip 파일은 Content-Encoding 없이 원본 바이트·길이·해시 검증을 유지하며 content-addressed 파일만 캐시한다. 계산은 고정 서버의 두 경로만 허용하고 16KiB 요청 제한·본문 읽기 시간 제한·70초 상한을 두며 쿠키/인증을 전달하거나 결과를 캐시하지 않는다. 기존 서버가 응답한 429/Retry-After도 유지한다.

## 앱 반영과 복구

다음 앱 빌드 설정은 도로 `https://runpen.alohalab.co.kr`, 계산 `https://runpen.alohalab.co.kr/api`, 공유 `https://runpen.alohalab.co.kr/share/`다. 도로 기본값을 변경했고 `/api` 계산 경로를 허용한다. 도로 캐시의 source 식별자는 이전 R2 주소를 유지해 기존 오프라인 자료를 재사용한다. 다른 호스트의 캐시는 합치지 않는다.

별도 작업 사본의 `.env.local`에 새 주소를 적용했다. 기존 정책 작업 폴더의 환경 파일과 휴대폰 설치본은 그대로다. 휴대폰은 새 APK 업데이트 후에 이 경로를 사용한다. 이 작업은 휴대폰 설치·실기기 통합 통과를 뜻하지 않는다.

복구 시 앱의 도로 주소는 기존 `https://pub-5944210ae37a4e4987dea14ae0f41905.r2.dev`, 계산은 `https://runpen-route-compute-125644906792.asia-northeast3.run.app`, 공유는 `https://runpen-shared-runs.ssw3131.workers.dev`로 되돌릴 수 있다. 기존 서비스는 삭제하지 않았다. 회사 DNS 원복은 Worker 사용자 도메인 연결을 제거한 후 apex A `118.67.131.217`, Proxied, TTL Auto를 복구한다. 변경 전 이 주소는 521 오류였다.

## 확인 근거

실제 HTTPS 200, 공유 뷰어 6파일 SHA-256 일치, 전국 pointer 원본 363바이트·해시·인코딩 없음, 강남/부산/구로·광명 도로 요소 3454/2008/2929 및 전체 내용 해시 일치, 강남 하트 3km 실제 계산 후보 5개를 확인했다. 무효 요청 400/과대 요청 413·없는 경로와 미게시 정책 404도 확인했다. 상세 증거는 로컬 `test-results/domains/live.json`과 [실행 기록](../history/executed-plans/2026-10-24-1519-domain-connection.md)에 남긴다.
