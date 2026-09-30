# 4-1 로컬 도로 표본 재현과 휴대폰 측정

4-1의 독립 가공·PC 검증 도구다. 기존 운영 도로 API·영구 캐시를 교체하지 않는다. 현재 결과는 [검증 기록](../quality/road-samples-verification.md), 공급 형식은 아래 설명을 따른다.

## 입력과 재현

- Python 3.12와 `scripts/road-data/requirements.txt`, 프로젝트 Node 24를 사용한다. 실제 Python 실행 경로는 `PYTHON` 환경 변수로 지정한다. 개인 절대 경로는 저장소에 넣지 않는다.
- [source-lock.json](../../scripts/road-data/source-lock.json)이 Geofabrik 한국 PBF의 날짜·공식 MD5 대조값·SHA-256·바이트 수·OSM 기준 시각을 고정한다. 원본 URL은 보관 정책에 따라 사라질 수 있으므로 검증된 원본을 별도로 보존한다. 새 버전으로 조용히 대체하지 않는다.
- 원본과 중간 파일은 `.cache/road-data/`, 배포 후보·결과는 `build/road-data/`다. 모두 Git 제외 경로다. 원본 약 288MB와 가공 메모리·도구 설치 공간이 필요하다.

모바일 루트에서 실행한다.

```powershell
. .\scripts\env.ps1
# $env:PYTHON에 사용할 Python 3.12 실행 파일 경로를 먼저 지정한다.
& $env:PYTHON -m pip install --only-binary=:all: --target .tools/road-python -r scripts/road-data/requirements.txt
$env:PYTHONPATH = Join-Path (Get-Location) '.tools/road-python'
powershell -ExecutionPolicy Bypass -File scripts/road-data/fetch-source.ps1
& $env:PYTHON scripts/road-data/test_extract.py
& $env:PYTHON scripts/road-data/extract.py
npm.cmd run roads:package
npm.cmd run roads:verify
npm.cmd run roads:benchmark
node scripts/road-data/summarize.mjs
npm.cmd run test:road-files
```

`extract.py`는 전체 한국 PBF를 읽어 [표본 설정](../../scripts/road-data/samples.json)의 모든 격자 후보 범위를 가로지르는 highway way를 추출한다. pyosmium의 노드 위치 캐시로 전체 geometry를 얻고 누락 참조에는 실패한다. `package.mjs`가 현재 모바일 엔진의 `runnable()`을 직접 사용해 보행 필터를 적용한다. 두 테스트 프로젝트의 파일·서버·계정은 필요 없다.

`roads:verify`는 같은 원본과 정확히 같은 조회 범위에서 **분할하지 않은 입력**과 파일을 합친 입력·그래프·전체 검색 결과를 비교한다. 과거 서울 표본과 최신 OSM 결과가 같다고 가정하지 않는다. `roads:benchmark`는 임시 loopback 서버와 별도 Node 프로세스로 각 경우 3회 측정하고 서버를 종료한다.

## 공급 형식 v1 초안

PC 검증의 잠정 선택은 **위경도 0.02도 격자 + gzip level 6 JSON + 전체 way 중복 보존**이다. 휴대폰 결과 후 4-2에 넘길 형식을 최종 결정한다. 위도별 실제 길이가 다르며 한국 표본에서 약 1.8km × 2.2km다.

