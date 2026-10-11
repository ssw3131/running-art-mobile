# 공통 UI 검증 — 2026-10-11

## 최신 판정 — 공통 기반·갤러리 완료

개인 Figma 연결의 원본 접근이 복구되어 이전 blocked 원인을 해소했다. 공통 스타일·상태 컴포넌트·원본 아이콘·글꼴 API와 미리보기를 완료했다. 서비스 화면별 이관·휴대폰 재설치·iOS 검증은 별도 후속이다. 아래 10-05의 부분 완료/원본 대기는 당시 이력이다.

### 원본 대조와 구현

- UI 페이지 `0:1`의 보이는 Text 전체를 구간별 조회했다. Noto 996구간, Roboto 68구간, Inter 59구간이다. [노드·문구·굵기 근거](../design/common-ui-font-audit-20261011.json). 기본 Noto 정책 유지, 명시된 Roboto 수치의 Black 지원을 추가했다. 한글에 남은 Roboto/Inter는 공통 Noto로 표시한다.
- 체크박스 ON/OFF `54:8929`/`54:8930`, 스위치 ON/OFF `30:4568`/`30:4569` 연결. OFF 체크박스는 실제 도형 primitive, 다른 상태는 원본 SVG다. 기본값을 제공하면서 선택적인 visuals 확장을 유지했다.
- TopBar 원본 `253:6237`보다 실제 UI `253:6238`의 Noto Bold 24 제목을 우선했다. 최소 높이 80·상단 3 제목 여백·그림자, 원본 back 30/menu 24와 48dp 터치를 확인했다. 로그아웃 팝업 원본 `49:8453`은 16×16이다.
- 공유 아이콘 `248:4593`의 18×18 바깥 슬롯·원본 21.5×20.666·left -2.5/top -1.6667 overflow 기하를 반영했다. 14개 SVG의 root 크기를 유지하며 Android에서 표시했다.
- UI 하단 라벨 95개 모두 #757575였다. 기존 선택 주황색은 앱 상호작용 보완임을 명시했다. 연결된 Simple Design System 코드 컴포넌트는 이 RN 저장소/설치 의존성에 없어 해당 Figma 노드를 원본 SVG로 export했다.

### 실행 검증

- `dev.ps1 check`: 타입·전체 lint 통과. Android export 1,655 modules/55 assets, `index-bdc23daa00523aa22561b761b6d2db41.hbc`. 로컬 Noto/Roboto 400/500/600/700/900 각각 5개 포함.
- `RunningArt_UI_QA` API 36, emulator-5558의 기존 debug APK와 localhost 127.0.0.1:8087의 최신 `--no-dev --minify` JS로 실행했다. 이번에는 네이티브 의존성 변경이나 새 APK 빌드를 하지 않았다. 기존 설치가 release여서 debug APK로 갱신한 뒤 최신 화면 문구를 확인했다.
- `common-ui.py choices`: 실제 체크·스위치 OFF→ON/ON→OFF와 복귀, 비활성 상태, 접근성 checkable/checked/enabled, 48dp 터치 영역 assertion 통과. `choice-initial`, `choice-changed`, `choice-restored` 및 `*-disabled` PNG/XML.
- `final-top`, `choice-before`, `final-bottom`, `final-modal`: 원본 상단 아이콘·Black 글꼴·ON/OFF·팝업/공유 아이콘 표시 대조. `confirm-burst 1`: 실제 확인 4회 터치가 콜백 1회인 것을 다시 확인했다.
- `scaled-top`, `scaled-choices`, `scaled-toggles`, `scaled-modal`: 480dpi=360dp, font_scale 1.6. 제목·라벨·모달 줄바꿈과 버튼/원본 이미지 표시 확인. 하단 라벨은 여러 줄로 확장되고 아이콘 상단 정렬을 유지했다.
- 실제 Gboard 두벌식 키 ㅎ/ㅏ/ㄴ/ㄱ/ㅡ/ㄹ과 공백으로 `한글 ` 조합을 확인했다(`korean-retried.xml`). 언어 추가 직후에는 자모가 분리됐고 Android 자체 Gboard 설정 입력창에서도 같은 현상(`native-composed`)을 확인했다. Gboard 재시작 후 정상 조합됐다. TextField 제품 코드는 수정하지 않았다.
- 한국어/영문 키보드 전환 후 한글·영문·숫자 혼용 값, Android 전체 선택/복사/붙여넣기 결과의 정확한 2회 연결, 처음부터 한 문자 뒤로 커서 이동 후 `X` 삽입을 문자열 assertion으로 확인했다(`korean-mixed`, `clipboard-result`, `cursor-result`). 한국어 키보드에서 adb의 영문 keycode가 한글로 처리되는 시험 도구 조건은 앱의 문자 누락으로 판정하지 않았다.

