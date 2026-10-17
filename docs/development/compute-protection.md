# 계산 서버 과부하·남용 제한과 비용 알림

2026-10-10. 비로그인 `POST /v1/routes` 계약과 서버 실패 시 기기 계산 전환을 유지한다. 사용자별 상품 이용권·과금 횟수가 아니라 초기 운영 자원을 보호하는 서버 전체 제한이다.

## 실제 적용한 계산 제한

| 범위 | 한도 | 기준 |
| --- | ---: | --- |
| 인스턴스 내 실행 | 계산 1개 | HTTP 동시 수신은 8개, 실행 자리가 없으면 즉시 429 |
| 서버 전체 1분 | 6회 | UTC 고정 구간 |
| 서버 전체 1시간 | 60회 | UTC 고정 구간 |
| 서버 전체 1일 | 200회 | UTC 00:00, 한국 09:00 갱신 |
| 서버 전체 1개월 | 3,000회 | UTC 매월 1일 00:00 갱신 |

최소 0/최대 2개, 1 CPU/1GiB, 작업자 60초·HTTP 전체 65초·Cloud Run 70초 설정이다. HTTP 수신 동시성을 1→8로 변경해 초과 요청을 애플리케이션이 빠르게 429로 응답하도록 했다. 실제 엔진 계산은 계속 인스턴스당 1개다. 요청 본문 16KiB·헤더 8KiB·본문 대기 5초·응답 8MiB 제한이 있다.

서울 비공개 `runpen-compute-guard-125644906792` 버킷의 `admission-v1.json`을 모든 인스턴스·리비전이 공유한다. 세대가 일치할 때만 횟수를 갱신하며, 기록에 성공해야 계산을 시작한다. 경쟁 시 최대 세 번만 다시 읽고, 저장소 장애·손상·객체 누락·응답 유실에는 계산을 허용하지 않는다. 인스턴스 재시작이나 조작한 클라이언트 헤더로 횟수가 초기화되지 않는다. 작업 취소·계산 실패에도 이미 예약한 횟수는 돌려주지 않는다.

저장 내용은 UTC 구간·횟수·마지막 시각·중지 플래그뿐이다. 위치·도형·계정·IP를 기록하지 않는다. 클라이언트 IP·설치 ID를 신뢰하는 사용자별 제한은 아니다. 버킷은 공개 접근 차단·uniform access·버전 관리 없음·soft delete 0초이며 계산 서비스 계정의 `storage.objectUser` 권한을 이 버킷에만 부여했다. 프로젝트 전체 권한·서비스 계정 키는 추가하지 않았다. 작은 운영 횟수 객체만 담는 이 버킷의 보존 설정을 사용자 자료 저장소에 적용하지 않는다.

저장소 호출 전에는 인스턴스별 토큰 12개·초당 1개 보충의 HTTP 요청 제한과 계산 점유 검사를 거친다. 저장 장애 시 30초, 저장소 경쟁 실패 시 5초, 전체 한도 초과 시 최대 60초 동안 차단 결과를 재사용해 저장소 요청을 줄인다. 거절은 `Retry-After`를 포함한다. 앱은 서버를 자동 재시도하지 않고 기존 기기 계산으로 넘어간다. `/healthz`의 성공은 프로세스 생존만 뜻하며 계산 가능 횟수·저장소 건강까지 보증하지 않는다.

## 운영 중지·재개

모바일 루트에서 실행한다. 토큰은 프로세스 환경에만 두고 출력·파일에 기록하지 않는다.

```powershell
$env:CLOUDSDK_CONFIG=Join-Path (Get-Location) '.cache/gcloud-server-compute'
$env:ROUTE_OPERATOR_TOKEN= & .\.tools\google-cloud-sdk\bin\gcloud.cmd auth print-access-token
try {
  # status를 pause 또는 resume으로 변경한다. resume은 횟수를 초기화하지 않는다.
  & .\.tools\node\node.exe scripts/route-compute/control-admission.mjs status runpen-compute-guard-125644906792
} finally { Remove-Item Env:ROUTE_OPERATOR_TOKEN }
```

`pause`는 새 계산을 503 `compute_paused`로 거절한다. 이미 실행 중인 계산은 각 요청의 시간 제한 안에서 끝난다. `resume`은 동일 횟수를 유지하며, 인스턴스의 차단 캐시가 만료되는 최대 60초 뒤 재확인된다. 객체를 삭제하거나 초기 JSON으로 덮어 횟수를 초기화하지 않는다. 최초 객체 생성은 `--if-generation-match=0` 조건으로 한 번만 수행한다.

