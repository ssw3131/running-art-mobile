# RunPen — Running Art Mobile

**2026-10-04 직접 그리기 완료·23:53:59 휴대폰 설치:** 코스 만들기에서 한 획의 닫힌 도형을 그리고 미리보기 후 코스를 생성·저장·러닝에 사용할 수 있습니다. 344개 검사·타입/린트·release와 API 36 터치/계산/저장/재열기/러닝을 통과하고 시험 자료를 복구했습니다. 사용자 후속 요청으로 동일 ID·서명의 `20261004-custom-drawing.apk`를 SM-S942N에 자료 유지 방식으로 업데이트하고 설치 해시·기본 실행을 확인했습니다. 휴대폰 기능/DB 내용 해시 재검증은 별도이며 클라우드 변경은 없습니다. [사용법](docs/development/custom-drawing.md)·[검증/APK](docs/quality/custom-drawing-verification.md).

**2026-10-04 실제 러닝 링크 공유 완료(PC·서버·웹):** 실제 Cloudflare·Supabase의 합성 링크 생성·세 경로/토글·공유 중단과 테스트 계정/자료 정리를 완료했다. 원본 앱에 배포 주소를 연결했고 18:56:38 KST 휴대폰에 동일 ID·서명 APK를 자료 유지 설치했다. 사용자 최종 지시에 따라 PC·서버·웹 범위를 완료하고 추가 폰 검증·임시 UI 파일 정리는 후속으로 남겼다. [검증/폰 후속](docs/quality/run-link-sharing-verification.md).

**2026-10-04 코스 규칙 변경 완료(PC·에뮬레이터·APK):** 중심 100m 제한 없이 반경 2km 전체에서 순환 코스를 추천합니다. 코스 어디서나 원하는 방향으로 출발하고 한 바퀴를 연속 완주하면 확인합니다. 코스 밖에서는 보행 도로 최단 합류·이탈 시 마지막 진행 지점 복귀를 안내하며 접근도 실제 러닝 기록에 포함합니다. 330개 검사·타입/린트·release, 양방향 완주·잠금/오프라인·합류/중단 복귀·생성/저장을 통과했습니다. 동일 ID/서명의 `20261004-free-loop.apk`를 준비했으며 **휴대폰에는 설치하지 않았습니다.** [사용법](docs/development/course-gps-guidance.md)·[검증/APK](docs/quality/free-loop-guidance-verification.md)·[최신 상태](docs/handoff/status.md).

**2026-10-04 수정 목표·휴대폰 후속 완료:** 탈퇴 서버 배포·시험 계정 삭제/재시도/기기 보관과 실제 Google 프로필 저장·재로그인을 검증했습니다. 사용자 후속 승인으로 **13:18:40에 최신 계정 APK를 휴대폰에 업데이트**했고, 프로필 저장/앱 재시작/서버 대조/원상 복구와 기존 코스 1개·러닝 2건·209좌표·메모 1개의 내용 보존까지 통과했습니다. 실제 사용자 계정은 탈퇴시키지 않았습니다. Figma·카카오/네이버는 이번 목표에서 제외했습니다. [현재 범위](docs/development/account-mypage.md)·[실제 검증·설치본·후속](docs/quality/account-mypage-verification.md). 아래 미배포/미설치는 과거 이력입니다.

**2026-10-04 안내 재개 오류 수정·휴대폰 후속 검증 완료:** 재개 뒤 홈으로 나가면 안내가 멈추던 문제를 수정했습니다. 반복 3회·연속 315.8초 잠금·알림 제어·강제 종료/완주 정리를 통과했고 11:31:09에 수정 APK를 설치했습니다. 이 수정의 통합 검사 284개도 통과했습니다. **배경 OFF 자동 정지와 최종 자료·계정 UI 대조까지 완료했습니다.** 코스 1개·러닝 2건·메모 1개·기존 로그인/동기화 ON을 유지했고 안내 서비스도 종료했습니다. 실제 야외 GPS·배터리는 후속입니다. [현재 상태](docs/handoff/status.md)·[검증/설치본](docs/quality/running-guidance-simulation-verification.md).

**2026-10-04 추가 소셜 후속:** 앱의 Google·카카오·네이버 공통 로그인 처리를 준비하고 전체 274개 검사를 통과했습니다. 기본 Google만 활성화하며 카카오/네이버의 실제 설정·로그인 검증은 남아 있습니다. [검증 범위](docs/quality/account-mypage-verification.md).

