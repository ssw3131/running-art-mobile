# 문의 게시판 검증 — 2026-11-21

**실기기 후속:** A7에 최종 APK를 자료 유지 설치하고 실제 접수·수정·삭제·운영팀 답변 왕복과 재시작을 확인했다. 삼성 키보드가 제목을 가리는 결함은 미해결이다. [11월21일 폰 검증](inquiry-phone-20261121.md)을 따르며 아래 휴대폰 미연결은 클라우드 검증 당시 상태다.

## 범위

이메일 없는 비공개 문의 목록/상세/수정/삭제와 Supabase 답변. [계약](../development/inquiry-board.md)·[실행 계획](../history/executed-plans/2026-11-21-0837-inquiry-board.md).

## 확인한 결과

- Node 문의 로직 10개 통과: 입력·이메일 제거·미확인 접수/동일 요청 재시도·계정 변경·전송 제한·10초 타임아웃·삭제된 요청 처리.
- 문의 UI 6개 통과: 실패와 빈 목록 구분·이메일 없는 등록/상세 이동·페이지 추가·답변 표시·수정 중 답변 충돌·삭제 확인·계정 변경 시 이전 응답 폐기.
- 기존 공지/FAQ UI·공지 캐시 7개 통과.
- 실제 PGlite PostgreSQL 엔진의 기존 계정/지원 검사와 새 문의 SQL 통과. 별도 부분 S6 마이그레이션 검사 통과: 약관 데이터 보존, 공지 테이블 미생성, 본인 RLS·원장 비공개·답변 트리거·버전 충돌·삭제/제한·페이지 경계·탈퇴 정리.
- 전체 fast 7단계 통과: 타입/린트·서버 타입/린트·Node 619통과/기존1건skip·Jest44묶음256개·OpenAPI·계정/문의/공유 DB 정책. 최종 API·Android29/36·PR/main 필수 검사와 운영 DB 반영도 완료했다. 실제 휴대폰 설치와 문의→답변 왕복은 연결 기기가 없어 미완료다.

## 실패와 환경 한계

- cloud.sh setup은 /home/agent/.expo 읽기 전용으로 실패했고 추가 경로 권한으로도 동일했다. HOME을 변경하지 않고 공식 해시로 검증한 Node24.21.0과 npm ci를 사용했다. Expo 검사는 CLI가 지원하는 셸 전용 __UNSAFE_EXPO_HOME_DIRECTORY를 프로젝트의 Git 제외 캐시로 지정한다(기존 인증 없음).
- 최신 Supabase CLI는 ~/.supabase 쓰기 제한, 구 CLI npm 설치는 직접 GitHub 연결 거절로 실패했다. curl로 공식 v2.81.3 CLI를 받아 도움말 확인 후 migration new로 파일을 생성했다.
- 최초 Node 실패 2개는 폐기된 이메일 계약/옛 RPC 모의객체였다. 이메일 미전송·abortSignal 계약으로 수정 후10개 통과.
- 최초 UI 6개 실패는 Jest 모듈 초기화 전에 mockRemote를 값으로 캡처한 fixture 문제였다. 호출 시 위임하도록 수정 후6개 통과.
- 최초 린트에서 effect 내 setState 오류를 발견했다. 외부 문의 컨트롤러 구독 콜백으로 복원 입력을 반영하도록 수정했다.

- 첫 ready44840341351은 fast/API/Android29가 통과했다. API29 화면 육안 검토에서 문의와 기존 공지 카드의 흰색 SVG 화살표가 밝은 배경에서 보이지 않는 문제를 발견해 c.text를 명시했다. 수정 소스의 최종 검사를 위해 draft로 전환했고 진행 중 Android36 실행은 취소됐다. 이 첫 실행을 전체 성공으로 세지 않는다.


## 운영 DB 반영 — 2026-11-21 09:00~09:03 KST

