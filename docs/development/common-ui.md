# RunPen 공통 UI

2026-10-05 구현 진행 중. 기존 기능 화면을 일괄 교체하지 않고 `/ui-preview`에서 먼저 검증한다. 개발 환경 메뉴에 진입 링크가 있다.

## 미리보기 확인

이번 소스를 실행한 Android 앱에서 **첫 화면 하단 → 개발 환경 확인 → RunPen 공통 UI 미리보기 열기**로 이동한다. 검증에 사용한 AVD 이름은 `RunningArt_UI_QA`다. 개발 APK는 Metro 연결이 필요하다. **후속 사용자 요청으로 2026-10-05 19:21:46에 SM-S942N에 독립 실행 release APK를 업데이트했으므로 휴대폰에서는 개발 서버 없이 확인할 수 있다.** 글꼴·색상·버튼·입력·선택·탭·모달을 한 화면에서 스크롤하며 확인한다.

현재 완료 범위는 공통 기반과 미리보기다. 최신 Roboto 지정 위치와 일부 원본 상태는 Figma 조회 한도로 대기 중이며, 원본을 확보한 뒤 해당 컨트롤을 완성하고 서비스 화면에 적용한다.

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

`AppText`와 입력창 기본은 Noto Sans KR. 영문·숫자도 자동 분리하지 않는다. 지정한 텍스트 또는 중첩 텍스트에 `family="roboto"`를 준다. Regular/Medium/SemiBold/Bold마다 실제 정적 TTF를 로드해 임의 합성 굵기를 피한다.

```tsx
<AppText>거리 <AppText family="roboto" weight="bold">5.24 km</AppText></AppText>
```

예시는 API 사용 설명이며 특정 서비스 화면의 Roboto 사용 확정을 뜻하지 않는다. 최신 Figma 폰트 변경 전수 대조는 MCP 호출 한도로 아직 미완료다. 원본 컴포넌트의 기존 Roboto 한글을 그대로 적용하지 않고 사용자가 지정한 Noto 기본 정책을 따른다.

폰트는 `@expo-google-fonts/noto-sans-kr`, `@expo-google-fonts/roboto` 패키지의 로컬 TTF를 Metro가 앱에 묶는다. 별도 assets/fonts 복사로 이중 관리하지 않는다. 원본·라이선스는 각 패키지 `LICENSE_FONT`와 lockfile 버전으로 추적한다. `FontGate`는 준비 전 공통 화면을 표시하지 않으며 실패 시 재시도를 제공한다. [Expo 폰트 안내](https://docs.expo.dev/develop/user-interface/fonts/).

## 컴포넌트 계약

- Button: primary/secondary/outline, compact 팝업 크기, loading/disabled, 앞뒤 아이콘 슬롯. 최소 터치 영역 48dp와 시각 높이를 구분한다.
- TextField: controlled value/onChangeText, label/hint/error, 포커스/읽기 전용. 입력창 값이나 커서를 재가공하지 않는다.
- SelectField: 단일 선택 모달, 비활성 옵션/빈 목록, 선택 후 닫기. 실제 선택 값은 부모가 보관한다.
- Checkbox/Toggle: controlled checked/onChange와 양 상태 원본 에셋 슬롯. **선택 상태 원본을 아직 확보하지 못해 기본 에셋 연결/갤러리 검증은 미완료**다.
- Tabs/BottomTabBar: 선택 값과 콜백만 제공한다. 뒤로 가기나 화면 이동은 app/features가 담당한다.
- AppModal/ConfirmDialog: OS 뒤로 가기와 명시적 취소, 배경 터치는 기본 닫지 않음, 처리 중 취소/중복 확인 차단. 모달 내용 스크롤과 안전 영역을 지원한다. `returnFocusRef`에 열기 버튼의 ref를 전달하면 닫힘 후 접근성 포커스를 복구한다. SelectField는 내부 트리거를 자동 연결한다. Android TalkBack에서 두 모달의 복귀를 확인했고 iOS는 미검증이다.
- TopBar: 제목과 양쪽 슬롯. 현재 레이아웃은 임시 기본값이며 원본 상단 바 전체/아이콘 대조가 남았다.

색상은 원본의 행동 `#FB5603`, 선택/팝업 `#FC5602`를 별도 의미로 유지한다. 토큰 중 오류 색·처리 상태/포커스/접근성 터치 영역은 정적 Figma에 없는 구현 보완이다. 다크 팔레트는 아직 제공하지 않는다.

## 남은 원본 대조

최신 Roboto 적용 위치, 체크박스 양 상태·스위치 ON·상단 바/팝업 아이콘, 선택된 하단 탭 스타일. 원본 확보 전 유사 아이콘으로 대체하거나 전체 디자인 완료로 보고하지 않는다.

[실행 계획](../history/executed-plans/2026-10-05-1654-common-ui.md)
