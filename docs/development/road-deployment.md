# 4-2 독립 도로 서버 배포 준비

0.02도·gzip 표본의 **실제 R2 개발용 배포·공개 다운로드 검증을 2026-10-01 완료했다.** 사용자 생성 `running-art` 버킷(APAC·Standard)에 판교 추가 후 33개 불변 객체(타일 31개·목록·출처)와 현재 포인터를 제공한다. [판교 추가 검증](../quality/pangyo-roads-verification.md). 사용자 도메인·운영 CDN·실제 이전 릴리스 복구는 후속이며 휴대폰 앱의 일반 공급 연결·영구 캐시 검증도 완료했다. [실제 검증 JSON](../quality/road-deployment-r2-dev-report.json) · [표본 재현](road-samples.md) · [표본·휴대폰 검증](../quality/road-samples-verification.md) · [배포 검증 결과](../quality/road-deployment-verification.md)

## 배포 묶음과 주소

`roads:deploy prepare`는 매니페스트와 모든 gzip 파일을 해제·검증한 뒤 `build/road-deploy/<release>-g200000-<manifest SHA-256>/`에 복사한다. 기존 파일이 있으면 바이트가 같아야 재사용한다. 입력이나 출처 안내가 바뀌면 검증에 실패한다. 표본 한도는 압축 합계 64MiB·400개이며 전국 배포는 4-4에서 별도로 확장한다.

| 객체 | 경로 / HTTP 계약 |
| --- | --- |
| 버전별 타일 | `roads/samples/v1/releases/<id>/tiles/<cell>.json.gz`; `Content-Type: application/gzip` |
| 버전별 매니페스트 | 같은 버전 폴더의 `manifest.json`; `application/json; charset=utf-8` |
| 출처 안내 | 같은 버전 폴더의 `ATTRIBUTION.txt`; `text/plain; charset=utf-8` |
| 현재 표본 버전 | `roads/samples/v1/current.json`; `application/json; charset=utf-8` |
| 불변 객체 캐시 | `public, max-age=31536000, immutable, no-transform` |
| 현재 버전 캐시 | `no-store, no-transform`; CDN 캐시 우회 |

모든 객체에 HTTP `Content-Encoding`을 설정하지 않는다. gzip은 **파일 형식**이며 전송 인코딩이 아니다. HTTP 클라이언트가 자동 해제하면 압축 바이트 해시와 크기가 달라지므로 검증에서 거부한다. 매니페스트 내부의 타일 경로는 같은 버전 폴더 기준이다.

포인터는 `format: running-art-road-channel`, `schemaVersion: 1`, `coverage: samples`, 자료 `release`, `gridStepE7`, 매니페스트·출처 안내의 객체 키·바이트 수·SHA-256을 담는다. 같은 원본 릴리스라도 매니페스트가 다르면 주소가 달라진다. 4-3 앱 어댑터는 이 포인터와 매니페스트를 검증하고 한 계산에 한 버전만 사용해야 한다. 현재 일반 앱은 이 계약을 검증한 뒤 SQLite에 저장하며 [캐시 안내](road-cache.md)를 따른다.

## 로컬 준비와 재현

모바일 루트에서 실행한다. 먼저 4-1의 `roads:package`, `roads:verify` 결과가 필요하다.

```powershell
. .\scripts\env.ps1
npm.cmd run roads:deploy -- prepare
npm.cmd run roads:rehearse
npm.cmd run test:road-deploy
```

`prepare` 출력의 `bundle` 경로를 이후 명령의 `--bundle`에 지정한다. `roads:rehearse`는 메모리 모의 저장소와 임의 loopback 포트만 사용한다. 현재 설정의 객체 업로드·재실행·HTTP 검사·포인터 전환 후 표본 지역의 전체 엔진 입력과 그래프를 원래 입력과 대조한다. 서버는 종료 시 닫고 결과는 `build/road-deploy/rehearsal-report.json`에 쓴다. 실제 R2·CDN·휴대폰 성능 검증이 아니다.

## 실제 배포 대상 설정

2026-10-01 사용자 결정으로 도메인 구매를 미루고 **개발용 `r2.dev` 주소로 먼저 표본을 검증**한다. 운영용 사용자 도메인과 CDN 검증은 이후 단계다.