**2026-10-04 계정 후속:** 서버 탈퇴 준비본과 로컬 권한 검사를 추가해 전체 267개 검사를 통과했습니다. 아직 미배포·앱 미연결이며 기기 자료 정책과 실제 서버 검증이 남았습니다. 앱/APK·휴대폰은 아래 상태를 유지합니다. [최신 상태](docs/handoff/status.md).

**2026-10-03 계정·마이페이지 진행 중:** Google 기반 프로필·계정별 화면/러닝 설정·실제 기록 집계·동기화 화면·로그아웃 확인을 연결했습니다. SQLite v6와 PC·비로그인 에뮬레이터 검증을 마쳤으며, 탈퇴 정책/구현·실제 계정 프로필 저장 검증 등은 남아 있습니다. 휴대폰에는 설치하지 않았습니다. [사용법](docs/development/account-mypage.md)·[완료/미완료 검증 범위](docs/quality/account-mypage-verification.md).

**2026-10-03 코스 생성·실제 GPS 안내 연결 완료(PC·에뮬레이터 범위):** 위치·거리·도형→후보→저장→출발 준비→실제 안내→완주 확인·코스 연계 기록을 연결했습니다. SQLite v5·체크포인트·동기화 형식 호환, 249개 검사·타입·린트·release 빌드와 30분 잠금/오프라인 안내·중단 복원·생성 화면 흐름을 확인했습니다. 기존 ID·서명의 `20261003-course-gps.apk`를 준비했으며 **휴대폰에는 설치하지 않았습니다.** 야외·배터리와 기존 모의 서비스의 실기기 재개 문제는 후속입니다. [사용법](docs/development/course-gps-guidance.md)·[검증·APK 해시](docs/quality/course-gps-guidance-verification.md)·[최신 상태](docs/handoff/status.md).

**2026-10-03 16:05 휴대폰 검증 중단:** 사용자 요청으로 멈췄습니다. 모의 안내 화면·이탈/복귀·완주·연속 5분 잠금·알림 일시정지를 확인했고 설정 하단 잘림 수정 APK를 16:00:54에 설치했습니다. 저장 코스의 **일시정지 후 재개→백그라운드에서 안내 서비스가 멈추는 문제는 미해결**입니다. 다음 재개 시 이 문제와 시험 후 자료 대조부터 이어갑니다. [상세 결과](docs/quality/running-guidance-simulation-verification.md)·[현재 상태](docs/handoff/status.md).

**2026-10-03 15:27:29 휴대폰 업데이트 완료:** 사용자 요청으로 SM-S942N에 안내 시험 APK를 설치했습니다. 기존 앱·데이터를 유지하는 업데이트이며 설치본 해시가 준비 파일과 일치합니다. 앱 프로세스 실행을 확인했고, 잠금 상태여서 화면·주행 검증은 후속입니다. 아래 미설치 표현은 최초 개발 완료 시점입니다. [설치 검증](docs/quality/running-guidance-simulation-verification.md).

**2026-10-03 러닝 안내 모의 시험 완료:** 홈·저장 코스 상세에서 지도/집중 모드, 방향·이탈·지나온 길 복귀, 한국어 음성·진동, 화면 꺼짐 안내, 설정·완주 결과를 시험합니다. 239개 검사·타입·린트·release 빌드와 API 36의 30분 잠금·오프라인 안내·저장 코스·DB 보존을 통과했습니다. 최신 준비 APK는 `build/install/running-art-0.1.0-20261003-guidance.apk`이며 **휴대폰에는 설치하지 않았습니다.** 실제 GPS 안내·야외 검증은 후속입니다. [사용법](docs/development/running-guidance-simulation.md)·[검증·APK 해시](docs/quality/running-guidance-simulation-verification.md). 아래 날짜별 다음 작업·설치본 표현보다 이 문단과 현재 상태를 우선합니다.

**2026-10-03 개인 자료 동기화 완료:** 내 계정에서 동기화를 켜면 개인 코스·완료한 러닝을 비공개 서버에 저장하고 복원합니다. 계정 분리·오프라인 재전송·수정·삭제·충돌 처리를 구현했고, 220개 검사와 실제 휴대폰의 빈 저장소 복원·원본 보존을 통과했습니다. 최신 APK는 `build/install/running-art-0.1.0-20261003-personal-sync.apk`이며 12:21:48 KST에 기존 휴대폰 앱을 업데이트했습니다. 다음은 RunPen 5-1 서비스 화면·계정입니다. [사용법](docs/development/personal-sync.md)·[검증·해시·범위](docs/quality/personal-sync-verification.md).

