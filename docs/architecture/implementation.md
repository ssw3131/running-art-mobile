# 구현 구조와 데이터 흐름

2026-09-30 결정에 따라 모바일의 서버·도로 공급·데이터·배포를 두 테스트 프로젝트에서 독립시킵니다. 2026-10-01 일반 앱을 모바일 전용 R2 표본과 영구 캐시에 연결했고 기존 API를 제거했습니다. 로그인·동기화·공유·커뮤니티와 전국·운영 공급은 후속이며 유료화·횟수 제한은 보류입니다. [독립 서버 전략](../planning/server-strategy.md).

현재 **4-1 독립 표본 가공·PC 비교와 후속 휴대폰 처리 비용 측정을 완료했습니다.** `scripts/road-data/`가 새 PBF를 고정·가공·비교하고 `road-data/file-format.ts`가 격자 선택·검증·ID 병합을 담당합니다. `road-file-lab`는 별도 로컬 측정 화면입니다. 4-2 개발용 실제 R2 배포와 4-3 일반 공급 연결·휴대폰 검증도 완료했습니다. [표본 구조](../development/road-samples.md)

4-2의 **배포 준비·로컬 검증**도 완료했습니다. `scripts/road-data/deployment.mjs`는 검증된 불변 묶음, `publish.mjs`는 업로드·HTTP 검사·조건부 전환, `r2-store.mjs`는 공식 S3 SDK 연결, `deploy.mjs`는 CLI, `rehearse.mjs`는 실제 표본의 로컬 통합 검증을 담당합니다. 설정 예시는 `infra/road-data/r2.example.json`입니다. SDK는 배포 도구에만 포함합니다. 앱은 업로드 키 없이 공개 파일을 받습니다. [배포 계약과 사용법](../development/road-deployment.md)

`persistent-cache.ts`가 별도 SQLite 스키마·전체 검증 후 저장·현재 버전·만료·용량 정리를, `cache-database.ts`가 Expo SQLite 공유 연결을 담당합니다. `channel.ts`는 HTTPS 포인터·불변 경로·해시·스트림 크기를 검증하고 `mobile-loader.ts`가 Expo fetch·캐시·조회 진단을 연결합니다. 일반 계산과 `road-cache-lab.tsx`는 같은 공급자·DB를 사용합니다. 이전 loopback 전송기는 PC 로컬 리허설에만 남아 있습니다. [캐시 계약](../development/road-cache.md).

5단계 로컬 코스 저장도 구현했습니다. `modules/courses/`는 검증된 경로 스냅샷·중복·목록·상세·이름 변경·삭제를 담당하고, 기존 사용자 DB에 버전 2를 추가합니다. `features/courses/SaveCoursePanel.tsx`가 완료한 후보를 저장하고 `app/courses/`에서 재계산 없이 복원합니다. 기본 경로 표시는 배경 지도·네트워크·GPS를 사용하지 않습니다. [저장 구조와 사용법](../development/saved-courses.md)

후속 GPX 내보내기는 `modules/courses/gpx.ts`의 순수 변환, `export.ts`의 읽기·취소·중복·오류 처리, `share-gpx.ts`의 Expo 파일·공유 연결로 나눕니다. 상세 화면에서 저장된 이름·경로를 다시 읽으며 DB 스키마나 내용을 바꾸지 않습니다. [GPX 사용법](../development/gpx-export.md)

## 현재와 예정 구조

저장 코스 시뮬레이션은 `modules/course-simulation/player.ts`의 거리/시간 기반 제어와 `features/courses/SimulationPanel.tsx`의 화면·앱 수명으로 분리했다. `MapSurface`의 `simulationPosition`이 저장 좌표의 가상 위치를 표시하고 GPS 위치·카메라 추적은 유지한다. DB 쓰기·도로 조회·인터넷 없이 동작한다. [사용법](../development/course-simulation.md)·[검증](../quality/course-simulation-verification.md).