- Supabase `running-art-mobile-dev`에 검증된 문의 전용 SQL을 적용했다. 저장소 파일은 `20261120234216_private_inquiry_board.sql`, MCP 적용 이력의 version은 `20261121000048`, name은 `private_inquiry_board`다. 같은 변경의 대응 관계이며 다시 적용하지 않는다. 기존 부분 적용 이력 때문에 전체 migration push는 여전히 금지하고 실제 객체를 먼저 대조한다.
- 적용 전 문의 테이블·함수·support_private 스키마가 없는 것을 확인했다. 적용 후 문의/접수 원장·RLS·authenticated 접수 실행 허용, 익명 SELECT/접수와 사용자 직접 UPDATE 금지를 확인했다. contact_email 컬럼은 없다.
- 기존 정책 4행의 본문 MD5가 적용 전후 동일했다. v1 location cbf075125b37c622f831f2c0fe79a1f5, v1 privacy fcd0ed5c36f609f582c0f033578abd56, v2 location 4ac409698ad2237175d0ce154af518be, v2 privacy 919b920b7cdbfa070037d4f347fbe9ed. 공지·회원·기록·계산 서버는 이번 배포에서 변경하지 않았다.
- 운영 DB에서 새 임시 UUID의 auth.users 행만 사용하는 단일 트랜잭션으로 등록·동일 요청 재시도·본인 목록·수정·답변 자동 시각/버전·답변 후 삭제 거절을 검증하고 롤백했다. 이후 해당 시험 사용자·문의·원장 모두 0건을 확인했다. 실제 사용자 계정이나 문의를 사용하지 않았다.
- 공개 HTTP API의 list_service_inquiries 호출은 비로그인 HTTP401/42501로 거절되어 새 함수의 스키마 반영과 익명 접근 차단을 확인했다. 실제 인증 HTTP 동시 처리·삭제 재시도는 PR API 검사에서 통과했다.
- 보안 Advisor도 확인했다. 신규 문의 쓰기 RPC 3개의 authenticated SECURITY DEFINER 경고는 직접 테이블 쓰기를 금지하고 auth.uid()/활성 계정·본인·행 잠금을 검사하는 의도된 API다. 익명 실행은 금지하고 search_path는 비워 두었다. 비공개 원장의 RLS/no-policy INFO는 사용자 직접 접근을 허용하지 않는 의도된 차단이다. 기존 공개 약관·공유·계정 함수/비밀번호 관련 경고는 이번 범위에서 변경하지 않았다.

## 최종 소스·증거 연결

