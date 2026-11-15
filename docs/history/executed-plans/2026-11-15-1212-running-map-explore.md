# 러닝 중 지도 둘러보기와 자동 추적 복귀

- 기록 생성: 2026-11-15T12:12:09+09:00 (Asia/Seoul)
- 실행 시작: 2026-11-15T12:12:09+09:00
- 상태: 진행 중
- 기록 유형: 실행 시작 시 계획 작성
- 요청·계획 출처: 최신 코드 검토 후 사용자의 “그렇게 수정하자”. 기본 자동 추적을 유지하면서 러닝 중 이동·확대, 현재 위치 버튼 복귀, 회전·기울이기 제한과 터치 잠금 유지를 승인했다.

## 실행 전 계획

최신 main `6a72e79`에서 `feat/running-map-explore` 브랜치로 작업한다. 러닝 지도는 현재 위치 중앙·진행 방향 위쪽 자동 추적을 기본으로 유지한다. 드래그 또는 확대·축소 시 카메라 추적만 중지하고 GPS 기록·안내·실제 궤적 갱신은 계속한다. 현재 위치 버튼으로 최신 위치·방향과 기본 안내 배율로 복귀한다. 회전·기울이기 제스처는 제한하며 기존 러닝 화면 터치 잠금과 해제는 유지한다. 일시정지·시뮬레이션에도 같은 지도 조작을 적용한다.

지도 제어와 실제 러닝 연결의 회귀 검사를 추가하고 타입·린트·관련 로직·UI를 확인한다. 최신 제품 계약, 변경 검토 기록과 인수인계를 갱신하고 draft PR 빠른 피드백 후 ready 필수 검사를 수행한다. 필수 검사 통과 후 main 반영과 검증 결과를 확인한다. 휴대폰 설치·야외 GPS·운영 배포는 이번 요청 범위에 포함하지 않는다.

## 실행 결과

GuidanceMap의 navigationMode와 gesturesEnabled를 분리하고 LiveGuidancePanel에서 터치 잠금에만 조작 제한을 연결했다. 제스처 이후 위치·궤적 갱신은 유지하되 카메라 갱신은 멈추고 현재 위치 버튼으로 추적을 복원한다. 준비 지도는 기존 회전·애니메이션을 유지한다.

## 검증

- 새 회귀의 변경 전 실행: 18개 중 5개 예상 실패·13개 통과. 변경 후 관련18개 전부 통과.
- Node24.21.0/npm11.19.0 공식 고정 도구 setup 완료. 최초 HOME/.expo 생성은 읽기 전용 오류였으며 해당 경로 생성 권한을 부여한 뒤 정상 설치했다.
- 사용자의 모델 변경 후 중단된 전체 검증을 재개했다. `bash scripts/cloud.sh fast`: 7단계 전부 통과. 로직581개 통과·기존skip1, UI44묶음241개 통과, 앱/서버 타입·린트·OpenAPI·계정/공유 정책 통과. 원본 근거는 Git 제외 `test-results/fast/`에 보존.
- `npm run qa:plan -- origin/main`, `npm run qa:review -- origin/main --working`, `git diff --check` 통과.
- 원격 Android 전체 검사와 main 반영은 후속이며 실기기 제스처·야외 GPS를 검증한 것은 아니다.

## 남은 작업과 종료

지도 변경 구현·로컬 및 draft 검사 완료. Android36의 시스템 상태바 촬영 준비 실패로 필수 게이트와 main 병합 미완료. PR62는 draft로 보존하며 작업 브랜치를 유지한다. 휴대폰 설치 없음.


## 2026-11-15T13:45:35+09:00 PR62 검증 결과·중단 지점