### 범위와 한계

10-05에 확인한 TalkBack 모달 포커스 복귀 로직은 변경하지 않았다. 첫 서비스 활성화 직후 포커스 불안정·iOS/제조사별 IME·실물 휴대폰의 이번 UI는 추가 검증 대상이다. 오래된 debug APK의 루트 러닝 복원 배너가 다시 나타났으며 공통 UI 밖의 기존 문제다. 이번 작업은 물리 휴대폰·서버·사용자 자료를 조작하지 않았다. 별도 대화의 휴대폰 검증 변경은 이 결과에 포함하지 않는다.

검증 후 font_scale 1.0/밀도 420/하드웨어 키보드 시 IME 표시 0/접근성 서비스 null을 확인했다. 추가한 한국어는 재검증용 AVD에 보존하고 마지막 입력 언어는 English로 돌렸다. 앱·adb reverse·UI 전용 AVD·localhost Metro를 종료했고 8087 listener가 없음을 확인했다. 기기의 임시 PNG/XML은 제거하고 PC의 `.cache/common-ui-qa` 증거를 보존했다.

## 2026-10-05 이력

## 판정

**19:21:46 휴대폰 설치 후속:** 사용자 요청으로 소스 `f237564`의 독립 실행 release APK를 SM-S942N에 자료 유지 업데이트했다. 아래 초기 미설치 표현보다 이 후속을 우선한다. 공통 UI 표시를 확인했으며 전체 디자인 목표는 계속 Figma 원본 대기다.

**부분 완료·목표 blocked(18:07).** 공통 토큰·폰트·주요 UI와 독립 미리보기를 구현하고 Android에서 실행했다. 최신 Figma의 Roboto 지정 위치와 일부 원본 에셋을 확보하지 못했으므로 전체 디자인 일치/목표 완료로 판정하지 않는다. 같은 MCP 한도가 연속 작업에서 반복돼 원본 접근 대기로 전환했다.

## 구현과 증거

| 요구 | 현재 증거·판정 |
| --- | --- |
| 색상·간격·모서리·글꼴 공통화 | `src/theme/tokens.ts`, ThemeProvider/FontGate 구현. 기본 Noto, 명시적 Roboto와 4개 굵기 각각 번들/표시 확인 |
| 버튼·입력·선택·탭·모달 | `src/components/ui`; 활성 버튼 콜백, disabled/loading 실행 차단, 단일 선택 5 km 반영, 탭 선택 상태, 입력·오류·읽기 전용, 모달 열기/배경 유지/뒤로 닫기/재열기/처리 후 복귀 확인 |
| 체크박스·스위치 | controlled 상태/접근성/터치 영역과 양 상태 에셋 슬롯 구현. 원본 ON·체크 에셋/갤러리/네이티브 동작 대조 **미완료** |
| 상단/하단 내비 | props/events 전용 구현. 하단 SVG 표시와 큰 글꼴 줄바꿈·아이콘 정렬 확인. 상단 원본 아이콘/전체 치수와 하단 선택 스타일 대조 **미완료** |
| 기능별 폴더 경계 | app → feature → components → theme, 공통 코드에 계정·Router·GPS·저장소 import 없음. 개발 환경 링크만 추가, 기존 서비스 화면 이관 없음 |
| 최신 Figma 폰트 의도 | 기본 Noto·명시 Roboto API 준비. 최신 Roboto 적용 위치 전수 조회가 MCP Starter 한도로 실패. **미확정** |
| 원본 정적 에셋 | SVG 9개를 로컬 다운로드, root 치수/빈 파일 여부 확인. `assets/ui/README.md`에 원본 노드 대응. 표시한 아이콘은 Android 스크린샷 확인. 미확보 에셋은 대체하지 않음 |
| 폰트 라이선스 | 두 패키지 0.4.3 lockfile 고정, `assets/fonts/*LICENSE.txt` 보존 |

## PC 검사