**2026-10-03 실서비스 기획 반영:** 서비스명은 **RunPen**, 저장소·기술 프로젝트명은 Running Art입니다. [제품 기획](docs/product/overview.md)에 Figma UI 기준의 화면·흐름, 현재 구현과의 차이, 미확정 과금안을 정리했습니다. 현재 앱을 실서비스로 이어가며 개발용·배포용 앱을 따로 만들지 않습니다. 서버 환경 분리 여부와 최초 출시 필수 범위는 후속 결정입니다. 전체 목표를 단계적으로 완성하고 커뮤니티는 후속 확장으로 둡니다. 이번 변경은 문서 정리이며 서비스 화면 구현·앱 배포 완료를 뜻하지 않습니다.

문서 읽기 순서는 **[서비스 기획](docs/product/overview.md) → [현재 상태](docs/handoff/status.md) → [로드맵](docs/planning/roadmap.md)**입니다. 개인 자료 동기화의 최신 결과는 위 문단을 따르며 아래 날짜별 ‘미구현’·‘최신 APK’는 해당 시점의 기록입니다.

**2026-10-03 Google 앱 로그인 목표 완료:** 홈의 내 계정에서 Google 로그인·브라우저 복귀·계정 표시·세션 보관·갱신·로그아웃을 제공합니다. 전체 자동 검사 202개·타입·린트·release APK·에뮬레이터에 이어 **SM-S942N에서 실제 로그인 → 앱 복귀 → 계정 표시 → 앱 재시작 후 유지 → 로그아웃**을 확인했습니다. 로그아웃 후 재시작·재로그인과 기존 코스·러닝·메모 보존도 통과했습니다. 개인 자료 동기화는 후속입니다. [사용법](docs/development/google-sign-in.md)·[검증과 APK](docs/quality/google-sign-in-verification.md).

**2026-10-02 실제 휴대폰 후속 검증 완료:** SM-S942N·Android 16에서 개선 전/후 release APK를 교차 3쌍 비교했다. 합성 격자는 3쌍 모두 빨라졌지만 강남 실제 도로는 3쌍 중 2쌍에서 느려져 일관된 개선을 확인하지 못했다. 격자 전체 결과와 실제 도로 후보 점수·탐색량이 같고 입력/취소/재계산·저장 코스 재생을 통과했다. 최종 성능 APK 설치·해시와 기존 야외 기록 2건/209좌표·코스 1개·메모 1개 보존을 확인했다. GPS 거리 재합산은 정확히 일치하며 장시간 잠금·배터리·실제 이동 거리 오차는 후속이다. [전후 수치와 검증 범위](docs/quality/phone-performance-20261002.md). 아래 이전 시각의 설치 보류·미검증 표현은 당시 이력이며 최신 상태는 이 문단을 우선한다.

**2026-10-02 계산 성능 개선:** 결과를 유지하며 PC 6사례의 계산 중앙값을 3.5~7.7% 줄였다. 188개 검사와 release·에뮬레이터 검증 완료, 휴대폰 적용은 후속이다. [전후 측정과 한계](docs/quality/route-performance-20261002.md).

**2026-10-02 19:26:52 KST 휴대폰 설치 완료:** SM-S942N에 전국 도로·코스 저장/GPX·시뮬레이션·GPS 러닝을 포함한 최신 `running-art-0.1.0-20261002-running.apk`를 기존 데이터 유지 방식으로 업데이트했다. 설치본 SHA-256 일치와 최초 설치 시각·데이터 경로/inode 유지를 확인했다. 사용자 후속 요청에 따라 앱 실행·기능 테스트는 하지 않았다. 전국 계산·시뮬레이션·러닝의 휴대폰 기능 검증은 나중에 진행한다. 아래 이전 판교 설치본 유지·설치 보류 표현은 당시 이력이다.

사용자가 선택하거나 직접 그린 도형을 닮은 **실제 보행 도로 코스**를 찾고, 달린 궤적과 기록을 남기는 모바일 앱입니다. Android를 먼저 개발·배포하고 이후 iOS로 확장합니다.

**실제 러닝 GPS 추적·기록을 구현했습니다.** 시작·일시정지·재개·종료, 거리·활동 시간·평균 페이스, Android 잠금 화면 수신, 오프라인 기록 목록·상세·삭제와 앱 중단 복원을 제공합니다. 전체 자동 검사 186개·타입·린트·release 빌드와 API 36 에뮬레이터의 위치 주입·잠금·강제 종료·오프라인 복원을 확인했습니다. 최신 APK의 휴대폰 설치는 완료했고 기능 실행·야외 GPS·배터리 검증은 후속입니다. [러닝 사용법](docs/development/running-tracking.md)·[검증](docs/quality/running-tracking-verification.md).

