# 코스 계산 서버 비교 도구

2026-10-05 사용자가 휴대폰·서버 계산 비교를 목표로 지정했다. 현재 제품의 로컬 계산 경로는 유지한다. 이 도구는 고정된 공개 표본만 받는 독립 시험이며 운영 코스 API가 아니다.

## 실행

모바일 루트에서 프로젝트 Node 24를 사용한다.

```powershell
. .\scripts\env.ps1
node scripts/server-compute/prepare.mjs --download
node scripts/server-compute/benchmark.mjs
node --test tests/server-compute.test.mjs
node scripts/server-compute/package.mjs --output build/server-compute/새로운-출력-폴더
```

- `prepare`: 휴대폰 증거의 불변 매니페스트/타일만 공개 R2에서 읽고 해시·릴리스·파일 수를 검증한다. 현재 포인터가 바뀌어도 시험 입력은 바뀌지 않는다. `--download` 없이 실행하면 `build/road-data/national-260930`의 기존 가공물을 읽는다. 출력은 `.cache/server-compute/fixtures`다.
- 각 표본을 기존 모바일 협력형 러너와 동기 실행으로 계산해 전체 결과를 대조한다. 휴대폰의 그래프 규모·탐색량·후보 순서/점수도 비교한다. 실제 도로는 폰에서 전체 후보 좌표를 추출하지 않았으므로 휴대폰과 좌표 전체 일치를 주장하지 않는다.
- `benchmark`: 루프백 HTTP와 별도 Node 자식 프로세스 1/2개를 사용한다. 각 표본의 새 프로세스 첫 요청·이후 3회, 강남 동시 1/2/4요청을 각각 3회 측정한다. 준비 3회까지 총 57응답을 기록하고 매 응답의 전체 JSON 해시를 확인한다.
- 도로 입력만 메모리에 재사용한다. 그래프와 탐색은 요청마다 새로 실행하며 후보 결과 캐시는 없다. 압축 해제는 Node zlib, 해시는 Node crypto를 사용한다. 엔진·탐색 규칙·후보 수는 제품과 같다.
- 도로 읽기/해제·계산(검증/그래프/탐색)·직렬화·큐 대기·HTTP 본문 수신을 구분한다. `cpuMs`는 자식 프로세스 CPU 사용량(런타임 보조 스레드 포함)이며 벽시계와 다르다. 메모리는 완료 시 RSS 표본과 프로세스 생애 high-water 값이고 연속 프로파일이 아니다.
- 큐 제한·알 수 없는 표본 거절·시간 초과·워커 실패 처리와 종료 시 자식 프로세스 정리를 포함한다. 실서비스 인증·사용자 입력 검증·요청 취소 시 진행 중 계산 중단·운영 재시작 정책은 별도 구현이 필요하다.

실측: [결과](../quality/server-compute-20261005.md)·[원자료 JSON](../quality/server-compute-20261005.json).

## 실제 호스팅 시험 — 2026-10-05 완료

**23:58 완료:** 실제 서울 1·2 CPU 66요청, 성공 59건 전체 결과 일치·429 7건, 서버 로그 대조·시험 서비스/이미지/활성 소스 정리를 완료했다. [결과·추천·비용/한계](../quality/cloud-run-compute-20261005.md). Git 제외 원자료가 있는 작업 PC에서 `node scripts/server-compute/analyze-hosted.mjs`로 66요청·설정·로그·정리 대조 및 공유 JSON 집계를 재현한다. 새 분석 도구 구문/린트도 통과했다. 다음은 제품 연결 여부/운영 정책 결정이다.