Cloud Run에 `COMPUTE_GUARD_BUCKET`이 없으면 프로세스가 시작되지 않는다. 로컬 계산 시험에서는 선택 사항이다. 운영 배포에는 해당 환경 변수와 HTTP concurrency 8·최대 인스턴스 2를 함께 유지한다. 17개 코드 파일만 묶는 패키저에는 비밀 값·환경 파일·사용자 자료를 넣지 않는다.

2026-10-17 수정 소스의 외부 상태 확인 경로는 `/health`다. 기존 `/healthz`는 로컬 별칭으로 유지하지만 Cloud Run 예약 경로 때문에 운영에서404였으므로 외부 모니터링에는 쓰지 않는다. 새 리비전 반영 결과는 [운영 후속 검증](../quality/operations-readiness-20261017.md)을 따른다.

이번 리비전은 `runpen-route-compute-00002-nog`다. 이전 `00001-96r`은 제한 코드가 없으므로 단순 롤백하면 보호도 사라진다. 장애 시 우선 pause로 기기 계산을 유도하고 수정 리비전을 배포한다. 저장소 접근 장애 자체는 계산 차단으로 처리된다.

## 예산 알림 설정

사용자가 최초 월 US$10 선택 후 실제 결제 계정 통화 KRW에 맞춘 **월 15,000원**을 승인했다. `RunPen monthly usage before credits` 예산을 생성하고 2026-10-10 16:58:52 KST에 금액·기간·프로젝트·크레딧 처리·임계값·기존 수신자 설정을 조회 검증했다. 예산 ID는 `b45c4bb0-3857-4102-a4dd-f5ec87467231`이다.

`scripts/route-compute/set-budget.ps1 -AmountKrw 15000`으로 `running-art-mobile` 프로젝트 전체·매월·모든 크레딧 제외·실제 50/90/100%·예상 100%를 설정했다. 실제 금액은 7,500/13,500/15,000원이며 월말 예상 15,000원 초과도 알린다. 같은 관리 이름이 있으면 갱신하며 다른 예산은 수정하지 않는다. 수신자는 결제 계정의 기존 Billing Account Administrator/User다. 실제 메일 도착은 시험하지 않았다.

크레딧 제외는 무료 체험에 가려지는 사용량을 보기 위한 설정으로 실제 청구액과 다를 수 있다. 알림은 청구 데이터 반영 지연이 있으며 결제 차단·유료 전환·US$10 지출 보장을 뜻하지 않는다. Cloud Run 외의 빌드·이미지·Storage도 같은 프로젝트 예산에 포함된다. Supabase·Cloudflare·MapTiler 비용은 이 Google 예산에 포함되지 않는다.

## 검증과 한계

- `node --test tests/route-admission.test.mjs tests/route-compute.test.mjs`: 경쟁·재시작·UTC 갱신·장애/손상·응답 유실·취소·과부하·계약·기기 전환.
- `verify-admission.mjs`: 실제 GCS에서 별도 객체로 경쟁·조건부 갱신·익명 차단을 확인하고 시험 객체 삭제. 운영 횟수는 조작하지 않는다.
- `verify.mjs`: 실제 R2 강남·부산·직접 도형의 전체 결과 해시를 기존 고정 입력과 비교.
- `verify-overload.mjs`: 8요청을 한 번만 보내 성공 결과·429/503·응답 시간을 기록한다.

이 보호는 고비용 계산의 누적·동시 실행을 제한한다. 한 익명 호출자가 전체 한도를 소진하면 정상 사용자도 기기 계산으로 전환된다. 분산 사용자별 공정성·봇 식별·대규모 DDoS 차단을 구현한 것은 아니다. HTTP 요청·콜드 스타트·접근 로그·빌드·저장소 비용은 여전히 발생할 수 있어 전체 청구액의 강제 상한으로 해석하지 않는다. 공개 대규모 출시 시 입구에서 차단하는 WAF/Cloud Armor 등의 구성·비용을 별도로 정한다. Cloud Run 기본 접근 로그는 플랫폼 정책대로 남으며, 앱 추가 로그는 입력 없는 승인·거절 이벤트이고 거절은 인스턴스당 30초에 한 번만 기록한다.

공식 근거: [Cloud Storage 조건부 갱신](https://docs.cloud.google.com/storage/docs/request-preconditions), [Budget API](https://docs.cloud.google.com/billing/docs/how-to/budget-api), [계정 통화·크레딧·임계값](https://docs.cloud.google.com/sdk/gcloud/reference/billing/budgets/create). 실제 결과는 [검증 기록](../quality/compute-protection-20261010.md)을 따른다.
