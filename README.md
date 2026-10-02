# Running Art Mobile

**2026-10-02 실제 휴대폰 후속 검증 완료:** SM-S942N·Android 16에서 개선 전/후 release APK를 교차 3쌍 비교했다. 합성 격자는 3쌍 모두 빨라졌지만 강남 실제 도로는 3쌍 중 2쌍에서 느려져 일관된 개선을 확인하지 못했다. 격자 전체 결과와 실제 도로 후보 점수·탐색량이 같고 입력/취소/재계산·저장 코스 재생을 통과했다. 최종 성능 APK 설치·해시와 기존 야외 기록 2건/209좌표·코스 1개·메모 1개 보존을 확인했다. GPS 거리 재합산은 정확히 일치하며 장시간 잠금·배터리·실제 이동 거리 오차는 후속이다. [전후 수치와 검증 범위](docs/quality/phone-performance-20261002.md). 아래 이전 시각의 설치 보류·미검증 표현은 당시 이력이며 최신 상태는 이 문단을 우선한다.

**2026-10-02 계산 성능 개선:** 결과를 유지하며 PC 6사례의 계산 중앙값을 3.5~7.7% 줄였다. 188개 검사와 release·에뮬레이터 검증 완료, 휴대폰 적용은 후속이다. [전후 측정과 한계](docs/quality/route-performance-20261002.md).

**2026-10-02 19:26:52 KST 휴대폰 설치 완료:** SM-S942N에 전국 도로·코스 저장/GPX·시뮬레이션·GPS 러닝을 포함한 최신 `running-art-0.1.0-20261002-running.apk`를 기존 데이터 유지 방식으로 업데이트했다. 설치본 SHA-256 일치와 최초 설치 시각·데이터 경로/inode 유지를 확인했다. 사용자 후속 요청에 따라 앱 실행·기능 테스트는 하지 않았다. 전국 계산·시뮬레이션·러닝의 휴대폰 기능 검증은 나중에 진행한다. 아래 이전 판교 설치본 유지·설치 보류 표현은 당시 이력이다.

사용자가 선택하거나 직접 그린 도형을 닮은 **실제 보행 도로 코스**를 찾고, 달린 궤적과 기록을 남기는 모바일 앱입니다. Android를 먼저 개발·배포하고 이후 iOS로 확장합니다.

**실제 러닝 GPS 추적·기록을 구현했습니다.** 시작·일시정지·재개·종료, 거리·활동 시간·평균 페이스, Android 잠금 화면 수신, 오프라인 기록 목록·상세·삭제와 앱 중단 복원을 제공합니다. 전체 자동 검사 186개·타입·린트·release 빌드와 API 36 에뮬레이터의 위치 주입·잠금·강제 종료·오프라인 복원을 확인했습니다. 최신 APK의 휴대폰 설치는 완료했고 기능 실행·야외 GPS·배터리 검증은 후속입니다. [러닝 사용법](docs/development/running-tracking.md)·[검증](docs/quality/running-tracking-verification.md).

**4-4의 전국 도로 공급·갱신/복구·용량 운영을 PC와 개발용 R2에서 완료했습니다.** 일반 앱은 지도 중심 주변의 전국 도로 파일을 받아 영구 저장합니다. 두 날짜의 원본·23개 대표/경계 대조, 실제 새 날짜 갱신·이전 버전 복구·최신 복귀, 공개 자료의 새 프로세스 오프라인 복원을 확인했습니다. 전체 자동 검사 165개·타입·린트·release 빌드를 통과했습니다. **휴대폰에는 전국 공급을 포함한 최신 통합 APK를 설치했으며 기능 테스트는 사용자 결정으로 후속입니다.** 운영 도메인/CDN도 후속입니다. [전국 공급 안내](docs/development/national-roads.md) · [전국 검증](docs/quality/national-roads-verification.md) · [기존 표본 휴대폰 검증](docs/quality/road-cache-verification.md)

**계산한 코스의 기기 저장·목록·다시 열기·이름 변경·삭제를 구현했습니다.** 재계산 없이 경로를 복원하며 기본 경로 표시는 인터넷·GPS 없이 동작합니다. 자동 검사 119개·타입·린트·Android 번들과 에뮬레이터·실제 휴대폰의 저장·강제 종료 후 복원·삭제를 확인했습니다. SM-S942N에는 최신 독립 실행 APK를 업데이트했고 기존 메모 보존·네트워크 없는 복원을 확인했습니다. 이번 표본 측정 뒤 원래 설치본으로 복원·독립 실행을 확인했습니다. **저장 코스의 GPX 내보내기도 구현했습니다.** 전체 자동 검사 130개·최종 관련 검사 11개·타입·린트·Android 빌드와 에뮬레이터의 오프라인 파일 전달·취소·재시도를 확인했습니다. 후속 SM-S942N 업데이트·GPX 파일 전달·오프라인 취소/재시도와 기존 자료 보존도 확인했습니다. 코스 시뮬레이션은 구현·PC·에뮬레이터 검증을 완료했고 실제 휴대폰 검증은 후속입니다. [시뮬레이션 안내](docs/development/course-simulation.md)·[검증](docs/quality/course-simulation-verification.md). [GPX 사용법](docs/development/gpx-export.md) · [GPX 검증](docs/quality/gpx-export-verification.md). [코스 저장 사용법](docs/development/saved-courses.md) · [검증 결과](docs/quality/saved-courses-verification.md) · [전체 로드맵](docs/planning/roadmap.md)