측정한 첫 구성은 **Google Cloud Run 서울 `asia-northeast3`, 1 vCPU / 1GiB / 계산 프로세스 1개**다. 활성 인스턴스당 동시 요청 1, 최소 인스턴스 0, 최대 1, 요청 시간 제한 120초, 요청 기반 CPU 과금·startup CPU boost 비활성으로 실행했다. CPU 중심 요청의 동시 처리 1 설정은 [공식 동시성 설명](https://docs.cloud.google.com/run/docs/about-concurrency)을 참고했다.

같은 설정에서 33요청(3표본 × 첫 요청/3반복 = 12, 강남 1/2/4 동시 × 3회 = 21)을 수행했다. 첫 관측을 무조건 cold start로 분류하지 않고 리비전·인스턴스 로그와 연결한다. 플랫폼 큐·429·시간 초과도 결과다. 이후 **2 vCPU / 2GiB / 프로세스 2개 / 동시 요청 2 / 최대 인스턴스 1**로 같은 33요청을 비교했다. 이는 단일 요청 가속과 처리량 증가를 구분하기 위한 시험이다.

판단 기준은 잠정 시험 목표다: 강남 반복 전체 대기 중앙값 10초 이하, 결과 정합성 유지, 4요청 때 대기/실패·메모리·비용을 확인한다. 이를 서비스 SLA나 전체 사용자 분포의 p95로 표시하지 않는다. 표본 통과 후 실제 앱 HTTP 전환·오프라인 정책·개인 위치 전송 정책은 따로 결정한다.

### 준비한 묶음과 배포 조건

`build/server-compute/20261005-reviewed/`는 제품 엔진과 공개 고정 입력만 담은 약 1.78MB의 복사 자료(28파일) 및 Dockerfile/NOTICE/package.json이다. 계정 키·개인 GPS·앱 환경 파일·node_modules를 복사하지 않는다. `bundle.json`에 복사 파일 해시가 있다. 공개 도로는 OpenStreetMap/ODbL 출처를 포함한다.

Node 직접 실행·Cloud Build의 Linux 컨테이너 빌드·Cloud Run 배포를 검증했다. 두 구성에 같은 이미지 digest를 사용했으며 실제 Node v24.21.0과 성공 응답의 전체 결과 해시를 대조했다. Dockerfile의 `node:24-bookworm-slim`은 이동 가능한 태그이므로 재실행 시 새 이미지 digest와 런타임을 기록한다.

공식 Windows SDK 587.0.0을 해시 검증 후 `.tools/google-cloud-sdk`에 설치했다. `CLOUDSDK_CONFIG`는 `.cache/gcloud-server-compute`, 사용량 보고는 비활성이고 시스템 PATH는 변경하지 않았다. 사용자 무료 체험 등록·SDK 접근 승인 뒤 인증·프로젝트 결제 연결·배포를 완료했다. 승인 과정은 [실행 기록](../history/executed-plans/2026-10-05-2235-server-compute-benchmark.md)을 참조한다.

아래는 이번 시험에 사용한 1 CPU 배포 명령이다. 시험 서비스는 이미 삭제됐다. 재실행 시 프로젝트·결제 상태와 기존 서비스 이름 충돌을 확인한다. 서비스는 IAM 인증 필수로 두며 공개 사용자 접근은 허용하지 않는다. [소스 배포](https://docs.cloud.google.com/run/docs/deploying-source-code)·[배포 명령](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy).

```powershell
# $benchmarkProject에는 사용자가 선택한 Google Cloud 프로젝트 ID를 넣는다.
gcloud run deploy runpen-compute-benchmark-20261005 `
  --project $benchmarkProject --region asia-northeast3 `
  --source build/server-compute/20261005-reviewed `
  --cpu 1 --memory 1Gi --concurrency 1 `
  --min-instances 0 --max-instances 1 --timeout 120s `
  --cpu-throttling --no-cpu-boost --no-allow-unauthenticated `
  --set-env-vars BENCHMARK_WORKERS=1
```

공식 관리 도구로 발급받은 호출자 ID 토큰을 `BENCHMARK_ID_TOKEN` 환경 변수에만 전달한다. 토큰은 출력하거나 보고서/파일에 저장하지 않는다. 프로브는 검토한 `.run.app` HTTPS 주소 또는 로컬 loopback만 허용하며 리디렉션을 따르지 않는다.

```powershell
node scripts/server-compute/probe.mjs --url $benchmarkServiceUrl --output .cache/server-compute/cloud-1cpu.json
```

프로브는 인증 실패 시 재시도 없이 중단하고, 다른 오류/429/시간 초과는 실패 횟수로 남긴다. 2 CPU 구성도 별도 출력으로 보존한다. 시험 종료 후 새 시험 서비스와 이번 생성 이미지/빌드 산출물을 식별해 정리하고, 기존 프로젝트 자원은 유지한다. Supabase 요금제를 변경하지 않는다.

### 시험 비용 추정

2026-10-05 공식 [Cloud Run 요금표](https://cloud.google.com/run/pricing)의 서울 요청 기반 활성 단가를 HTML 내 서울 표에서 확인했다: CPU $0.0000336/vCPU-초, 메모리 $0.0000035/GiB-초, 요청 $0.40/백만 건. 무료 구간은 결제 계정 전체에서 공유되므로 미사용을 가정하지 않는다.

두 구성에서 각각 33요청, **요청마다 자원 활성 30초라고 가정**하면 계산/메모리/요청 비용은 무료 할인 전 약 **$0.1102**다. 120초씩이면 약 **$0.4408**다. 이는 실제 속도 예측이나 청구 상한이 아니라 계산 예시다. 시작·종료·이미지 빌드/저장·인터넷 전송·세금은 별도다. 이번 시험은 사용자 승인 **$1 예산**으로 진행했다. 실제 Monitoring 기반 계산/메모리 추정은 약 $0.0144이며 빌드·저장·전송·세금은 별도다. 재실행에서 예상 비용이 승인 범위를 넘으면 범위를 줄이거나 다시 협의한다. 최대 인스턴스 설정이나 예산 알림을 강제 과금 차단으로 해석하지 않는다.

대안은 [Lightsail Linux 2GB/2vCPU/IPv4 월 $12 묶음](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)이다. 고정 서버 운영도 비교할 수 있지만 초기 시험에는 배포/정리 및 운영 부담이 적은 Cloud Run을 먼저 제안한다. 어느 서비스도 이 PC와 같은 CPU 속도를 보장하지 않는다.
