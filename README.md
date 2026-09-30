# Running Art Mobile

사용자가 선택하거나 직접 그린 도형을 닮은 **실제 보행 도로 코스**를 찾고, 달린 궤적과 기록을 남기는 모바일 앱입니다. Android를 먼저 개발·배포하고 이후 iOS로 확장합니다.

**서버 준비·휴대폰 연결 테스트를 보류하고 4-3의 영구 도로 캐시를 먼저 구현했습니다.** 별도 SQLite에 검증된 지역 파일을 저장하며 손상 복구·취소·만료·용량 정리를 처리합니다. 실제 세 지역 표본을 저장한 뒤 새 PC 프로세스에서 네트워크 없이 전체 도로 입력·그래프가 같은지 확인했습니다. 일반 코스 계산의 공급 전환과 실제 기기 확인은 후속입니다. 다음 권장 작업은 **계산한 코스의 기기 저장·목록·다시 열기**입니다. [캐시 사용법](docs/development/road-cache.md) · [캐시 검증](docs/quality/road-cache-verification.md) · [준비된 배포 절차](docs/development/road-deployment.md) · [전체 로드맵](docs/planning/roadmap.md)

**2026-09-30 서버 방향 정리:** 두 웹 테스트 프로젝트는 알고리즘·기능 참고로만 사용하고 모바일의 서버·도로 공급·데이터·배포를 독립시킵니다. 로그인·동기화·코스 공유·커뮤니티를 서비스 범위에 포함하고, 초기 사용자 제공은 무료이며 유료화·횟수 제한은 후속 계획으로만 둡니다. [독립 서버 전략](docs/planning/server-strategy.md)에 구성과 전환 순서를 정리했습니다. **현재 코드·설치 APK의 기존 도로 API 연결은 아직 교체하지 않았습니다.** 새 파일 형식은 별도의 로컬 검증 화면에서만 사용합니다.

**현재는 핵심 기능 테스트용 앱을 개발하고 있습니다.** 실제 서비스 기획·디자인은 이후 전달받아 반영합니다. 지도·전경 위치·SQLite 저장 기반과 **v0.2 코스 계산**을 구현했습니다. 홈의 **코스 계산 테스트 → 주변 OSM**에서 현재 위치나 지도 이동으로 중심을 정하고 주변 도로로 계산합니다. 결과에 **도로 조회·코스 계산·전체 시간**을 표시하며, 지도 이동 후에도 완료된 경로는 재탐색 전까지 유지합니다. 현재 소스는 앱의 도로 API 호출을 1회로 제한하고 Overpass 공급자 전환을 기존 서버로 단일화했습니다. 앱 전체 제한은 65초, 수정 서버는 공급자당 25초·전체 55초입니다. **9월 30일 00:49 KST에 최신 APK를 휴대폰에 업데이트하고 독립 실행을 확인했습니다. 기존 Sites 접근 오류로 서버는 아직 이전 코드이며, 서버의 새 시간 제한·검증 정책은 미반영입니다.** [지도 중심 조회와 메모리 캐시](docs/development/route-center.md), [결과를 보존하는 성능 개선](docs/development/route-engine-performance.md), [전환 전 재시도 검증 이력](docs/quality/road-retry-verification.md)을 참고하세요. 이 과거 이력의 서버 복구·배포 항목을 현재 다음 작업으로 재개하지 않습니다. [설치용 테스트 APK](docs/development/android-test-apk.md)는 PC 개발 서버 없이 실행합니다.

최신 검증 상태는 [현재 상태](docs/handoff/status.md), 사용법은 [코스 계산](docs/development/route-engine.md)·[지도·현재 위치](docs/development/map-location.md)·[SQLite 저장소](docs/development/storage.md)를 참고하세요. 주변 도로 API 조회·메모리 캐시와 별도 영구 캐시 검증 화면을 구현했습니다. 일반 계산에 영구 캐시 연결, 러닝 추적, 실제 코스·러닝 기록 저장은 후속 단계입니다. 지도 중심 변경은 에뮬레이터와 이전 휴대폰 설치본에서 확인했지만 이번 캐시 화면은 아직 기기에 설치·검증하지 않았습니다. 실제 휴대폰 GPS 기준 조회·계산 검증과 CI/CD 실행도 보류합니다.

## 휴대폰 테스트 APK 다운로드

**2026-09-30 수정 APK:** 로컬 `build/install/running-art-0.1.0-20260930.apk`. 앱 직접 Overpass 재시도 제거·API 1회 호출·65초 제한을 포함합니다. SM-S942N에 기존 데이터를 유지해 업데이트했고 개발 서버 없는 실행·지도 표시·설치본 해시 일치를 확인했습니다. 서버 코드는 아직 운영 미반영입니다. 아래 GitHub 다운로드는 이전 2026-09-27 버전입니다.