**2026-09-30 서버 방향 정리:** 두 웹 테스트 프로젝트는 알고리즘·기능 참고로만 사용하고 모바일의 서버·도로 공급·데이터·배포를 독립시킵니다. 로그인·동기화·코스 공유·커뮤니티를 서비스 범위에 포함하고, 초기 사용자 제공은 무료이며 유료화·횟수 제한은 후속 계획으로만 둡니다. [독립 서버 전략](docs/planning/server-strategy.md)에 구성과 전환 순서를 정리했습니다. 현재 일반 계산과 캐시 검증 화면은 같은 모바일 전용 R2 전국 채널·영구 저장을 사용합니다.

**현재는 핵심 기능 테스트용 앱입니다.** 최종 서비스 기획·디자인은 이후 반영합니다. 홈의 **코스 계산 테스트 → 주변 OSM**에서 대전·제주 등 위치 버튼을 선택하거나 지도를 움직여 중심 주변 2km 도로로 계산합니다. 결과에 도로 조회·계산·전체 시간과 캐시 사용을 표시하며 완료된 경로는 재탐색 전까지 유지합니다. [지도 중심 조회](docs/development/route-center.md), [계산 성능](docs/development/route-engine-performance.md), [독립 실행 APK](docs/development/android-test-apk.md)를 참고하세요.

최신 상태는 [인수인계](docs/handoff/status.md), 사용법은 [코스 저장](docs/development/saved-courses.md)·[코스 계산](docs/development/route-engine.md)·[지도·위치](docs/development/map-location.md)를 참고하세요. 휴대폰에는 2026-10-02 러닝 통합 APK가 설치되어 있으며 GitHub 공개 APK는 이전 버전입니다. 러닝의 실제 휴대폰·야외 검증, 회원/동기화와 CI/CD는 후속입니다.

## 휴대폰 테스트 APK 다운로드

**2026-10-02 러닝 GPS APK 준비 완료:** `build/install/running-art-0.1.0-20261002-running.apk`(95,764,735바이트, arm64·x86_64). 전국 도로·코스 저장/GPX·시뮬레이션과 실제 GPS 러닝을 포함합니다. 기존 서명·앱 ID를 유지하며 에뮬레이터와 휴대폰에 업데이트했습니다. 휴대폰에서는 설치만 확인했고 기능 테스트는 후속입니다. [검증·해시](docs/quality/running-tracking-verification.md).

**2026-10-02 전국 공급 APK 준비 완료:** `build/install/running-art-0.1.0-20261002-national.apk`(95,680,819바이트). 전국 도로 공급과 현재 코스 기능을 포함하며 기존 APK와 서명·앱 ID가 같습니다. 휴대폰 설치는 아직 하지 않았습니다. [설치 안내·해시](docs/development/android-test-apk.md)를 참고하세요.

**2026-10-01 GPX APK 휴대폰 검증 완료:** `build/install/running-art-0.1.0-20261001-gpx.apk`(95,659,943바이트). 코스 상세의 GPX 내보내기를 포함하며 에뮬레이터에 설치·검증했습니다. 00:56:22 KST에 SM-S942N에도 업데이트했습니다. 기존 코스 1개·메모 1개 보존, 오프라인 재실행·공유 취소·재시도·수신 파일 내용을 확인했습니다. 같은 폴더의 해시·한글 설치 안내와 [GPX 검증](docs/quality/gpx-export-verification.md)을 참고하세요.

**2026-09-30 코스 저장 APK:** 로컬 `build/install/running-art-0.1.0-20260930-courses.apk`(95,595,419바이트). 코스 저장·목록·상세·이름 변경·삭제를 포함합니다. 22:09:04 KST에 SM-S942N에 기존 데이터를 유지해 업데이트하고 PC 없이 실행·네트워크 없는 복원·설치본 해시 일치를 확인했습니다. 일반 코스 계산의 도로 공급은 아직 기존 API를 사용합니다. 아래 GitHub 다운로드는 이전 2026-09-27 버전입니다.

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
- 기술: React Native·Expo·TypeScript·Expo Router. 지도는 MapLibre React Native·MapTiler, 전경 위치는 Expo Location, 저장 기반은 Expo SQLite를 연결했습니다. 백그라운드 TaskManager·러닝 SQLite 기록을 연결했습니다.
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
