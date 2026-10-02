# 전국 도로 공급 — 4-4 PC·개발용 R2 완료

2026-10-02 두 날짜의 전국 가공·지역 목록·PC 원본 대조·영구 캐시와 실제 R2의 첫 게시·날짜 갱신·이전 버전 복구·최신 복귀를 완료했다. 최종 공개 자료 23개 사례·새 프로세스의 네트워크 0회 복원을 확인했다. 앱 소스와 새 APK의 기본 공급은 전국 채널이다. 휴대폰 설치본은 아직 네 표본이며 연결 테스트는 사용자 결정으로 후속이다. [실제 검증](../quality/national-roads-verification.md).

## 공급 계약

- 한국 OSM 원본의 크기·SHA-256·데이터 시각을 고정한다. `extract.py --national --jsonl`은 순차 출력 완료 후 출력 해시·크기·건수 보고서를 생성한다. `.partial` 또는 완료 보고서가 없는 파일은 전국 패키징에 사용할 수 없다.
- `national-package.mjs`는 원본 보고서를 검사하고 SQLite R-tree로 도로를 인덱싱한다. 보행 필터는 현 v0.2 엔진의 `runnable`을 사용한다. 전체 OSM way·node ID·좌표·속성을 유지하고 0.02도 칸과 교차하는 도로를 통째로 저장한다.
- 조회 중심 지원 범위는 위도 [33,39), 경도 [124,132)이다. 이 사각형이 행정 경계나 모든 지점의 도로 존재를 의미하지 않는다. 내용은 고정 Geofabrik 한국 추출본에 한정된다.
- 지역 소유 영역은 0.5도, 사방 여유 영역은 0.14도이며 192개 지역 목록을 생성한다. 경계에서도 최대 10km 조회 사각형을 포함한다. 목록의 모든 칸에는 도로 파일 또는 명시적 빈 칸 선언이 필요하다. 빠진 칸·중복·범위 밖 선언은 실패다.
- 전역 카탈로그 → 지역 목록 → 필요한 타일 순서로 읽는다. 각각 고정 해시·크기·릴리스를 검사한다. 같은 해시의 타일은 여러 지역에서 같은 공개 주소를 참조한다. SQLite 저장은 지역별 공급 키로 나뉘므로 중첩 타일이 기기에 중복 저장될 수 있다.
- `roads/national/v1/` 아래 카탈로그·지역 목록·타일·출처 안내는 해시 주소의 불변 파일이다. `current.json`만 조건부 전환한다. 표본 경로와 별도이며 기존 표본 포인터를 바꾸지 않는다.

## 로컬 실행

모바일 루트에서 프로젝트 Node 환경과 Python `osmium` 패키지를 준비한다. Python 경로는 기존 [표본 가공 안내](road-samples.md)를 따른다.

```powershell
. .\scripts\env.ps1
$env:PYTHONPATH = Join-Path (Get-Location) '.tools/road-python'
& $env:PYTHON scripts/road-data/extract.py --national --jsonl --output .cache/road-data/national-verified.jsonl
node scripts/road-data/national-package.mjs --input .cache/road-data/national-verified.jsonl --output build/road-data/national-verified
node scripts/road-data/national-regions.mjs
node scripts/road-data/national-verify.mjs
node scripts/road-data/national-cache-rehearse.mjs --mode local
node scripts/road-data/national-cache-rehearse.mjs --mode offline --database build/road-data/national-verified/cache-local.sqlite
node scripts/road-data/national-cache-rehearse.mjs --mode capacity
```

패키징과 새 캐시 리허설은 기존 파일을 덮어쓰지 않는다. 반복 시 새 출력·DB 경로를 지정한다. 검증기는 공간 인덱스를 사용하지 않고 원본 JSONL을 다시 읽어 전국 대표/경계 22개 위치와 추가 10km 조회의 전체 입력·그래프를 비교한다.

실제 공개 대조는 현재 게시된 릴리스와 같은 검증 묶음을 지정한다. 아래 예시는 9월 30일 자료이며 새 DB 경로로 시작한다. 공개 검사는 예상 릴리스와 전체 입력 해시를 확인하고, 오프라인 검사는 별도 프로세스에서 같은 DB를 열어 요청 0회를 확인한다.

