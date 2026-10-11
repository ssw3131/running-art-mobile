# RunPen 공통 UI

2026-10-11 Figma 재조회로 공통 기본 상태와 아이콘을 완성했다. 기존 기능 화면을 일괄 교체하지 않고 `/ui-preview`에서 먼저 검증한다. 개발 환경 메뉴에 진입 링크가 있다.

## 미리보기 확인

이번 소스를 실행한 Android 앱에서 **첫 화면 하단 → 개발 환경 확인 → RunPen 공통 UI 미리보기 열기**로 이동한다. 검증에 사용한 AVD 이름은 `RunningArt_UI_QA`다. 개발 APK는 Metro 연결이 필요하다. **후속 사용자 요청으로 2026-10-05 19:21:46에 SM-S942N에 독립 실행 release APK를 업데이트했으므로 휴대폰에서는 개발 서버 없이 확인할 수 있다.** 글꼴·색상·버튼·입력·선택·탭·모달을 한 화면에서 스크롤하며 확인한다.

현재 범위는 공통 기반과 미리보기다. 10-11 변경은 최신 소스의 개발 앱에서 확인한다. 10-05 휴대폰 설치본에는 이번 체크박스·스위치·상단 바 보완이 포함되지 않는다. 실제 서비스 화면에 적용하는 작업은 다음 단계다.

## 구조와 책임

| 경로 | 책임 |
| --- | --- |
| `src/theme` | 의미별 색상·간격·모서리·타이포그래피, 테마 경계, 로컬 폰트 로딩 |
| `src/components/ui` | 텍스트·버튼·입력·선택·탭·모달과 접근성/입력 상태 |
| `src/components/navigation` | 상단 바와 하단 탭 표시, 선택 이벤트 |
| `src/features/ui-preview` | 데이터 저장 없는 미리보기 상태/샘플 |
| `src/app/ui-preview.tsx` | Router·폰트 준비·테마 연결 |
| `src/features/account`, `courses`, `running` 등 | 기능별 합성 UI와 기능 상태; 프로필 사진 조회·코스 저장·GPS 등 |
| `assets/ui` | Figma에서 확보한 원본 SVG |

의존 방향은 app → features → components → theme이다. 공통 컴포넌트는 Router·인증·네트워크·DB·GPS를 import하지 않는다. 특정 기능의 이름을 가진 카드라도 데이터 조회/조작을 하면 기능 폴더에 둔다. 여러 기능에서 같은 표현과 동작이 실제로 재사용될 때 공통화한다. 기존 account/running UI는 화면 이관 단계에서 점진적으로 교체한다.

## 글꼴

`AppText`와 입력창 기본은 Noto Sans KR. 영문·숫자도 자동 분리하지 않는다. 지정한 텍스트 또는 중첩 텍스트에 `family="roboto"`를 준다. Regular/Medium/SemiBold/Bold/Black마다 실제 정적 TTF를 로드해 임의 합성 굵기를 피한다.

```tsx
<AppText>거리 <AppText family="roboto" weight="black">5.24</AppText> km</AppText>
```

10-11 UI 페이지에서 숨겨진 조상을 제외한 모든 Text의 글꼴 구간을 조회했다. [조회 근거](../design/common-ui-font-audit-20261011.json)에 노드 ID·수치·굵기를 보존했다. 거리/시간/페이스/칼로리/매칭률/횟수는 Roboto Black, 이용 현황 분수·날짜는 Medium이다. 단위까지 자동 확장하지 않는다. 일부 팝업·약관 한글에 남은 Roboto와 Inter는 기존 사용자 결정대로 Noto 기본값을 따른다. 원본 component 페이지의 Roboto 제목보다 UI 인스턴스의 Noto Bold를 우선한다. 기능별 이관 때 이 노드 대응을 사용한다.

폰트는 `@expo-google-fonts/noto-sans-kr`, `@expo-google-fonts/roboto` 패키지의 로컬 TTF를 Metro가 앱에 묶는다. 별도 assets/fonts 복사로 이중 관리하지 않는다. 원본·라이선스는 각 패키지 `LICENSE_FONT`와 lockfile 버전으로 추적한다. `FontGate`는 준비 전 공통 화면을 표시하지 않으며 실패 시 재시도를 제공한다. [Expo 폰트 안내](https://docs.expo.dev/develop/user-interface/fonts/).

## 컴포넌트 계약

- Button: primary/secondary/outline, compact 팝업 크기, loading/disabled, 앞뒤 아이콘 슬롯. 최소 터치 영역 48dp와 시각 높이를 구분한다.
- TextField: controlled value/onChangeText, label/hint/error, 포커스/읽기 전용. 입력창 값이나 커서를 재가공하지 않는다.
- SelectField: 단일 선택 모달, 비활성 옵션/빈 목록, 선택 후 닫기. 실제 선택 값은 부모가 보관한다.
- Checkbox/Toggle: controlled checked/onChange, 기본 Figma ON/OFF 표시, disabled/checked 접근성, 최소 48dp 터치. `visuals`는 필요한 경우 양 상태를 함께 교체하는 선택 props다.
- Tabs/BottomTabBar: 선택 값과 콜백만 제공한다. 뒤로 가기나 화면 이동은 app/features가 담당한다.
- AppModal/ConfirmDialog: OS 뒤로 가기와 명시적 취소, 배경 터치는 기본 닫지 않음, 처리 중 취소/중복 확인 차단. 모달 내용 스크롤과 안전 영역을 지원한다. `returnFocusRef`에 열기 버튼의 ref를 전달하면 닫힘 후 접근성 포커스를 복구한다. SelectField는 내부 트리거를 자동 연결한다. Android TalkBack에서 두 모달의 복귀를 확인했고 iOS는 미검증이다.
- TopBar: UI `253:6238`의 최소 높이 80·Noto Bold 24 제목·그림자와 양쪽 48dp 터치 슬롯. Icon의 chevronLeft/menu로 조합한다. 화면이 safe-area 상단 여백을 제공한다. 글꼴 확대 시 제목 줄바꿈으로 높이가 늘어난다.

색상은 원본의 행동 `#FB5603`, 선택/팝업 `#FC5602`를 별도 의미로 유지한다. 토큰 중 오류 색·처리 상태/포커스/접근성 터치 영역은 정적 Figma에 없는 구현 보완이다. 다크 팔레트는 아직 제공하지 않는다.

## 디자인과 앱 동작의 경계

Checkbox ON `54:8929`, OFF `54:8930`, Switch ON/OFF `30:4568`/`30:4569`, 상단 바·메뉴·로그아웃 아이콘과 공유 아이콘 18dp 바깥 슬롯을 대조했다. 원본 에셋은 [목록](../../assets/ui/README.md)에 연결한다.

UI의 하단 메뉴 라벨 95개는 모두 #757575였으며 별도 선택 디자인은 없었다. 선택 라벨의 주황색과 selected 접근성 상태는 앱 상호작용 보완이다. 아이콘 색은 원본을 유지한다. 오류/로딩/disabled·터치 확장도 같은 구현 보완이다. 공통 UI 완성을 서비스 전체 화면 이관이나 iOS·모든 키보드 호환 검증 완료로 해석하지 않는다.

[실행 계획](../history/executed-plans/2026-10-05-1654-common-ui.md)
