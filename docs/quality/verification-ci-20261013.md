# 브랜치·UI/API 자동 검증 도입 결과

2026-10-13. [실행 계획](../history/executed-plans/2026-10-12-2354-verification-ci.md)·[재현 명령과 운영](../development/verification-ci.md)·[정제된 실행 증거](verification-ci-20261013.json). 작업 브랜치·PR·필수 CI·main 보호 도입을 완료했다. 최신 PR과 [main 전체 실행](https://github.com/ssw3131/running-art-mobile/actions/runs/38291807358)에서 API 29·36을 모두 통과했고, 자료 보존·정리·4화면 차이 0을 원본 아티팩트로 대조했다. Windows 핵심 흐름 10회 연속 근거도 별도로 보존했다.

## 확인된 결과

| 묶음 | 근거와 결과 |
|---|---|
| 빠른 검사 | 초기 로컬/CI Node 410개, 마스크 탐지 보강 후 최신 PR/main CI 411개·UI 상태 4개, Python 하니스 검사 3개. 앱/서버 타입·린트·OpenAPI 최신 여부·PGlite 정책 통과 |
| API 계약 | 실제 HTTP 처리기의 성공·오류와 OpenAPI 비교, 필수 응답 필드 누락 탐지 |
| 경계값 생성 | Schemathesis 4.31.0, seed 20261013, 182요청 통과 |
| 상태 순서 생성 | fast-check 4.10.2, seed 20261013, 동기화와 러닝 각각 40순서. 축소 입력과 seed/path로 재현 가능 |
| Linux 실제 DB | CLI 2.120.0·격리 PostgreSQL 17/Auth/Storage, 네 마이그레이션·pgTAP 5개·기존 SQL 네 묶음·두 SQLite 전체 복원 통과 |
| 검사 자체의 탐지력 | 버튼 가림·응답 필드 누락·타인 SELECT 허용·중복 저장을 주입하면 해당 검사가 탐지. 기준 이미지 없음/환경 불일치는 시각 통과로 판정하지 않음 |
| 물리 폰 S0 | [SM-S942N 결과](service-s0-phone-20261013.md): 기존 자료/계정/설정 보존, 설치·5탭·메뉴/상세·입력/GPX 취소, 정리 완료 |

DB 원본 테스트는 RLS·Storage 소유권·불변 파일·RPC 검증·재시도·충돌·삭제를 검사한다. 타인 접근 결함 주입은 격리 트랜잭션 안에서 SELECT 정책을 느슨하게 만든 뒤 기존 검사의 실패를 확인한다. 연결 종료로 롤백하고 원래 정책 검사를 다시 통과한 것을 확인했다. 운영 Supabase/R2/Cloud Run은 이 CI에서 호출하거나 배포하지 않는다.

## 실행 이력과 판정

| 실행 | 판정 |
|---|---|
| 최초 Windows API 36 | System UI ANR에 가려 실패. 환경 문제로 기록하고 최초 성공으로 세지 않음 |
| 후속 Windows API 36 | 코스 준비가 남은 상태에서 자유 GPS 시작을 시도한 시나리오 순서 문제. 독립 자유 GPS를 먼저 검사하도록 정정 |
| [Linux 38270122401](https://github.com/ssw3131/running-art-mobile/actions/runs/38270122401) | 빠른 검사·API 통과. release 빌드·Maestro 통과 뒤 ADB 스크롤 좌표/화면 크기 차이로 실패 |
| [Linux 38273555464](https://github.com/ssw3131/running-art-mobile/actions/runs/38273555464) | 빠른 검사·API 및 타인 접근 결함 탐지 통과. 최신 보고/시각 고정 코드를 올려 Android 실행은 취소됨. Android 성공으로 세지 않음 |
| [Linux 38275123413](https://github.com/ssw3131/running-art-mobile/actions/runs/38275123413) | 빠른/API·전체 S0 9단계·원본 보존·정리 통과. 최초 기준 부재를 not_run으로 탐지해 게이트 실패. 생성된 4개 화면을 검토해 기준 등록 |
| Windows API 36 연속 실행 | 같은 S0 APK·9단계 × 10회, 재시도 0·90단계 모두 통과. 01:51:37 최종 보고서 생성 |
| [Linux 38277992141](https://github.com/ssw3131/running-art-mobile/actions/runs/38277992141) | 최신 PR head `94344ec`의 깨끗한 merge checkout에서 빠른/API·S0 전체·원본 보존·정리 통과. 새 빌드/재촬영한 네 화면 모두 차이 0, PNG SHA도 기준과 동일. 전체 게이트 통과 |
| [main 38281173312](https://github.com/ssw3131/running-art-mobile/actions/runs/38281173312) | CI squash commit `9422128`. 빠른/API·API 36 전체 동작/보존/정리 통과. API 29는 시나리오 전 SQLite `-json` 미지원으로 실패·정리 통과. API 36 시각 비교는 시스템 Wi-Fi 가장자리 23px로 실패 |
| [문서 PR 38282323384](https://github.com/ssw3131/running-art-mobile/actions/runs/38282323384) | 문서/집계 통과, 앱/API/빠른 검사 생략을 확인. 이후 같은 PR에 Android 10 하니스 수정이 추가돼 전체 검사로 확대 |
| [호환 PR 38283809954](https://github.com/ssw3131/running-art-mobile/actions/runs/38283809954) | 411개+UI 4개·Fuzz 182·실제 DB/API, API 29 3단계/원본 보존/정리와 API 36 전체 동작/정리 통과. API 36 촬영의 상단 여백이 73px 달라 전체 시각 게이트 실패 |
| [표시 환경 고정 PR 38289368580](https://github.com/ssw3131/running-art-mobile/actions/runs/38289368580) | 소스 `45e8bdd`. 빠른/API·API 29 3단계·API 36 9단계, 원본 보존·정리 통과. Pixel 5 상단 136px/하단 63px 실측, 네 화면 검토 마스크 적용 차이 0·재시도 0·dirty=false |
| [최종 main 38291807358](https://github.com/ssw3131/running-art-mobile/actions/runs/38291807358) | squash commit `703a765`에서 독립 재빌드·재실행. 411개+UI 4개+Python 3개·Fuzz 182·실제 DB, API 29/36 동작·보존·정리·네 화면 차이 0 및 필수 게이트 통과 |

Windows 10회 실행은 `7fa78cf` 시점의 하니스에 시나리오 순서·정적 fixture 초기화 보강을 읽어 시작했다. 이후 추가한 Linux 스크롤/보고서/표시줄 고정 보강과 구분하며, 최신 하니스의 Linux 10회 또는 Windows 픽셀 비교 10회 성공을 주장하지 않는다. 같은 APK 해시 `729c60a28efd29dfb6cf857933ee9f9db87b4a81e88535b508a416620fe2992f`와 fixture를 유지한 핵심 동작 안정성 검사다. 완료 뒤 서비스 없음·도우미 없음·글꼴 배율 1.0을 확인하고 전용 에뮬레이터를 종료했다.

초기 CI PR 보고서는 소스 `7870391665fe050af4b2c1529bce366be5dc0bb5`(PR merge checkout), dirty=false, APK `42195e78386a17989a4f6cdfb415ecc263b64e03a6bf2ca1bda75340822057f6`를 기록한다. 최초 기준 생성 실행과 이번 독립 비교 실행을 구분한다. 같은 head의 준비 완료 이벤트가 앞선 실행 `38277967089`를 취소했으며 취소 실행은 통과 횟수에 넣지 않는다.

### main의 진단 재실행

main API 29는 UI 계층 도우미가 성공 로그 뒤 비정상 종료 상태를 반환한 첫 실패 후, 같은 코드의 실패 작업만 진단 재실행해 통과했다. 최초 실패 원본을 보존했으며 전체 첫 시도 통과나 해당 불안정성의 근본 해결로 해석하지 않는다. 첫 실행은 Maestro를 통과한 뒤 `S0-02-draft`의 화면 계층 조회에서 실패했고 정리는 통과했다. 두 번째 작업에서도 시나리오 내부 자동 재시도는 하지 않았지만, workflow attempt 2라는 점을 별도로 기록한다. Android 16과 빠른/API의 첫 시도 성공은 그대로 유지한다. 같은 현상이 재발하면 ADB 종료 코드·SystemUI/도우미 로그를 추가 수집해 원인을 좁히며, 실패를 무시하거나 OK 문자열만으로 강제 성공 처리하지 않는다.

## 브랜치 운영 적용

S0 [PR #1](https://github.com/ssw3131/running-art-mobile/pull/1), CI [PR #2](https://github.com/ssw3131/running-art-mobile/pull/2), Android 검증 환경 보완 [PR #3](https://github.com/ssw3131/running-art-mobile/pull/3)을 각각 squash merge했다. 계속 유지하는 브랜치는 main이며 완료된 작업 브랜치는 삭제한다.

10회 안정성·Linux 독립 통과 후 main 보호를 PUT하고 GET으로 검증했다. PR, 최신 main 반영, GitHub Actions 앱(ID 15368)의 `verification-gate`, 관리자 적용, 선형 이력, 대화 해결을 요구한다. 강제 push·삭제는 금지하고 1인 개발에 타인 승인 수는 0으로 둔다. 저장소는 squash만 허용하고 병합 후 브랜치 자동 삭제를 켰다.

## 시각 검증 범위

홈·러닝 대기·보관함·비로그인 계정의 정적 화면을 비교한다. S0 공통 상하단은 기존 Figma 대조 근거와 [S0 승인 화면](service-s0-screenshots.html)을 따르고, 기존 본문은 현재 구현의 회귀 기준이다. S1 이후 본문 Figma 이관 완료로 해석하지 않는다. CI 계정 화면은 실제 자격 설정이 없어 Google 버튼 비활성/설정 안내가 나타나는 상태를 기준으로 삼는다. 실제 3종 소셜 버튼과 계정 상태는 실기기 검증 범위이며 CI 캡처가 이를 대체하지 않는다.

코스 생성 지도의 외부 배경은 고정 PNG 비교 대상에 넣지 않고 입력/탭 유지·선택/저장/접근성 동작 증거로 남긴다.

소스/APK/fixture 해시·API·빌드 fingerprint·호스트·해상도·밀도·글꼴 배율·언어·시간대를 기록한다. 촬영 중 상태 표시줄만 공식 데모 모드로 고정하고 다시 해제한다. pixelmatch 0.1·안티앨리어싱 제외로 비교하며 자동 기준 갱신은 없다. 차이 0이 아니면 실패 증거를 검토한다.

main `38281173312`의 네 원본 PNG를 대조한 결과, 각각 원시 차이 249px가 모두 시스템 Wi-Fi 아이콘 가장자리 `x=817..857,y=53..85`에만 있었다(pixelmatch 판정 23px). 앱 영역은 동일했다. 원본 실패 ZIP/보고서는 보존하고 기준 PNG를 바꾸지 않은 채 이 41×33px 시스템 영역만 이유·좌표·실행 번호를 기록해 제외했다. 검토 후 별도 폴더에서 네 화면 차이 0을 확인했으며 후속 PR/main의 독립 재실행에서도 차이 0을 확인했다. 넓은 마스크와 앱 영역 마스크는 거부하고 Wi-Fi 마스크가 있어도 실제 앱 버튼 가림은 탐지하는 검사를 추가했다. 앞선 PR의 마스크 없는 차이 0과 이 후속 판정을 구분한다.

이어 `38283809954`는 기능을 모두 통과했지만 상단 환경 차이를 시각 검사에서 잡았다. 기존 홈 본문 시작은 y=346, 이 실행은 y=273으로 73px 이동했고 시스템 시계 위치도 달랐다. 픽셀 차이는 홈 456,937·러닝 267,288·보관함 92,301·계정 268,067이었다. 앱 전체를 가리거나 기준 PNG를 갱신하지 않았다. Pixel 5 오버레이와 SystemUI의 실제 창 높이를 명시적으로 설정·측정하도록 보완했다. 로컬 진단에서 오버레이만 바꾸면 cutout 133px에 상태 표시줄 63px가 남아 시계가 잘리는 상태를 재현했고, SystemUI 갱신 후 둘 다 133px로 일치함을 확인했다(로컬 물리 높이 2400px의 축소, Linux 2340px와 별도 환경). Linux 기준은 기존 승인 화면의 상단 여백 136px를 유지한다. 프로필 선택·오래된 시스템 바 거부·SQLite WAL/타입/정리 Python 검사 3개를 통과했다. 후속 PR/main의 Linux 실측은 statusBar `[0,0,1080,136]`, navigationBar `[0,2277,1080,2340]`, cutoutInsets `[0,136,0,0]`으로 일치했고 네 화면 촬영 중에도 유지됐다.

공개 CI에는 합성 자료만 사용한다. 실제 폰 화면/계정/좌표 원본은 로컬 무시 폴더에만 보관한다. 결과 아티팩트는 7일 후 만료되며 실행/판정 요약은 이 문서에 남긴다.

## 증거 확인

Actions 실행의 `android-36-1` 아티팩트를 내려받아 압축을 풀고 `index.html`을 열면 시나리오와 스크린샷, 기준/현재/차이 세 이미지를 함께 확인할 수 있다. `report.json`은 기능·원본 보존·정리 결과, `visual-report.json`은 화면별 차이와 소스/APK/환경을 담는다. API 아티팩트에는 경계값 생성 JUnit, PostgreSQL 권한/결함 주입 로그, 실제 동기화 왕복 결과를 남긴다.

통과한 로컬 증거는 `test-results/android-windows-stability/`, 독립 PR의 내려받은 원본은 `.cache/ci-setup/android-reviewed/`, 실제 폰 9화면은 `.cache/service-s0-phone-20261013/`에 각각 보존했다. 각 폴더에 `index.html`이 있다. 이 경로는 개인 PC의 무시 폴더이며 새 checkout에서 제공되는 공개 기준 화면과 구분한다.

## 해결 결과와 후속 범위

main에서 발견한 API 29 SQLite 조회 호환성과 API 36 시스템 표시 환경 문제를 수정하고 최신 PR/main에서 재검증을 완료했다. SQL 온라인 백업→호스트 읽기 방식으로 변경하고 WAL·한글/줄바꿈/숫자/NULL·읽기 전용·전송 실패 정리 검사를 추가했다. QA/워크플로/빌드 설정·의존성이 바뀌는 PR은 API 29를 main 반영 전에 추가 실행한다. 최초 실패 이력은 유지한다. APK/서버 자동 배포는 범위 밖이다. 실제 소셜 인증·야외 GPS 정확도·충전 해제 소모·TalkBack 발화는 실기기 확인을 병행한다.

최종 main 원본 증거는 `.cache/ci-setup/main-final/`의 OS별 보고서·갤러리에 보존했다. 공개 Actions 아티팩트가 만료되어도 소스/APK/fixture 해시·환경·시나리오·화면별 판정은 [정제된 실행 증거](verification-ci-20261013.json)에 남는다. 구현·실행 검증 완료 시각: 2026-10-13T04:15:20+09:00.