[PR62](https://github.com/ssw3131/running-art-mobile/pull/62)의 제품 head는4d74ccc다. Draft43671777540 빠른 검사 통과 후 ready43672071317을 실행했다. fast/API/Android29는 통과했다. Android36 첫 회차는 기능15단계·자료 보존·정리 통과 후 prepare-visual-home 시스템 신호 아이콘이12초 내 준비되지 않아 실패했다. 실패 작업만 동일 소스로1회 재실행했으며 두 번째도 기능15단계·자료 보존·정리는 통과했으나 prepare-visual-account에서 신호 미준비와 남은0.06045초의 캡처 호출 시간 초과로 실패했다. 전체 게이트는 두 회차 모두 실패다.

[원본 근거와 보고서](../../quality/evidence/pr62-run43672071317/README.md)를 보존했다. SystemUI 준비 실패는 확인됐지만 근본 원인은 미확정이다. 코드·기준·마스크·허용오차·제한 시간을 변경하지 않았고 세 번째 전체 재실행은 하지 않았다. PR을 draft로 되돌리고 결과 문서를 보완한다. 다음 작업은 독립 visual 진단으로 준비 문제를 해결한 후 ready 전체 게이트와 main 반영 확인이다. 임시 worktree 없음, 미병합 브랜치는 보존한다.

마지막 갱신: 2026-11-15T13:45:35+09:00. 전체 완료가 아닌 부분 완료다.


## 2026-11-15T13:52:41+09:00 사용자 승인 후속 재개 계획

사용자가 “해라”로 화면 검사 단독 진단·원인 수정·최종 전체 검증·PR62 main 병합을 승인했다. 현재 소스로 visual 단독 진단을 실행하며 Android16 SystemUI demo 신호 입력과 준비 관측을 대조한다. 원본 실패 근거·화면 기준·마스크·허용오차를 유지하고 원인이 뒷받침되는 수정과 회귀 검사를 적용한다. 단독 검사가 통과한 후 최종 전체 검사를 실행하고 main 반영을 확인한다. 휴대폰 설치는 포함하지 않는다.


### Android16 소스 대조와 수정 후보

수정 전 visual 단독43678651486을 기존 c92ad2b로 시작했다. Android16 AOSP의 DemoMobileConnectionsRepository는 slot이 없으면 subId1을 사용한다. MobileIconsInteractor는 subId별 WeakReference 캐시를 재사용하고, 생성 시 MobileRepositorySwitcher.getRepoForSubId로 선택한 실제/데모 repository를 MobileIconInteractorImpl에 고정한다. 따라서 실제 SIM과 데모의 ID가 같으면 기존 실제 신호를 읽는 객체가 재사용될 수 있다. 실제 표시 객체가 얼마나 오래 유지되는지에 따라 간헐적 통과와 실패가 생길 수 있다는 가설이며 원본 덤프가 없어 이전 두 실행의 내부 객체까지 입증한 것은 아니다.

Android36에 한해 데모 slot(새 pipeline에서는 subscription ID)999를 명시하고 API29 명령은 유지한다. 초기 명령과 모든 준비 관측 명령에 동일 ID를 사용하며 실제 모뎀 profile4도 유지한다. 전후 SystemUI/telephony 덤프를12초 준비 구간 밖에서 수집한다. 화면 기준·마스크·8픽셀 판정·준비12초·정착12초를 변경하지 않는다. Python 준비 회귀4개·Node 실제 실패PNG 포함4개·py_compile·diff 검사 통과. 수정 후보의 단독 native 검증은 후속이다.

AOSP 근거(android16-release):
- [MobileIconsInteractor](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android16-release/packages/SystemUI/src/com/android/systemui/statusbar/pipeline/mobile/domain/interactor/MobileIconsInteractor.kt): getMobileConnectionInteractorForSubId/reuseCache, 생성 시 repository 주입.
- [MobileRepositorySwitcher](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android16-release/packages/SystemUI/src/com/android/systemui/statusbar/pipeline/mobile/data/repository/MobileRepositorySwitcher.kt): getRepoForSubId는 현재 isDemoMode에 따라 실제/데모 선택.
- [DemoMobileConnectionsRepository](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android16-release/packages/SystemUI/src/com/android/systemui/statusbar/pipeline/mobile/data/repository/demo/DemoMobileConnectionsRepository.kt): DEFAULT_SUB_ID=1, event.subId로 데모 repository 생성.


### 2026-11-15T14:04:05+09:00 독립 전후 진단

수정 후보 bedd6bd의 draft43679127789 빠른 검사가 통과했다. 수정 전43678651486(c92ad2b)은 APK 빌드를 마치고 emulator 촬영 진단 중이다. 기존 실행을 취소하지 않고 비교하기 위해 같은 후보 head를 임시 qa/pr62-signal-diagnostic 브랜치에 두고 수정 후43679426258 visual 단독을 시작했다. 이 임시 원격 브랜치는 진단 종료 후 제거한다. 코드의 결과는 두 실행의 실제 증거로 기록하며 부분 진단을 전체 게이트 통과로 간주하지 않는다.

수정 전 visual43678651486은 네 화면 차이0·자료 보존·정리를 통과했다. 신호 관측16개가 첫 표본에서 모두 준비 완료(0.365~0.520초)였다. 이는 간헐적 현상의 한 통과 표본이며 앞선 실패 또는 수정 가설을 증명/해소하는 결과로 쓰지 않는다. 원본 출처·보고서는 [독립 진단 근거](../../quality/evidence/pr62-systemui-diagnostic/README.md)에 보존한다. 수정 후보 draft43679127789 artifact도 대조했으며 로직582개 통과·기존skip1, UI44묶음241개, Python harness38개 통과를 확인했다.


### 2026-11-15T14:24:41+09:00 첫 후보 진단 실패와 수집 범위 보완

43679426258은 데모 명령을 보내기 전 기본 SystemUI dump 도중 ADB write failure/offline으로 실패했다. guest gate·자료 보존·visual usage setup은 통과했으나 신호999/화면 비교는 미실행이고 forwarding cleanup도 실패했다. 연결이 끊긴 근본 원인은 미확정이며 dump의 EPIPE와 연결 재생성 logcat·report를 독립 진단 근거에 보존했다.

기본 service dump는 SystemUIService.java가 CRITICAL로 치환하므로 필요한 모바일 NORMAL 상태·table을 포함하지 않는다. 후속은 DemoModeController/MobileConnectionsRepository/DemoMobileConnectionLog[999]만 명시해 읽고 통신과 무관한 전체 시스템 상태 덤프는 제거한다. 신호 입력·판정·화면 기준·기한은 유지한다. Python harness38개·py_compile 통과. 수정된 후보를 visual 단독으로 다시 확인한 뒤 전체 게이트로 진행한다.


### 2026-11-15T14:41:15+09:00 수정 후보 단독 통과·최종 전체 검증 진행

2581131의 draft43680997117과 visual43680993249가 통과했다. 네 화면 차이0·원본 보존·정리·신호16개 첫 표본 준비(0.286~0.617초)와 transport 경고0을 확인했다. 실제 OS 덤프는 SIM1의 실제 repository가 유지되는 동안 별도 DemoMobileConnectionLog[999]의 primaryLevel/cdmaLevel/icon.level=4 및 느낌표 없음이 적용됨을 보여 준다. 전후 대상 dump는7/8ms에 완료됐다. 원본 텍스트/해시와 보고서·표본을 독립 진단 근거에 보존했다.

이 증거를 기록한 뒤 PR62를 ready로 전환해 fast/API/Android29·36 전체 검사를 수행한다. 단독 결과를 전체 통과로 쓰지 않으며, 이전 실패와 연결 끊김 원인의 미확정 범위를 유지한다. 전체 게이트 통과 후 main 반영·필수 검사 확인·임시 브랜치 정리를 진행한다.
