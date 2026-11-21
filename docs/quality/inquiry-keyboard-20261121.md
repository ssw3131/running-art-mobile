# 문의 입력칸 키보드 가림 수정 — 2026-11-21

## 검증 범위

| 항목 | 결과 |
| --- | --- |
| 제품 변경 | 문의 작성·수정의 키보드 가림 보정과 긴 본문 내부 스크롤 |
| 로컬·빠른 검사 | 타입·린트·로직619/기존skip1·UI256·서버/DB/OpenAPI, QA Python39 통과 |
| 최종 전체 Android29 | 7단계·문의 키보드8개 경계 통과 |
| 최종 전체 Android36 | 15단계·문의 키보드8개 경계·기존 정적4화면 차이0 통과 (ADB 준비 실패 후 작업1회 재실행) |
| main | PR80 → b5acbc7, 동일 tree 증거 재사용과 필수 검사 통과 |
| 설치용 APK | preview217394294 빌드·서명/해시 검증·업로드 완료 |
| 실제 삼성 키보드 | 클라우드에 휴대폰이 연결되지 않아 수정본 재검증 미실행 |

아래에는 최초 실패·QA 보완·단독 진단과 최종 전체 검사를 각각 기록한다. 운영 DB/서버 변경은 없다.

## 원인과 변경

[A7 실제 결함](inquiry-phone-20261121.md)에서 제목 입력칸이 삼성 키보드에 완전히 가려졌다. 기존 문의 SupportPage는 Android에서 KeyboardAvoidingView의 behavior가 없고 키보드 표시/포커스 이후 입력칸을 스크롤하는 처리도 없었다. 기존 자동 검사는 입력 노드가 존재하는 것만 확인해 화면 가림을 놓쳤다.

작성·수정 양식의 네이티브 입력 ref를 공통 문의 스크롤에 연결했다. 키보드 표시/포커스/레이아웃 변경 뒤 스크롤 영역과 입력칸을 측정해 헤더와 키보드 사이로 이동한다. 키보드 이벤트가 누락된 구형 Android의 adjustResize에서도 줄어든 스크롤 영역을 기준으로 이동한다. 창 크기가 이미 줄어든 경우 여백을 중복 추가하지 않으며 키보드 종료/포커스 해제 시 여백을 제거한다. 긴 본문은 기본180dp, 작은 가용 공간에서는 더 작게 제한하고 내부에서 스크롤한다. 문의 데이터/API·공지 정적 화면은 유지한다.

## 확인한 결과

- 타입/린트 통과, 문의/지원 UI8개 통과, Python 문법·QA 도구39개 검사 통과. 전체 fast7단계(로직619통과/기존skip1·Jest44묶음256개·DB/서버/OpenAPI 포함) 통과.
- Android 문의 시나리오에 빈 작성/새 작성/수정의 제목·본문, 긴 본문·큰 글씨/다크, 키보드 닫기/미전송 뒤로 가기 검사를 추가했다. IME 원본 덤프·입력/스크롤 경계 JSON·PNG를 저장하고 최소 입력칸 높이/헤더·키보드 경계를 비교한다.
- 긴 본문 내부 스크롤이 페이지 탐색을 가로채지 않도록 QA 스크롤 탐색에서 EditText를 페이지로 선택하지 않고 바깥 여백에서 스와이프한다.
- Android29·36 전체 검사와 원본 화면 검토를 통과했다. 삼성 키보드를 포함한 실제 휴대폰 재검증은 이 클라우드에 연결된 기기가 없어 미실행이다. main 결과는 아래 최종 반영 절을 따른다.

최초 qa:review는 native 시나리오 경로를 tests 배열에 넣어 형식 검사에서 거절됐다. 허용된 UI 테스트만 tests에 두고 native 시나리오는 native/visual 근거로 유지했다. 제품 검사 실패는 아니다.

## 최초 제품 소스와 CI

