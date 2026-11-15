# 가까운 코스·합류 경로 검증

**PR62·PR63 통합 A7 검증 진행 중**이다. 이전 main6a72e79 기준 제품18e84de/검사b98e602의 전체346은 Android29 실패 작업1회 재실행 뒤 모든 필수 게이트를 통과했다. 그동안 PR62와 기록 PR64가 main25c390a에 반영돼 새 통합 소스의 검증이 필요하다. 사용자 요청대로 두 기능을 A7에서 함께 검증한 뒤 PR63을 병합한다. 최초 실패·진단·이전 기준 성공은 아래에 보존하며 최신 통합본·폰·성능 통과로 대신하지 않는다.

## 확인한 범위

- 기존 엔진 원본 대조15개 통과. 최초 러닝 검사 일부는 의존성 설치 전 모듈 부재로 실패했으며 설치 후 관련 검사로 재확인한다.
- 경로·API·새 정책 첫57개 중55통과/2실패: 변경한 소스 미발견 조기 종료 기대가 이전3회였던 검사와, 스트림 시험에서 공유 fixture의 후보를 비워 재조회가409가 된 시험 결함. 원인을 수정하고 관련41개/배포 번들 검사를 통과했다.
- 첫 전체 UI236개 중235통과/1실패: 시간 초과 안내에 추가된 재시도 문구를 이전 완전일치로 검사했다. 안내 문구와 동작을 함께 확인하도록 수정했다.
- 타입 검사 통과. `expo lint`는 홈 `.expo` 쓰기 제한 때문에 첫 실행 실패. 홈을 변경하지 않고 Expo telemetry를 끈 공식 환경변수로 재확인한다.

## CPU 비교와 한계

`scripts/benchmarks/nearby-approach.mjs`는 동일 공개 입력으로 이전 planner와 새 planner를20회씩 비교하며 최단 도보 거리 차이를 검사한다. GPS·다운로드·SQLite·Hermes를 포함하지 않는 Node CPU 결과이며 휴대폰 성능으로 주장하지 않는다. 원본은 `test-results/nearby/cpu.json` 및 로컬 실행 로그에 보관한다.

최초 비교: 격자5.66→8.31ms(46.8% 느림), 서울68.27→23.70ms(65.3% 단축). 격자는 직선691m/도로972m로1km 경계 확인 후2km를 다시 구성했다. 실제 우회 가능성을 버리지 않고 시작 반경에1.5배 여유를 두었다. 후속 비교는 격자6.72→7.49ms(11.5% 느림), 서울62.86→23.47ms(62.7% 단축)이며 경로 재사용 P95는 각각0.67/0.56ms였다. 병렬 검사 중 측정값은 전용 실행과 구분한다. 최초 성능 회귀를 삭제하지 않는다.

## 중간 검증 상태 — 최종 상태는 아래 후속 기록 우선

- 최종 로컬 fast 통과(로직594·UI239·타입/린트/서버/OpenAPI/정책), 이후 스트림 취소와 캐시 경계 보완은 관련 검사로 확인한다.
- PR draft/ready 전체 API·Android29/36·화면 검증 및 main 반영 확인.
- SM-A102N 최초 조회/파일 캐시/그래프 캐시/완성 경로의 각20회 실측. 최초 중앙값30% 단축·경로 재사용P95 1초 목표는 아직 미검증이다.


## 추가 확인 — PR63 검토 중

