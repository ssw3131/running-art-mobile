# Running Art Mobile

사용자가 선택하거나 직접 그린 도형을 닮은 **실제 보행 도로 코스**를 찾고, 달린 궤적과 기록을 남기는 모바일 앱입니다. Android를 먼저 개발·배포하고 이후 iOS로 확장합니다.

**현재는 핵심 기능 테스트용 앱을 개발하고 있습니다.** 실제 서비스 기획·디자인은 이후 전달받아 반영합니다. 지도·전경 현재 위치·권한 처리를 구현했고 Android 빌드와 에뮬레이터 확인을 마쳤습니다. 최신 검증 상태는 [현재 상태](docs/handoff/status.md), 키 설정·기능 확인은 [지도·현재 위치 테스트](docs/development/map-location.md)를 참고하세요. 저장소·알고리즘·러닝 추적은 미구현이며 CI/CD는 계획만 저장했습니다.

## 처음 열었다면

1. [프로젝트 목표와 결정 이유](docs/product/overview.md)에서 만들 앱을 확인합니다.
2. [현재 상태와 다음 작업](docs/handoff/status.md)에서 완료·미완료를 구분합니다.
3. [Android 개발 환경 설정과 실행](docs/development/android-studio.md)에서 확정 버전·새 PC 최초 설정·매일 실행 방법을 확인합니다.
4. 개발 전 [구현 구조](docs/architecture/implementation.md)와 [단계별 계획](docs/planning/roadmap.md)을 확인합니다.
5. Codex를 사용한다면 **이 폴더 자체를 프로젝트로 열고** [Codex 사용 안내](docs/development/codex.md)를 읽습니다.

전체 문서는 [문서 목차](docs/README.md), 실제 실행한 계획은 [실행 기록 모음](docs/history/executed-plans/README.md)에 있습니다. 이전 채팅을 읽지 않아도 현재 범위와 실행 방법을 알 수 있도록 관리합니다.

## 실행 요약 — Windows

새 PC에서는 [중심 안내](docs/development/android-studio.md)의 **새 PC 최초 설정**을 먼저 완료합니다. 준비된 PC의 매일 실행 순서는 다음과 같습니다.

1. Windows 시작 메뉴에서 Android Studio를 열고 프로젝트의 `android/` 폴더를 선택합니다. Gradle 동기화 완료를 확인합니다.
2. Studio Terminal에서 CMD를 사용하고 모바일 루트로 이동합니다. `set "ANDROID_HOME=%CD%\.tools\android-sdk"`를 실행한 뒤 `npm run start`로 Metro를 켭니다.
3. 상단의 **app·Pixel 7 → ▶ Run**으로 빌드·설치합니다. 개발 서버 선택 화면이 나오면 Metro 터미널에서 **a**를 누릅니다.
4. **시작 화면 → 개발 환경 확인 → 실행 환경 → Android 뒤로 가기**를 확인합니다.

현재 앱은 Metro가 필요한 **Expo development build**입니다. 도구 버전·설정 위치·수정 반영·종료 방법은 [중심 안내](docs/development/android-studio.md), 설치 스크립트와 CLI 명령은 [Windows 보조 안내](docs/development/windows-android.md)에 있습니다. 다른 PC의 최초 전체 설치와 실제 휴대폰은 아직 검증하지 않았습니다.

## 핵심 기준

- 기능·흐름: Google AI Studio 프로토타입을 기준으로 모바일에 맞게 재구현합니다.
- 계산: Codex 프로토타입 **루트 v0.3 알고리즘**을 휴대폰 내부 모듈로 이식합니다. export 폴더의 v0.2와 혼동하지 않습니다.
- 기술: React Native·Expo·TypeScript·Expo Router. 지도는 MapLibre React Native·MapTiler, 전경 위치는 Expo Location을 연결했습니다. 백그라운드 TaskManager와 SQLite는 후속 구현입니다.
- 데이터: 전국 사용자 위치 주변의 OSM 보행 데이터를 지역 파일로 내려받고 캐시합니다. 지도 타일과 경로 계산용 그래프는 별개입니다.
- 경로 계산에는 생성형 AI 호출이 필요하지 않습니다. Gemini 코칭·그림 생성은 현재 범위에서 제외합니다.

## 폴더 안내

```text
running-art-mobile/
├─ README.md                 처음 읽는 안내
├─ AGENTS.md                 Codex 공통 작업 지침
├─ .codex/config.toml        프로젝트 Codex 설정
├─ .agents/skills/           Android·알고리즘·실행 기록 스킬
├─ docs/
│  ├─ product/              목표·범위·결정 이유
│  ├─ architecture/         모듈·데이터 흐름·이식 기준
│  ├─ development/          설치·실행·Codex 사용법
│  ├─ planning/             개발 순서·미실행 CI/CD 계획
│  ├─ quality/              검증 기준·실제 검증 기록
│  ├─ handoff/              현재 상태·다음 담당자 안내
│  └─ history/executed-plans/ 실제 실행한 계획과 결과
├─ src/app/                 현재 구현된 화면과 라우팅
├─ assets/                  앱 이미지·아이콘
├─ scripts/                 설치·환경·에뮬레이터 도구
├─ dev.ps1                  로컬 개발 명령 진입점
├─ app.json                 현재 Expo 설정
└─ package-lock.json        의존성 잠금 파일
```

`.tools`, `.cache`, `node_modules`, `.expo`, `dist`, `android`, `ios`는 로컬 도구 또는 생성물입니다. 소스 공유 대상이 아니며 설치·빌드로 생성합니다. VS Code에서는 도구·캐시·의존성을 숨깁니다. 기존 `docs/` 루트의 세 문서는 이전 링크 호환용입니다.

[`.gitignore`](.gitignore)는 로컬 환경 값·IDE 개인 파일·로그·캐시·테스트 결과·앱 패키지·서명키도 제외합니다. `.env.example`, VS Code 공통 설정(`settings.json`, `extensions.json`), Codex 설정·스킬과 소스·문서·잠금 파일은 공유합니다.

이 폴더만으로 현재 기본 앱을 설치·빌드할 수 있습니다. 향후 알고리즘·화면 이식에는 [원본 위치 안내](docs/architecture/prototype-migration.md)의 소스가 필요합니다. 현재 코드에서 형제 폴더를 import하지 않습니다.