개발용 설정은 [개발용 예시](../../infra/road-data/r2-dev.example.json)를 `.cache/road-deploy/r2-dev.json`에 복사해 사용한다. `publicUrlMode: "r2-dev"`를 명시하고 `accountId`, `bucket`, 버킷 Settings의 Public Development URL에 표시되는 `https://pub-….r2.dev` 루트 주소를 채운다. 임의 주소나 S3 API 주소를 대신 넣지 않는다. 이후 아래 명령의 `--config`에 이 개발용 설정 파일을 지정한다.

기본 `publicUrlMode`는 `custom-domain`이다. 모드를 생략하거나 `custom-domain`으로 설정하면 `r2.dev`를 거부하며 `r2-dev` 모드에는 Cloudflare의 개발용 주소만 허용한다. 두 모드 모두 HTTPS·루트 경로·비밀 정보 없는 URL을 요구하고 객체의 크기·해시·헤더·조건부 쓰기 검사를 동일하게 적용한다. 계획과 실행 결과의 `developmentOnly: true`는 개발용 배포임을 나타낸다.

현재 [공개 포인터](https://pub-5944210ae37a4e4987dea14ae0f41905.r2.dev/roads/samples/v1/current.json)의 해시는 `bee3509d90ace81ff74f9604554b8c77ca9896a61cfc37f05fb232f66dea320d`다. 로컬 `.cache/road-deploy/r2-dev.json`과 `development-plan.json`에 실제 대상·묶음 경로를 보관한다. 1주일 사용자 토큰은 `running-art` 버킷 Object Read & Write 권한만 갖고 2026-10-08 만료된다. 비밀 값은 `.cache/road-deploy/r2-credentials.dpapi`에 현재 Windows 사용자용으로 암호화돼 있다. 로컬 `run-r2-dev.ps1 -Command current` 래퍼는 실행 중에만 환경 변수로 복호화하며 종료 시 원래 값을 복원한다. 이 파일들은 Git 제외 대상이며 다른 PC로 복사해도 키를 복호화할 수 없다. 키 만료 후에는 새 접근 설정이 필요하지만 공개 다운로드는 업로드 키를 사용하지 않는다.

모바일 전용 버킷과 Cloudflare에 연결할 도메인을 정한 뒤 [설정 예시](../../infra/road-data/r2.example.json)를 `.cache/road-deploy/r2.json`에 복사하고 `accountId`, `bucket`, `publicBaseUrl`을 채운다. `publicBaseUrl`은 `https://도로전용도메인` 형태의 버킷 루트다. 비밀 키는 설정 JSON·Git·Expo 환경 변수에 넣지 않는다.

R2의 S3 API는 계정별 endpoint와 `auto` 리전을 사용한다. 도구는 공식 AWS SDK를 개발 의존성으로만 사용하고 앱에서 import하지 않는다. 업로드용 키는 해당 버킷에 한정한 Object Read & Write 권한으로 발급해 `ROAD_R2_ACCESS_KEY_ID`, `ROAD_R2_SECRET_ACCESS_KEY` 환경 변수에 제공한다. 도구는 다른 AWS 프로필이나 기본 자격 증명을 자동으로 사용하지 않는다. [R2 인증](https://developers.cloudflare.com/r2/api/tokens/) · [공식 SDK 예시](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)

도메인 연결과 다음 CDN 캐시 규칙은 **사용자 도메인으로 운영할 때** 적용한다. `r2.dev`에는 요청량 제한이 있고 Cloudflare 캐시를 사용할 수 없으므로 개발용 결과를 운영 CDN 검증 완료로 해석하지 않는다. 개발용 모드에서도 객체의 Cache-Control 검사는 유지한다. [R2 공개 버킷](https://developers.cloudflare.com/r2/buckets/public-buckets/)

- `/roads/samples/v1/releases/` 아래 객체만 캐시 대상으로 지정하고 원본의 Cache-Control을 따른다. JSON·TXT도 포함할 수 있도록 경로 기준 규칙을 사용한다.
- `/roads/samples/v1/current.json`은 항상 캐시 우회한다. 기존 규칙이 있다면 우회가 최종 적용되도록 확인한다. 이미 캐시된 경우 해당 URL만 제거한 뒤 다시 검증한다.
- 전용 버킷에는 공개 도로 표본만 넣는다. 원본 PBF·중간 파일·계정 키·개인 GPS는 업로드 목록에 포함되지 않는다.
- 현재 Android 네이티브 연결에는 웹 CORS가 필요하지 않다. 웹 소비자가 추가될 때 실제 허용 origin에 한해 별도 설정한다.

## 업로드·검증·전환

아래 `BUNDLE_DIR`은 prepare의 출력 경로다. `upload`와 `promote`는 `--apply`가 없으면 네트워크 쓰기 없이 계획만 출력한다. 계정 설정이 없을 때도 `plan`을 사용할 수 있다.

```powershell
npm.cmd run roads:deploy -- plan --bundle BUNDLE_DIR
npm.cmd run roads:deploy -- upload --bundle BUNDLE_DIR --config .cache/road-deploy/r2.json
# 실제 대상과 계획 확인 후 실행
npm.cmd run roads:deploy -- upload --bundle BUNDLE_DIR --config .cache/road-deploy/r2.json --apply
npm.cmd run roads:deploy -- verify --bundle BUNDLE_DIR --config .cache/road-deploy/r2.json
npm.cmd run roads:deploy -- current --config .cache/road-deploy/r2.json
# 첫 배포에 current 결과가 absent인 경우
npm.cmd run roads:deploy -- promote --bundle BUNDLE_DIR --config .cache/road-deploy/r2.json --expect absent --apply
```

업로드는 타일·출처 안내·매니페스트 순서다. 새 객체에는 `If-None-Match: *`를 사용한다. 이미 있으면 실제 본문 해시·크기·헤더가 같을 때만 재사용하고 다른 객체를 덮어쓰지 않는다. 중단되면 `current.json`은 그대로 남으며 업로드를 다시 실행할 수 있다.

전환은 먼저 현재 포인터의 SHA-256이 `--expect`와 같은지 확인한다. 모든 원본 객체와 공개 HTTP 응답을 다시 검사한 뒤, 기존 포인터가 있으면 그 ETag로 `If-Match`, 없으면 `If-None-Match: *`를 적용한다. 검증 중 다른 실행이 포인터를 바꾸면 전환에 실패한다. R2의 조건부 PutObject 지원을 사용한다. [S3 호환 표](https://developers.cloudflare.com/r2/api/s3/api/)

`verify`는 인증 없이 공개 주소의 **버전별 객체**를 검사한다. `promote`는 쓰기 후 현재 포인터의 원본·공개 주소까지 대조하며 크기 초과·리다이렉트·잘못된 Content-Encoding·캐시 정책·CDN HIT/STALE를 실패로 처리한다. 요청 제한 시간은 30초다. 실제 R2/CDN에서 이 과정이 통과해야 외부 배포 완료로 기록한다.

## 이전 버전 복구와 실패 처리

이전 묶음을 보관한다. `current`로 확인한 현재 SHA-256을 `--expect`에 넣고 **이전 BUNDLE_DIR로 같은 promote 명령**을 실행한다. 이전 버전의 원본·공개 파일도 모두 검증하며 현재 포인터만 조건부 갱신한다. 배포 도구에는 객체 삭제·버킷 생성·도메인 변경 기능이 없다.

쓰기 후 응답 유실이나 CDN 검사 실패는 변경이 이미 일어났을 수 있다. 이때 명령은 실패하고 자동 복구하지 않는다. `current`로 원본 상태를 확인하고 공개 주소·캐시 설정을 고친 후 해당 SHA-256을 기준으로 재전환 또는 이전 묶음 복구를 실행한다. 오래된 `--expect`로 반복 덮어쓰지 않는다.

`ATTRIBUTION.txt`는 OSM·Geofabrik 출처, 고정 원본 주소·해시·기준 시각, ODbL 링크와 가공 스크립트 위치를 포함한다. 원본 다운로드 주소의 보존 기간과 공개할 가공 소스·원본 보관 정책은 실제 외부 공개 시 함께 확인한다. 이번 실행은 외부 공개나 전국 제공을 완료한 것이 아니다.