- `dev.ps1 check` / 최종 `npm run check`: 간격·내비 정렬 수정분까지 타입·전체 lint 통과.
- `npm run export:android -- --output-dir .cache/common-ui-export-final`: 포커스 복귀 보정 후 최종 Android Hermes 번들 성공(`index-e4da62eeb4e6b6244b4f71c2547f9cf2.hbc`, 1,636 modules, 48 assets). Noto Sans KR 400/500/600/700와 Roboto 400/500/600/700만 포함됨. 첫 barrel import에서 27개 폰트가 포함되는 문제를 하위 경로 직접 import로 수정했다.
- `android/gradlew.bat -p android assembleDebug --max-workers=2 -PreactNativeArchitectures=x86_64`: 8분 33초, 692 tasks 성공. 새 expo-image 네이티브 모듈 등록을 ExpoModulesPackageList로 확인했다.
- `expo-doctor`: 20/21 통과. 기존 expo 57.0.25/상수 57.0.19/router 57.0.23에 새 패치 권장(57.0.26/57.0.20/57.0.24). 추가한 expo-image 57.0.5와 폰트 패키지 관련 실패 없음. 이번 UI 범위에서 기존 SDK를 일괄 업그레이드하지 않았다.
- `git diff --check`: 통과.

## Android 실제 실행

사용자 자료가 없는 새 AVD `RunningArt_UI_QA` API 36 x86_64, `emulator-5558`만 조작했다. 물리 휴대폰과 다른 검증의 emulator-5556은 조작하지 않았다. Metro는 127.0.0.1:8087 루프백 전용, adb reverse로 연결했다.

증거는 `.cache/common-ui-qa/`의 PNG/XML과 `scripts/qa/common-ui.py`에 있다.

- `preview-visible`, `buttons`: 기본 1080×2400/420dpi(약 411dp), Noto/Roboto·혼용·굵기, 원본 내비·공유·화살표 표시 확인.
- `buttons-pressed`: 코스 설정 콜백 실행 후 disabled와 busy 영역을 눌러도 피드백 값 유지.
- `select-open`, `input-selected`: 옵션 모달·비활성 옵션 표시, 5 km 적용, 추천 탭의 선택/내용 반영.
- `typed`: 0.2초 간격 입력의 `RunPen 2026`과 실제 TextInput 값 일치 assertion 통과. 최초 adb의 한 번에 빠른 문자열 주입에서는 `RRu`로 누락됐다. 빠른 실제 타이핑·한글 IME 조합/커서 이동/붙여넣기는 아직 검증하지 않았고 입력 전반 완료로 확대하지 않는다.
- `confirm-open`, `backdrop-stays`: 제목/설명/버튼 표시, 배경 터치로 닫히지 않음.
- `scaled-ui-final`, `scaled-modal-final`: 480dpi(360dp)·font_scale 1.6, 제목/본문/하단 라벨 줄바꿈, 모달 내용/버튼 표시 확인.
- `confirm-busy`, `confirmed`: 로딩 표시·취소 비활성, 처리 중 Back 후 미리보기 복귀 확인. 중복 제출 방지는 ref/disabled 구현이지만 실제 빠른 연타 횟수 계측은 아직 수행하지 않았다.
- `scaled-completed-final`: 큰 글꼴에서 내비 아이콘이 같은 높이에 오도록 보정 후 확인.

초기 에뮬레이터 부팅 중 System UI 지연 대화상자는 Wait 후 해소됐다. 화면 밀도 변경의 개발 클라이언트 Activity 재생성에서 Router 중복 linking 경고가 나와 새 프로세스로 재실행한 뒤 검증했다. 이 경고를 릴리스 앱 회귀로 판정하거나 수정한 것은 아니다.

## 남은 작업

1. Figma 조회 한도 해소 또는 사용자가 제공하는 원본 근거로 최신 Roboto 위치·원본 변형을 전수 대조.
2. 체크박스 양 상태·스위치 ON·상단/팝업 아이콘 원본 확보와 기본 연결·미리보기/Android 대조.
3. 상단 바 치수·하단 선택 상태와 공유 아이콘 외부 슬롯 기하 최종 대조.
4. 한글 IME 조합·커서/붙여넣기, 원본 연결 후 체크·토글 검증. 빠른 ASCII 입력·스크린리더 모달 포커스 복귀·연타 계측은 아래 후속에서 통과했다. iOS·실물 휴대폰·릴리스 오프라인 시작은 이번에 검증하지 않았다.

LAN 서버 실행은 자동 승인 검토가 외부 노출 위험으로 거절했다. 대안으로 `NODE_OPTIONS=--dns-result-order=ipv4first`와 `--localhost`를 함께 사용하고 실제 리슨 주소 `127.0.0.1`을 확인했다. LAN 실행 승인을 요청하거나 우회하지 않았다.

## 정리

UI 전용 emulator-5558의 font_scale=1.0·밀도 기본값을 복구하고 앱/adb reverse/에뮬레이터·검증 Metro를 종료했다. APK는 로컬 개발 산출물이며 배포하지 않았다. 해시: `bda3dbcb1fe862646be8b6e159a949305c0fd5ea27d5420c42f2799e5f20b5f1`. 개발 APK는 Metro에서 JS를 읽으므로 최종 JS 근거는 위 export 해시와 화면 증거를 함께 본다.