**4-4의 전국 도로 공급·갱신/복구·용량 운영을 PC와 개발용 R2에서 완료했습니다.** 일반 앱은 지도 중심 주변의 전국 도로 파일을 받아 영구 저장합니다. 두 날짜의 원본·23개 대표/경계 대조, 실제 새 날짜 갱신·이전 버전 복구·최신 복귀, 공개 자료의 새 프로세스 오프라인 복원을 확인했습니다. 전체 자동 검사 165개·타입·린트·release 빌드를 통과했습니다. **휴대폰에는 전국 공급을 포함한 최신 통합 APK를 설치했으며 기능 테스트는 사용자 결정으로 후속입니다.** 운영 도메인/CDN도 후속입니다. [전국 공급 안내](docs/development/national-roads.md) · [전국 검증](docs/quality/national-roads-verification.md) · [기존 표본 휴대폰 검증](docs/quality/road-cache-verification.md)

**계산한 코스의 기기 저장·목록·다시 열기·이름 변경·삭제를 구현했습니다.** 재계산 없이 경로를 복원하며 기본 경로 표시는 인터넷·GPS 없이 동작합니다. 자동 검사 119개·타입·린트·Android 번들과 에뮬레이터·실제 휴대폰의 저장·강제 종료 후 복원·삭제를 확인했습니다. SM-S942N에는 최신 독립 실행 APK를 업데이트했고 기존 메모 보존·네트워크 없는 복원을 확인했습니다. 이번 표본 측정 뒤 원래 설치본으로 복원·독립 실행을 확인했습니다. **저장 코스의 GPX 내보내기도 구현했습니다.** 전체 자동 검사 130개·최종 관련 검사 11개·타입·린트·Android 빌드와 에뮬레이터의 오프라인 파일 전달·취소·재시도를 확인했습니다. 후속 SM-S942N 업데이트·GPX 파일 전달·오프라인 취소/재시도와 기존 자료 보존도 확인했습니다. 코스 시뮬레이션은 구현·PC·에뮬레이터 검증을 완료했고 실제 휴대폰 검증은 후속입니다. [시뮬레이션 안내](docs/development/course-simulation.md)·[검증](docs/quality/course-simulation-verification.md). [GPX 사용법](docs/development/gpx-export.md) · [GPX 검증](docs/quality/gpx-export-verification.md). [코스 저장 사용법](docs/development/saved-courses.md) · [검증 결과](docs/quality/saved-courses-verification.md) · [전체 로드맵](docs/planning/roadmap.md)

**2026-09-30 서버 방향 정리:** 두 웹 테스트 프로젝트는 알고리즘·기능 참고로만 사용하고 모바일의 서버·도로 공급·데이터·배포를 독립시킵니다. 로그인·동기화·코스 공유·커뮤니티를 서비스 범위에 포함하고, 초기 사용자 제공은 무료이며 유료화·횟수 제한은 후속 계획으로만 둡니다. [독립 서버 전략](docs/planning/server-strategy.md)에 구성과 전환 순서를 정리했습니다. 현재 일반 계산과 캐시 검증 화면은 같은 모바일 전용 R2 전국 채널·영구 저장을 사용합니다.

**현재 설치된 화면은 핵심 기능 검증 화면이며, 이 앱을 RunPen 서비스로 이어 개발합니다.** Figma UI 페이지의 홈·코스 생성·실시간 러닝·기록 보관함·마이페이지와 계정·안내 화면이 목표입니다. 기존 홈의 **코스 계산 테스트 → 주변 OSM**에서 위치 버튼이나 지도를 이용해 중심 주변 도로로 계산할 수 있습니다. 현행 사용법은 [지도 중심 조회](docs/development/route-center.md), [계산 성능](docs/development/route-engine-performance.md), [독립 실행 APK](docs/development/android-test-apk.md)를 참고하세요.

최신 상태는 [인수인계](docs/handoff/status.md), 사용법은 [코스 저장](docs/development/saved-courses.md)·[코스 계산](docs/development/route-engine.md)·[지도·위치](docs/development/map-location.md)를 참고하세요. 휴대폰에는 2026-10-03 개인 자료 동기화 APK까지 업데이트했으며 GitHub 공개 APK는 이전 버전입니다. 야외·장시간 검증은 후속, CI/CD는 실행 보류입니다.

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

- 기능·흐름: RunPen Figma UI 페이지와 사용자 확정 결정을 우선합니다. prototype 페이지는 보조, 보관함은 과거 시안이며 Google AI Studio 프로토타입은 참고용입니다.
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