- `manifest.json`: `format`, `schemaVersion`, `release`, `coverage: "samples"`, `coordinateOrder: "lat,lon"`, 정수 `gridStepE7`, 원본 출처와 `files` 목록.
- 각 파일: 격자 ID, `[south, west, north, east]` 범위, 상대 `path`, `encoding`, 압축·해제 바이트 수와 각각의 SHA-256, way 수. `tiles/<row>_<column>.json.gz`만 허용한다.
- 타일 본문: 형식·버전·릴리스·ID·범위·좌표 순서와 `elements`. 각 way는 원래 숫자 ID, 전체 node ID 배열, 같은 길이의 `{lat, lon}` 좌표, 원래 태그를 보존한다.
- way에 격자 내부 노드가 없어도 선분이 격자를 가로지르면 전체 way를 포함한다. 좌표를 경계에서 자르거나 가상 접속 노드를 만들지 않는다. 경계에 닿는 선분도 포함한다.
- 여러 파일의 같은 way는 모든 노드·좌표·태그가 같은 경우만 합친다. 같은 node ID의 좌표 충돌은 오류다. 가까운 좌표의 서로 다른 node ID를 합치지 않는다.
- 조회 영역을 덮는 모든 격자가 필요하다. 파일이 누락되면 부분 자료를 성공으로 처리하지 않는다. 빈 격자도 명시적으로 목록에 포함한다. 3개 표본은 전국 자료가 아니다.
- 입력 way는 ID 순서로 정렬한다. 엔진의 동일 거리 동률 선택과 전체 결과를 재현하기 위한 계약이다.
- 파일은 해시·압축 해제 크기·스키마·릴리스를 검사한 뒤 합친다. 단일 압축 파일 8MiB, 해제 32MiB를 상한으로 둔다. 현재 표본은 이보다 훨씬 작다. 앱 전체 작업 메모리·저장량 제한과 영구 캐시는 4-3에서 구현한다.
- `© OpenStreetMap contributors`, Geofabrik 출처, ODbL 안내가 매니페스트 원본 정보에 포함된다. 운영 배포의 상세 라이선스 표시·원본 보관은 4-2에서 확인한다.

영구 저장·업데이트 원자성·취소 중 저장 방지·전국 매니페스트 분할은 아직 구현하지 않았다. 단절 구간은 원본 그대로 남기며 계산 엔진이 도달 가능한 부분만 사용한다. 배경 지도 오프라인 표시는 별도다.

## Android 로컬 검증

앱의 **도로 파일 로컬 검증**은 3개 공개 표본만 처리한다. 현재 위치 권한이나 사용자의 GPS 자료를 사용하지 않는다. gzip 해제·SHA-256은 각각 fflate·noble-hashes의 순수 JavaScript 구현을 사용한다.

개발 APK + production JavaScript 조건으로 측정한다. 릴리스 APK는 cleartext HTTP가 허용되지 않으므로 이 로컬 HTTP 도구를 위해 운영 네트워크 정책을 바꾸지 않는다. 결과의 앱 빌드 종류·JavaScript 모드·Hermes 여부와 기종을 함께 기록한다.

```powershell
. .\scripts\env.ps1
# 터미널 1: 데이터 서버. 127.0.0.1에만 바인딩한다.
npm.cmd run roads:serve
# 터미널 2: 앱 개발 서버
npm.cmd run start:performance -- --offline
# 터미널 3: 연결된 기기의 SERIAL을 지정한다.
adb devices -l
adb -s SERIAL reverse tcp:8766 tcp:8766
adb -s SERIAL reverse tcp:8081 tcp:8081
```

기기에 같은 서명의 개발 APK를 `adb install -r`로 설치하고 개발 서버에 연결한 뒤 홈 → 도로 파일 로컬 검증에서 0.01/0.02/0.04도 각각 실행한다. 각 실행은 지역별 3회, 총 9회다. 파일·입력 해시와 그래프 노드/edge 수를 PC 기준과 대조한다. 앱 로그의 `ROAD_FILE_LAB_START`, `ROAD_FILE_LAB`, `ROAD_FILE_LAB_COMPLETE`를 저장한다. 자동 진입은 `runningart://road-file-lab?grid=200000&autostart=1`을 사용할 수 있다.

별도 터미널에서 실행 전·측정 중·완료 후 `adb -s SERIAL shell dumpsys meminfo com.runningart.mobile.dev`를 수집한다. PSS/RSS와 JS heap은 서로 다른 값이다. 느린 샘플링으로 놓친 순간 최대값을 측정한 것처럼 쓰지 않는다. 완료 후 자신이 추가한 포트 전달만 제거하고 임시 서버를 종료한다. 기존 휴대폰 APK를 변경했다면 기존 릴리스 APK로 복원하거나 변경 상태를 사용자에게 명시한다.

USB/loopback 전송은 통신망·운영 CDN 속도가 아니다. 에뮬레이터와 Node 수치는 실제 휴대폰의 속도·메모리 완료 조건을 대신하지 않는다. 휴대폰을 연결하지 못한 경우 4-1은 부분 완료로 유지한다.