현재 `src/app/_layout.tsx`는 Router Stack을 구성하고 `index.tsx`에서 `map.tsx`·`route-lab.tsx`·`road-file-lab.tsx`·`road-cache-lab.tsx`·`courses/`·`storage.tsx`·`environment.tsx`로 이동합니다. 화면은 핵심 기능 테스트용이며 이후 서비스 기획·디자인에 맞춰 변경합니다.

- `src/modules/map/`: MapLibre 네이티브 지도·MapTiler 스타일 URL·현재 위치 점·카메라·지도 실패 처리. 웹은 Android 확인 안내를 표시합니다.
- `src/modules/location/`: UI 독립적인 권한·위치 획득·취소 로직과 Expo 어댑터. 위치는 한 번 얻은 뒤 구독을 해제합니다.
- `src/features/map/use-current-location.ts`: 화면 포커스·앱 전경 수명과 위치 요청 상태 연결, 설정 복귀 재확인.
- `src/modules/storage/`: Expo SQLite 지연 초기화, 트랜잭션 마이그레이션, 테스트 메모 CRUD와 코스 저장소의 공유 초기화. 화면에서는 준비·실패·재시도를 처리하며 지도는 DB 초기화에 종속되지 않습니다. [저장 구조·사용법](../development/storage.md)을 참고합니다.
- `src/modules/route-engine/`: v0.2 TypeScript 엔진·타입, 분할 실행·취소·요청 교체, 지도 좌표 변환, 원본 비교. 엔진은 React·지도 SDK·네트워크·DB를 import하지 않습니다.
- `src/modules/road-data/`: R2 공개 표본 선택·포인터/파일 검증·Expo 스트림·SQLite 영구 캐시. 조회 전체 65초 제한과 취소를 적용하며 기존 사이트·Overpass 대체 경로는 없습니다.
- `src/features/route-lab/`: 지도 중심·현재 위치 요청, 다운로드부터 계산까지 취소하는 세션, 조회/계산 시간, 고정 표본과 원본 비교, React Native 실행기. `assets/route-lab/`의 원본 표본은 보존합니다. [지도 중심 조회](../development/route-center.md)·[코스 계산 안내](../development/route-engine.md)를 참고합니다.
- `tests/`: 위치·설정 단위 검증, 실제 SQLite 저장소 검증, v0.2 원본 보존·고정 결과 회귀·제약·취소·지도 변환 검증. Router 화면 경로 밖에 둡니다.

| 위치 (일부 구현·나머지 예정) | 책임 |
| --- | --- |
| `src/app/` | 화면 경로·진입점 |
| `src/features/` | 코스 생성·러닝·기록별 화면과 상태 |
| `src/modules/route-engine/` | 그래프·탐색·점수·후보 선정. React·지도 SDK·fetch·DB에 직접 의존하지 않는 계산 |
| `src/modules/road-data/` | 주변 데이터 선택·다운로드·검증·캐시 |
| `src/modules/location/` | 권한·위치 수신·백그라운드 작업 |
| `src/modules/storage/` | SQLite 접근·마이그레이션·복원 |
| `src/modules/map/` | MapLibre 연동·좌표 변환·표시 |
| `src/components/` | 실제로 둘 이상의 기능에서 사용하는 공통 UI |

전역 상태 도구는 해당 기능의 복잡도에 따라 정합니다. 지금 미구현 공개 API나 데이터 스키마를 임의로 확정하지 않습니다.

## 코스 생성 흐름

```text
출발 위치 + 목표 거리 + 도형
       ↓
주변 격자 확인 → 필요 시 R2 파일 수신·검증 → SQLite 영구 캐시
       ↓
OSM 식별자·연결 관계를 보존한 보행 그래프
       ↓
앱 내부 계산: 도형 배치 → 실제 도로 연결 → 점수·후보 선정
       ↓
지도 좌표 변환 → 후보 비교·선택 → 기기 코스 저장·목록·상세 → GPX 파일 공유
```

지도 스타일·타일은 MapTiler에서 MapLibre로 공급합니다. 보행 그래프는 R2 공개 OSM 파일 또는 영구 캐시에서 구성하고 실제 계산은 휴대폰에서 합니다. 현재 판교를 포함한 네 표본만 지원하며 배경 지도와 도로 캐시는 별개입니다.

