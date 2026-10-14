# S5·S6 성취·공유와 계정·지원 검증

상태: 2026-10-14 검증 진행 중. [구현 계약](../development/achievements-support.md)·[실행 계획과 실패 이력](../history/executed-plans/2026-10-14-0908-achievements-service.md).

## 범위

사용자 확정: 도형별 완주 배지·완주 횟수, 기존 기록 포함/삭제 재집계, 기기 달력 기준 연속일. 칼로리는 제외한다. 카드 닉네임·날짜는 기본 표시하며 선택적으로 숨길 수 있다.

기존 계정·사진·탈퇴·러닝·동기화와 같은 앱 ID/서명을 사용한다. 운영자/문의 이메일/시행일은 답변 대기다. 운영 SQL·약관 게시·휴대폰 설치를 수행하지 않았다. 문의 접수·공지는 신규 RPC를 적용한 환경이 필요하며 운영 완료로 분류하지 않는다.

## 완료 조건 대조 — 11:30 기준

| 조건 | 현재 근거와 남은 범위 |
| --- | --- |
| 완주 배지·중복/복원·삭제 재집계·연속일 | `achievements.test.mjs`의 실제 SQLite 소유권/원본 불변 및 집계 검사, `UI-S5-01/02`, 실제 APK 결과→배지→기록 진입. 칼로리 제외/닉네임·날짜 기본 표시는 사용자 결정대로 확인 |
| PNG 두 비율·미리보기와 실제 파일 일치·OS 공유/취소 | Windows API 36 `s56-android-06/07` 실제 PNG 바이트/해상도와 저장·공유창 확인. Android 10 호환 검사는 수정본 CI 대기이며 성공으로 세지 않음 |
| 긴 이름·시간·작은 수치, 저장/공유 실패·계정 변경 | 카드 데이터의 한글/영문 20자·123시간·1m/0m 검사와 `achievement-export.test.tsx` 5개 추가 검사 통과. 후자는 네이티브 경계 모의 실패 주입으로 부분 파일 삭제·재시도·계정 변경 중단·공유 실패를 검사하며 실제 OS 저장 성공 검사를 대체하지 않음 |
| 기존 링크 수신/공유 중단·AI 호출 제외 | 기존 링크/서버 권한 검사와 CI `S0-08-links-gpx` 유지. 이미지 카드는 기기 캡처·좌표 정규화만 사용하며 링크와 공개 범위를 구분. 실제 외부 링크 운영 근거는 [기존 공유 검증](run-link-sharing-verification.md), 이번 새 실기기 수신 검증으로 주장하지 않음 |
| 계정·사진·탈퇴·기기 자료 보관 | 기존 `account`, `profile-photo`, `account-withdrawal`, `account-deletion` 검사와 실제 격리 Auth/Storage 통합 유지. 운영 계정/실제 폰의 변경 화면 후속은 미실행 |
| 앱/지도 테마·재시작·접근성 | 실제 APK의 테마 변경/재시작·360dp/글꼴 1.6배 및 전체 GPS 회귀. 제품 지도 설정은 같은 테마를 사용. 실제 폰 야외·장시간 검증과 구분 |
| 소개/사용법/FAQ·공지 목록/상세/오프라인 | 번들 콘텐츠·UI 상태 검사, 실제 APK `s56-android-07` 캐시/네트워크 OFF·목록 복귀. 시험 공지는 격리 캐시만 사용, 운영 공지 미게시 |
| 문의 실제 저장·중복·실패/재전송·선택 이메일 | 로컬 controller/정책 검사 및 실제 격리 `DB-SUPPORT-01` 통과. 운영 SQL·담당/회신 채널·보유 기간 확정과 운영 접수 검증은 남음 |
| 정책 정합성·운영 정보·최신 문안 | [기술 대조/교체 초안](../product/policy-reconciliation-20261014.md) 작성. 운영자/연락처/시행일·최종 문안과 실제 게시/필수 동의 통합은 미완료 |
| PR/main·APK·인수인계 | 동일 ID/서명 APK 준비. PR #16의 최종 필수 게이트·병합/main 전체 검사와 최종 상태 갱신은 진행 중. 휴대폰 설치·운영 배포는 미실행 |

추가 오류 검사는 처음 두 번 Jest 실행 준비에서 sandbox `realpath EPERM`으로 시작하지 못했다. 동일 작업 폴더 TEMP를 사용한 승인된 로컬 실행에서 5개 통과했다. 제품 소스/APK 변경 없이 검사만 보완했으며 현재 실행 중인 CI(`38500625886`, head `97b4662`)에는 이 추가 검사가 아직 포함되지 않는다.

## 로컬 검사