- 제품 소스 `4b02917a5c0c3730b46edbcb00d88413c7d3ec61`과 PR80 검사 소스 `12ffa3213e6ae1ee699cbe78c24de7abf469304f`의 tree가 `9ed6384f7a048cc879f27b78fede237554f86c24`로 같음을 실제 Git 객체로 대조했다.
- 제품 소스의 draft [44859976082](https://github.com/ssw3131/running-art-mobile/actions/runs/44859976082) 빠른 검사/development-feedback 통과. ready [44860357256](https://github.com/ssw3131/running-art-mobile/actions/runs/44860357256)의 fast7단계와 실제 격리 API도 통과했다. 다운로드한 두 보고서의 source12ffa32/dirty=false/status=passed를 대조했다.
- 최초 draft44859527080·후속44859761660은 Android29 실제 IME 표시 검사와 이벤트 누락/resize 보강 소스를 올리면서 자동 취소됐다. 이 두 실행을 성공으로 세지 않는다. 첫 gh watch는 조회 HTTP500으로 종료됐지만 Actions 실행 실패와 구분하고 이후 실제 run 상태를 재조회했다.

## 새 설치용 APK

- [Handset44860207683](https://github.com/ssw3131/running-art-mobile/actions/runs/44860207683)이 제품 소스4b02917의 빌드·서명/패키지 검증·업로드를 통과했다. 워크플로 ref인 main80cdbf1과 실제 빌드 source_ref4b02917을 구분한다.
- [설치 묶음](https://github.com/ssw3131/running-art-mobile/actions/runs/44860207683/artifacts/14689847376): `runpen-preview-4b02917a5c0c-217394294.apk`, versionCode217394294, applicationId `com.runningart.mobile.dev`, arm64-v8a/armeabi-v7a, Metro 없는 preview/OpenGL이다.
- APK SHA256 `99ba2b5c4213735aa113eb7ea3d444c6627d22a13c45a78a417f1e3648fe4e2d`, 기존 인증서 SHA256 `3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179`. 실제 다운로드와 metadata, ZIP SHA256 `ce8deeab8c58c4fbeea7bca432e52a50e5798d7dcfb42f8e133c5d6979ab46a2`와 Actions digest가 일치했다.
- 실제 Hermes 번들의 Supabase 호스트가 기존 zymfblgzpidgfjjgrino 프로젝트 하나인 것을 확인했다. Git 제외 `build/handset/inquiry-keyboard-4b02917/`에 APK·설치 안내·metadata·해시·원본 ZIP을 보존한다. 이 새 빌드는 실제 휴대폰에 설치하지 않았다.

## 첫 전체 검사 실패와 진단 보완

ready44860357256의 Android29는 작성 제목 경계 확인 후 `Input is not focused: inquiry-body`로 실패했다. 원본 PNG/XML에서 제목은 [63,1299][1017,1431], IME 상단1473으로 정상 표시됐지만 본문은 [63,1628][1017,2101]로 키보드 뒤에 있었다. QA가 스크롤 전체 bounds의 하단2214를 그대로 사용해 키보드 g를 눌렀고, 포커스가 제목에 남은 채 접근성 setText만 본문에 적용됐다. 제품 위치 검사 실패를 무시하지 않고 원본으로 QA 탐색 좌표 결함을 확인했다.

입력 전 현재 IME 경계를 구해 페이지 탐색/스와이프/탭을 표시 영역 안으로 제한했다. 키보드를 닫지 않고 제목→본문 포커스 전환을 검사하며 실제 포커스/전체 높이/키보드 경계 단언은 그대로 유지한다. 실패 XML 재생 검사에서 IME 아래 본문을 즉시 탭하지 않고 IME 위에서 스와이프함을 확인했다. Python39개와 문법 검사를 재통과했다. 원본 report·PNG·XML·IME 덤프는 `.cache/inquiry-keyboard/android29-first/`에 보존한다.

Android36도 같은 ready 실행에서 제목 [63,1283][1017,1415]/IME상단1457 경계를 통과한 뒤, 키보드 뒤 본문 [63,1612][1017,2085]를 탭해 제목에 g가 입력된 같은 QA 좌표 결함으로 실패했다. 원본 PNG/XML을 직접 대조했다. 앞선14단계는 통과했으나 전체 통과로 세지 않는다. Android29/36 모두 시나리오 재시도0·정리 통과다.

QA 수정8ea8e10의 [분야별 진단44862807289](https://github.com/ssw3131/running-art-mobile/actions/runs/44862807289)을 기존 전체 검사와 별도 브랜치에서 실행했다. 첫 dispatch 요청은 GitHub503으로 접수되지 않아 실행 목록이 빈 것을 확인한 뒤 다시 요청했다. 기존 전체 검사가 끝난 뒤 PR을 draft로 돌려 같은 QA 소스를 반영했다. 앱 제품 소스는4b02917과 동일하다.

분야별44862807289는 작성/수정/새 문의의 제목·본문6개 경계와 실제 등록·수정·운영 답변·삭제를 통과했다. 원본 긴 본문 PNG에서 180dp 입력칸 전체가 [63,942][1017,1415], IME상단1457 위에 표시됨을 직접 확인했다. 이후 큰 글씨/다크 작성 화면의 `inquiry-title` 대기에서 실패했다. 원본 `inquiry-wait-inquiry-title.png/xml`에는 작성 화면과 문의 유형이 정상 표시되고 제목 입력칸은 화면 아래에 있었다. 노드가 스크롤 없이 나타나기만 기다린 QA 준비 조건을 문의 유형 표시로 바꾸고 기존 입력 탐색이 제목까지 스크롤하게 했다. 대기 기한·포커스·높이·IME 단언은 완화하지 않았다. 정리 통과·재시도0, 원본은 `.cache/inquiry-keyboard/diagnostic-first/`에 보존한다.

큰 글씨 진입 대기 수정5827015의 draft44864468813은 빠른 검사를 통과했다. 해당 수정의 분야별 재진단은44864466016이다. 긴 본문 원본 XML은 실제 Android EditText임에도 scrollable=false를 보고했다. RN의 네이티브 입력은 긴 내용을 내부 스크롤할 수 있으므로 QA 페이지 스와이프는 이 플래그에 의존하지 않고 모든 EditText의 바깥 여백을 사용하도록 보완했다. 실제 실패 캡처를 재생해 본문 내부 x540 대신 여백 x31을 선택함을 확인했다.

## 분야별 통과와 최종 전체 검사

[재진단44864466016](https://github.com/ssw3131/running-art-mobile/actions/runs/44864466016)은 source5827015/dirty=false의 실제 격리 Android36 achievements-only로 통과했다. 작성/수정/새 문의/큰 글씨의 제목·본문8개 경계, 등록·수정·답변·삭제·큰 글씨/다크·미전송 뒤로 가기와 기존 공지 오프라인 상세/복귀를 확인했다. 재시도0·UI 준비 대기0·전송 경고0·자료 보존/정리 통과다.

원본 큰 글씨/다크 PNG에서 제목 [72,1200][1008,1383], 본문 [72,843][1008,1383]가 IME상단1431보다48px 위에 있고 입력칸 전체와 긴 본문의 마지막 커서가 보임을 직접 검토했다. 키보드를 닫은 화면에서 본문 아래 안내와 문의 보내기 버튼 접근, 미전송 목록 복귀도 확인했다. 원본 ZIP·report·8개 bounds·IME 덤프·PNG는 `.cache/inquiry-keyboard/diagnostic-second-evidence/`에 보존한다. ZIP SHA25671982874208a01e464f16791b3b49b4ad2e9338e55c9005c8ba3db4630404408을 Actions digest와 대조했다.

최종 QA 여백 탐색 보완2835b7b는 Python39개·실제 XML 재생과 [draft44866150651](https://github.com/ssw3131/running-art-mobile/actions/runs/44866150651)의 fast/development-feedback을 통과했다. 분야별 결과를 최종 전체 검사와 혼동하지 않으며, 이 소스를 ready로 전환해 아래 Android29/36 전체 필수 검사를 통과했다. 설치 APK4b02917과의 차이는 docs/와 scripts/qa/뿐임을 Git으로 대조했다.

검토한 진단 원본: [큰 글씨 제목](evidence/inquiry-keyboard-20261121/android36-diagnostic-large-title.png)·[긴 본문](evidence/inquiry-keyboard-20261121/android36-diagnostic-large-long-body.png)·[키보드 닫기/전송 버튼](evidence/inquiry-keyboard-20261121/android36-diagnostic-dismissed.png)·[8개 경계](evidence/inquiry-keyboard-20261121/android36-diagnostic-bounds.json).

최종 전체 [44866420129](https://github.com/ssw3131/running-art-mobile/actions/runs/44866420129)의 source d3c913cde8b71197764b5e09ef367ed8ee0fdaa6과 head2835b7b의 tree b71c09d4c82e4e2a27272a02f196f3b13c321bb0이 같다. 다운로드한 fast/API 보고서도 같은 source/dirty=false/status=passed이며 원본 ZIP digest를 대조했다. Android29/36 전체 결과는 아래에 이어 기록한다.

최종 전체44866420129의 첫 Android36 작업136731094981은 앱 설치 이전 `q.adb('root')`에서 `adb: unable to connect for root: closed`로 종료됐다. 원본 로그에서 에뮬레이터 부팅 완료 이후 ADB root 전송이 닫혔음을 확인했으며, 앱 기능/화면 검사와 report 생성은 시작되지 않았다. 482바이트 아티팩트는 index.html만 포함한다. 격리 backend·TLS 정리는 통과했고, 이를 제품 검사 실패나 통과로 바꾸지 않는다. 원본 로그는 `.cache/inquiry-keyboard/final-36-initial-failure-raw.log`에 보존한다. 같은 소스의 실패한 Android36 작업만1회 재실행하는 대상으로 정했다. Android29는 중단하지 않고 아래와 같이 통과했다.

PR draft 전환 직후 이전 head4b의44863425730은 새 head 반영으로 취소됐고, QA 수정본44863434876은 성공했다. 이 중간 취소도 성공으로 세지 않는다.

Android36 단독 재실행 요청은 GitHub가 `The workflow run containing this job is already running`으로 거절해 접수되지 않았다. 권한 승인 거절과 구분하며, Android29 종료 후 아래와 같이 동일 작업 재실행을 요청했다.

Android29의 최종 전체44866420129/회차1은7단계와 문의 키보드8개 경계·큰 글씨/다크·기존 공지를 통과했다. source d3c913c/dirty=false, 시나리오 재시도0·정리 통과이며 UI 준비 대기3·덤프 완료 뒤 전송 종료 경고1은 원본에 보존한다. 정상 제목·긴 수정 본문·큰 글씨 긴 본문 PNG를 직접 검토했다. 정상 입력 하단1431/IME상단1473, 큰 글씨 제목 하단1401/IME상단1449, 큰 글씨 본문 [72,814][1008,1354]/IME상단1449로 입력칸 전체가 보였다. [제목 원본](evidence/inquiry-keyboard-20261121/android29-full-create-title.png)·[큰 글씨 본문](evidence/inquiry-keyboard-20261121/android29-full-large-long-body.png)·[8개 경계](evidence/inquiry-keyboard-20261121/android29-full-bounds.json). ZIP SHA2564e1a8a1a2105bf1816839813a7b651361a8c19f2886c22328d2ee038bec5f617와 Actions digest를 대조했다.

Android29와 첫 필수 게이트 종료 후 Android36 작업 재실행 요청이 실제 접수됐고 같은 run의 run_attempt=2/head2835b7b를 확인했다. 첫 회차 전체 상태는 `.cache/inquiry-keyboard/final-full-attempt1.json`에 따로 보존한다.


## 최종 Android36 통과와 반영

최종 전체44866420129의 회차2는 Android36의15단계·문의 키보드8개 경계와 기존 공지, 자료 보존/정리 및 필수 verification-gate를 통과했다. source d3c913c/dirty=false/mode=full이며 최종 head2835b7b와 tree가 같다. 기존 화면 비교는 home/run/archive/account 모두 차이0이고 기준·마스크·허용 오차는 변경하지 않았다. 성공 회차 시나리오 재시도0·UI 준비 대기1·전송 경고0을 확인했다. 첫 ADB 준비 실패와 작업 재실행1회는 위에 별도 보존한다.

원본 제목·긴 수정 본문·큰 글씨/다크 본문·키보드 닫기 PNG를 직접 검토했다. 정상 제목/본문 하단1415는 IME상단1457보다42px 위에 있으며 큰 글씨 본문 [72,843][1008,1383]도 IME상단1431보다48px 위다. 입력칸 전체와 긴 본문의 마지막 커서가 보이고 키보드를 닫으면 문의 보내기 버튼에 접근할 수 있다. [제목 원본](evidence/inquiry-keyboard-20261121/android36-full-create-title.png)·[큰 글씨 본문](evidence/inquiry-keyboard-20261121/android36-full-large-long-body.png)·[키보드 닫기](evidence/inquiry-keyboard-20261121/android36-full-dismissed.png)·[8개 경계](evidence/inquiry-keyboard-20261121/android36-full-bounds.json).

Android36 원본 아티팩트14693778290의 SHA256 `a367439ace8667ea85dcbe8caced1a9f2f85dce4c582499ed9fa8b6ae5e5cc09`를 실제 ZIP과 대조했고 `.cache/inquiry-keyboard/final-android36-attempt2/`에 보존한다. 필수 게이트가 최종 tree의 회차2 receipt14694099180을 발행한 것도 확인했다.

[PR80](https://github.com/ssw3131/running-art-mobile/pull/80)을 main `b5acbc7008a05014cc7e3fd346848edbd003dece`로 병합했다. 실제 Git 객체의 tree가 최종 검사와 같은 `b71c09d4c82e4e2a27272a02f196f3b13c321bb0`이다. 설치 APK4b02917과 최종 소스의 차이는 문서와 QA 도구뿐이므로 제품 소스는 동일하다.

[main44872163519](https://github.com/ssw3131/running-art-mobile/actions/runs/44872163519)의 scope·verification-gate도 통과했다. 다운로드한 verification-reuse-1(14694282508, SHA256 `ec46b48eb557c966c4077c3e36ea7c1db1834b51931602c3949095aab3ce5202`) 원본은 reused=true/pr80/run44866420129/attempt2/tree b71c09d4를 확인한다. main에서 Android를 다시 실행한 것으로 세지 않는다.

운영 DB/서버와 실제 휴대폰은 변경하지 않았다. 삼성 키보드의 최종 확인은 이 APK를 기존 앱 위에 업데이트 설치한 뒤 작성·수정 제목/긴 본문·키보드 닫기/뒤로 가기 순서로 이어간다. APK·다운로드 ZIP·전체 원본 검증 자료는 Git 제외 로컬 폴더에 보존한다. 결과 문서 후속 PR의 필수 검사와 작업 브랜치 정리 결과는 해당 PR 본문에 남긴다.