```powershell
node scripts/road-data/national-cache-rehearse.mjs --directory build/road-data/national-260930 --mode public --database build/road-data/public-260930-new.sqlite
node scripts/road-data/national-cache-rehearse.mjs --directory build/road-data/national-260930 --mode offline --database build/road-data/public-260930-new.sqlite
```

공개 검사가 중단되면 실패 보고서와 검증 완료된 DB를 보존한다. 같은 공개 명령에 `--resume`을 추가해 재개할 수 있으며 기존 DB를 요구한다. 재개 시 이미 받은 지역은 캐시를 재사용하므로 그 시간을 최초 다운로드 성능으로 취급하지 않는다. 실제 배포의 대량 파일 검증과 대표 조회 검증은 순서대로 실행한다. 2026-10-02에는 동시 실행 중 마지막 10km 조회가 120초에 도달했고, 대량 검증 종료 후 재개해 남은 타일 112개를 17.97초에 받아 전체 입력 대조를 통과했다. 최종 23개 오프라인 요청은 0회였다. [공개 결과](../quality/national-roads-public-report.json)·[오프라인 결과](../quality/national-roads-public-offline-report.json).

## 배포와 복구

```powershell
node scripts/road-data/national-deploy.mjs plan --config .cache/road-deploy/r2-dev.json
node scripts/road-data/national-deploy.mjs upload --config .cache/road-deploy/r2-dev.json --apply
node scripts/road-data/national-deploy.mjs verify --config .cache/road-deploy/r2-dev.json
node scripts/road-data/national-deploy.mjs current --config .cache/road-deploy/r2-dev.json
node scripts/road-data/national-deploy.mjs promote --config .cache/road-deploy/r2-dev.json --expect 확인한_SHA256_또는_absent --apply
```

실제 업로드 키는 배포 전용 환경 변수로만 전달한다. 현재 PC는 Git 제외 DPAPI 래퍼를 사용한다. `upload`와 `promote`는 `--apply` 없이는 계획만 출력한다. `--bundle`, `--report`, `--concurrency`(기본 4, 업로드 최대 8·읽기 검증 최대 32)를 지정할 수 있다. 포인터 쓰기는 검증 이후 한 번의 조건부 요청으로 실행한다. 실패하면 진행 중 요청의 종료를 기다리고 신규 요청을 중지한다. 재실행은 이미 올라간 동일 객체를 검증 후 재사용한다.

