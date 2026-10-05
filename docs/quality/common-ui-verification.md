# 공통 UI 검증 — 2026-10-05

## 판정

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