| 실행 | 결과 |
| --- | --- |
| `s56-fast-03` | 타입/린트·서버·로직 451개·UI 33개·OpenAPI·PGlite 계정/지원/공유 정책 모두 통과 |
| `s56-fast-04` | 추가 오류/경계 검사를 포함해 타입/린트·서버·로직 452개·Jest 38개(UI/네이티브 경계)·OpenAPI·PGlite 정책 모두 통과. 제품 소스는 그대로이며 추가 검사의 원격 CI 반영은 후속 |
| Python QA | 10개 통과. sandbox 임시 디렉터리 접근 실패 후 작업 폴더의 전용 TEMP로 실행 |
| Expo doctor | 20/21. 기존 Expo 11개 패키지의 최신 patch 권고 유지, 새 view-shot 5.1.0 호환 확인 |
| `s56-build-02` | release 성공, 초기 네이티브 캡처 검증용 |
| `s56-build-03` | release 성공. 자동 시스템 테마·다크 대비·카드 이미지 로드 재시도 포함 |

집계 검사는 중복/복원·삭제·현재/최장 연속일·0거리·자유/중도 종료·실제 SQLite 소유권·원본 불변을 포함한다. 문의 검사는 응답 유실/재시작/같은 요청 재시도·계정 전환·위조 영수증·권한/신규 5건 제한·삭제 cascade를 포함한다. 실제 PostgreSQL/Auth/Storage 통합은 PR CI에서 별도로 수행한다.

## 격리 Android

전용 `RunningArt_UI_QA`, `emulator-5558`만 사용했다. 연결된 A7 휴대폰은 조작하지 않았다. 시험 종료 후 합성 러닝·설정·공유 파일을 정리하고 기존 코스/메모/계정 관련 테이블 내용 해시를 대조한다.

- `s56-android-01`: 카드 하단 버튼 스크롤 중 시스템 제스처 영역으로 시작한 시험 스와이프로 실패. 실패 화면/로그·원본 보존/정리 확인. 실제 viewport 내부로 스와이프 위치를 수정했다.
- `s56-android-02`: 실제 스토리 1080×1920/피드 1080×1350 PNG, 기본 닉네임·날짜와 숨김, 공유창/저장 취소, 배지→기록 상세·서비스 안내/FAQ/문의 로그인·다크 테마 재시작을 확인했다. 마지막 큰 글씨 검사에서 설정 변경에 따른 activity 재생성과 딥링크가 겹쳐 설정 화면에 남아 실패했다. 화면 배율 변경 후 cold launch를 사용하도록 검사를 수정했다. 이 실행을 전체 통과로 세지 않는다.
- `s56-android-03`: 실제 폴더 저장 추가 검사가 Android 허용 버튼의 대소문자(`Allow`/`ALLOW`) 차이로 멈췄다. 확인된 시스템 `android:id/button1`로 찾도록 수정했다. 파일 쓰기 전 실패이며 정리/원본 보존을 확인했다.
- `s56-android-04`: S5/S6 기능 단계·원본 보존·정리 통과, 캡처 준비/전송 경고 0건. 실제 폴더 저장 PNG가 미리보기와 바이트 단위로 같고 기본/숨김 두 비율, 배지 기록 진입·지원 메뉴·테마 재시작·360dp/글꼴 1.6배를 확인했다. 뒤이은 눈으로 보는 검토에서 1.6배의 활동 시간 마지막 숫자 줄바꿈과 소개 그림 상단 샘플 글자 잔여를 발견했다. 큰 글씨에서 통계를 한 열로 배치하고 그림 crop을 보완했으며 후속 APK로 다시 확인한다.
- `s56-android-05`: Android DocumentsUI가 이전 Pictures 폴더를 기억해 취소의 첫 Back이 상위 폴더로만 이동했다. 앱 복귀 없이 후속 버튼을 찾던 검사가 실패했으며 원본/정리는 통과했다. 취소 후 실제 카드 복귀를 확인하는 최대 3단계 Back과 정리 전 실패 캡처를 추가했다. 시나리오 재시도나 판정 완화가 아니다.

- `s56-android-06`: 최종 `s56-build-06` APK로 S5/S6·원본 보존·정리 모두 통과했다. 재시도·캡처 준비 대기·전송 경고 0건. 실제 저장 PNG와 미리보기의 바이트 일치, 두 비율/개인정보 선택, 기본 닉네임·날짜, 테마 재시작, 큰 글씨를 확인했다. 최종 화면을 직접 열어 활동 시간 한 줄과 소개 그림의 샘플 글자 제거를 확인했다. story SHA-256 `c8daf264843b8a4cd4aa8150186f55c529692171d9d0e53bf343e91df2b70120`, feed `772ae7abac56eca22c5f8b47b60fcaa30abdedf6a6bda20d9d1ad00f9305ce13`.

