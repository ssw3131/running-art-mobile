# 가입·재가입 공통 진입과 Figma 계약 — 2026-10-24

**2026-10-24 20:14 A7 설치 후속 완료:** 사용자 요청으로 가입·홈 변경의 타입/린트·로직472·Jest92·앱 release를 확인하고 SM-A750N에20:11:42 자료 유지 설치했다. 원래 빈 기록·비로그인·설정/권한·설치 식별자 보존, 진입/로그인전환/재시작·도우미 정리를 확인했다. **서버 약관 미게시·개인정보/위치 조회 API 미준비로 실제 가입 완료는 불가**하며 소셜/동의/사진·전체 격리 Android/DB·CI/병합/서버 게시·코스20km 통합은 후속이다. [설치 검증](../quality/signup-phone-20261024.md). 아래 소스 준비 당시 전부 미실행 문단보다 이번 확인 범위만 우선한다.

**소스 구현 완료 / 검증 대기.** 타입·린트·테스트·빌드·CI·실기기·병합·운영 반영을 실행하지 않았다. 기존 홈 작업의 검사 결과를 이 변경의 통과 근거로 사용하지 않는다.

기존 Android 모의 로그인은 실제 격리 Supabase 세션·정책·명시적 동의를 사용하는 QA 소스로 교체했다. 가입 대기 계정의 화면 동의 검사와 실제 완료 영수증을 가진 서비스 준비 계정을 구분한다. localhost TLS·ADB reverse·준비/정리 wrapper·CI 호출부까지 작성했으며 실행 결과는 없다. 제품 코드에 완료 우회를 추가하지 않았다. [Android 회원 QA 준비/실행/정리](android-membership-qa-20261024.md)·[체크리스트](../quality/signup-membership-figma-checklist.md)를 함께 읽는다.

## 작업 기준과 통합

- 별도 `running-art-signup/`, `feat/signup-membership`, 시작 commit `c3285e1f50e3bbbc310f28576ccbddffed3bcdd7` (홈 인증 작업의 clean HEAD).
- 상위가 Git 저장소가 아니어서 앱 create_worktree 도구는 `Not a git repository`를 반환했다. 모바일 Git에서 `git worktree add -b feat/signup-membership ../running-art-signup c3285e1...`로 분리했다.
- 기본 모바일 `9ac006c`의 사용자 미커밋 정책/설치 문서, 홈 작업 폴더, 코스20km, 도메인, .guidance-resume은 수정하지 않았다. 초안 사본만 이 브랜치에 포함했다.
- 이 브랜치는 이미 홈의 ServiceStack/콜백/홈 두 상태 및 기준 commit의 도메인 변경을 포함한다. 홈 후속 commit이 생기면 그 차이를 통합하되 **회원 완료 기준**을 단순 `auth.account` 기준으로 되돌리지 않는다. 과거 MembershipPrompt는 삭제했으므로 복원하지 않는다.
- 이 계획 시작 당시 코스20km는 별도 `feat/course-distance-20km`였다. 통합본에 보존한 [체크리스트](../quality/course-generation-figma-checklist.md)와 실행 기록으로 당시 검증 범위를 구분한다. 최종 통합에서 route inventory와 공통 `_layout`/ServiceStack·콜백·문서 충돌을 대조한다.

## 공통 진입

`membershipAccess(owner, state)`만 서비스 진입을 판정한다. 로그인 세션만으로 통과하지 않는다.

| 상태 | 화면 |
| --- | --- |
| Auth 복원 중 | 로딩 |
| 비로그인 | 가입/로그인 진입 |
| 현재 계정 회원 조회 중/실패 | 가입 화면의 로딩/오류·명시적 재시도 |
| 신규·기존 미완료·새 Auth ID로 재가입 | 프로필·필수 동의 입력 |
| 회원 조회는 됐으나 정책 없음/오류 | 프로필 유지, 약관 재시도, 완료 금지 |
| 현재 계정·현재 정책의 서버 완료 영수증, 진행 작업 없음 | 홈 및 서비스 |

Expo Router Protected 그룹은 미완료 계정의 서비스 딥링크/뒤로 우회를 막는다. 가입 화면에는 공통 헤더가 없다. 약관 경로와 인증 callback은 공통이며 미완료 계정도 열람할 수 있다. 계정/접근 상태 전환 시 route history를 초기화해 이전 계정 화면으로 돌아가지 않는다. 콜백은 공유 인증 exchange와 회원 확인을 기다린다.

한 프로세스 동안 회원 상태는 계정별로 유지한다. 콜드 시작/계정 전환/명시적 재시도/동의 제출 후에는 서버 상태·정책을 확인한다. 단순 foreground에서는 이미 확인한 완료 상태와 입력 중 상태를 다시 초기화하지 않는다. 새 정책을 강제로 즉시 푸시하는 기능은 추가하지 않았다.

## 조회와 저장 경쟁

