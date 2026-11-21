# 문의 입력칸 키보드 가림 수정 — 2026-11-21

## 원인과 변경

[A7 실제 결함](inquiry-phone-20261121.md)에서 제목 입력칸이 삼성 키보드에 완전히 가려졌다. 기존 문의 SupportPage는 Android에서 KeyboardAvoidingView의 behavior가 없고 키보드 표시/포커스 이후 입력칸을 스크롤하는 처리도 없었다. 기존 자동 검사는 입력 노드가 존재하는 것만 확인해 화면 가림을 놓쳤다.

작성·수정 양식의 네이티브 입력 ref를 공통 문의 스크롤에 연결했다. 키보드 표시/포커스/레이아웃 변경 뒤 스크롤 영역과 입력칸을 측정해 헤더와 키보드 사이로 이동한다. 키보드 이벤트가 누락된 구형 Android의 adjustResize에서도 줄어든 스크롤 영역을 기준으로 이동한다. 창 크기가 이미 줄어든 경우 여백을 중복 추가하지 않으며 키보드 종료/포커스 해제 시 여백을 제거한다. 긴 본문은 기본180dp, 작은 가용 공간에서는 더 작게 제한하고 내부에서 스크롤한다. 문의 데이터/API·공지 정적 화면은 유지한다.

## 확인한 결과

- 타입/린트 통과, 문의/지원 UI8개 통과, Python 문법·QA 도구39개 검사 통과. 전체 fast7단계(로직619통과/기존skip1·Jest44묶음256개·DB/서버/OpenAPI 포함) 통과.
- Android 문의 시나리오에 빈 작성/새 작성/수정의 제목·본문, 긴 본문·큰 글씨/다크, 키보드 닫기/미전송 뒤로 가기 검사를 추가했다. IME 원본 덤프·입력/스크롤 경계 JSON·PNG를 저장하고 최소 입력칸 높이/헤더·키보드 경계를 비교한다.
- 긴 본문 내부 스크롤이 페이지 탐색을 가로채지 않도록 QA 스크롤 탐색에서 EditText를 페이지로 선택하지 않고 바깥 여백에서 스와이프한다.
- Android29·36·main 결과는 실행 후 이어서 기록한다. 삼성 키보드를 포함한 실제 휴대폰 재검증은 이 클라우드에 연결된 기기가 없어 미실행이다.

최초 qa:review는 native 시나리오 경로를 tests 배열에 넣어 형식 검사에서 거절됐다. 허용된 UI 테스트만 tests에 두고 native 시나리오는 native/visual 근거로 유지했다. 제품 검사 실패는 아니다.

## 최종 소스와 CI

- 제품 소스 `4b02917a5c0c3730b46edbcb00d88413c7d3ec61`과 PR80 검사 소스 `12ffa3213e6ae1ee699cbe78c24de7abf469304f`의 tree가 `9ed6384f7a048cc879f27b78fede237554f86c24`로 같음을 실제 Git 객체로 대조했다.
- 최종 draft [44859976082](https://github.com/ssw3131/running-art-mobile/actions/runs/44859976082) 빠른 검사/development-feedback 통과. ready [44860357256](https://github.com/ssw3131/running-art-mobile/actions/runs/44860357256)의 fast7단계와 실제 격리 API도 통과했다. 다운로드한 두 보고서의 source12ffa32/dirty=false/status=passed를 대조했다.
- 최초 draft44859527080·후속44859761660은 Android29 실제 IME 표시 검사와 이벤트 누락/resize 보강 소스를 올리면서 자동 취소됐다. 이 두 실행을 성공으로 세지 않는다. 첫 gh watch는 조회 HTTP500으로 종료됐지만 Actions 실행 실패와 구분하고 이후 실제 run 상태를 재조회했다.

## 새 설치용 APK

- [Handset44860207683](https://github.com/ssw3131/running-art-mobile/actions/runs/44860207683)이 제품 소스4b02917의 빌드·서명/패키지 검증·업로드를 통과했다. 워크플로 ref인 main80cdbf1과 실제 빌드 source_ref4b02917을 구분한다.
- [설치 묶음](https://github.com/ssw3131/running-art-mobile/actions/runs/44860207683/artifacts/14689847376): `runpen-preview-4b02917a5c0c-217394294.apk`, versionCode217394294, applicationId `com.runningart.mobile.dev`, arm64-v8a/armeabi-v7a, Metro 없는 preview/OpenGL이다.
- APK SHA256 `99ba2b5c4213735aa113eb7ea3d444c6627d22a13c45a78a417f1e3648fe4e2d`, 기존 인증서 SHA256 `3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179`. 실제 다운로드와 metadata, ZIP SHA256 `ce8deeab8c58c4fbeea7bca432e52a50e5798d7dcfb42f8e133c5d6979ab46a2`와 Actions digest가 일치했다.
- 실제 Hermes 번들의 Supabase 호스트가 기존 zymfblgzpidgfjjgrino 프로젝트 하나인 것을 확인했다. Git 제외 `build/handset/inquiry-keyboard-4b02917/`에 APK·설치 안내·metadata·해시·원본 ZIP을 보존한다. 이 새 빌드는 실제 휴대폰에 설치하지 않았다.

## 첫 전체 검사 실패와 진단 보완

ready44860357256의 Android29는 작성 제목 경계 확인 후 `Input is not focused: inquiry-body`로 실패했다. 원본 PNG/XML에서 제목은 [63,1299][1017,1431], IME 상단1473으로 정상 표시됐지만 본문은 [63,1628][1017,2101]로 키보드 뒤에 있었다. QA가 스크롤 전체 bounds의 하단2214를 그대로 사용해 키보드 g를 눌렀고, 포커스가 제목에 남은 채 접근성 setText만 본문에 적용됐다. 제품 위치 검사 실패를 무시하지 않고 원본으로 QA 탐색 좌표 결함을 확인했다.

입력 전 현재 IME 경계를 구해 페이지 탐색/스와이프/탭을 표시 영역 안으로 제한했다. 키보드를 닫지 않고 제목→본문 포커스 전환을 검사하며 실제 포커스/전체 높이/키보드 경계 단언은 그대로 유지한다. 실패 XML 재생 검사에서 IME 아래 본문을 즉시 탭하지 않고 IME 위에서 스와이프함을 확인했다. Python39개와 문법 검사를 재통과했다. 원본 report·PNG·XML·IME 덤프는 `.cache/inquiry-keyboard/android29-first/`에 보존한다.