## 후속 검증 — 2026-10-05 18:05

같은 빈 AVD와 APK를 다시 실행하고 localhost Metro의 `--no-dev --minify` JS로 검증했다. 위 최초 실행 시점의 미검증 중 다음 항목을 갱신한다.

- `confirm-burst-result.xml`: 확인 버튼 연속 4회 터치 후 `preview-confirm-count`가 `확인 실행 1회`임을 assertion으로 확인했다. 콜백 진입 시점에 세므로 화면 닫힘만으로 중복 방지를 추정한 것이 아니다.
- `fast-typed.xml/png`: 한 번의 `adb input text`로 `RunPen 2026` 주입 후 TextInput 값과 정확히 일치했다. 처음 비최적화 개발 JS에서 발생한 누락을 이 실행 조건에서는 재현하지 못했다. 실제 한글 IME 조합까지 검증한 것은 아니다.
- `CommonUiAccessibility.java`: TalkBack을 유지하는 UiAutomation으로 실제 접근성 포커스를 읽었다. 확인 모달 제목 `미리보기를 확인할까요?` → 취소 후 `preview-open-dialog`/`모달 열기`, 선택 모달 제목 `목표 거리` → 닫기 후 `preview-select`/`목표 거리, 선택해주세요.`를 확인했다. 각 최종 계측은 `INSTRUMENTATION_CODE: 0`이다.
- 모달은 호스트 ref를 받는 `AccessibilityInfo.sendAccessibilityEvent`로 포커스를 요청한다. Android에서 350ms 복귀는 실패해 700ms로 보정한 뒤 위 두 모달의 복귀를 확인했다. iOS onDismiss 경로는 코드만 준비했고 실행하지 않았다. TalkBack을 처음 켠 직후 첫 열림의 제목 포커스는 안정적으로 확인되지 않았으며, 서비스 안정화 후 재실행에서 제목/복귀를 확인했다.
- 계측 도우미의 시스템 알림 거절은 Google/AOSP permissioncontroller 창에 한정한다. 테스트 AVD의 TalkBack 첫 알림 안내를 처리하는 용도다.
- 새 빈 AVD에서 기존 앱 루트의 `러닝 복원` 오류 배너가 표시됐다. 공통 미리보기 외 기존 러닝 복원 기능은 이번 변경/완료 판정 범위에 포함하지 않는다.
- 포커스 변경 후 `npm run check`와 위 최종 export가 통과했다. 앱 기능/서버/물리 휴대폰 배포 변경은 없다.
- 후속 검증 종료 시 TalkBack 설정 null/0, 폰트 배율/밀도 복구와 임시 계측 앱 제거를 확인했다. 앱·adb reverse·emulator-5558·Metro를 종료하고 8087 listener가 없음을 확인했다.

## 휴대폰 설치 — 2026-10-05 19:22

- 사용자 명시 요청에 따라 release 빌드: `:app:assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a,x86_64`, 4분 13초/846 tasks 성공.
- 파일: `build/install/running-art-0.1.0-20261005-common-ui.apk`, 114,275,771 bytes. SHA-256 `3155bab0d86ddd445f3aac907669f520b21bc1d6796fedfd83ff45c491b01ad2`.
- 설치 전 APK를 읽어 서명 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`가 새 파일과 같음을 확인했다. 같은 앱 ID `com.runningart.mobile.dev`에 `adb install -r --no-streaming` 성공.
- 설치 시각 19:21:46. 최초 설치 `2026-09-27 16:29:39`와 dataDir `/data/user/0/com.runningart.mobile.dev` 유지, 설치된 APK 해시와 전달 파일 일치. 앱 제거·자료 초기화·로그아웃은 하지 않았다. 이번에는 DB 내용 해시/계정 상태를 별도로 재검증하지 않았다.
- Metro reverse 연결 없이 `runningart:///ui-preview`로 cold start, 공통 UI·Noto/Roboto·혼용·하단 아이콘 표시를 PNG/XML로 확인했다. 에뮬레이터에서 보였던 루트의 러닝 복원 오류 배너는 이번 휴대폰 화면에 없었다. 기기에서 직접 조작하는 전체 UI 회귀까지 수행한 것은 아니다.
- 증거는 `.cache/common-ui-phone/`에 보관한다. 임시 `/sdcard/common-ui-install.xml`은 제거했고 앱은 사용자가 볼 수 있도록 미리보기 화면에 열어 두었다. 서버 배포 변경 없음.