지역별 정적 파일·현재 포인터·영구 캐시를 일반 조회에 연결했습니다. 공개 기본 주소는 `channel.ts`, 선택적 변경은 `EXPO_PUBLIC_ROAD_BASE_URL`을 사용합니다. 업로드 SDK·키는 앱에 포함하지 않습니다.

## 독립 서버의 목표 경계

권장 구성은 Supabase의 회원·개인 기록·공유·커뮤니티 기반과 R2·CDN의 공용 도로 파일 배포입니다. 가공 작업은 사용자 요청과 분리하며 휴대폰이 필요한 지역 파일을 영구 저장한 뒤 v0.2 모듈에서 계산합니다. MapTiler 배경 지도는 별도입니다.

러닝 기록은 로컬 SQLite에 먼저 저장하고 이후 서버에 동기화하는 계획입니다. 개인 GPS·코스와 공개 게시물·경로는 다른 접근 정책과 자료로 관리합니다. 독립 도로 표본 가공 스크립트는 모바일 저장소에 구현했습니다. 회원 서버 마이그레이션·접근 정책·운영 배포는 아직 미구현입니다.

회원·자료 ID, 데이터 소유 관계와 서버 책임은 향후 기능 확장에 사용할 수 있게 설계합니다. 이를 유료화 선구현으로 해석하지 않으며 현재 단계에 사용권 발급·생성 승인·횟수 차감을 넣지 않습니다.

## 알고리즘 경계

- 입력은 보행 그래프·출발 위치·목표 거리·도형·탐색 설정, 결과는 후보의 좌표·거리·점수·통계 또는 후보 없음입니다.
- [v0.2 독립 소스](prototype-migration.md)의 `buildGraph(elements, origin, radius)`, `search(graph, options, progress)`와 원본 도형을 이식했습니다. 동기 API는 회귀 테스트에 사용합니다. 앱은 `calculateRoute(input, { signal, onProgress })`로 같은 연산의 generator를 분할 실행하며 `options.version`은 `'0.2'`로 고정합니다.
- OSM 위경도, 원점 기준 미터 좌표, 지도 배열의 순서·단위를 명시합니다. MapLibre의 GeoJSON 경계에서는 경도·위도 순서를 사용합니다.
- 네트워크·캐시·UI·SQLite는 계산 밖에 두어 고정 그래프로 회귀를 검증합니다.
- 입력 검사·그래프 생성·A*·도형 배치·추가 탐색 내부에 실행 양보 지점을 두고, 8ms 연산 예산 후 호스트로 제어를 돌려줍니다. 앱의 실행 어댑터는 React Native의 `scheduler` 낮은 우선순위 작업을 사용합니다. 별도 스레드는 아닙니다. 취소는 실제 연산을 중단하며 요청 번호 검사로 이전 결과 표시도 막습니다. 에뮬레이터 측정과 실제 휴대폰 측정은 구분합니다.

## 실패와 러닝 처리

다운로드 실패·캐시 손상·버전 불일치·그래프 부족·후보 없음을 구분합니다. 단절된 도로를 직선으로 이어 성공 처리하지 않습니다. 지역 경계는 공통 OSM 노드로 연결하고 근접 좌표만으로 합치지 않습니다.

러닝은 위치 수신·일시정지·재개·종료를 구분하고 시뮬레이션을 실제 기록과 분리합니다. GPS 공백·권한 거부·프로세스 중단 후 복원과 스키마는 해당 단계에서 정해 검증합니다. 프로토타입의 수치 기준을 검토 없이 제품 보장으로 옮기지 않습니다.

## 네이티브 설정

현재는 `app.json`, 앱 ID `com.runningart.mobile.dev`입니다. `android/`·`ios/`는 prebuild 생성물이므로 지속할 변경은 Expo 설정·config plugin에 둡니다. 네이티브 패키지 추가 시 SDK 호환성을 확인하고 development build를 다시 빌드합니다.

`app.config.ts`, `APP_VARIANT`, preview ID·서명은 [CI/CD 계획](../planning/ci-cd-validation-plan.md)의 미구현 항목입니다.
