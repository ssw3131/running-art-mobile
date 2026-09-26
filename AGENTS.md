# Running Art Mobile — 작업 지침

이 프로젝트의 설명·인수인계는 한국어로 작성한다. 먼저 [README](README.md)와 [현재 상태](docs/handoff/status.md)를 읽고, 작업에 필요한 분야 문서만 추가로 읽는다. 모든 실행 명령은 이 폴더를 기준으로 한다.

## 유지할 제품 결정

- 현재는 핵심 기능 테스트용 앱을 개발한다. 실제 서비스 기획·디자인은 사용자가 이후 전달하며, 지금의 화면·문구·정보 구조를 최종 서비스 설계로 확정하지 않는다.
- 기능·사용자 흐름은 Google AI Studio 프로토타입이 기준이다. Codex 프로토타입에서는 루트 v0.3 알고리즘을 이식한다. export 폴더의 v0.2를 대신 쓰지 않는다.
- React Native·Expo·TypeScript·Expo Router, Android 우선이다. 경로 계산은 휴대폰 내부 모듈에서 한다. 계산 서버나 Gemini 호출을 추가하지 않는다.
- 지도는 MapLibre React Native·MapTiler, 도로 그래프는 지역별 OSM 파일·캐시로 분리한다. OSM 노드 ID·연결성을 보존한다.
- 위 구성 중 아직 미구현인 항목이 있다. 파일과 상태 문서를 확인하고 계획을 구현 사실로 보고하지 않는다.
- CI/CD는 사용자가 추후 실행하기로 한 별도 계획이다. 일반 정리·세션 재개를 CI/CD 구축 지시로 해석하지 않는다.

## 작업과 코드 배치

- Android 개발에는 Android Studio를 사용한다. 설치·프로젝트 열기는 [Android Studio 안내](docs/development/android-studio.md)를 따른다. Codex는 모바일 루트, IDE는 생성된 `android/`를 연다.
- Android Studio는 시작 메뉴에서 일반 실행한다. 이 프로젝트는 사용자 선택에 따라 `.tools/node`를 Windows **사용자 Path**에 한 번 등록하고, IDE의 Gradle JDK·SDK·캐시는 프로젝트 도구로 지정한다. 기존 Path 항목을 보존하고 시스템 전체 Path는 변경하지 않는다. 개인 절대 경로는 로컬 설정에만 둔다.
- Gradle JDK는 프로젝트 JDK 17, IDE 자체는 번들 JBR을 사용한다. `gradle-daemon-jvm.properties`의 JVM 기준은 JDK 선택보다 우선하므로 불일치 시 먼저 확인한다. 설치 과정에서 AGP·Gradle·SDK 기준을 자동 변경하지 않는다. `scripts/env.ps1`은 기존 CLI 작업용으로 유지한다.
- 화면 진입점은 `src/app/`; 새 분야 코드는 [구현 구조](docs/architecture/implementation.md)에 맞춰 필요할 때 만든다. 테스트는 Router 경로 밖에 둔다.
- `android/`·`ios/`는 prebuild 생성물이다. 지속할 설정은 Expo 설정·config plugin에 둔다.
- 일상적인 Android prebuild는 `npm run prebuild:android`의 `--no-clean`을 사용해 IDE 로컬 설정·캐시를 보존한다. 현재 Expo CLI는 기본 prebuild에서 네이티브 폴더를 재생성하므로 직접 기본 명령으로 삭제하지 않는다.
- 원본 프로토타입을 수정하거나 형제 폴더를 런타임 import하지 않는다. 이식 시 [출처·버전](docs/architecture/prototype-migration.md)을 확인한다.
- `.tools`, `.cache`, `node_modules`, 빌드 파일·실제 키·서명키를 커밋하지 않는다. 개인 절대 경로를 공유 설정에 넣지 않는다.
- 현재 변경분을 먼저 확인하고 사용자의 수정은 보존한다. 미구현 기능에 가짜 성공·임시 서버를 넣지 않는다.

## 실행한 계획 자동 기록

**계획에 따라 실제 구현·설정 변경을 시작할 때와 마칠 때 `$running-art-plan-record`를 적용한다.** 사용자가 별도로 ‘기록해 줘’라고 말할 필요가 없다. 스킬 목록에 없으면 [.agents/skills/running-art-plan-record/SKILL.md](.agents/skills/running-art-plan-record/SKILL.md)를 직접 읽는다.

- 논의·제안·승인만 된 미실행 계획은 실행 이력에 넣지 않는다. 단순 질문·읽기·오탈자 수정에 새 계획을 만들어 기록하지 않는다.
- 실제 변경 시작 직전에 계획을 보존하고, 작업 종료 시 결과·검증·남은 작업과 종료 시각을 덧붙인다. 추가 승인 절차를 만들지 않는다.
- 기록은 `docs/history/executed-plans/`에 날짜별로 모은다. 진행 중·부분 완료·중단도 실제 실행했다면 기록한다.
- 실행 전 계획은 사후에 결과에 맞춰 바꾸지 않는다. 범위 변경은 날짜를 붙여 별도 덧붙인다. 과거 기록을 복원하면 사후 복원과 시각 불명을 명시한다.
- 같은 계획의 후속 실행은 기존 기록을 이어 쓰고 중복 파일을 만들지 않는다. 기록 갱신 자체에 대한 기록을 재귀적으로 만들지 않는다.

## 검증과 보고

Windows에서는 `powershell -ExecutionPolicy Bypass -File .\dev.ps1 check`로 타입·린트를 확인한다. 직접 npm을 쓰려면 먼저 `. .\scripts\env.ps1`을 실행한다. 변경에 따라 doctor·build·기기 확인을 선택한다. 문서만 수정하면 링크·설정·스킬 구조 확인으로 충분하다.

빌드 성공과 실제 기기 실행 성공을 구분한다. 검증하지 못한 내용은 이유와 함께 남긴다. 작업 후 관련 분야 문서와 `docs/handoff/status.md`, 해당 실행 기록·목록을 갱신한다. 기존 사용자 승인 범위의 일상적인 구현에 재승인을 요구하지 않는다.

## 분야별 스킬

- `$running-art-android`: Android Studio·도구 설치·로컬 빌드·기기 연결 진단.
- `$running-art-algorithm-port`: v0.3 계산 모듈 이식·회귀 검증.
- `$running-art-plan-record`: 실행 전 계획 보존과 결과·날짜 기록.

사용법과 확인 방법은 [Codex 안내](docs/development/codex.md)에 있다.
