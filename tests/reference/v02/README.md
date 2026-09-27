# Running Art 코스 탐색 알고리즘 소스

실제 도로 그래프에서 하트 등 특정 도형과 닮은 폐회로를 최대 5개 찾는 독립 실행 묶음입니다. UI·호스팅·이미지 업로드·외부 지도 API는 포함하지 않습니다.

상세 원리·수식·의사코드·입출력 명세는 [ALGORITHM.md](ALGORITHM.md)를 읽어주세요.

## 실행

Node.js 22 이상 권장. 외부 패키지나 API 키 없이 실행합니다.

```bash
npm test
npm run demo
node cli.js examples/grid.json output/v01.json 0.1
```

- 결과 JSON: `output/demo.json`
- 지도 교환 형식: `output/demo.geojson`
- `examples/grid.json`은 **실제 도로가 아닌 테스트용 합성 격자**입니다.
- 실제 도로로 실행하려면 `{origin, options, elements}` 형식의 JSON을 준비하세요.
- `elements`에는 원래 node ID를 보존한 OSM way의 nodes, geometry, tags가 필요합니다.

## 구성

- `src/route-engine.js`: 원본 v0.2 탐색 엔진. `version:'0.1'`도 실행 가능.
- `src/route-worker.js`: 브라우저 Worker 진입점. HTTP 서버에서 사용.
- `cli.js`: 입력 검증과 결과 JSON/GeoJSON 저장.
- `tests/`: 실제 도로 연결 조건, 점수, 중복 제거, v0.2 회귀 검사.
- `SHA256SUMS.txt`: 배포 파일 해시.

핵심은 도형 배치 → 도로 노드 후보 → A* + Beam Search → 접근/복귀 연결 → 유사도 점수 → 중복 제거입니다. GPU나 AI API는 필요하지 않습니다.

## 추출본 검증 결과

- 독립 묶음에서 테스트 7개 통과.
- `npm run demo`로 코스 5개 생성 및 JSON/GeoJSON 저장 확인.
- 합성 격자 예제 v0.2: 최고 표시 점수 94점, 해당 코스 약 5.40km.
- 이 점수는 합성 예제 결과이며 실제 도시 성능을 의미하지 않습니다.
