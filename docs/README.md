# 문서 목차

처음 참여할 때는 **목표 → 현재 상태 → 개발 환경 → 구현 구조 → 계획** 순서로 읽습니다. 명령은 별도 설명이 없으면 프로젝트 루트에서 실행합니다.

개발 환경은 [Android 개발 환경 설정과 실행](development/android-studio.md)을 중심 안내로 사용합니다. 확정 구성, 새 PC 최초 설정, 매일 실행, 정상 확인을 한 문서에서 볼 수 있습니다.

| 분야 | 문서 | 내용 |
| --- | --- | --- |
| 제품 | [목표·결정 이유](product/overview.md) | 사용자 경험, 선택 이유, 포함·제외 범위 |
| 구현 | [모듈·데이터 흐름](architecture/implementation.md) | 현재 코드와 앞으로 만들 구조 |
| 구현 | [프로토타입 이식](architecture/prototype-migration.md) | 기능 기준, v0.2 출처, 이식 주의점 |
| 개발 | [Android 개발 환경 — 중심 안내](development/android-studio.md) | 도구·버전·경로, 새 PC 최초 설정, 매일 Studio 실행·종료, 확인 기준 |
| 개발 | [Windows — CLI 보조 안내](development/windows-android.md) | 설치 스크립트의 범위·CLI 명령·환경 변수·기기 관리 |
| 개발 | [휴대폰 독립 실행 테스트 APK](development/android-test-apk.md) | PC 개발 서버 없이 실행하는 APK 빌드·설치·검증 |
| 개발 | [Codex 사용법](development/codex.md) | 지침·스킬·자동 기록 |
| 개발 | [지도·현재 위치 테스트](development/map-location.md) | MapTiler 키·권한·실패 처리·확인 방법 |
| 개발 | [SQLite 저장소 테스트](development/storage.md) | DB 위치·테스트 메모·마이그레이션·실행 방법 |
| 개발 | [코스 계산 테스트](development/route-engine.md) | v0.2 계산·지도·취소·기준 결과 재현 |
| 개발 | [지도 중심 기준 코스 조회](development/route-center.md) | 현재 위치·지도 이동·주변 도로 API·메모리 캐시·시간 표시 |
| 개발 | [코스 계산 성능·웹 비교](development/route-engine-performance.md) | 최적화 전략·원본 보존·PC 벤치마크·실기기 측정 구분 |
| 계획 | [단계별 개발](planning/roadmap.md) | 순서와 완료 조건 |
| 계획 | [CI/CD 자동화](planning/ci-cd-validation-plan.md) | 계획 저장, 아직 미실행 |
| 검증 | [검증 기준](quality/strategy.md) | 변경별 확인 방법 |
| 검증 | [환경 검증 기록](quality/setup-verification.md) | 실제 통과·미검증 사항 |
| 검증 | [지도·위치 검증 기록](quality/map-location-verification.md) | 자동 검사·Android 빌드·기기 결과 |
| 검증 | [저장소 검증 기록](quality/storage-verification.md) | 실제 SQLite 테스트·Android CRUD·프로세스 재시작 복원 |
| 검증 | [코스 계산 검증](quality/route-engine-verification.md) | 원본 회귀·Android 결과·시간·메모리·응답성 |
| 검증 | [지도 중심 조회 검증](quality/route-center-verification.md) | 중심 선택·주변 도로·취소·시간 표시·설치용 APK |
| 검증 | [Studio Gradle 복구](quality/gradle-recovery.md) | 사용자 Path·JDK·SDK 복구와 GUI 실행 결과 |
| 인수인계 | [현재 상태](handoff/status.md) | 진행 상황과 다음 작업 |
| 기록 | [실행한 계획](history/executed-plans/README.md) | 계획·날짜·결과 |

## 유지 규칙

- 최신 상태는 handoff, 제품 결정은 product, 앞으로의 순서는 planning을 기준으로 관리합니다.
- 계획 저장을 구현 완료로 표시하지 않습니다. 검증에는 날짜·명령·결과·미검증 항목을 남깁니다.
- 실행 기록은 과거 계획과 결과입니다. 계획 원문을 결과에 맞춰 바꾸지 않습니다.
- 논의·승인만 된 계획은 planning에 둡니다. 실제 실행이 시작된 계획만 history에 기록합니다.
- 경로·명령이 바뀌면 실행 안내도 갱신합니다. 문서 링크는 이동 가능한 상대 경로로 작성합니다.
- 개발 환경 안내에는 최종 구성과 사용법을 남기고, 작업 과정·진단 이력은 quality·history에 보존합니다.
- 프로토타입 문서의 기능 나열보다 현재 제품의 최종 결정을 우선합니다.
