# 코스 생성 Figma 변경 — 로컬·에뮬레이터 검증

상태: **완료 — 로컬·에뮬레이터 핵심 검증 범위**. 최신 사용자 결정에 따라 검증 후 로컬 커밋까지 진행하는 범위다. push·PR/CI·병합·배포·배포 검증·물리 휴대폰 설치는 다른 작업과 합쳐 후속으로 수행한다.

작업은 `feat/course-distance-20km`의 별도 checkout에서 수행한다. 홈·인증 작업과 합친 상태가 아니며, 해당 통합 회귀는 별도다. [전체 체크리스트](course-generation-figma-checklist.md)·[제품 계약](../development/course-generation-figma-20261024.md)을 함께 읽는다.

## 발견과 수정

- 추천 지도 GeoJSON 좌표의 일반 배열 타입을 고도 API의 두 원소 좌표로 명시 변환했다. 타입 검사에서 발견했다.
- 슬라이더의 PanResponder는 렌더마다 교체하지 않고 유지한다. 최신 콜백은 layout effect로 갱신하며 ref는 실제 제스처에서 읽는다.
- MapTiler 장소 검색의 기본 유형에는 POI가 빠진다. [공식 유형 표](https://docs.maptiler.com/guides/developer/location-services/geocoding-search/place-types-values/)를 확인하고 `poi,address,road,place,municipality,locality,neighbourhood`를 명시했다. 변경 전 강남역 결과 없음·서울숲 이름 대신 인접 도로 조회를 실제 재현했고, 변경 후 강남역·서울숲·부산시청·서울시청 도로명 주소 결과를 확인했다. 근거: `test-results/figma-places-fixed.json`.
- 20km 상한을 적용한 최초 실도로 네 표본은 모두 0후보였다. 전체 도형 둘레와 실제 도로 우회 길이가 달라 상한 안에서 닫힌 경로를 찾기 어려웠다. 상한이 기존 목표×1.25 범위를 줄이는 경우에만 0.88·0.8배 도형 배치를 처음부터 함께 탐색하고 추가 탐색 하한을 0.75배로 보완했다. 실제 경로의 목표×0.75 하한·20km 상한, 반복 구간 제한, 점수 공식·정렬은 유지한다. 경로를 잘라내지 않는다. 기존 상한 비적용 탐색은 변경하지 않는다.
- 배포 패키지 검사가 새 고래를 기존 v1 입력으로 보내던 검증 코드를 v1/v2 구분으로 갱신했다. 새 형식 12도형×20거리 입력과 실제 패키지의 고래 계산을 확인한다.

## 실도로·검색 근거

공개 R2 자료를 읽어 로컬의 실제 서버 워커/엔진으로 계산했다. 운영 계산 서버에는 배포하거나 요청하지 않았다. 기존 워커 60초·512MiB 제한을 그대로 사용했다.

| 표본 | 결과 | 근거 |
| --- | --- | --- |
| 부산 고래 11km | 5후보, 11.27~12.22km | `test-results/figma-real-probe/whale-11.json` |
| 강남 고양이 3km | 5후보, 2.84~3.24km | `test-results/figma-real-probe/cat-3.json` |
| 부산 고래 20km, 보완 후 | 5후보, 18.80~19.72km | `test-results/figma-20-refined/whale-20.json` |
| 강남 고양이 20km, 보완 후 | 5후보, 19.14~19.97km | `test-results/figma-20-refined/cat-20.json` |
| 부산 하트 20km, 보완 후 | 5후보, 18.99~19.81km | `test-results/figma-20-refined/heart-20.json` |

모든 성공 응답을 제품 `parseComputeResponse`로 검사했다. 최초 0후보 근거는 `figma-real-probe`, `figma-20-probe`에 별도로 보존한다. 빌드 등 다른 프로세스와 병행한 시간은 성능 보장치로 쓰지 않는다. 이 표는 전국 모든 도형·거리 조합의 성공 보장이 아니다.

## 실패 이력과 환경

- 최초 `figma-fast-first`: 공유 npm의 잘못된 경로, 샌드박스 loopback EACCES, Jest 임시 캐시 rename EPERM. 최초 로직 448통과·12실패 중 11개는 loopback 접근 제한이고 하나는 v1/v2 패키지 검사 조건이었다. 최초 로그는 유지한다.
- 공유 Node 설치 안 npm의 `ci-info/package.json` 손상을 확인했다. 공유 도구를 수정하지 않고 작업 폴더 `.cache/bin`의 Node/npm/npx로 검사한다.
- `figma-fast-fixed`: 로직 460개와 서버 소스/OpenAPI/정책 검사를 통과했다. Expo lint는 공유 npx를 선택해 실패했으며 로컬 npx 연결 후 `figma-source-final.log`에서 타입·린트 통과. UI 첫 코스 생성 검사는 10초 제한 초과, 나머지39개 통과했다.
- 첫 UI 진단도 같은 첫 검사의 시간 초과를 보존했다. native 빌드와 에뮬레이터가 동시에 실행 중이었고 당시 PC 가용 RAM 약1.2GiB였다. 이 작업에서 연 에뮬레이터를 잠시 종료해 경쟁을 줄인 후 동일한 10초 제한으로 코스 생성6개를 통과했다. 제품 결함 부재를 시간 초과만으로 추론하지 않으며 최종 전체 검사와 native 흐름을 별도로 확인한다.
- Python 도우미 최초 sandbox TEMP 쓰기 실패 후 작업 전용 TEMP에서10개 통과했다. APK 빌드의 upstream Kotlin/C++ deprecation·긴 경로 경고는 빌드 로그에 유지한다.

## 에뮬레이터·최종 결과

전용 API36 `RunningArt_UI_QA`와 API29 `RunPen_CI`를 사용하며 물리 기기는 조작하지 않는다. 시험 fixture 원본 보존과 종료 후 자료/도우미/설정 정리를 두 환경에서 확인했다.

### 로컬 검사

- `test-results/figma-fast-final`: 로직461개·전체 컴포넌트40개·서버 소스/OpenAPI·계정/공유 정책 검사 통과. 같은 실행의 소스 검사 실패는 아래 수정 후 별도로 해소했다.
- 최종 슬라이더의 안정적인 responder 생성 방식에 대한 React Compiler 검사 진단을 수정한 뒤 `.cache/figma-source-verified.log`에서 타입·린트 통과. Native callback 등록만 수행하는 한 줄의 ref 규칙 예외 이유를 코드에 명시했다.
- 기존 결과의 원래 조건을 사용하는 재생성 회귀를 추가하고 `.cache/figma-ui-final.log`에서 코스 생성7개+거리 입력2개 통과. 전체40개 실행 후 추가한 검사는1개다.
- 응답 fixture를 실제 요청의 옵션·계약으로 계산하도록 고친 뒤 `.cache/figma-contract-final.log`의 관련10개 검사 통과. `.cache/figma-fuzz.log`에서 로컬 HTTP 생성547개/통과547개. 실제 운영 서버나 운영 DB를 검증한 결과가 아니다.
- `.cache/figma-python.log`: Python 도우미10개 통과.
- 최종 x86_64 release APK 빌드와 QA 도우미 미포함 검사 통과. SHA-256 `397c7b5871bebf7a3cdcf0950bb4428567800806a3d4007afc653dea53b17ab8`. 기존 앱 ID/서명으로 에뮬레이터에만 설치했다.

### Android 최초 실패 보존

- `test-results/figma-android36-first`: 시작 화면 위 Digital Wellbeing 시스템 앱 ANR 대화상자가 덮여 탭 접근 실패. `failure.png`·XML로 원인을 확인했다. 해당 시스템 앱을 force-stop하고 진단했다. 제품 앱 ANR 통과/실패 근거로 바꾸지 않는다.
- `test-results/figma-android36-diagnostic`: 거리 범위 거부·20km 적용/취소·실제 슬라이더 드래그/눈금·도형 화면은 통과. 검색 단계에서 기존 UiObject.setText가 한글을 버려 입력이 비어 있었으며, 스크린샷에 빈 검색어 오류가 남았다. 제거 가능한 QA 도우미에서 가시 입력 필드의 ACTION_SET_TEXT를 사용하고 실제 입력값을 다시 확인하도록 수정했다. 제품 검색 코드는 이 실패 때문에 변경하지 않았다.
- `test-results/figma-android36-unicode`: 거리 입력 전체 재통과, 한글 ACTION_SET_TEXT 및 입력값 일치 확인 통과. 이후 키보드 닫기용 뒤로 가기가 홈으로 이동했다. ACTION_SET_TEXT만으로는 키보드가 열리지 않기 때문에 도우미 호출 전에 실제 입력란을 탭하도록 절차를 수정했다. 이 실패도 제품 코드 변경 없이 보존한다. 해당 실행의 자료/도우미 정리 통과.
- `test-results/figma-android36-real`: 실제 부산시청 검색/선택·11/20km·고래20km 5후보·유사도/예상 시간과 경사 난이도 표시·재생성 취소·미저장 상세 진입까지 확인했다. 첫 후보19.64km/84%/128분, 후보 순서는 표시 점수 내림차순이다. 도우미의 `seek`는 활성 버튼만 찾도록 되어 있어 의도적으로 비활성인 저장 전 러닝 버튼을 찾다가 실패했다. XML에는 `saved-course-run enabled=false`가 확인된다. 검증 도우미에 비활성 상태 관찰 옵션을 추가했다. 이 실패 실행도 최종 성공으로 바꾸지 않으며 정리는 통과했다.
- `test-results/figma-android36-final`: 시나리오를 연결하는 설정 중 앞 시나리오의 결과 탭이 다음 시나리오에 영향을 줄 수 있음을 확인해 준비 실행을 중단했다. 완료 보고서 없는 중단 실행이다. 연결 시 SQLite를 유지한 새 앱 실행으로 시작하도록 바꾸고 `figma-android36-complete`에서 다시 검증한다. 중단 로그는 유지하며 다음 실행의 초기화/최종 정리로 시험 상태를 회수한다.
- `test-results/figma-android29`: 거리 입력/슬라이더/도형은 통과했고, 실제20km 계산/5후보/저장까지 진행했다. 준비 화면으로 이동한 직후의 덤프가 빈 전환 프레임이라 즉시 탭 검사에 실패했다. 이어진 `failure.png/XML`에는 실제 저장 이름 `FIGMA_WHALE_20 · 19.64 km`, 러닝 준비 화면과 선택된 `tab-run`이 확인된다. 제품 코드를 바꾸지 않고 선택된 탭과 저장 코스 이름이 함께 나타날 때까지 제한된 상태 대기를 적용했다. 대기 프레임을 모두 남기고 `figma-android29-ready`에서 재확인한다. 최초 실패·정리 통과 이력은 유지한다.

### 실제 Android 생성 결과

API36 `figma-android36-complete/report.json`은 전체 실행 통과다. 실제 검색→고래20km 생성→5후보→재생성 확인 취소→미저장 상세/러닝 버튼 비활성→이름 지정 저장→러닝 준비, 기존 직접그리기/취소/후보 선택/이름 복원/중복저장 방지/GPX 선택창/보관함, 360dp·글꼴1.6의 입력/확인/그리기 취소를 통과했다. 시험 원본 코스·메모 내용 해시 보존과 최종 자료/도우미/설정 정리도 통과했다. 덤프 연결 준비 대기2건, 전송 경고0건이다. 고정4화면은 캡처만 했고 이전 기준과 픽셀 비교하지 않았다.

| 후보 | 유사도 표시 | 실제 거리 | 예상 시간 |
| --- | --- | --- | --- |
| 1 | 84% | 19.64km | 128분 |
| 2 | 83% | 19.44km | 126분 |
| 3 | 83% | 19.55km | 127분 |
| 4 | 83% | 19.72km | 128분 |
| 5 | 83% | 18.80km | 122분 |

`figma-real-result.json`에는 실제 SQLite snapshot v4/고래/목표20/폐곡선과 카드 문구를 기록했다. `figma-save-required.png`는 저장 전 준비 비활성, `figma-saved-running-preparation.png`는 저장 후 러닝 탭 이동의 근거다. 후보 지형이 조회되면서 `중급 코스`가 표시됐으며 계산/선택을 막지 않는다.

`test-results/figma-server-device-equality.json`: 동일 공개 부산 도로의 로컬 서버 워커 첫 후보와 기기 저장 코스894좌표를 대조했다. 도로 구간 ID/순서/분율과 목표 점선이 같고, 표시84%·실제19.64232594481822km다. 최초 strict 좌표 동일 비교는 129.1052111과129.10521110000002 같은 마지막 이진수 차이로 실패했다. 좌표 최대 차이2.842170943040401e-14도, 거리 차이1.0658141036401503e-14km를 별도 기록하고 좌표1e-10도/거리1e-6km 허용 오차로 통과했다. 모든 후보 전체 해시 동일이나 운영 서버 왕복 통과를 의미하지 않는다.

API36 기기 내20km 계산은 진행 캡처 기준 약2분20초다. PC의 로컬 워커 결과와 속도를 동일시하지 않으며 에뮬레이터 수치를 실제 휴대폰 성능으로 일반화하지 않는다.


### API29 후속과 최종 범위

`test-results/figma-android29/report.json`의 입력/슬라이더/도형 단계 통과와 `test-results/figma-android29-ready/report.json`의 실제 검색/20km/5후보/저장필수/러닝 준비·360dp/글꼴1.6 단계를 함께 근거로 삼는다. 후속 실행 전체 상태·시험 원본 보존·정리는 통과, 덤프 연결 준비 대기3건·전송 경고0건이다. 최초 실패 보고서를 성공으로 덮어쓰지 않았다. 두 API는 동일한 최종 APK를 사용했고 마지막 파일 해시도 다시 확인했다.

- 현재 `--figma-generation-only`는 입력+실제 코스+큰 글씨, `--figma-real-only`는 실제 코스+큰 글씨다. 기존 직접그리기/GPX 회귀는 `--generation-only`로 재현한다. API36 완료 실행에서는 새 앱 실행으로 시나리오를 분리해 기존 회귀를 함께 수행한 기록을 보존한다.
- 검증 중 제품 수정은 타입/슬라이더 responder/명시적 POI/20km 전체 도형 배치 보완이다. 최종 APK 이후 변경은 QA 도우미와 문서뿐이다.
- 이 결과는 전체 CI·자동 픽셀 일치·전국 모든 도형/거리·실제 GPS 러닝/야외·새 형식 운영 동기화/권한·배포 검증을 대신하지 않는다. [후속 체크리스트](course-generation-figma-checklist.md)의 부분 확인/미실행 항목을 유지한다.
- 타 작업 소스와 통합한 뒤 전체 회귀, 새 계산 서버 계약 우선 적용, 앱 적용 및 자료 보존/복구·배포 검증을 묶어서 수행한다. 이번에는 서버·DB·물리 폰을 변경하지 않았다.

- 로컬/에뮬레이터 결과 기록 완료: 2026-10-24T20:19:42+09:00
