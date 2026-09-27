---
name: running-art-algorithm-port
description: Running Art의 Codex v0.2 경로 알고리즘을 React Native 앱 내부 모듈로 이식하거나 이식 결과의 계산 회귀를 검증할 때 사용한다. 일반 UI 수정이나 새 서버 구축에는 사용하지 않는다.
---

# v0.2 알고리즘 이식

[이식 기준](../../../docs/architecture/prototype-migration.md)과 [구현 구조](../../../docs/architecture/implementation.md)를 읽는다. 실제 이식 요청이 있을 때 적용하며 문서에 계획이 있다는 이유로 구현을 시작하지 않는다.

1. 2026-09-27 사용자 결정의 v2.0은 저장소의 `v0.2`를 뜻한다. 모바일 루트 기준 `../running-art/exports/running-art-algorithm/`의 `src/route-engine.js`, `src/route-worker.js`, `ALGORITHM.md`, `tests/`, `examples/grid.json`을 확보한다. `../running-art/versions/v0.2/` 보관본과 출처·해시를 대조하고 차이가 있으면 기록한다. 줄바꿈에 따른 해시 차이는 이식 기준 문서의 확인 방법을 따른다. 루트 v0.3은 테스트 버전으로 제외하며 `pixel-shapes.js`·`V0.3.md`를 기준으로 삼지 않는다.
2. 원본이 없으면 해당 이식은 진행할 수 없음을 알리고 확보할 파일을 명시한다. 다른 버전으로 조용히 대체하거나 임의 알고리즘을 만들어 이식 완료로 표시하지 않는다.
3. 계산과 웹·네트워크·저장을 분리한다. 형제 폴더 import, DOM·Leaflet·Web Worker 종속성을 앱에 끌어오지 않는다. 실제 코드는 `src/modules/route-engine/`에 둔다.
4. `options.version: '0.2'`를 명시하고 같은 엔진에 포함된 도형·점수를 사용한다. OSM 노드 식별·보행 제한·접근/복귀·거리 단위·위경도 순서·점수 의미를 보존한다. 첫 이식과 새 알고리즘 고도화를 한 번에 섞지 않는다.
5. 독립 묶음의 `tests/route-engine.test.js`, `tests/refinement.test.js`와 고정 그래프로 결과를 비교한다. 서버·웹 UI·버전 보관본 테스트까지 모바일에 복사하지 않는다. 가까운 별개 노드, 단절, 후보 없음, 거리·중복·점수 회귀, 크기 85~115%와 v0.1 기준 후보 보존을 확인한다.
6. 실제 Android에서 시간·메모리·UI 응답성을 측정한다. `async` 선언만으로 계산이 별도 스레드에서 실행된다고 가정하지 않는다.
7. 이식 범위, 보존한 기준, 차이, 검증·미검증을 실행 기록과 현재 상태에 남긴다.
