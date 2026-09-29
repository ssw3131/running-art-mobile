# 도로 조회 재시도 서버 단일화 검증

실행: 2026-09-29 23:45 KST 시작, 2026-09-30 검증. 상태: 로컬 코드·검증 및 최신 앱 휴대폰 업데이트 완료, 서버 배포 보류.

## 구현

- 앱 `src/modules/road-data/client.ts`: Overpass 주소·쿼리·공급자 반복문·시도별 타이머 제거. 기본·사용자 지정 API 모두 1회 호출, 본문 읽기와 검증 포함 65초. 메모리 캐시·OSM ID·전체 geometry·범위 검사·취소·수동 재요청 유지.
- 웹 `hosting/road-provider.mjs`: 배포/로컬 서버 공통 공급자 전환·본문 검사·취소/시간 제한. A→B 각 1회, 네트워크·시간 초과·5xx·손상/부분 응답만 전환. 4xx는 종료, 429/406은 API 429로 변환하고 제공된 `Retry-After` 유지. 시간 초과는 504, 그 외 공급자 실패는 502, 수신한 취소는 499로 처리한다.
- Overpass 쿼리 20초, 공급자당 25초, API 전체 55초. 응답 검사 상한은 모바일과 같은 2천만 문자·10만 요소다. 문자 상한 초과는 같은 대용량 쿼리를 반복하지 않고 종료한다. 정상 응답·요청 매개변수·`X-Road-Area` 계약을 유지한다.
- 로컬 `hosting/road-cache.mjs`: 기존 공유 캐시의 최대 8항목·15분과 동일 요청 병합 유지. 개별 호출 취소는 공유 작업을 중단하지 않으며 마지막 호출 취소 시 중단한다. 실패·늦은 이전 요청은 새 요청의 캐시를 덮지 않는다.
- 배포 서버의 도로 캐시만 `queryVersion=3`으로 변경해 과거에 검증 없이 저장된 응답을 다시 읽지 않는다. 영역 기준·15분 TTL·캐시 장애 시 정상 조회는 유지한다. 주소/고도 API 정책은 유지한다.
- 앱은 `ROAD_DATA_ATTEMPT`, 서버는 `ROAD_PROVIDER_ATTEMPT`로 시간·호스트·상태·결과를 기록한다. 좌표·키·응답 본문은 로그에 넣지 않는다.

## 자동 검사와 통합 확인

| 대상 | 명령·방법 | 결과 |
| --- | --- | --- |
| 모바일 관련 | `node --test tests/route-center-road.test.mjs` | 16개 통과 |
| 모바일 전체 | `npm test` | 74개 통과 |
| 타입·린트 | `npm run check` | 통과 |
| Android 번들 | `npm run export:android -- --output-dir .cache/road-retry-android-export` | 1,382모듈·Hermes 번들 생성 성공 |
| 서버 도로 관련 | `node --test tests/road-provider.test.js tests/road-cache.test.js tests/hosting.test.js tests/road-query.test.js tests/snapshot.test.js`, `node --test tests/local-roads.test.js` | 20개 + 5개 통과 |
| 서버 전체 | `node --test tests/*.test.js` | 47개 중 45개 통과, 기존 줄바꿈 해시 검사 2개 실패 |
| 서버 빌드 | `node scripts/build.mjs`, `node --check dist/server/index.js` | 통과 |
| 통합 | 실제 앱 로더 → 로컬 HTTP 서버 / 실제 앱 로더 → 빌드된 Worker | 각각 앱 호출 1회, 서버 A 실패→B 성공 2회, 다음 조회는 앱 캐시. 좌표·노드 ID 보존 |

타이머·본문 정지·잘못된 JSON·`remark`·손상된 노드·4xx·양쪽 실패·시도 중 취소·전체 제한·늦은 응답·공유 호출 일부/전체 취소를 검사했다. 로컬 HTTP 연결 종료가 공급자 요청의 AbortSignal까지 전달됐고, 실패 응답은 캐시에 들어가지 않았다. 기존 서울 도로 저장 자료로 변경된 출발점의 코스 생성 검사도 통과했다. 새 지역 서버 전환 검사는 공급자 응답을 모의했으며 실제 공개 Overpass 부하 시험이 아니다.

