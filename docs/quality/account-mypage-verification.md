# 계정·마이페이지 검증 — 수정된 두 작업 목표 완료

날짜: 2026-10-03~04. **10-04 사용자 수정 목표인 탈퇴 서버 배포·연동 시험, 기존 Google 프로필 저장·재로그인 검증을 완료했다.** Figma·카카오/네이버는 이번 목표에서 제외했다. 전체 서비스 UI·추가 계정 기능은 [후속 범위](../development/account-mypage.md#남은-범위)로 남긴다. 아래 과거 ‘미배포/실제 프로필 미검증’은 해당 시점의 이력이다.

## 최신 휴대폰 후속 — 2026-10-04 13:06~13:27

사용자가 휴대폰 연결 후 **“설치하고 화면·프로필 확인”**을 승인했다. 최초 두 작업의 설치 보류는 이 범위에서 해제됐으며 아래 서버/PC 시험 당시의 ‘미설치’와 구분한다.

- SM-S942N·Android 16에 **13:18:40 KST** 업데이트. 파일 `build/install/running-art-0.1.0-20261004-account-verified.apk`, 96,852,162바이트, arm64/x86_64, SHA-256 `cc45df3904d3f88ccc0c89a018d639aa83d99e857664a9214e81c39d7c5c6c18`. 실제 설치 파일 해시도 동일하다. ID `com.runningart.mobile.dev`, 서명 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 유지.
- 현재 통합 소스의 release 빌드 성공(9분 9초), 전체 자동 검사 **301개 재통과**. 기존 안내 재개 수정과 GPS/계정/탈퇴 활성화를 포함한다. 이번 휴대폰에서는 계정 화면을 검증했으며 새로운 야외 GPS·잠금 장시간 시험으로 확대하지 않는다.
- 기존 로그인 상태 그대로 마이페이지 진입, 누적 0.72km·14분·2회/완주 0회 집계, 프로필 편집·변경 없는 저장 비활성 확인. 시험 닉네임 `RunPenPhoneQA`·기본 이미지 저장 후 마이페이지 반영, 별도 정상 Google 세션의 실제 Auth 응답과 일치를 확인했다.
- 앱 완전 종료/재실행 후 닉네임·기본 이미지·로그인 복원 통과. 편집 취소 확인창을 확인한 뒤 원래 한글 닉네임/연결 사진을 UI에서 저장했다. 서버에서는 원래 없던 RunPen 키까지 복구했고 전체 메타데이터 SHA-256 `039732e7ec09027d83f2cd2910236ade3823ca6d9c9d635683c5395fa8fa6be2`가 원래 값과 같다. 최종 재실행에서도 같은 계정/원래 이름·연결 사진 유지.
- 개인 동기화 ON·대기 0건·전송/복원 0건, 탈퇴 기기 보관 문구·사용 가능한 버튼을 확인했다. **휴대폰의 실제 탈퇴 버튼과 탈퇴 재개 버튼은 누르지 않았다.** 기기 삭제/보관 전체 흐름은 위 서버/PC 합성 SQLite 검증 범위다.
- appId, 최초 설치 시각, 데이터 경로·inode 유지. 읽기 전용 서명 도우미로 다음 기존 행 전체를 대조했다. 러닝에 추가된 열 7개는 모두 null이고 기존 18열은 동일하다. 다른 세 테이블은 전 열이 동일하다.

| 기기 자료 | 수 | 기존 열 전후 동일 SHA-256 |
| --- | --- | --- |
| 코스 | 1 | `2df4b823aae31a450948df62f96fd85fa137fad1f0a21f1c6c0de914e82174a2` |
| 러닝 | 2 | `f544d3892464efcc7c65789a2b53921f95db04b1d3128faaae39f8dd9a477faa` |
| GPS 좌표 | 209 | `3586c7db820bc3e3bc8f2bab96bb2ec8de2a4315eb30602254da663c56f7c8b6` |
| 메모 | 1 | `39a4b30e2fdb9880a1c87f63592f16268f1f74d8f6a2619e9672f1315fef3c82` |

검증 도구: `scripts/qa/account-phone.py`, `verify-account-phone.py`, `account-ui/NicknameInput.java`·`build-account-ui.ps1`. 입력 도우미는 표시된 RunPen 닉네임 칸만 Accessibility API로 편집하고 저장 버튼/DB/인증 저장소를 건드리지 않는다. 시험 후 도우미 패키지 2개와 기기 임시 파일을 제거했으며 앱 실행 서비스 없음·USB 분리 가능. 별도 PC 인증 서버와 임시 프로필 백업도 복구 성공 대조 후 정리했다. 사용자 위치/계정 원문 증거는 무시된 로컬 캐시에만 있다.

[개인정보 없는 휴대폰 대조 결과](account-phone-verification.json) · [휴대폰 탈퇴 안내 화면](assets/account-withdrawal-phone-20261004.png)

## 실제 서버 후속 — 2026-10-04 12:20~13시, PC·Supabase

- 기존 `running-art-mobile-dev`에 탈퇴 SQL과 `delete-account` Edge를 배포했다. 소스 4개를 합친 단일 파일의 SHA-256은 `4d7b32cbed62c107cfd5ca42330d91d198f026b909dad245d52a35b32d789409`이다. Dashboard 편집기 전체 소스를 원본과 대조하고 배포했으며 `verify_jwt=false`를 재조회했다. 본인 Auth/서명 확인표 검증은 함수 안에서 계속 수행한다.
- 서버 전용 확인표 키와 활성화 플래그를 등록했다. 등록 전 실제 503 `unavailable`, 등록 후 무인증 prepare 401 `authentication_required`를 확인했다. 관리 키/확인표 키는 앱과 저장소에 넣지 않았다.
- `supabase/tests/account_deletion.sql`을 실제 PostgreSQL에서 실행해 현재/탈퇴 중/삭제된/다른/익명 계정, 서비스 역할 RPC, Storage RLS, 동일 변경 재시도 차단, FK 삭제를 통과했다. 테스트 트랜잭션은 롤백됐다. 기존 자료가 있는 서버에서도 검사할 수 있도록 마지막 두 cascade 단언을 합성 계정 소유자 범위로 수정했으며 로컬 PGlite도 재통과했다.
- `scripts/qa/account-hosted.mjs --run-disposable` 실제 시험은 **12:45:40~12:46:07 KST**에 통과했다. 관리자 화면에서 이메일 발송 없이 만든 일회용 계정 2개에 앱의 코스/러닝 저장소·동기화 엔진을 연결했다. 계정마다 코스 1개·2좌표 러닝 1개를 업로드했다. Android 기기를 사용한 시험은 아니다.
- A 계정의 실제 파일 501개(참조 파일 2개·미참조 합성 파일 499개)를 만들고 HTTP 202의 500개 삭제 후 재시도→잔여 파일/Auth 삭제 200을 확인했다. 삭제 도중 아직 살아 있는 JWT의 요약 조회·업로드·동일 변경 커밋 재시도가 차단된다. 다른 계정의 확인표로 삭제 요청하면 403이다.
- 요청 전 네트워크 오류와 실제 삭제 성공 응답 폐기를 시험 클라이언트에 주입했다. 확인표·기기 기록을 보존하고, 새 controller/로그인 없는 상태에서 실제 status 200 `deleted`로 복구했다. **서버 장애를 인위적으로 발생시킨 것은 아니며** 오류 주입 지점은 클라이언트 경계다.
- 보관 결과는 PC SQLite 코스 1개·러닝 1개·GPS 2좌표다. 소유권/동기화 메타데이터를 제외한 행 내용과 모든 GPS 행이 같고 비로그인 저장소 API로 다시 열린다. 코스 내용 SHA-256 `3ad3a0b82d37643c0e83f5f51b33cd16c17b04919de0761bd7994e559169a195`, 러닝 `ce5bd8e1e96ad01bbd07e74dcf038180bace20ad3eadf2eed0b330a8dc2329a2`, GPS `7f93232fd1ad106badc149f643e82b2b6bcf4b5b153ab0a1b88a82d4a0f69c0d`.
- A 삭제 전후 B의 요약 행 전체와 내려받은 파일 해시가 같았다. A 삭제 후 기존 JWT 쓰기와 재로그인은 거절됐다. B도 배포 API로 탈퇴시켰고 두 확인표 모두 실제 삭제 완료를 반환했다. 시험 계정/파일/진행 행은 정리됐다.

| 실제 사용자 서버 자료 | 적용 전 | SQL 적용 직후 | 일회용 계정 정리 후 |
| --- | --- | --- | --- |
| Auth 계정 | 1 | 1 | 1 |
| 개인 요약 행 | 4 | 4 | 4 |
| 개인 Storage 객체 | 3 | 3 | 3 |
| 요약 전체 행 정렬 MD5 | `683f8620b70b2d74cfa86d175f0819a3` | 동일 | 동일 |
| Storage 객체 메타데이터 전체 행 정렬 MD5 | `c1f73dd4008742594fe6c274de50b16f` | 동일 | 동일 |

Storage MD5는 객체 메타데이터 비교이며 기존 사용자 파일 바이트의 새 다운로드 검사는 아니다. 실제 사용자 계정을 삭제하거나 휴대폰을 조작하지 않았다.

### 기존 Google 프로필

`scripts/qa/profile-hosted.mjs --verify-google`의 loopback 페이지에서 Chrome의 기존 Google 계정을 정상 OAuth로 두 번 인증했다. 기존 Supabase 소유자·Google identity가 맞는지 먼저 확인했다. **12:52~12:53:17 KST**에 다음을 통과했다.

1. 빈 닉네임은 앱 `saveProfile`에서 거절되고 서버 메타데이터가 그대로다.
2. 공백을 포함한 한글/이모지 시험 닉네임을 정규화해 저장하고 `runpen_picture=initials`를 저장했다. 실제 Auth `getUser` 응답과 앱 상태가 같고 다른 메타데이터는 유지됐다.
3. 같은 저장소를 읽는 새 SDK/client와 앱 controller를 만들어 세션·프로필 복원을 확인했다. 이는 PC 메모리 저장소의 재생성이며 Android SecureStore 또는 OS 프로세스 재시작 검증으로 확대하지 않는다.
4. 시험 세션만 local 로그아웃한 뒤 두 번째 Google OAuth 로그인에서 두 필드 유지와 같은 소유자를 확인했다. 휴대폰 세션의 전역 로그아웃은 호출하지 않았다.
5. 원래 프로필 전체를 복구했다. 원래 없던 키까지 제거한 후 메타데이터 전체 일치, SHA-256 `039732e7ec09027d83f2cd2910236ade3823ca6d9c9d635683c5395fa8fa6be2`의 전후 동일을 확인했다. 시험 세션·토큰 메모리를 정리했다.

로컬 시험 페이지의 최초 요청은 Referrer 정책 때문에 Origin 단언에서 거절됐고, 프로필 변경 전에 정책을 수정해 정상 시험을 완료했다. 초기 실패를 프로필 저장 실패로 집계하지 않는다.

### 앱 활성화·산출물

서버 시험 후 `.env.local`의 공개 탈퇴 플래그만 true로 켰다. `.env.example`과 다른 서버 환경의 기본값은 false이며 추가 소셜 플래그는 켜지 않았다. 서버·앱 타입/린트 통과. `export:android --source-maps --output-dir .cache/account-hosted-export` 성공, Hermes 바이트코드 실제 SHA-256 `d4dda9cc84939206342499ae37789d571de42a1a6fccf02f2d5027ac25611207`. 기존 APK와 휴대폰 설치본을 갱신하지 않았다.

재현 도구는 `scripts/qa/{bundle-account-function,account-hosted,profile-hosted}.mjs`, 비밀 없는 결과는 `.cache/account-hosted-qa/{bundle,hosted-result,profile-result}.json`이다. 일회용 자격 정보·원래 프로필 파일과 로컬 서버는 정리했다. 기존 기능의 전체 301개 검사에 더해 실제 서버/프로필 시험을 수행했으며, hosted 시험은 일반 `npm test`에 넣지 않았다.

[실제 함수 설정 증거](assets/account-function-20261004.jpg) · [프로필 검증·복구 증거](assets/account-profile-20261004.jpg)

## 이전 후속 — 탈퇴 기기 보관·목표 범위 변경

2026-10-04 사용자 지시로 Figma 디자인 적용·대조를 이번 목표에서 제외하고, 탈퇴 기기 자료를 보관하도록 확정했다. 따라서 아래 과거의 ‘정책/Figma 대기’는 현재 미완료 조건이 아니다.

- `tests/account-withdrawal.test.mjs` 새 17개 통과. 실제 SQLite와 서버의 실제 HMAC/요청 handler를 앱 controller/HTTP adapter에 연결한 로컬 통합 검사다. 실제 Supabase·Edge 배포 검증으로 확대하지 않는다.
- 전체 `npm test` 301개 통과(`.cache/account-qa/tests-with-withdrawal.log`). 앱 TypeScript·ESLint 통과. 검사의 TypeScript 매개변수 속성 미지원 오류를 표준 필드 선언으로 수정한 뒤 통과했다.
- 마지막 지연 OAuth 콜백 잠금 보완 후 인증 관련 47개(`withdrawal-auth-tests.log`)와 실제 보관 자료의 코스/러닝/안내/좌표 읽기를 강화한 최종 탈퇴 17개(`withdrawal-final-tests.log`) 재통과. 최종 타입/린트 로그는 `.cache/account-qa/withdrawal-check.log`다.
- 비어 있지 않은 v6→v7 전 테이블 행 보존, 탈퇴 후 코스·러닝·GPS/안내 사본·메모 내용 보존, 기존 비로그인/다른 계정 보존, 기존 설정 유지/새 기본값, 다른 계정 자동 연결 없음 확인.
- 진행 중 러닝 거절/종료 후 재시도, 진행 표식 이후 동기화/새 러닝·코스 쓰기 차단, SQLite 중간 실패 전체 롤백, SecureStore 쓰기/읽기 대조 실패 시 삭제 요청 없음 확인.
- 605개 파일 배치 계속 처리, 서버 삭제 응답 유실·세션 만료/앱 재시작 후 조회, 401/404/503 실패 보존, 다른 계정으로 삭제 재개 거절·다른 계정 세션 유지, 만료 확인표 재발급/확인 불가 안내, 기기 보관 후 세션/저장소 정리 실패의 만료 후 재시도 확인.
- `npm run export:android -- --output-dir .cache/account-withdrawal-export`로 Hermes Android 번들 생성 성공(`.cache/account-qa/withdrawal-export.log`). 새 네이티브 APK 빌드·이번 탈퇴 UI 에뮬레이터/휴대폰 설치·실제 화면/인증 시험은 하지 않았다. 이전 APK에는 이번 탈퇴 처리가 포함되지 않는다.
- 최종 보완 후 번들도 재생성했다. 파일은 `_expo/static/js/android/index-4e6c4eacbbbae3c81e5f4111db66eb42.hbc`다.
- 서버 SQL/Edge와 실제 `.env.local`은 변경하지 않았다. 앱의 `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED`는 기본 비활성이고 실제 서비스 배포/시험 후 켠다. 기존 APK/휴대폰을 탈퇴 가능 버전으로 보고하지 않는다.

공유 작업 트리의 별도 안내 Kotlin/runtime·실기기 문서 변경은 보존했다. 이 계정 작업의 미설치/미조작과 다른 작업의 안내 APK 설치 이력을 구분한다.

## 자동 검사

- 전체 `npm test`: 258개 통과. 로그 `.cache/account-qa/tests.log`.
- 마지막 계정·SDK 보완 후 `node --test tests/account.test.mjs tests/auth-sdk.test.mjs`: 10개 통과. 실제 설치된 Supabase SDK가 본인 토큰으로 `PUT /auth/v1/user`를 호출하고 프로필 메타데이터를 세션에 유지하는 계약을 확인했다. HTTP는 로컬 응답 모형이며 실제 Supabase 계정 저장의 증거가 아니다.
- `npm run check`: TypeScript·ESLint 오류/경고 없음. 로그 `.cache/account-qa/check.log`.
- v5→v6에서 기존 코스·메모·GPS 좌표·안내 사본/체크포인트·동기화 내용 보존 및 중복 마이그레이션을 실제 SQLite로 확인했다.
- 비로그인/A/B 계정 설정 분리, 저장 도중 계정 변경 롤백, 종료 기록/확정 완주만 집계, 기존 러닝의 옵션 불변, 새 러닝의 기본값 반영을 확인했다.
- 닉네임 정규화·길이·제어 문자, 사진 HTTPS 검증, 프로필 실패/오프라인 보존·중복 저장/로그아웃 직렬화·메타데이터 외 값 보존을 확인했다.

## 에뮬레이터

`scripts/qa/account-emulator.py prepare|run|restore`는 대상을 에뮬레이터로 고정한다. 원래 SQLite v4는 모든 테이블이 빈 검증용 DB였으며 `.cache/account-qa/original.db`에 보존했다. 비어 있지 않은 자료의 마이그레이션 증거는 위 SQLite 자동 검사이며, 이 빈 에뮬레이터 결과를 사용자 휴대폰 자료 보존 검증으로 보고하지 않는다.

확인한 화면과 동작:

1. 마이페이지의 Google 진입·실제 0건 집계·기록 링크 표시.
2. Wi-Fi/데이터를 끈 뒤 어두운 테마·음성 끄기·화면 꺼짐 안내 끄기·집중 모드 저장.
3. Android 앱 설정 진입·복귀 및 권한 상태 재표시.
4. 앱 강제 종료 후 재실행하고 SQLite에서 설정 값 재확인.
5. 비로그인으로 프로필·동기화 경로에 직접 진입하면 로그인 안내.
6. 기존 테이블 내용 해시 불변. 시험 후 원래 DB의 버전·모든 테이블 내용 해시를 동일하게 복원하고 기존 연결 상태로 복귀.

증거는 `.cache/account-qa/ui-report.json`, `guest-account.png`, `settings-dark.png`, `settings-guidance.png`, `settings-restarted.png`, `restored.json`이다. 어두운 테마 상태 표시줄 대비를 화면 확인 후 보완했다. 최종 APK 확인 결과는 아래에 이어 기록한다.

## APK와 최종 확인

- 최종 APK: `build/install/running-art-0.1.0-20261003-account.apk` (96,816,534바이트).
- SHA-256: `4929595485e9f0b31cd6f052a95c677f5b8e855924eda308a6b7d5157d7fc069`. 최종 에뮬레이터 설치본의 해시와 일치한다.
- 기존 `course-gps.apk`와 같은 서명 인증서 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, 기존 appId `com.runningart.mobile.dev` 유지.
- 최종 보완본에서 위 에뮬레이터 시나리오를 다시 통과했다. `settings-dark.png`에서 상태 표시줄이 밝게 표시되는 것을 확인했다.
- 번들 source map에 포함된 변경 TS/TSX 17개와 작업 소스를 대조했다. 줄끝 형식·파일 끝 빈 줄만 정규화해 전부 일치한다(`source-map-check.json`).
- 2026-10-03T20:08:29+09:00 최종 확인 후 원래 SQLite v4 검증 DB·테이블 해시와 Wi-Fi ON/모바일 데이터 OFF 상태를 복원했다.
- **휴대폰에는 설치하지 않았다.** 이 APK의 기기 설정 저장은 SQLite v6를 사용하며 이전 앱으로 설치만 되돌려 데이터 호환을 가정하지 않는다.

## 서버 탈퇴 준비본 로컬 검사

2026-10-04 서버 준비본 후속: `supabase/functions/delete-account/`와 탈퇴 SQL을 작성했으며 **미배포·앱 미연결** 상태다. 아래 로컬 검사는 실제 계정 탈퇴 완료를 뜻하지 않는다.

- 전체 `npm test` 267개 통과(`.cache/account-qa/tests-with-server.log`), 앱 타입·린트와 `npm run check:server` 통과.
- 새 9개 검사: 요청/본인 검증, 201개 페이지 처리·605개 이어하기, 다른 소유자/잘못된 경로 거부, 부분 파일 삭제/단계별 실패·재시도, Auth 응답 유실, 실제 설치 SDK의 사용자/관리자 토큰 분리·본인 경로·삭제 순서. HTTP는 로컬 응답 모형이다.
- PGlite 0.5.8에서 실제 PostgreSQL SQL 실행: 정상/삭제 중/삭제 후/다른 계정/익명 권한, 관리자 전용 RPC, 파일 접근·업로드 차단, 기존 커밋 재시도의 우회 차단, FK 정리·다른 계정 보존 통과. 모든 합성 행 롤백 확인. `npm run test:account-server`로 재현한다.
- 실제 Supabase Auth/Storage 바이트·Edge/Deno·서로 다른 DB 세션의 잠금 경합·네트워크 응답 유실 후 앱 복구는 미검증이다. 서버 준비본은 기존 APK에 포함되지 않으며 앱 소스/APK 해시는 변하지 않았다.

## 추가 소셜 앱 연결 검사 — 2026-10-04

- `node --test tests/auth-providers.test.mjs tests/auth.test.mjs tests/auth-sdk.test.mjs tests/account.test.mjs`: 31개 통과. 이후 전체 `npm test`: 274개 통과(`.cache/account-qa/tests-with-providers.log`), 앱 타입·린트 통과.
- 선택 제공자별 S256·코드 검증자 일치·콜드 스타트 복귀, 동의 거절/브라우저 취소·지연 복귀 차단, 동시 제공자 선택 방지, 기존 Google 세션 복원 중 추가 로그인 방지, 비활성/알 수 없는 제공자 차단을 확인했다.
- 설치된 Supabase SDK로 Google/Kakao/custom Naver의 실제 요청을 만들고 로컬 코드 교환 응답으로 검증했다. 실제 공급자 인증을 검증한 것은 아니다.
- 네이버 공식 discovery에서 OIDC 경로와 S256/RS256 지원을 확인했다. Supabase 실제 제공자 설정은 브라우저 탭 제어가 두 번 `Emulation.setFocusEmulationEnabled` 시간 초과로 실패하여 확인하지 못했다. 서버 설정·비밀 값은 변경하지 않았다.
- 추가 플래그는 기본 비활성이다. 기존 10-03 에뮬레이터 검증을 새 제공자의 실제 로그인 검증으로 확대하지 않는다. 최신 빌드 결과는 후속 기록을 따른다.

### 추가 소셜 코드 포함 APK — 2026-10-04T11:19:52+09:00

- `build/install/running-art-0.1.0-20261004-account.apk`, 96,818,646바이트. SHA-256 `83a1d4397ce2d993aa85a809af3b7ab0de36f1fd9a0b0acc93793a27565621b0`.
- Gradle `BUILD SUCCESSFUL in 13m 43s`, 846개 작업 중 47개 실행. 로그 `.cache/account-qa/providers-build.log`. 기존 ID `com.runningart.mobile.dev`와 서명 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`를 확인했다.
- 묶음 source map과 변경한 인증/마이페이지 소스 4개를 대조해 모두 일치했다(`providers-source-map-check.json`). 기본 카카오/네이버 플래그는 비활성이다.
- 이 APK는 **휴대폰·에뮬레이터에 설치하지 않았다.** 위 10-03 APK의 비로그인 에뮬레이터 결과와 구분한다. 실제 제공자 인증·로그인 상태 화면은 후속이다.
- 11:22 최종 작업 트리 확인에서 별도 러닝 안내 Kotlin·runtime·검사 변경을 발견했다. 소스 수정 시각(11:15)이 이번 빌드와 겹치므로 이 APK에 해당 안내 수정이 모두 포함되었다고 보장하지 않는다. 위 274개는 해당 검사 실행 시점의 결과이며 이후 추가된 안내 검사까지 포함한 수치가 아니다. 안내 수정과의 최종 통합 빌드/검증 후 설치 판단이 필요하다.

## 현재 미검증·미완료

### 탈퇴 응답 유실 후속 — 2026-10-04T11:33:59+09:00

서명된 조회용 확인표와 prepare/delete/status 서버 계약을 추가했다. `node --test tests/account-deletion*.test.mjs` 15개, `npm run check:server` 통과. 전체 `npm test`는 현재 작업 트리의 284개를 통과했으며, 이전 274개에 이번 확인표 검사 6개와 별도로 추가된 안내 runtime 검사 4개가 더해진 수치다(`.cache/account-qa/tests-with-receipts.log`).

실제 WebCrypto HMAC으로 변조·다른 키/프로젝트·발급 전/만료 시각·다른 계정 삭제 거절을 검사했다. Auth 삭제 성공 직후 응답이 유실되고 로그인 세션이 사라진 상황에서 저장한 확인표로 완료를 조회했다. 일반 404·권한 오류·서버 장애·다른 계정 응답은 완료로 처리하지 않았다. 설치 SDK의 GET 요청/오류 변환도 로컬 HTTP로 검사했다.

서버에는 확인표 보관 테이블을 추가하지 않았다. 전용 키 생성·클라우드 배포·실제 계정 삭제·앱 확인표 보관/기기 정리는 하지 않았다. 실제 Edge 게이트웨이·서버/Auth/Storage 통합과 24시간 만료 후 지원 흐름은 후속이다. APK는 이전 검증본을 그대로 두었다.

### 두 작업 완료 후 별도 후속

- 실제 Android 탈퇴 전체 흐름·보관/응답 유실 복구, 최신 APK의 실제 로그아웃 확인 흐름과 다른 휴대폰의 프로필 표시. 마이페이지/프로필·앱 재시작·동기화/탈퇴 안내는 위 실제 휴대폰 후속에서 통과했다.
- 카카오·네이버 실제 인증, Figma 디자인. 두 항목 모두 수정된 이번 목표에서 제외했다.
- 사진 업로드·전체 테마·서비스 전체 5탭·배지/안내. 기능을 완료로 표시하는 가짜 버튼·성공 응답을 넣지 않았다.

[사용법](../development/account-mypage.md) · [실행 기록](../history/executed-plans/2026-10-03-1828-account-mypage.md)