[첫 draft 실행](https://github.com/ssw3131/running-art-mobile/actions/runs/43675914363)은 UI238통과/1실패였다. 새 `isStartFix`를 `running-preparation.test.tsx` 모의 객체에 빠뜨린 원인이며 원본 아티팩트와 로컬 재현을 대조했다. 모의 객체 수정 후 해당 검사와 전체 fast를 통과했다. 직접 CLI 아티팩트 다운로드의403은 GitHub 연결 도구로 원본 ZIP을 받아 해결했다.

24개 공개 고정 표본(격자/서울 ×1·2·3·5·10·20km ×하트/직접 그리기)에서 이전 최고점은 모두 보존됐다. 후보 확보는19/24→20/24, 새 결과의 합류1km 이내 확보는20/24다. 20km 네 표본은 도로 파일 범위가 작아 양쪽 모두0개였으며 전국/장거리 성공률을 뜻하지 않는다. 동기 계산과 기기/서버 공용 협력 계산의 전체 결과도24개 모두 일치했다. 원본과 생성 시간은 `test-results/nearby/quality.json`에 보관한다.

| 공개 표본 | 이전 최고점 코스 접근 | 새 가까운 대표 접근 | 5점 초과 선택 필요 |
| --- | ---: | ---: | --- |
| 서울 하트2km | 1,156m | 72m | 예 |
| 서울 직접 그리기2km | 795m | 72m | 예 |
| 서울 하트3km | 595m | 460m | 아니오 |
| 서울 직접 그리기3km | 595m | 0m | 예 |

추가 배치로 생성 시간이 늘 수 있다. 서울2km 두 형태는 새 계산 약3.4초,3km는 약5.9초였으며 기기/서버 실제 통신 시간과 구분한다.

합류 경계 보완에서는1.5배 반경 여유를 최종 채택하지 않았다. 거리 하한+30m 도로 스냅 여유로 첫 범위를 고르고, 경로 거리+GPS/도로 간격이 경계까지의 거리 하한보다 짧으면 이미 최단 경로임을 확인할 수 있다. 불필요한100m 여유 때문에972m 경로를2km에서 다시 만들던 문제를 제거했다. 작은 GPS 이동에 그래프를 재사용하는 후속 변경은 우회 검사에서 동일한 실패 그래프를 재사용하는 결함을 드러냈고, 한 요청에서 이미 시도한 그래프를 다시 선택하지 않도록 고쳤다.

후속 Cloud Node20회 비교: 격자5.25→2.59ms(50.6% 단축), 서울65.33→21.89ms(66.5% 단축), 완성 경로 재사용P95 각각0.48/0.50ms. 실제 다운로드·파일 캐시·GPS·Hermes·휴대폰 값은 아니다. 최초 회귀 수치도 위에 보존한다.


통합 후속: 준비 화면이30m 안의 위치 이동에서 경로 형식만 확인해 같은 도로 검사로 진입하지 않는 경우를 발견했다. 준비 UI와 실제 시작에서 공유 planner의 도로 검사를 거치도록 연결했고, 실제 시작에도 경로10초 제한·실패 후 명시적 재확인을 추가했다. 지연 응답 후 작은 GPS 이동의 재검증이 걸리던 경우는 진행 요청을 완료 처리한 뒤 결과를 게시하도록 수정했다. 관련52개 로직과 준비 UI를 확인하고 최종 전체 회귀를 실행한다.

중간 ready43676688680과 preview43676719412는 이 후속 수정에 맞추기 위해 중단했다. 해당 ready의 Android failure 표시는 취소 후 결과 폴더가 없는 상태에서 gallery/cleanup이 실행된 결과이며 실제 제품 실행 실패가 아니었다(원본 job 로그 대조). preview43676689044는 존재하지 않는 source SHA를 전달한 실행 실수로 source 검증에서 실패했으며 제품 빌드 실패가 아니다. 수정된 실제 SHA의 최종 산출물만 인계한다.

최종 보완 후 로컬 fast 전체(타입/린트/서버/로직/UI/OpenAPI/정책)와 보행 일방통행 이동/10m 평행 도로의 캐시 검사13개를 통과했다. 후자의 이동은 완성 경로 대신 도로망을 재사용한다.

ready43677406985는 변경 검토 JSON의 자동 경로 목록에 빈 문자열이 들어가 scope에서 중단됐다. 제품 검사를 실행하기 전의 검토 자료 오류이며 빈 경로를 제거해 다시 검사한다.

교량/분리 도로의 끝점이 같은 좌표에 겹친 추가 표본에서 이전 소스 스냅이 도로를 임의 선택하는 경우를 재현했다. 끝점도 OSM 노드가 공유되지 않으면 모호성으로 처리하고, 실제 노드 공유 교차로는 계속 허용하도록 보완했다. 이는 직선 연결이나 점수식 변경이 아니다.


## 전국 채널의 공개 부산시청 표본

공개 부산시청35.1796,129.0756, 도로 `kr-20260930-c8cb96030306-roads-v1`, manifest `35ca7c88052c975b9a48bd5c204f04c8e9833adf4ed1d952b01c63cf866275df`에서5km 범위11,796개 OSM 항목을 읽었다. 같은 자료로2·3·20km 하트 및20km 사용자 사각형을 비교해 모두5개 후보와 이전 최고점을 유지했다. 원본/결과는 `test-results/nearby/public-busan-roads.json`, `public-busan-quality.json`에 보관한다. 최초 직접 Node fetch는 환경 연결 오류였고, Node 공식 `--use-env-proxy`로 환경 프록시를 사용해 동일 공개 자료를 받았다. 실제 사용자 출발지나 운영 생성 API/횟수는 사용하지 않았다.

| 거리·도형 | 가까운 대표 접근 | 최고점과 차이 | 기본 선택 | 이전→새 계산 |
| --- | ---: | ---: | --- | --- |
| 2km 하트 | 266m | 4.41점 | 가까운 대표 | 1.51→1.63초 |
| 3km 하트 | 243m | 4.55점 | 가까운 대표 | 1.67→1.86초 |
| 20km 하트 | 431m | 0점 | 가까운 대표 | 13.82→18.24초 |
| 20km 사용자 사각형 | 177m | 1.58점 | 가까운 대표 | 36.22→36.30초 |

부산2km의 최고점 대안은 접근1,056m로 자동 선택하지 않는다. 최종 끝점 모호성 보완 전/후 부산2/5km 그래프의 소스 도로·투영 결과가 정확히 같아 이 표본의 후보/접근 결과에는 영향이 없다. 전국 채널을 사용한 한 공개 지점이며 모든 지역의 확보율을 의미하지 않는다. CPU 시간은 서버 통신/GPS/휴대폰 값을 제외한다.

React Native의 실제 `abort-controller` 구현은 `abort(reason)` 인자를 무시한다. Node만 통과한 화면 인계가 기기에서 즉시 취소되지 않도록 취소 사유 대신 WeakSet 표식으로 인계 의도를 공유했고, 같은 React Native polyfill을 사용한 진행 작업 인계 검사를 추가했다. 최종 소스/산출물은 이 보완을 포함한다.

생성 경로 seed는 선택 출발지와 현재 GPS가 같고 현재 정확도로도 도로 위 위치를 확인할 수 있을 때만 바로 재사용한다. 더 정확한 GPS가 도로에서20m 떨어져 있거나 출발지가 조금이라도 달라진 표본은 기존 seed를 확정하지 않고 현재 위치에서 확인/계산하는 검사를 추가했다.


## 최종 소스의 자동 검증

제품 소스 `18e84de3991d20f142c684f52e06bdad191a3473`, PR63의 최종 전체 실행은43679702434다. 빠른 검사 원본에서 Node602개 중601통과·1skip, UI44개 suite/241개 통과, 타입/린트·서버 타입/린트·OpenAPI·계정/공유 정책 통과를 확인했다. 별도 API 실행의 HTTP fuzz 및 실제 격리 PostgreSQL/Auth/Storage/SQLite 왕복도 통과했다. merge-ref checkout09311cd는 제품 head18e84de와 구분한다.

Android36 원본은 기능15단계와 자료 보존/정리는 통과했지만 `capture_visuals → prepare-visual-home → wait_system_bar`에서 `SystemUI full signal not ready within visual settling deadline`로 실패했다. 첫 홈의22개 표본 모두 fullSignal=false였고 실제 PNG의 이동통신 아이콘은 부분 신호였다. radio-profile4/OK는 기록됐지만 실제 표시 준비의 성공을 보장하지 못했다. 따라서 정적4화면 비교는 실행되지 않았고 verification-gate는 실패다. 시스템 표시 준비 실패로 분류하며 앱 기능15단계 통과와 전체 성공을 구분한다. 소스 변경이나 기한/마스크/기준 완화로 숨기지 않는다.

원본 [Android36 아티팩트14149171021](https://github.com/ssw3131/running-art-mobile/actions/runs/43679702434/artifacts/14149171021), ZIP SHA256 `e719de999eb031cdd646e41b1cbd9e9eef855dc01cee8e966697b06fd5110c9e`를 내려받았다. `report.json`, `attempt-01/systembar-readiness.jsonl`, 원본 PNG22장과 실패 로그를 `test-results/nearby/ci-18e84de/android36/`에 보관했다. 이전 PR59의 동일 종류 상태 준비 이력도 대조했다. 원인에 대한 추가 진단 없이 같은 전체 빌드를 재실행하지 않는다. 후속은 현재 실행 소스의 visual 분야 진단→원인 확인/해결→ready 전체 게이트→main 반영이다. PC 폰 검사로 원격 화면 게이트를 대체하지 않는다.

추천 결과의 `s2a-nearby-policy.png`/`s2a-nearby-explanation.png`에서 가까운 코스 구분, 도형 거리와 출발지 합류 거리 분리, 결과 설명이 잘림 없이 표시됨을 직접 확인했다. 준비 화면 `course-preparation-ready.png`/`s4-preparation-ready.png`의 안내와 확인 버튼도 검토했다. 이 표본은 코스 위 준비 안내이며 오프코스 실패/시간 초과의 모든 시각 상태를 검토했다고 주장하지 않는다. 해당 상태 동작은 UI 회귀로 확인했고 실제폰은 후속이다. 배경 지도/주소는 격리 시험의 연결 없음 상태이며 운영 지도 성공을 뜻하지 않는다.

Android29 원본 report.json은 smoke7단계·단일 회차·원본 자료 해시 보존·정리 통과다. UI 덤프 준비 대기4건과 transport 경고2건은 원본에 남겼고 전체 재실행은0회다. Android29의 호환 smoke를 Android36의 전체 생성/준비 흐름 검사와 혼동하지 않는다. Node의1skip은 Windows 전용 preview 동기화 검사이며 Linux에서 생략하도록 기존에 정의된 항목이다.

## 적용 산출물

독립 실행 preview [43679963544](https://github.com/ssw3131/running-art-mobile/actions/runs/43679963544)는 제품18e84de를 실제 checkout하여 성공했다. workflow 자체는 main6a72e79에서 dispatch됐으므로 실행 페이지의 main SHA를 APK 소스로 오인하지 않는다. 다운로드한 metadata.commit과 APK 해시를 직접 확인했다.

- 파일: `runpen-preview-18e84de3991d-216882774.apk`, 116,814,171바이트
- APK SHA256: `a74fdff303993bc9cd3ef7ce174e181be5d524cc07f0457970615d5767ca0829`
- applicationId: `com.runningart.mobile.dev`, versionCode216882774, OpenGL, arm64-v8a/armeabi-v7a
- 기존 서명 SHA256: `3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179`
- artifact14147998466의 ZIP 해시: `c8ced2db3a25297536a40db98f793da6a50d6305437c77330320cfdbe60f5841`

클라우드 작업 폴더의 `.cache/releases/runpen-preview-18e84de/`에 APK/metadata/설치 설명/해시를 보관했다. Actions 산출물은2026-11-22만료이므로 장기 사용 시 별도 보관한다. 실제 설치나 실행 성공을 뜻하지 않는다.

서버 ZIP은 `.cache/releases/runpen-nearby-server-4be79ed.zip`, 58,152바이트, SHA256 `d591650a7d439ca573e2d160047f554dae74d99a73792ae997e05425f7b1e7a4`다.4be79ed에서 묶은22개 소스가 최종18e84de와 모두 같은 바이트임을 확인했다. 서버 번들에는 기존 배포 목록에 빠졌던 service-shapes/figma-contours도 포함한다. 운영 반영은 없으며 실제 적용 순서는 v1/v2 호환 새 서버→새 앱이다.

## 전체 검사 반복 이력과 개선점

후속 ready43677563204는 끝점 모호성 보완,43677915798은 React Native 취소 인계 보완,43678492027은 생성 seed와 현재 GPS 정확도 보완으로 취소됐다. APK43677407205/43677921579도 중간 소스 빌드이며 최종 산출물로 사용하지 않는다.43678499797의 preview는 성공했지만 마지막 seed 수정 전4be79ed이므로18e84de/43679963544로 대체했다. 최초 실패와 취소를 최종 성공 수치에 섞지 않는다.

통합 검토를 끝내기 전에 ready로 전환해 전체 Android 빌드를 여러 번 반복했다. 저장소의 ‘빠른 피드백에서 확정 후 전체 검사 한 번’ 목표를 지키지 못한 실행 비효율이다. 이후에는 Node/Jest와 실제 React Native polyfill에서 생성→추천→준비→시작, GPS 변경·취소/인계·seed 검증을 먼저 마친 뒤 ready로 전환한다. PC에서 같은 빠른 검사를 수행할 수 있지만 Android 필수 검사나 SM-A102N 실측의 대체 근거로 쓰지 않는다.

## CPU 측정 범위 정정

이 작업에서 수행한 Node 측정은 모두 Codex Cloud Linux에서 실행했다. 이전 기록의 PC라는 표현은 데스크톱 Node 계산 방식이라는 뜻이었으며 사용자의 실제 PC에서 측정했다는 의미가 아니다.

최종 공개 입력20회 비교의 `cpu.json`은 격자5.94→2.98ms(49.9% 단축), 서울79.27→23.18ms(70.8% 단축)였다. `nearby-approach.mjs`의 graphCacheP95는 합류 목적지를 바꾸어 추가 도로 조회가 필요한 경우를 포함하므로 순수 그래프 캐시 성능으로 해석하지 않는다. 별도 진단에서는 원래 합류 목적지를 유지하고 timing.cache=graph 및 roadMs=0을 검사했다.

| 공개 입력·각20회 | 최초 이전→새 중앙값 | 단축률 | 그래프 재사용P95 | 완성 경로 재사용P95 |
| --- | ---: | ---: | ---: | ---: |
| 격자 | 6.268→3.468ms | 44.7% | 1.713ms | 0.486ms |
| 서울 | 69.044→21.476ms | 68.9% | 1.107ms | 0.443ms |

원본 `cpu-isolated-graph.json`과 격리 진단 스크립트를 인계 묶음에 함께 보관한다. 기기 GPS·네트워크/파일 캐시·SQLite·Hermes를 포함하지 않으며 SM-A102N 최초30%/경로P95 1초 목표의 통과 근거로 쓰지 않는다.

## PC에서 이어갈 실기기 검증

SM-A102N을 연결한 PC에서 현재 설치본·서명·versionCode·기존 코스/러닝/로그인 보존을 확인하고 별도 설치 범위에 따라 진행한다. Node 검사를 PC에서 반복하는 것만으로 휴대폰 측정을 대신할 수 없다. 기본 PC에 Java/전체 SDK를 새로 설치할 필요는 없으며, 필요한 서명 APK와 계측 실행 방식부터 확인한다.

공개 출발지·도로 manifest·합류1km 이내 코스를 고정해 baseline6a72e79와 새 소스를 비교한다. 사용자 DB 전체 삭제 없이 격리 도로 캐시에서 최초 조회·도로 파일 캐시·그래프 캐시·완성 경로 재사용을 각각20회 이상 측정한다. GPS 확보 시간을 따로 기록하고 유효 GPS 확보 이후 도로 읽기/그래프 구성/길찾기/전체 경로 준비를 구분한다. 실패·시간 초과를 성공 표본에서 조용히 제외하지 않고 성공률과 함께 남긴다.

세부 계산 시간은 ApproachTiming 콜백을 이용한 별도 계측이 필요하다. 준비한 preview에는 시간 결과를 화면에서 내보내는 진단 기능이 없으며, Metro 개발 모드의 결과를 release Hermes 성능으로 쓰지 않는다. 온도·절전·배터리·네트워크 조건을 기록하고 최초 중앙값30% 단축과 완성 경로P95 1초를 확인하기 전까지 전체 계획은 부분 완료다.


최종 인계 갱신: 2026-11-15T14:46:57+09:00. 사용자의 “중간에 멈춰서 피시로 요청하는 게 효율적이면 얘기해” 지시에 따라 반복 전체 CI를 멈추고 PC 인계한다. main은6a72e79로 유지하며 PR63은 draft다. APK·서버 묶음 준비와 운영 적용/폰 설치를 구분한다.

## PC 후속 — A7 검증 준비

2026-11-15 사용자 정정으로 현재 실기기 준비 대상은 **SM-A750N(A7)**이다. SM-A102N 각20회 목표를 A7 결과로 완료 처리하지 않는다. 기본 PC를 clean 상태에서 `preview.ps1 Sync -Branch codex/nearby-courses-approach`로8038611에 동기화했다. 원격 main은6a72e79이며 아직 미병합이다.

| 확인 항목 | PC에서 직접 확인한 결과 |
| --- | --- |
| 기기 | SM-A750N, Android10/API29, arm64-v8a·armeabi-v7a |
| 현재 앱 | development0.1.0/versionCode215677929, 최초 설치2026-10-31 22:14:27, 마지막 갱신2026-11-01 16:03:37 |
| 기존 APK |159,263,010바이트, SHA256 `1327c8577f7d80df37f38073eac6957abd90739f931f9b75317a60367a5383b7` |
| 새 APK | preview216882774, 위 인수인계와 동일116,814,171바이트/SHA256 `a74fdff303993bc9cd3ef7ce174e181be5d524cc07f0457970615d5767ca0829` |
| 서명 | 기존/새 APK의 v2 인증서 SHA256 `3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179` 일치, signed-data 서명 검증. APK 전체는 CI 산출물/기존 검증 해시와 대조했으며 로컬 apksigner 재검증은 아님 |
| 실행 상태 | 조회 시 러닝 서비스/USB reverse 없음. 앱 PID는 존재하므로 앱 전체가 종료됐다고 기록하지 않음 |
| 자료 준비 | DB135,168·WAL90,672바이트의 복사 전후 원본 해시·로컬 전송 해시 일치. 로컬 읽기 전용 SQLite quick_check=ok·v8, 완료 러닝1·좌표1·저장 코스0·메모0과 모든 사용자 테이블 행 개수/내용 해시 보존. 로그인 UI는 미재검증 |
| 측정 환경 | 최초 배터리2%/27.4도·USB충전. 복사 중 USB 단절 뒤 재연결하여 기존 APK 전체 사본 확보. 충전 중 저잔량 측정은 성능 기준으로 사용하지 않음 |

원본 실패 ZIP/preview ZIP의 SHA256은 각각 `e719de99…0c9e`/`c8ced2db…5841`로 인계와 같다. 기본 PC `.cache/pr63-pc/`에 원본 ZIP·풀린 보고서/PNG·새 APK/metadata·기존 APK 완전 사본·서명 검사 결과·기기 조회를 보존했다. 첫65,003,776바이트 사본은 미완료이며 `.apk.partial`로 구분해 복구/설치에 사용하지 않는다. 재연결 후 DB/WAL을 Git 제외 로컬 경로 `a7-private-snapshot/`에 읽기 전용으로 복사했고 실제 행/개인 위치/계정값은 공개 문서에 넣지 않았다. 도구 설치·앱 설치/실행·휴대폰 DB 변경·운영 배포는 하지 않았다.

### 실측 시작 전 남은 조건

1. 안정된 충전 상태/동일 절전·네트워크·온도 조건을 정하고 baseline6a72e79와 새 소스를 **같은 release Hermes 계측 경로**로 실행한다. 기존 development APK/Metro 수치를 release 목표로 바꾸어 쓰지 않는다.
2. 현재 preview에는 ApproachTiming 결과 수집/내보내기가 없다. 계측 실행 경로를 별도로 준비하고 서명·버전 상승·원래 자료 보존을 확인한 뒤 설치 범위를 확정한다. 현재 개발 APK는 native 지문76fbf4…/새 APK76331c…로 달라 Metro만으로 새 소스를 검증하지 않는다. 서버 기능 적용 순서는 계속 호환 서버→앱이며 미배포다.
3. 공개 출발지·manifest·동일 코스/합류 위치를 고정한다. 최초 조회는 별도 시험 캐시, 파일 재사용은 새 planner/유지한 시험 파일, 그래프 재사용은 `cache=graph`와 `roadMs=0`, 완성 경로는 `cache=plan`을 실제 관측한다. 사용자 도로 캐시/DB 전체를 지우지 않는다.
4. 조건별 각20회 원본에 GPS 확보 시간, roadMs/graphMs/searchMs/totalMs, cache/radius, 성공/실패/시간 초과와 기기 조건을 남긴다. 실패를 분모에서 제외하지 않고 성공률·최초 중앙값·완성 경로P95를 계산한다. 현재 모든 실측은 미실행이다.

### 원격 화면 진단

같은8038611의 visual 전용 [실행337/43683179656](https://github.com/ssw3131/running-art-mobile/actions/runs/43683179656)을 시작했다. 기존43679702434의22개 부분 신호 PNG와 판정 실패를 재확인했고, modem profile4/OK와 실제 표시가 다른 상태다. 현재 원본에는 demo 종료 전 SystemUI repository/telephony 상태가 없어 원인을 확정할 수 없다. 다음 진단을 위해 종료 전 읽기 전용 상태 수집을 추가하며 실제 픽셀 검사·12초 기한·기준 PNG·마스크/허용오차는 유지한다. 진단/전체 게이트/main의 최종 결과는 후속 기록을 따른다.

공식 [모뎀 신호 구현](https://android.googlesource.com/device/google/cuttlefish/+/refs/heads/main/host/commands/modem_simulator/network_service.cpp)의 `KeepSignalStrengthChangingLoop`는10초마다5%씩 신호를 낮추며 `HandleReceiveRemoteSignal`은 그 반복을 중단하지 않는다. [에뮬레이터 전달](https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-master-dev/android/third_party/modem-simulator/modem_main.cpp)의 profile4는 REMOTESIGNAL100을 한 번 보낸다. 초기1회 설정만으로 최대 신호가 유지된다는 기존 가정은 이 구현과 맞지 않으며, 실행별 전체 검사 소요시간에 따라 다른 신호 PNG가 나오는 현상과 일치한다. 해당 실패 실행의 당시 내부 상태를 직접 확보한 것은 아니므로 공식 구현에 근거한 원인 추론과 새 실행의 실증을 구분한다.

매 촬영 표본 직전에 modem profile4를 다시 보내고 OK/noKO를 확인한 뒤 남은 예산으로 demo를 재전송하도록 수정한다. 명령 시간도 기존12초 예산에서 차감하고 원본 픽셀 판정을 그대로 수행한다. 표본별 radio 영수증과 SystemUI/telephony 상태를 남긴다. 단순 긴 대기/재시도/PNG 가공/기준 변경은 없다. 새 Python 회귀3개는 자동 감소·재설정, 명령 실패, 명령 간 시간 차감과 늦은 성공 거부를 확인한다. PC에는 Python 실행기가 없어 원격 fast에서 확인하며 실제 visual/전체 결과 확인 전 해결 완료로 기록하지 않는다.

서버 준비본은 PC에서 허용 목록22개 파일로 다시 생성했다(`.cache/pr63-pc/server-bundle-18e84de/`). 새 ZIP `server-bundle-18e84de-pc.zip`의 SHA256은 `daba2a726ceecf2d2e02d22e8478343112bc9c6a2320ecb90e2c95c58742384e`다. 생성 시각/ZIP 형식이 다른 새 묶음이며 Cloud 원본 ZIP과 동일하다고 주장하지 않는다. 운영에는 적용하지 않았다.

### 수정 전 재현·수정 후 visual 통과

- 수정 전8038611의 visual337/43683179656은 홈·러닝·보관함의 준비/정착 뒤 마이페이지 준비17개 표본이 모두 부분 신호여서 실패했다. 마지막 남은0.0268초의 demo 명령이 시간 초과로 끝났으며 정리는 통과했다. 아티팩트14149668465/ZIP SHA256 `c16292f4582bcd798bc51a6c9c9ebe9ce04dec69aecb77e642ecff235845a305` 원본을 `.cache/pr63-pc/visual337/`에 보존했다. 첫 홈에서부터 실패한 전체330과 구분한다.
- 수정31a93aa의 [fast339/43684131377](https://github.com/ssw3131/running-art-mobile/actions/runs/43684131377)은 Python41·로직601/기존skip1·UI44묶음241·타입/린트/서버/OpenAPI/정책 통과다. 아티팩트14149960469/ZIP SHA256 `5c2cf5101019a881e482904714caa167ef5578b6d5c8bf948f033f72efcea78b`를 PC에 보존했다. 실제 API/DB 통합은 이 draft fast 범위가 아니다.
- 같은31a93aa의 [visual341/43684496783](https://github.com/ssw3131/running-art-mobile/actions/runs/43684496783)은4화면 모두 차이0·원본 보존·정리·manual-verification 통과다.16개 준비/정착 표본이 전부 첫 관측에서 최대 신호였고 최장0.567초,16개 modem profile4/OK 영수증을 확인했다. 시나리오 재시도·UI 준비 대기·전송 경고0. 이전에 실패한 마이페이지 원본의 최대 신호도 직접 검토했다.
- visual341 아티팩트14150676221/ZIP SHA256 `cdc50a4b65a963b0efb1b5fa0289baaeb614aaf8907c0219bdcd4a9613837d4d`, APK SHA256 `b57cb5bfc38928908d02fd1037cf6c09f67be2bdf2a7bba27b1ae1432af633c6`를 보존했다. SystemUI/telephony/demo 설정4개 원본 수집도 성공했다. 두 비교 실행의 에뮬레이터는37.2.13.0/build16740729이며 API36 OS fingerprint·geometry·기준 PNG·마스크/허용오차는 같다.

제품 src/server/modules/assets 및 앱 설정·잠금 파일은18e84de와 같다. 이 결과는 화면 분야 수정 실증이며 최종 ready 전체/API29/36 기능 게이트와 main 반영을 대신하지 않는다. 위 기기 계측/설치·운영 배포도 계속 별도다.

## 이전 기준 최종 전체346과 최신 main 통합

[전체346/43686012871](https://github.com/ssw3131/running-art-mobile/actions/runs/43686012871)의 head는b98e602, 실제 checkout5011d14, tree531bee3161e2e7dbea0189b7784b39209eb67457이다. 문서 반영 직후 ready 전환으로 draft345는 취소됐고 전체346만 필수 검사를 수행했다. fast의 Python41·로직601/기존skip1·UI241·타입/린트/OpenAPI/정책, 실제 PostgreSQL/Auth/Storage 및 접근 분리/복구 검사가 통과했다.

Android36은15단계·네 화면 차이0·원본 자료 보존/정리 통과, 시나리오 재시도0/UI 계층 준비 대기8/전송 경고0이다.16개 신호 표본은 모두 첫 관측에서 최대 신호, 최장0.504초이며 modem profile4/OK 영수증과 SystemUI/telephony 진단4개를 확인했다. 추천의 도형 거리/접근 거리 구분·가까운 대표 안내와 러닝 시작 안내 원본을 검토했다. 모든 오프코스/시간 초과 시각 상태 검토를 뜻하지 않는다.

Android29 첫 실행은 S0-02-draft 코스 상세 service-back 직후 앱이 종료됐다. Missing control: tab-courses의 원본 로그는06:51:10.509Z hwuiTask1의 SIGSEGV/0x40, libgui SurfaceComposerClient::Transaction::getLayerState → deferTransactionUntil_legacy → SurfaceView.applySurfaceTransforms/positionChanged를 보여 준다. 전체 원본 보존 단계는 미도달, 정리는 통과했다. 이전 전체330의 같은 OS/geometry/fixture에서7단계 통과한 원본과 대조했고, [공식 Android10 SurfaceView](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-10.0.0_r47/core/java/android/view/SurfaceView.java)의 Surface 수명 경쟁 가능성을 확인했다. 원인을 단순 환경 장애로 확정하지 않는다.

전체 첫 회차 종료 뒤 실패한 Android29 작업만 소스·시나리오·기한 변경 없이1회 재실행했다. GitHub 회차2의7단계·보존/정리와 verification-gate가 통과했다. UI 계층 준비 대기4개, 고유 영수증과 JUnit OK를 확인한 dump 전송 종료139 경고1개를 보존했다. 내부 시나리오 재시도0과 GitHub 작업 재실행1회를 구분한다. **최초 네이티브 충돌 수정 완료나 ARM/OpenGL A7 무영향을 뜻하지 않는다.**

| 원본 | 아티팩트 | ZIP SHA256 |
| --- | --- | --- |
| fast346 |14150751933|9e84941a0374afeb7104de070157d9be87e6a9380e5eff0b53edca5c5b0362e7|
| API346 |14149959101|67edc5010949c26c1b66c46d571668a3db19e24dfbf2f522f03a20abe7524a1f|
| Android36 성공 |14151278438|28a46d4817606126fb5ba631d1838e4fe1c463a03136f958919a2fe99e0048d0|
| Android29 최초 충돌 |14150524293|7a218e7e6214f4f02cddfbc0f7766889bfbd7e7928c53863bd7a8c4acb73f143|
| Android29 재실행 성공 |14152382693|f917f8ec30057efe0f2825df7bd449bb604c5439a208b09c4f8a5d18f2cc6d18|
| 회차2 정확한 tree 영수증 |14152895779|2d87913f356164574c9be8d3182fb55f1c3c767b2b503ca00a4890a00ff15bc6|

이후 병합 요청은 최신 main과 충돌405로 반영되지 않았다.07:25:31Z에 이미 병합된 PR62/main3fa67ce와 문서 PR64/main25c390a를 가져와 양쪽 인수인계를 보존한다. Android16의 실제 SIM1/데모999 분리가 main에 실증됐으므로 통합본은 main의 android.py/system_bar_readiness.py와 기존 검사를 그대로 채택한다. PR63의 실제 radio 매 표본 pin 실험과 전용3개 검사는 함께 제거하며 기존 원본 신호 판정/실패/기한 검사는 유지한다. 실험 기록은 위와 Git 이력에 남긴다. 이 통합은 새 source/tree이므로 전체346 성공을 재사용하지 않고 새 검증을 수행한다.