회원 조회와 약관 조회는 독립적으로 진행한다. membership 오류는 `status=error`, 정책 오류는 `policyStatus=error`, 미게시는 `policyStatus=unavailable`이다. 정책이 느려도 회원 미완료가 확인되면 프로필을 보여준다. 정책 재시도는 프로필 편집 state를 재생성하지 않는다.

완료 버튼은 두 필수 동의가 현재 문서 버전에 속하고 정책이 ready일 때만 활성화한다. `accept(input, saveProfile)`의 busy가 **프로필 저장 시작 전**부터 서버 동의/최신 정책 확인·정리까지 유지된다. Auth 프로필 갱신 이벤트로 가입 화면을 중간에 떠나지 않는다. 저장 실패 시 동의 RPC를 호출하지 않는다. 중복 제출·reload는 busy에서 거절한다. 늦은 계정 응답은 owner/epoch로 무시한다.

기존 계정별 SecureStore pending requestId를 재사용한다. 프로필 저장 후 동의 응답이 유실되면 성공을 만들지 않고 같은 버전/요청 ID로 명시적 재시도한다. 서버 완료가 확인됐지만 최신 정책 조회가 실패하면 정책 오류를 표시하고 서비스 진입을 보류한다. 최신 버전이 달라지면 동의를 다시 받아야 한다. 정책 버전 변화는 체크 두 개를 무효화한다.

사진 취소는 기존 선택을 유지하고, 교체/화면 종료/늦은 반환은 기존 discard 흐름으로 정리한다. 프로세스 종료 시 서버에 저장된 프로필과 회원 상태를 복원하며, 저장 전 입력/사진·미제출 체크는 자동 저장 또는 자동 동의하지 않는다. 약관 열람 및 정책 재시도 중에는 입력을 메모리에서 유지한다.

탈퇴는 기존 서버 삭제 확인→retainAsGuest→세션 정리와 auth.users cascade/신규 pending 트리거를 재사용한다. 가입 코드에서 `personalSync.enable(true)` 또는 guest 귀속을 호출하지 않는다. 새 계정에는 이전 완료 상태/요청 ID를 사용하지 않는다. 실제 탈퇴·재가입은 이번에 조작하지 않았다.

## 디자인 출처와 자산

Figma 개인 계정의 `QYRGII8OdvQB1SrtH3BA08`을 이 작업 세션 `ab0bd38b-092b-450c-82f1-2f6a0d520f02`으로 읽었다. `253:7200`, `253:7124`, `229:2153`, `256:7388`의 코드 컨텍스트와 스크린샷을 모두 확인했다. Figma 원본은 수정하지 않았다.

| 원본 슬롯 | 구현 |
| --- | --- |
| 로고 172×106, 러너 112×50/56·워드마크 crop | 기존 SignupBrand와 원본 PNG |
| 프로필 120 / 첫 선택칸 60 | 현재 사진은 동적 URI, 사진 없으면 원본 `avatar-default.png`를 원형으로 clip |
| 첫 선택칸 provider/default | provider 사진이 있으면 그 사진, 없으면 기본 사람. 별도 provider 링크 없음 |
| 러너 8종·사진 선택 60 | 기존 atlas의 원본 mask 좌표·gallery.svg, 선택 테두리와 접근성 selected |
| 닉네임 제목20 + 선택14 / 입력56 | 공통 TextField를 확장, 오른쪽 지우기와 접근성 label |
| 필수 체크+라벨+오른쪽 열람 | 공통 Checkbox와 Icon, 전체동의20 굵게. 터치영역 최소48·줄바꿈 |
| 진입 로그인 전환 | 문장 속 밑줄 링크 |

기본 폭 412에서 프로필 선택은 5개×2줄이며 좁은 화면에서 wrap한다. 120/60 슬롯과 56 최소 입력 높이를 유지하고 큰 글씨는 높이/스크롤로 수용한다. Figma Code Connect의 SDS X/ChevronRight는 프로젝트에 설치되어 있지 않아 기존 React Native TextField 지우기 및 Icon으로 대응했다. 마케팅·게스트·5회 홍보는 확정 제외 정책에 따라 추가하지 않았다. 위치약관/시험 정책 안내·로그아웃·오류/재시도는 실제 가입 동작에 필요한 추가 UI다.

`assets/signup/manifest.json`은 기존 자산 출처와 새 기본 이미지의 해시·바이트·노드를 기록한다. 기존 PNG/SVG와 호출부의 슬롯 수치, 새 파일의 존재/바이트를 구현 자료로 대조했다. **실제 렌더링·픽셀 일치·접근성 발화는 미검증**이며 [체크리스트](../quality/signup-membership-figma-checklist.md)를 따른다.

## 시험 약관

[등록 준비](test-policy-publication-20261024.md)와 `scripts/policies/prepare-test-policies.mjs`를 사용한다. 원문은 화면과 분리하고 새 불변 버전으로 게시한다. 기존 회원/정책 API만 사용한다. 정식 시행일은 미정이며 시험용 ID는 시험 게시 시각으로 표시한다. 실제 게시·동의 이력은 생성하지 않았다.