서버 전체 검사 실패는 `tests/versions.test.js`의 v0.1 원본 해시와 `tests/v03.test.js`의 v0.2 원본 해시다. `core.autocrlf=true`인 기존 Windows 체크아웃에서 CRLF로 바뀐 바이트가 원인이다. `git show HEAD:versions/...`의 35개 원본은 모두 매니페스트 해시와 일치했고, 작업 폴더와 Git 원본의 차이는 CRLF뿐이었다. `git diff -- versions`도 비어 있다. 보관본·매니페스트·원본 검사 기준은 수정하지 않았다.

## 반영 순서와 남은 작업

기존 Sites ID를 조회한 결과 `Sites project not found`였다. 서버 소스와 빌드는 준비했지만 운영에는 배포하지 않았다. 최초 로컬 작업에서는 모바일 소스와 번들만 준비했으며, 이후 사용자 설치 요청으로 아래 최신 APK 업데이트를 수행했다. 운영 연결 종료 신호 전달은 호스팅 설정의 확인이 필요하며, 미전달 시에도 서버 전체 55초 제한을 적용하도록 소스에 구현했다.

남은 순서: 기존 사이트 접근 복구 → 동일 사이트·주소로 서버 배포 → 설치된 최신 앱으로 저장 자료·캐시 밖 조회와 취소/시간 제한 확인. 새 사이트 생성·공급자 변경·영구 도로 저장·CI/CD는 이번 작업에 추가하지 않았다.

## 후속 휴대폰 설치 — 2026-09-30

사용자가 “폰에 설치해줘”라고 요청해 서버 선배포 대기와 별도로 최신 앱을 빌드·업데이트했다. 운영 서버는 이전 코드임을 설명했다.

- 프로젝트 JDK 17·Node 24.21.0·기존 SDK와 캐시로 `:app:assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a,x86_64`를 실행했다. 4분 4초, 809개 작업 중 45개 실행·764개 캐시 재사용, 성공. 네이티브 설정·의존성을 변경하지 않았다.
- `apksigner verify` 통과, 기존 APK와 동일 서명. 앱 ID `com.runningart.mobile.dev`, 버전 0.1.0/code 1, 최소 API 24·대상 API 36, arm64·x86_64다.
- 소스맵의 실제 `src/` 파일 26개가 현재 파일과 일치한다. 생성된 가상 Router context와 외부 라이브러리는 실제 앱 소스 비교에서 제외했다. 새 단일 호출·65초 정책을 확인했고, APK의 `assets/index.android.bundle` 해시가 생성 번들과 일치한다.
- 전달 파일: `build/install/running-art-0.1.0-20260930.apk`, 95,416,995바이트. SHA-256: `f75f4847d2c230181c00cc7d23628dd6c83933728588e347e486eb5f6292e8fc`. 체크섬·`INSTALL-20260930-ko.txt`를 함께 보관한다.
- SM-S942N에 `adb install -r --no-streaming`으로 설치해 `Success`를 확인했다. 설치 직후 USB가 잠시 끊겼지만 재연결 뒤 대조를 완료했다. 설치본 해시가 위 파일과 일치하고 마지막 업데이트는 2026-09-30 00:49:45다.
- 최초 설치 2026-09-27 16:29:39, 기존 데이터 경로와 데이터 inode가 유지됐다. 앱 삭제·데이터 초기화는 하지 않았다.
- Metro 포트 전달이 없는 상태에서 강제 종료 후 명시적 Activity 실행에 `Status: ok`, `LaunchState: COLD`가 반환됐다. 새 앱 프로세스와 전경 Activity를 확인했고 코스 계산 테스트의 지도·조회 진행 화면이 표시됐다. 조회·코스 계산 완료를 검증한 것으로 보고하지 않는다. 화면 캡처는 로컬 `.cache/road-retry-phone/launch.png`에만 보관한다.
- 이번 빌드가 시작한 Gradle daemon 1개를 종료했다. 기존 앱 소스·자동 검사 결과는 유지하며 서버 배포·GitHub APK 공개는 수행하지 않았다.