`r2-dev` 설정의 공개 검증은 전체 작업자가 공유하는 최소 20ms 요청 간격을 둔다. 429는 응답을 닫고 모든 대기 작업에 10/20/40초 지수 대기를 적용하며 `Retry-After`가 더 길면 그 값을 따른다. 60초를 넘는 지시나 재시도 소진은 추가 요청 없이 실패로 끝내고 현재 포인터를 유지한다. 대기 후 실제 요청마다 30초 제한을 새로 시작하며 해시·헤더·404 오류는 재시도로 숨기지 않는다. 2026-10-02 병렬 공개 검사에서 실제 429를 관측해 보강했다. 개발 주소의 요청/대역폭 제한은 변동하며 운영 도메인/CDN을 대체하지 않는다. [Cloudflare 공식 제한](https://developers.cloudflare.com/r2/platform/limits/).

전국 검증의 일시적인 연결 실패·본문 전송 끊김·요청 시간 초과는 1/2/4초 대기 후 전체 GET을 최대 3회 다시 읽고 크기·해시·헤더를 처음부터 검사한다. HTTP 상태 오류·완료된 응답의 크기/해시 오류는 이 재시도 대상이 아니다. 부분 수신을 검증 성공으로 재사용하지 않는다. 실제 11,100개 갱신 검사 뒤 연결 실패에서 이전 포인터가 유지됨을 확인하고 보강했다. 앱의 조회 정책과 구분되는 배포 도구의 읽기 복구다.

복구는 보존한 이전 전국 묶음으로 `promote --bundle 이전폴더 --expect 현재포인터해시 --apply`를 실행한다. 모든 원본·공개 파일을 다시 검증한 뒤 조건부로 전환한다. 포인터 쓰기 뒤 검증 실패는 상태를 다시 읽어 판단하며 자동으로 덮어쓰지 않는다. 2026-10-02 실제 R2에서 9월 30일 → 9월 29일 복구 → 9월 30일 최신 복귀를 완료하고 각 단계의 앱 채널·SQLite 입력 해시를 대조했다. [검증 결과](../quality/national-roads-verification.md).

서버 포인터를 복구해도 이미 기기에 저장된 유효한 목록을 강제로 지우지는 않는다. 일반 조회는 기존 7일 캐시 정책을 따르므로 즉시 복구 버전을 확인할 때는 앱의 **새 버전 확인** 또는 캐시 검증 화면의 **받아 저장·갱신**으로 `refresh`를 실행한다. 공개 전환 대조 도구도 매 단계 `refresh`를 사용하고 마지막 단계에서 별도로 네트워크 0회의 오프라인 재사용을 확인한다.

## 용량과 갱신 운영

캐시 기본 한도는 gzip 원본과 지역 목록 합계 64MiB, 갱신 기준은 7일이다. 이는 SQLite 파일 자체의 물리 크기 상한이 아니다. 인덱스·비어 있는 재사용 페이지·WAL 공간이 더 필요하다. 초기 PC 측정에서 논리 자료 21,352,262바이트의 DB는 종료 후 21,741,568바이트, 3MiB 제한 리허설의 DB는 4,349,952바이트였다.

한 번의 계산은 한 지역 목록의 릴리스만 사용한다. 갱신 실패 시 검증 가능한 이전 전체 조회 자료를 사용하고 실패 사실을 표시한다. 명시적 갱신은 실패를 반환하며 이전 저장 내용은 보존한다. 전체 새 조회를 검증한 뒤 트랜잭션으로 저장·용량 정리·현재 버전 전환을 완료한다.

초기 갱신 기준은 주 1회 수동 실행이다. 원본 날짜 확인 → 별도 잠금 → 추출/분할 → 대표 지역 원본 대조 → 불변 파일 업로드 → 전체 원본/공개 파일 검사 → 조건부 포인터 전환 → 공개 캐시 검증 순서로 진행한다. 실패한 단계의 결과를 완료로 기록하지 않으며, 업로드 재개 시 이미 있는 파일의 해시와 헤더를 검사한다. CI/CD나 예약 실행은 설정하지 않았다. 실제 청구 비용·운영 도메인/CDN과 저사양 휴대폰 측정은 후속이다.

항상 현재 릴리스와 직전 정상 릴리스를 보존한다. 그 외 과거 릴리스도 마지막 공개 종료 후 최소 14일을 보존해 앱의 7일 갱신 기준에 여유를 둔다. 삭제 후보는 보존 릴리스 전체의 참조 집합에서 빠지고 보존 기간도 지난 객체로 한정한다. 타일은 여러 릴리스에서 공유하므로 릴리스 날짜나 폴더 이름만으로 삭제하지 않는다. 현재는 삭제 도구·예약 정리를 추가하지 않았으며 실제 객체 삭제도 하지 않았다.

```powershell
node scripts/road-data/national-storage-plan.mjs --keep build/road-data/national-verified --keep build/road-data/national-260930 --report build/road-data/retention-plan.json
```

이 명령은 보존할 자료의 참조 집합·합계와 선택적인 `--candidate`의 미참조 합계를 읽기 전용으로 계산한다. 공개 종료 시각·기기 보존 기간은 별도로 확인해야 하므로 보고서만으로 삭제하지 않는다. 2026-09-29/30 두 원본의 타일·매니페스트·카탈로그 합집합은 27,220개·388,647,266바이트(약 370.6MiB)다. 두 번째 릴리스의 추가분은 310개·29,150,550바이트이며 작은 출처 안내·현재 포인터·버킷 메타데이터·표본 경로는 제외한 값이다. 날짜 간 변화량에 따라 증가분은 달라진다. [용량 보고서](../quality/national-roads-storage-plan.json).

## 날짜가 다른 원본의 갱신

기존 표본용 `source-lock.json`은 보존하며, 새 날짜의 공식 파일 크기·체크섬·PBF 기준 시각을 확인해 `pin-source.py`로 `sources/` 아래 별도 잠금을 만든다. 다운로드가 완전히 끝난 뒤 실행한다. 크기·공식 MD5·데이터 시각 확인과 로컬 SHA-256 계산을 통과해야 잠금과 최종 원본 파일명을 확정한다.

`extract.py`, `national-package.mjs`, `national-regions.mjs`에 같은 `--source-lock`을 전달한다. 추출·패키징 출력도 날짜별 새 폴더에 둔다. `national-verify.mjs`에는 `--source`와 `--input`, 캐시 검증에는 `--directory`를 맞춘다.

갱신 패키징은 `--reuse-directory 이전_전국_폴더`를 받을 수 있다. 새 원본으로 다시 만든 타일의 도로·ID·태그·좌표 전체가 이전 타일과 동일한 경우에만 이전 gzip 바이트를 검증 후 재사용한다. 새 지역 매니페스트에 그 타일의 `tileRelease`와 압축/해제 해시를 명시한다. 한 번의 조회는 여전히 하나의 새 매니페스트가 지정하는 정확한 파일 집합을 사용한다. 이전 파일이라는 이유로 임의의 도로 데이터를 섞지 않는다. 기존 표본 규격에서는 이 재사용 필드를 허용하지 않는다.

업로드의 `--reuse-inventory 이전_전국_폴더/inventory.json`은 이전 타일 해시의 업로드를 생략하는 선택 옵션이다. 생략분이 원격에 존재한다는 증거는 아니며 보고서의 `skippedByBaseline`에 따로 집계한다. `promote`는 이 옵션을 받지 않고 재사용 파일을 포함한 모든 원본·공개 객체를 검증한다. 이전 업로드가 미완료면 포인터 전환도 실패한다.

2026-09-30 자료는 highway 1,817,116개, 보행 가능 way 1,663,412개, 타일 26,717개다. 이전 원본과 전체 내용이 같은 타일 26,600개를 재사용하고 117개를 새로 생성했다. 23개 대표/경계 전체 입력·그래프 대조를 통과했고, 내용이 실제로 달라진 10km 사례로 손상된 갱신 후 이전 자료 유지·정상 갱신·이전 버전 복구·최신 복귀·완전 오프라인을 PC SQLite에서 확인했다. [가공](../quality/national-roads-260930-packaging-report.json)·[원본 대조](../quality/national-roads-260930-verification-report.json)·[갱신 리허설](../quality/national-roads-update-rehearsal-report.json). 이 로컬 리허설과 별도로 실제 R2 포인터 갱신/복구/최신 복귀도 완료했다. 휴대폰 검증은 후속이다.

## 후속 휴대폰 검증

사용자 결정으로 이번 실행에서는 휴대폰 연결·설치를 하지 않는다. 전국 전환 코드로 만든 새 APK를 이후 업데이트 설치할 때 아래 항목을 확인한다. 기존 판교 설치본·코스·메모는 그때까지 유지한다.

1. 업데이트 설치 전후 코스·메모 개수, 앱 데이터 경로, 설치 파일 해시를 확인한다. 도로 캐시와 사용자 자료의 DB는 별개다.
2. 서울·부산과 새 지원 위치인 대전·제주·울릉도에서 주변 2km 다운로드·코스 계산을 확인한다. 일반 조회는 주변 파일만 받고 전국 gzip 전체를 받지 않는다.
3. 선택 위치를 저장한 뒤 네트워크를 끄고 앱을 강제 종료·재실행한다. 같은 위치의 조회/계산과 새 다운로드 0개를 확인한다. 저장하지 않은 위치의 오프라인 요청은 자료 부족으로 안내해야 한다.
4. 조회 취소·재시도·갱신, 용량 상태와 캐시 비우기를 확인한다. 캐시 비우기 이후에도 저장 코스·메모·GPX·시뮬레이션 자료는 유지돼야 한다.
5. 시간·메모리·UI 반응은 휴대폰 모델·조건과 함께 별도로 기록한다. 이번 PC 결과를 휴대폰 성능이나 배경 지도 오프라인 제공의 증거로 사용하지 않는다.