[APK 바로 다운로드](https://github.com/ssw3131/running-art-mobile/releases/download/v0.1.0-test.20260927/running-art-0.1.0-20260927.apk) · [테스트 릴리스·설치 안내·SHA-256](https://github.com/ssw3131/running-art-mobile/releases/tag/v0.1.0-test.20260927)

앱 버전 0.1.0, Android 7.0 이상, arm64 휴대폰·x86_64 에뮬레이터 공용(약 95.4MB)입니다. 휴대폰에서 APK를 내려받아 열면 설치할 수 있습니다. 기존 테스트 앱은 삭제하지 않고 업데이트합니다. PC 개발 서버는 필요 없고 지도·새 도로 조회에는 인터넷이 필요합니다.

## 처음 열었다면

1. [프로젝트 목표와 결정 이유](docs/product/overview.md)에서 만들 앱을 확인합니다.
2. [현재 상태와 다음 작업](docs/handoff/status.md)에서 완료·미완료를 구분합니다.
3. [Android 개발 환경 설정과 실행](docs/development/android-studio.md)에서 확정 버전·새 PC 최초 설정·매일 실행 방법을 확인합니다.
4. 개발 전 [구현 구조](docs/architecture/implementation.md)와 [단계별 계획](docs/planning/roadmap.md)을 확인합니다.
   서버·도로 데이터 작업은 [독립 서버 전략](docs/planning/server-strategy.md)을 함께 확인합니다.
5. Codex를 사용한다면 **이 폴더 자체를 프로젝트로 열고** [Codex 사용 안내](docs/development/codex.md)를 읽습니다.

전체 문서는 [문서 목차](docs/README.md), 실제 실행한 계획은 [실행 기록 모음](docs/history/executed-plans/README.md)에 있습니다. 이전 채팅을 읽지 않아도 현재 범위와 실행 방법을 알 수 있도록 관리합니다.

## 실행 요약 — Windows

새 PC에서는 [중심 안내](docs/development/android-studio.md)의 **새 PC 최초 설정**을 먼저 완료합니다. 준비된 PC의 매일 실행 순서는 다음과 같습니다.

1. Windows 시작 메뉴에서 Android Studio를 열고 프로젝트의 `android/` 폴더를 선택합니다. Gradle 동기화 완료를 확인합니다.
2. Studio Terminal에서 CMD를 사용하고 모바일 루트로 이동합니다. `set "ANDROID_HOME=%CD%\.tools\android-sdk"`를 실행한 뒤 `npm run start`로 Metro를 켭니다.
3. 상단의 **app·Pixel 7 → ▶ Run**으로 빌드·설치합니다. 개발 서버 선택 화면이 나오면 Metro 터미널에서 **a**를 누릅니다.
4. **시작 화면 → 개발 환경 확인 → 실행 환경 → Android 뒤로 가기**를 확인합니다.

위 실행 순서의 기본 앱은 Metro가 필요한 **Expo development build**입니다. 휴대폰에 설치한 독립 실행 테스트 APK는 [별도 빌드·설치 안내](docs/development/android-test-apk.md)를 따릅니다. 도구 버전·설정 위치·수정 반영·종료 방법은 [중심 안내](docs/development/android-studio.md), 설치 스크립트와 CLI 명령은 [Windows 보조 안내](docs/development/windows-android.md)에 있습니다. 다른 PC의 최초 전체 설치는 미검증입니다. 실제 휴대폰은 개발용·릴리스 APK의 코스 계산·지도 결과·입력·취소를 확인했으며 GPS·저장소·야외 사용은 별도 검증이 필요합니다.

## 핵심 기준

- 기능·흐름: Google AI Studio 프로토타입을 기준으로 모바일에 맞게 재구현합니다.
- 계산: Codex 프로토타입 **v0.2 알고리즘**을 휴대폰 내부 모듈로 이식합니다. 사용자 표현의 v2.0은 저장소의 v0.2이며, `exports/running-art-algorithm/` 소스를 사용합니다. 루트 v0.3은 테스트 버전으로 이식 기준에서 제외합니다.
- 기술: React Native·Expo·TypeScript·Expo Router. 지도는 MapLibre React Native·MapTiler, 전경 위치는 Expo Location, 저장 기반은 Expo SQLite를 연결했습니다. 백그라운드 TaskManager는 후속 구현입니다.
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
├─ assets/                  앱 이미지·아이콘·고정 도로 표본
├─ tests/                   회귀 검사·v0.2 참조 원본·기준 결과
├─ scripts/                 설치·환경·에뮬레이터 도구
├─ dev.ps1                  로컬 개발 명령 진입점
├─ app.json                 현재 Expo 설정
└─ package-lock.json        의존성 잠금 파일
```

`.tools`, `.cache`, `node_modules`, `.expo`, `dist`, `android`, `ios`는 로컬 도구 또는 생성물입니다. 소스 공유 대상이 아니며 설치·빌드로 생성합니다. VS Code에서는 도구·캐시·의존성을 숨깁니다. 기존 `docs/` 루트의 세 문서는 이전 링크 호환용입니다.

[`.gitignore`](.gitignore)는 로컬 환경 값·IDE 개인 파일·로그·캐시·테스트 결과·앱 패키지·서명키도 제외합니다. `.env.example`, VS Code 공통 설정(`settings.json`, `extensions.json`), Codex 설정·스킬과 소스·문서·잠금 파일은 공유합니다.

이 폴더만으로 현재 앱을 설치·빌드하고 고정 데이터 회귀를 실행할 수 있습니다. v0.2 참조 소스는 `tests/reference/v02/`에 보존했으며 앱에서 형제 폴더를 import하지 않습니다. 표본을 다시 추출하거나 후속 화면을 이식할 때는 [원본 위치 안내](docs/architecture/prototype-migration.md)를 따릅니다.