빌드와 타입 검사를 동시에 실행한 `s56-final-check`는 Expo 자동 생성 route 타입 갱신 중 `/`·`/runs`를 찾지 못해 실패했다. 빌드 종료 뒤 순서대로 실행한 `s56-final-check-02/03`은 타입·린트 통과했다. 최종 전체 회귀·독립 CI·시각 기준 비교·main 반영은 아직 완료하지 않았다. 최초 실패 로그는 삭제하거나 성공 실행으로 덮어쓰지 않는다.

## PR CI 진행

[PR #16](https://github.com/ssw3131/running-art-mobile/pull/16), 최초 [38493490559](https://github.com/ssw3131/running-art-mobile/actions/runs/38493490559): head `82a7148`, CI merge source `f68c9e1`.

빠른 검사와 HTTP·실제 격리 PostgreSQL/Auth/Storage 통합은 통과했다. 기존 개인 자료/회원과 신규 `DB-SUPPORT-01`을 합쳐 3개 실제 통합 검사 통과다. 지원 SQL의 게시 범위·타인/익명/직접 쓰기 차단·중복/내용 변경 재시도·시간당 제한·탈퇴 cascade 및 기존 보안 mutation 탐지를 확인했다. 근거는 CI API artifact `11863380742`다. Android 29/36은 실행 중이다.

최초 API 29는 S0 탭/홈 뒤 과거 서비스 메뉴의 ‘코스 만들기’ 바로가기를 찾던 검사에서 실패했다. S6 메뉴는 소개/사용법/FAQ/문의/공지로 바뀌었으므로 실제 ‘서비스 소개 → 코스 생성하러 가기’ 경로에서 기존 중심/거리/도형 보존을 검증하도록 갱신했다. 아래로 이동한 개발 도구도 스크롤 후 진입한다. 기존 보존/뒤로 가기 assertions는 유지했다. API 29 artifact `11863223467`·실패 로그와 정리 통과, 준비 대기 1건/전송 경고 1건을 보존한다.

최초 API 36도 같은 과거 메뉴 버튼 탐색에서 실패했다. artifact `11863132573`와 첫 로그를 보존했으며 두 API 모두 갱신한 경로로 재검증한다.

## 검토한 실제 화면과 APK

최종 Windows API 36의 [원본 보고서](assets/achievements-support-20261014/local-report.json)를 보관한다. 보고서의 dirty는 당시 QA/문서 후속 편집 상태이며 제품 소스는 `57599bc`다. 아래 PNG는 같은 `s56-android-06` 실행에서 가져왔다.

| 결과/공유 | 계정/지원 |
| --- | --- |
| [완주 결과](assets/achievements-support-20261014/s5-result.png) | [서비스 메뉴](assets/achievements-support-20261014/s6-menu.png) |
| [글꼴 1.6배](assets/achievements-support-20261014/s5-result-large-font.png) | [서비스 소개](assets/achievements-support-20261014/s6-about.png) |
| [9:16 미리보기](assets/achievements-support-20261014/s5-story-preview.png) | [다크 테마 재시작](assets/achievements-support-20261014/s6-theme-restarted.png) |
| [4:5 닉네임·날짜 숨김](assets/achievements-support-20261014/s5-feed-preview.png) | |

APK: `build/install/running-art-0.1.0-20261014-achievements-service.apk`, 126,958,127바이트. SHA-256 `0b6691341f49e220c501ed6e81d23bb5c6266d31e917407a02a2dc7b8f0a7e7a`. 동일 앱 ID·release·시험 훅 미포함 검사를 통과했고 기존 S2a APK와 서명 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`가 같다. 설치 안내/해시는 같은 폴더에 있다. 휴대폰 설치·외부 APK 배포는 하지 않았다.

수정한 메뉴를 포함한 `s56-smoke-01`도 5단계·원본 보존·정리 통과(준비 대기/전송 경고 0)했다. [호환 흐름 보고서](assets/achievements-support-20261014/local-smoke-report.json). 새 경로에서 중심/거리/도형·탭 상태 유지와 OAuth 취소/가입 안내를 확인했다.

수정본 CI `38495705327`의 API 29는 소개 화면의 화면 밖 CTA를 찾는 검사에서 실패했다(artifact `11864472412`). 실제 UI XML은 버튼을 `[0,0][0,0]`으로 반환했으며 기존 검사 도구가 이를 위쪽으로 해석해 위로만 스크롤했다. 위치가 없는 요소는 방향 판단에서 제외하고, testID 없는 본문도 스크롤 이동 판정에 포함하도록 수정했다. 원본 실패 화면/로그와 정리 통과·준비 대기 2건/전송 경고 2건을 보존한다. API 36 전체 흐름은 같은 실행에서 계속 진행 중이다.

`s56-android-07`은 실제 저장 공지의 오프라인 목록→상세→목록 복귀를 추가해 S5/S6 전체·원본 보존·정리 통과(준비/전송 경고 0)했다. 공유 PNG 두 해시는 06과 같다. [보고서](assets/achievements-support-20261014/local-notice-report.json)·[저장 공지 목록](assets/achievements-support-20261014/s6-notices.png)·[상세](assets/achievements-support-20261014/s6-notice-detail.png)·[복귀](assets/achievements-support-20261014/s6-notice-back.png). 시험 공지는 격리 기기 캐시만 사용했으며 운영 서버에 게시하지 않았다. 파일·네트워크 원복을 확인했다.

## 전체 API 36·화면 기준 검토 — 11:02

수정본 CI `38495705327`, merge source `15eb73bfcee06a031ae70a68a3fb9e47f71da503`, API 36 APK `4c8e4236b928fddb892a3b04f8b9c19544185182183166400a4edafa21d8ae98`: **전체 14단계·원본 보존·정리 통과**. 캡처 준비 대기 2건/전송 경고 0건을 보존한다. [원본 보고서](assets/achievements-support-20261014/ci-full-02-report.json). API 29 실패와 정적 화면 실패가 있어 이 CI 전체를 성공으로 쓰지 않는다.

시각 비교는 홈·러닝·보관함 0픽셀, 마이페이지 237,545픽셀 차이였다. [이전 화면](assets/achievements-support-20261014/review-account-baseline.png)·[현재 화면](assets/achievements-support-20261014/review-account-current.png)·[차이](assets/achievements-support-20261014/review-account-diff.png)·[원본 비교](assets/achievements-support-20261014/review-report.json)를 직접 검토했다. 차이는 S6의 공통 Noto 글꼴·흰색/검정/회색/주황 팔레트·둥근 버튼·내용 간격과 일치한다. 비로그인 안내·CI 인증 설정 없음·실제 0 통계는 유지된다. 마이페이지 PNG 한 장만 갱신하고 출처와 이전 기준을 manifest에 기록했다. 나머지 PNG·기존 시스템 Wi-Fi 마스크·비교 허용치·환경은 바꾸지 않았다.

같은 캡처의 검토 후 재비교는 4화면 0픽셀이다. 이는 새 독립 CI 통과를 대신하지 않는다. API 29의 0좌표/본문 이동 수정은 실패 XML 재생에서 이전 코드 실패·수정 코드 통과를 확인했고, 실제 다음 CI에서는 확대된 S5/S6 포함 6단계를 검증한다. 공지 저장본 검사는 로컬 07에서 통과했으며 다음 전체 CI에도 포함한다.

## 최종 수정본 CI 초기화 실패 — 11:12

[38498980182](https://github.com/ssw3131/running-art-mobile/actions/runs/38498980182), head `ff0f143`: fast/API 통과. API 36 job `115641204367`은 release 빌드 성공 뒤 시나리오 시작 전 `adb root`에서 `unable to connect for root: closed`로 종료했다. `scripts/qa/android.py:114`의 초기 연결 실패이며 앱 설치·14단계·시각 비교는 실행되지 않았다. 환경 초기화 실패로 기록하며 기능 통과나 원본 보존/정리 통과로 세지 않는다. 러너의 에뮬레이터 종료는 확인했다.

최초 로그 `.cache/s56-ci-android36-third.log`, artifact `11864933804`(482바이트, 시나리오 보고서 없이 gallery만 생성)를 보존했다. API 29는 계속 실행 중이며 해당 작업을 취소하지 않는다. 같은 head의 실패 작업만 진단 재실행하고 최초 실패와 결과를 구분한다.

11:19 API 29도 종료했다. 기존 5단계는 모두 통과했고 추가 S5/S6에서 실제 스토리 PNG·공유창·저장 취소 뒤 `Pictures` 탐색이 실패했다. artifact `11866075172`의 정리 전 화면/XML은 Android 10 DocumentsUI의 `Downloads` 및 `ALLOW ACCESS TO "DOWNLOADS"` 버튼(`android:id/button1`)을 보여준다. Android 16의 내부 저장소/Pictures 시작을 가정한 검사 경로 오류다. API 29는 관측된 Downloads를 허용하고 실제 `/sdcard/Download`에 쓴 PNG 바이트를 미리보기와 비교하도록 수정했다. API 36의 Pictures 경로와 파일 일치/원본 보존/정리 assertions는 유지한다. 첫 실행의 원본 해시 복원·정리 통과, 준비 대기/전송 경고 0건을 보존한다. API 29 수정이 필요해 같은 head 단순 재실행 대신 수정 커밋의 전체 CI로 두 API를 다시 검증한다.
