# Cloud Run 코스 계산

**2026-10-17 배포 준비:** 현재 소스는 서비스 12도형·정수 1~10km와 기존 도형 ID·직접 그리기/이미지 윤곽을 받는다. 패키저의 `service-shapes.ts` 누락으로 독립 서버 시작이 실패함을 재현·수정했다. 배포 묶음 자체를 저장소 밖에서 시작하는 회귀 검사를 추가했다. 실제 운영 반영 여부는 [후속 검증](../quality/operations-readiness-20261017.md)을 따른다.

2026-10-10 사용자 결정: 로그인 여부와 관계없이 온라인 코스 계산을 Cloud Run으로 옮긴다. Supabase는 기존 계정·개인 자료 동기화, R2는 공개 전국 도로 공급을 맡는다. 계산 엔진 v0.2와 코스/러닝 저장 계약은 유지한다.

같은 날 후속으로 [공통 계산량 제한·과부하 대응](compute-protection.md)을 배포했다. HTTP 수신 동시성은 8, 실제 계산은 인스턴스당 1개다. 모든 인스턴스가 비공개 Storage의 원자적 횟수를 공유하고 장애·한도 초과 시 기기 계산으로 전환한다. 실제 계정 통화 KRW에 맞춰 승인된 월 15,000원 예산 알림도 등록·조회 검증했다.

## 요청 흐름

앱 → `POST /v1/routes` → 전국 R2 목록/타일 검증 → 동일 v0.2 엔진 → 후보 전체 결과 → 기존 앱의 후보 선택·저장·러닝. 서버 계산 성공 시 휴대폰에서 그래프/탐색을 다시 실행하지 않는다.

- 공개 계산 API: 로그인/토큰이 필요 없다. 개인 코스·GPS 기록·Supabase 자격 증명을 보내지 않는다. 계산 중심과 도형은 요청 처리에만 사용하고 앱/서버 코드에서 로그나 DB에 저장하지 않는다. Cloud Run의 기본 HTTP 접근 로그는 남는다.
- 계약 `runpen-routes-v1`: 한국 공급 범위, 반경 2km, 정수 1~10km, 자유 순환, 서비스 12도형·기존 도형 ID 또는 최대 49점의 닫힌 직접 그리기/이미지 윤곽. 임의 도로·외부 URL을 입력받지 않는다. 16KiB 요청/8MiB 응답 제한. 2026-10-17 `shapes1017` 리비전으로 운영 반영했다. 이전 `00002-nog`는 이전 도형·3/5/7km 계약이다.
- 외부 상태 확인: `GET /health`의200은 프로세스 생존만 뜻한다. 공통 사용량·저장소 건강·계산 가능 여부는 보증하지 않는다. `/healthz`는 로컬 호환 별칭이며 Cloud Run의 예약 경로 때문에 외부 확인에 사용하지 않는다.
- 도로 캐시: 기존 해시·크기·영역 검증과 64MiB SQLite 캐시를 서버 메모리에서 공유한다. 1시간 후 최신 목록을 확인하며 명시적 새 버전 확인은 즉시 갱신한다. 작업자 중단·인스턴스 종료 시 캐시는 소멸한다.
- 실행: 인스턴스당 계산 1개. 여분 요청은 429, 계산 시간 초과는 504. 앱은 자동 서버 재시도 없이 기기 계산으로 전환하며 화면에 전환을 표시한다. 서버 작업자 제한 60초, 본문 5초, 전체 65초, Cloud Run 70초, 앱 75초.
- 취소/화면 이동/백그라운드: 앱 요청 취소와 오래된 결과 무시. 서버가 연결 종료를 받으면 계산 작업자를 종료한다. 프록시가 연결 종료를 즉시 전달하지 않는 경우에도 60초 작업 제한이 남는다.
- 오프라인·합성 진단·‘기기 계산·도로 저장’은 기존 휴대폰 계산이다. **서버 성공은 휴대폰 도로 캐시를 채우지 않는다.** 오프라인 사용 전 ‘기기 계산·도로 저장’으로 해당 지역을 준비한다. 이미 저장한 코스는 기존대로 열고 달릴 수 있다.

## 배포와 복구

프로젝트 `running-art-mobile`, 서울 `asia-northeast3`, 서비스 `runpen-route-compute`. 1 CPU/1GiB, HTTP 동시성 8·계산 1, 최소 0, 서비스·리비전 최대 2, 요청 기반 CPU, 시작 CPU 부스트 OFF. 전용 `runpen-route-compute` 서비스 계정에 프로젝트 권한을 부여하지 않는다. 공통 계산량 기록 버킷의 객체 권한만 사용하며 Supabase/R2 비밀 키 없이 공개 HTTPS 도로를 읽는다.