- 제품 소스는 `790453d760ab3486e8eb98171fc70d3ce574b413`이다. PR77 검사 소스 `06c219fecc96d31b9fc26765979a224e21f52966`과 tree `2716614cbfd7c099d89262a3f877c78b6c242bd0`가 같음을 실제 Git 객체로 대조했다.
- 최종 draft [44844109050](https://github.com/ssw3131/running-art-mobile/actions/runs/44844109050)의 빠른 검사가 통과했다. ready [44844724324](https://github.com/ssw3131/running-art-mobile/actions/runs/44844724324)의 fast/API·Android29/36·verification-gate가 모두 통과했고 Android 최종 원본 검토는 아래에 기록한다.
- 첫 Android29 원본의 빈 작성/답변 목록/상세/다크·큰 글씨5개를 직접 열어 검토했다. 메일 입력 제거, 기존 이미지, 태그/답변 구분선, 고정 하단 버튼을 확인했고 밝은 테마 화살표 누락을 발견해 수정했다. 자동 검사 성공과 육안 발견을 구분한다.
- 처음 아티팩트 직접 다운로드는 저장소 HTTP 터널403으로 막혔고 한때 셸 GitHub API 인증도401이었다. 연결된 GitHub 도구의 파일 다운로드로 API/Android29/APK ZIP을 확보했다. 이후 gh 조회·빌드 실행도 정상 동작했다. APK는 metadata.json의 SHA256과 로컬 파일을 대조하고 Git 제외 `build/handset/`에 보존한다.
- 실제 휴대폰 ADB는 이 클라우드에 연결되어 있지 않다. 서명 빌드·에뮬레이터 검사와 실제 휴대폰 설치/등록→답변 왕복을 구분하며 후자는 미완료다.

## 설치용 APK 준비

- [Handset APK44844146008](https://github.com/ssw3131/running-art-mobile/actions/runs/44844146008)는 main의 신뢰된 워크플로로 제품 소스790453d를 빌드했고 서명/패키지 검증까지 통과했다. 워크플로 ref의 main c9f735b와 실제 source_ref790453d를 구분한다.
- [설치 묶음](https://github.com/ssw3131/running-art-mobile/actions/runs/44844146008/artifacts/14681828447): `runpen-preview-790453d760ab-217384297.apk`, applicationId `com.runningart.mobile.dev`, versionCode `217384297`, arm64-v8a/armeabi-v7a. 최종본은 Git 제외 `build/handset/inquiry-board-790453d/`에 APK·metadata.json·해시·설치 안내를 함께 보존했다.
- APK SHA256 `95b2f96492d243c9f5561ce558df12df5c2d1d194013415c07c2c6b5027a4010`, 기존 인증서 SHA256 `3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179`. 로컬 다운로드의 APK 해시와 metadata, ZIP 해시와 Actions digest를 각각 대조했다.
- 최종 APK의 실제 Hermes 번들에서 Supabase 호스트가 이번에 변경한 zymfblgzpidgfjjgrino 프로젝트 하나인 것도 확인했다. 이는 설치/실제 로그인 왕복 성공을 대신하지 않는다.
- 최초 be80ac9 빌드44841237718은 화살표 수정 전 자료로 보존하며 새 설치에는790453d 최종본을 사용한다. 실제 휴대폰 설치는 하지 않았다.

## 최종 Android 화면 검토

- 최종 [Android29 아티팩트](https://github.com/ssw3131/running-art-mobile/actions/runs/44844724324/artifacts/14683019806)는 source06c219f/dirty=false, 7단계·원본 보존·정리 통과, 재시도0이다. inquiry-board-result.json의 빈 작성/실제 등록/수정/운영팀 답변/비공개 목록/삭제/큰 글씨가 모두 true이고 email=false다.
- 해당 원본의 inquiry-answered-list·s6-notices를 열어 밝은 테마의 두 이동 화살표가 검은색으로 표시되는 것을 확인했다. inquiry-large-font-list·inquiry-large-font-reply에서 다크·1.6배 글씨의 고정 하단 버튼, 상태·답변 제목/날짜·긴 답변 본문을 검토했다. 캡처를 변경하거나 기준/마스크를 완화하지 않았다.
- 최종 [Android36 아티팩트](https://github.com/ssw3131/running-art-mobile/actions/runs/44844724324/artifacts/14684132915)는 같은 source06c219f/dirty=false, 15단계·원본 보존·정리 통과, 재시도0이다. 문의 실제 등록/수정/답변/삭제 등의 결과도 모두 true, email=false다. 기존 정적 4화면은 기존 시스템 Wi-Fi 마스크를 유지한 비교에서 차이0이다.
- API36의 inquiry-empty-form·inquiry-answered-detail·inquiry-large-font-list 원본을 열어 기존 이미지/이메일 없는 입력, 유형/상태/날짜와 긴 운영팀 답변 구분선, 다크·1.6배 글씨의 카드/태그/고정 하단 버튼을 확인했다. 긴 답변은 스크롤로 표시하며 하단 복귀와 답변 후 수정/삭제 숨김은 실제 시나리오 검사에서 통과했다.

## main 반영과 후속 — 2026-11-21 10:18 KST

- [PR77](https://github.com/ssw3131/running-art-mobile/pull/77)을 main `a679b4729973b28f1ecc48a94b5f03ba949740fb`에 squash 병합했다. 병합 후 실제 tree가 제품790453d·전체 CI06c219f와 같음을 다시 확인했다.
- [main44849299041](https://github.com/ssw3131/running-art-mobile/actions/runs/44849299041)은 동일 tree의 전체 성공 증거44844724324를 확인·재사용하여 필수 verification-gate가 통과했다. Android를 다시 실행한 결과로 세지 않는다. 로컬에도 최종 verified.json의 tree/source/run/suites/status를 보존했다.
- 운영·개인정보 관련 현재 설명을 이메일 없는 계약으로 맞추고, 기존 정책 게시본과 과거 실행 기록은 보존했다. 운영팀은 [운영 절차](../development/inquiry-board.md)에 따라 Table Editor의 reply_body만 편집한다.
- 최종 문서 전용 PR/main 필수 검사와 임시 브랜치 정리 결과는 해당 후속 PR에 기록한다. Git 제외 APK/metadata/해시·검증 원본과 기존 work 브랜치는 보존한다. 실제 휴대폰 연결 후 자료 유지 설치→문의 등록→Supabase 답변→앱 재진입 확인이 남아 있다.
