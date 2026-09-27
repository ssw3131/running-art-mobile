# 고정 코스 계산 자료

- `grid.json`: v0.2 독립 묶음의 합성 격자. 실제 도로가 아니다.
- `seoul.json`: 서울 광화문 중심 2km 내 좌표를 하나 이상 포함한 원본 OSM way 표본. 전체 way 좌표·태그·node ID를 보존한다.
- `provenance.json`: OpenStreetMap contributors, ODbL 1.0, 수집일·출처·원본 파일 SHA-256·추출 방법·표본 해시.
- `baselines.json`: 보존한 v0.2 원본으로 계산한 결과. Android Hermes 비교용이며 실제 연산 결과를 대체하지 않는다.

원본 도로 자료의 이용 조건은 [OpenStreetMap 저작권 안내](https://www.openstreetmap.org/copyright)를 따른다. 생성 방법과 검증 명령은 [코스 계산 안내](../../docs/development/route-engine.md)에 있다.
