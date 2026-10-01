# 문서 목차

처음 참여할 때는 **목표 → 현재 상태 → 개발 환경 → 구현 구조 → 계획** 순서로 읽습니다. 명령은 별도 설명이 없으면 프로젝트 루트에서 실행합니다.

**로컬 코스 저장·목록·상세·이름 변경·삭제와 PC·에뮬레이터·휴대폰 검증을 완료**했습니다. 후속 GPX 내보내기와 실제 휴대폰 파일 전달·오프라인 취소/재시도도 완료했습니다. 2026-10-01 R2 개발용 주소의 실제 표본 배포·공개 검사·첫 버전 전환을 완료했고 일반 앱의 R2 연결·휴대폰 영구 캐시 검증도 완료했습니다. 다음 데이터 작업은 4-4 전국 공급·갱신 운영입니다. 서버 독립 앱 작업은 코스 시뮬레이션입니다. [코스 저장 사용법](development/saved-courses.md)·[검증](quality/saved-courses-verification.md), 전체 순서는 [로드맵](planning/roadmap.md), 최신 상태는 [인수인계](handoff/status.md)를 기준으로 확인합니다.

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
| 개발 | [GPX 내보내기](development/gpx-export.md) | 저장 코스의 GPX 파일 공유·취소·데이터 범위 |
| 개발 | [저장한 코스](development/saved-courses.md) | 계산 후보의 기기 저장·목록·경로 복원·이름 변경·삭제 |
| 개발 | [코스 계산 테스트](development/route-engine.md) | v0.2 계산·지도·취소·기준 결과 재현 |
| 개발 | [지도 중심 기준 코스 조회](development/route-center.md) | 표본 위치·지도 중심·R2 공급·영구 캐시·오프라인 계산 |
| 개발 | [코스 계산 성능·웹 비교](development/route-engine-performance.md) | 최적화 전략·원본 보존·PC 벤치마크·실기기 측정 구분 |
| 개발 | [독립 도로 표본·파일 형식](development/road-samples.md) | PBF 가공·검증 재현, 파일 계약, 휴대폰 로컬 측정 |
| 개발 | [독립 도로 서버 배포](development/road-deployment.md) | 버전별 묶음·R2 설정·업로드·HTTP 검사·전환·복구 |
| 개발 | [영구 도로 캐시](development/road-cache.md) | SQLite 저장·오프라인 조회·취소·손상 복구·용량·별도 검증 화면 |
| 계획 | [단계별 개발](planning/roadmap.md) | 순서와 완료 조건 |
| 계획 | [모바일 독립 서버 전략](planning/server-strategy.md) | 테스트 프로젝트 분리, 도로 공급·회원·커뮤니티 구성, 무료 출시와 유료화 후속 범위 |
| 계획 | [서버 서비스와 가입 준비 안내](planning/cloud-services-and-accounts.md) | Cloudflare·Supabase·MapTiler 역할, AWS 비교, 서버 이전, 지금과 출시 전 계정 준비 |
| 계획 | [CI/CD 자동화](planning/ci-cd-validation-plan.md) | 계획 저장, 아직 미실행 |
| 검증 | [검증 기준](quality/strategy.md) | 변경별 확인 방법 |
| 검증 | [환경 검증 기록](quality/setup-verification.md) | 실제 통과·미검증 사항 |
| 검증 | [지도·위치 검증 기록](quality/map-location-verification.md) | 자동 검사·Android 빌드·기기 결과 |
| 검증 | [저장소 검증 기록](quality/storage-verification.md) | 실제 SQLite 테스트·Android CRUD·프로세스 재시작 복원 |
| 검증 | [GPX 내보내기 검증](quality/gpx-export-verification.md) | 공식 XSD·전체 좌표·에뮬레이터 및 휴대폰 파일 전달·취소·재시도 |
| 검증 | [로컬 코스 저장 검증](quality/saved-courses-verification.md) | SQLite 업그레이드·25개 후보 대조·에뮬레이터 및 휴대폰 독립 실행/오프라인 복원/삭제 |
| 검증 | [코스 계산 검증](quality/route-engine-verification.md) | 원본 회귀·Android 결과·시간·메모리·응답성 |
| 검증 | [지도 중심 조회 검증](quality/route-center-verification.md) | 중심 선택·주변 도로·취소·시간 표시·설치용 APK |
| 검증 | [도로 재시도 서버 단일화](quality/road-retry-verification.md) | 단일 API 호출·서버 공급자 전환·취소·시간 제한·운영 반영 상태 |
| 검증 | [4-1 도로 표본 검증](quality/road-samples-verification.md) | PC 연결·전체 결과, 휴대폰 27회·메모리·형식 결정과 운영 CDN 미검증 구분 |
| 검증 | [4-2 도로 배포 검증](quality/road-deployment-verification.md) | 로컬 S3·HTTP와 실제 R2 개발용 배포·공개 바이트·포인터 전환 검증 |
| 검증 | [판교 표본 추가 검증](quality/pangyo-roads-verification.md) | 지정 주소 중심 2km·R2 새 버전·휴대폰 온라인/오프라인 계산 |
| 검증 | [4-3 영구 도로 캐시 검증](quality/road-cache-verification.md) | 실제 R2·SQLite·새 프로세스와 SM-S942N 오프라인 대조 |
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