최대 인스턴스는 비용 완전 차단이나 사용자별 이용 횟수 정책이 아니다. 공통 계산량 제한과 월 15,000원 예산 알림을 적용했지만 공개 API의 반복 HTTP 호출은 여전히 비용을 발생시킬 수 있다. 현재는 제한된 초기 운영 구성으로 대규모 출시 부하·입구 차단은 후속이다. 무료 체험 종료 후 과금 상태는 별도 확인한다.

```powershell
# 저장소 루트, 기존 도구/인증 사용
& .\.tools\node\node.exe scripts/route-compute/package.mjs build/route-compute/NEW-REVISION
$env:CLOUDSDK_CONFIG=Join-Path (Get-Location) '.cache/gcloud-server-compute'
& .\.tools\google-cloud-sdk\bin\gcloud.cmd run deploy runpen-route-compute --project=running-art-mobile --region=asia-northeast3 --source=build/route-compute/NEW-REVISION --no-traffic --tag=qa-new-revision --service-account=runpen-route-compute@running-art-mobile.iam.gserviceaccount.com --cpu=1 --memory=1Gi --concurrency=8 --min=0 --max=2 --max-instances=2 --timeout=70 --cpu-throttling --no-cpu-boost --allow-unauthenticated --ingress=all --update-env-vars=COMPUTE_GUARD_BUCKET=runpen-compute-guard-125644906792
```

위 명령은 기존 트래픽을 유지한 채 새 리비전만 준비한다. 임시 태그 주소에서 기존/확대 입력의 전체 결과·`/health`·잘못된 입력을 확인한 뒤, 실제 생성된 리비전 이름으로 트래픽100%를 전환하고 태그를 제거한다. 검증 전에 새 리비전으로 전환하지 않는다.

패키저는 코드 17개만 복사한다. 환경 파일·사용자 자료·키·APK를 빌드에 올리지 않는다. 새 출력 폴더를 사용하며 Docker 기본 이미지의 실제 digest는 배포 증거에서 확인한다. 앱 `.env.local`의 `EXPO_PUBLIC_COMPUTE_BASE_URL`에 배포 HTTPS origin을 넣어 APK를 다시 빌드한다. 주소가 비어 있으면 기존 기기 계산이다.

복구: [운영 중지·재개](compute-protection.md#운영-중지재개)의 pause로 새 계산을 멈추면 앱은 기기 계산으로 전환한다. 이전 `00001-96r`로 단순 롤백하면 공통 제한도 사라지므로 주의한다. 앱에서 즉시 ‘기기 계산·도로 저장’을 선택할 수도 있다. 서버 주소를 비운 APK로 되돌리면 서버 호출을 완전히 제거한다. 코스·계정 DB 마이그레이션은 필요 없다.

2026-10-17 반영은 PR #19 필수 검사·병합 후 `--no-traffic`/임시 태그로 새 리비전을 먼저 준비했다. 실제6표본 결과 해시·상태/오류 응답을 통과한 뒤 `shapes1017=100`으로 전환하고 임시 태그를 제거했다. 필요 시 보호 코드가 포함된 `00002-nog=100`으로 복구할 수 있으며, 이때 확대 입력은 기기 계산으로 전환된다. 기존 자원·서비스 계정·IAM·공통 사용량을 유지했다. 자동 배포는 구성하지 않았다. [상세 근거](../quality/operations-readiness-20261017.md).

## 검증 도구

- `node --test tests/route-compute-package.test.mjs`: 실제 17파일 묶음의 해시/허용 목록, 저장소 밖의 HTTP 시작·120입력 계약·대표 4계산의 전체 결과, 운영 작업자 시작을 검사한다. 소스 폴더의 import 성공만으로 배포 가능하다고 판단하지 않는다.

- `node --test tests/route-compute.test.mjs`: 계약·guest 요청·크기/과부하·취소·작업자 종료/복구·기기 전환·도로 캐시.
- `node scripts/route-compute/verify.mjs local OUTPUT.json`: 실제 공개 R2와 로컬 HTTP를 이전 휴대폰 고정 입력 결과와 비교. 먼저 기존 `server-compute/prepare.mjs`로 `.cache/server-compute/fixtures`를 준비한다.
- `node scripts/route-compute/verify.mjs https://DEPLOYED.run.app OUTPUT.json`: 같은 비교를 실제 Cloud Run에 3회 요청한다. 강남5km·부산3km·강남 직접 도형, 전체 결과 해시와 응답 계약·잘못된 요청 400을 확인한다.

[Cloud Run 동시성](https://docs.cloud.google.com/run/docs/about-concurrency), [최대 인스턴스 제한](https://docs.cloud.google.com/run/docs/configuring/max-instances-limits), [요청 기반 과금](https://docs.cloud.google.com/run/docs/configuring/billing-settings). 실제 결과는 [검증 기록](../quality/cloud-run-routes-20261010.md)을 따른다.
