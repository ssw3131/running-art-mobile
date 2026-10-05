# 계정·마이페이지 사용법과 저장 계약

**2026-10-05 15:47 휴대폰 소셜 검증 완료:** Google·카카오·네이버 통합 APK를 SM-S942N에 설치하고 실제 앱 복귀·추가 소셜 재시작/로그아웃·프로필/계정 분리를 확인했다. 최종 기존 Google 계정·동기화 ON/대기 0건, 코스 2개·러닝 2건·209좌표·메모 1개 내용 해시 보존과 도우미 정리까지 완료했다. 아래 Android 후속은 이전 시점이며 사진 업로드와 네이버 공개 검수는 계속 별도다. [검증](../quality/account-expansion-verification.md).

**2026-10-05 후속:** [계정 확장](account-expansion.md)에 사진 선택/가공·비공개 저장·원자 프로필 저장·탈퇴 정리를 구현했고 서버를 배포했다. 카카오/네이버 등록·서버 연결·실제 PC 로그인/별명/사진·세션 복원/갱신을 완료해 로컬 두 제공자 플래그를 켰다. 네이버는 별도 프로필 API 보완을 포함한다. 실제 사진 API 왕복/활성화와 Android 추가 소셜 복귀·네이버 공개 검수는 후속이다. 아래 10-04 완료와 구분하며 [최신 상태](../handoff/status.md)를 우선한다.

2026-10-03~04 구현. **탈퇴 서버 배포·실제 연동과 기존 Google 프로필의 저장·세션 복원·재로그인 검증을 완료했다.** 10-04 사용자가 목표를 이 두 작업으로 수정했다. Figma 디자인·카카오/네이버는 후속이며 이번 완료 조건에 포함하지 않는다. 이어진 “설치하고 화면·프로필 확인” 승인으로 13:18:40에 실제 휴대폰 업데이트·마이페이지/프로필 저장·재시작 유지·원상 복구·자료 보존까지 완료했다. 탈퇴는 휴대폰에서 안내 화면만 확인했고 실제 사용자 계정을 삭제하지 않았다.

## 사용법

홈의 **로그인 · 마이페이지** 또는 **이름 · 마이페이지**로 진입한다. 비로그인 사용자는 기존 기기 기록을 계속 이용하고 Google·카카오·네이버로 로그인할 수 있다. 현재 네이버는 개발 중으로 등록 멤버만 이용할 수 있다. 각 제공자는 별도 계정이며 기존 계정의 기록이 자동으로 합쳐지지 않는다.

- 프로필 편집: RunPen 닉네임과 연결 계정 사진/닉네임 기본 이미지 중 표시 방식을 선택한다. 닉네임은 NFC 정규화 후 1~20 Unicode 코드 포인트이며 공백만·제어 문자·줄바꿈을 허용하지 않는다. 중복 닉네임을 허용하는 초기 구현이다. 사진 업로드·자르기는 제공하지 않는다.
- 기록: 현재 계정에 속한 기기 저장/복원 자료 중 종료한 러닝의 거리·활동 시간·횟수를 집계한다. 코스 완주는 `course_outcome='finished'`인 종료 기록만 센다. 진행 중 러닝·다른 계정·미복원 서버 자료는 포함하지 않는다. 기존 자유 러닝을 코스 완주로 바꾸지 않는다.
- 동기화: 기존 개인 기록 동기화 화면에서 켜기/끄기·지금 동기화·기기 기록 연결·충돌 선택을 제공한다. 로그인이나 프로필 저장만으로 기존 기기 기록을 서버로 전송하지 않는다.
- 설정: 계정 화면의 밝게/어둡게/기기 설정, 새 코스 러닝의 음성·화면 꺼짐 안내·지도/집중 기본값을 저장한다. 진행 중 러닝 설정은 그대로 유지된다. 화면 꺼짐 안내를 끄면 다음 코스 러닝은 앱을 벗어나거나 화면을 끌 때 일시정지된다.
- 위치 권한: OS의 전경/배경 권한·정확도·위치 서비스 상태를 읽고 앱 설정으로 이동한다. 복귀 시 다시 읽는다. 설정 화면 진입만으로 권한 요청이나 위치 수집을 시작하지 않는다.
- 로그아웃: 확인 후 이 기기 세션을 종료한다. 코스·러닝·전송 대기 자료는 유지한다. 진행 중 러닝의 계정 변경 방지는 기존 인증 제어를 사용한다.
- 회원 탈퇴: 계정과 서버 개인 자료를 삭제하되 이 기기에 저장된 코스·러닝·GPS 경로는 비로그인 기록으로 보관한다. 서버에만 있는 자료는 복원할 수 없다. 실제 서버 시험 후 공개 빌드 플래그를 켰으며 현재 휴대폰 설치본에도 적용됐다. 중단된 요청은 비로그인 상태에서도 마이페이지의 ‘탈퇴 요청 확인’으로 다시 확인한다.

## 저장과 책임

| 대상 | 저장소·변경 범위 |
| --- | --- |
| 닉네임·사진 표시 방식 | Supabase Auth의 본인 `user_metadata.runpen_nickname`, `runpen_picture`만 갱신. Google 원본 이름·사진과 다른 메타데이터는 유지 |
| 사진 원본 | 연결 제공자의 HTTPS 사진 주소. 로딩 실패·사진 없음이면 기본 이미지 |
| 계정 화면·안내 기본 설정 | SQLite v6 `account_preferences`, `owner_id`별 저장. 비로그인은 빈 문자열로 별도 저장 |
| 기존 코스·러닝·위치·동기화 | 마이그레이션은 기존 행을 보존. v6 설정 테이블, v7 탈퇴 진행 메타데이터/새 기록 차단 트리거 추가 |
| 탈퇴 요청·확인표 | 암호화 SecureStore에 소유자·확인 시각·서명 확인표 저장 후 다시 읽어 확인. SQLite v7 `account_withdrawals`에는 소유자·시작/기기 보존 완료 시각만 저장 |
| 새 코스 러닝 설정 | 러닝 시작 트랜잭션에서 해당 계정 기본값을 사본으로 저장. 이후 계정 기본값 변경은 기존 러닝을 변경하지 않음 |

프로필 저장에는 인터넷이 필요하며 실패하면 성공으로 표시하지 않는다. 저장 중 로그아웃·중복 저장을 막고 응답의 계정 ID를 확인한다. 화면을 떠난 뒤 완료되어도 다른 화면을 뒤로 이동시키지 않는다. 설정 저장은 오프라인으로 가능하며 저장 도중 계정이 바뀌면 트랜잭션을 롤백한다. 프로필 정보는 권한 판정에 사용하지 않는다.

공식 계약: [Supabase updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [사용자 메타데이터](https://supabase.com/docs/guides/auth/managing-user-data). 앱은 기존 공개 키와 사용자 세션을 사용하며 서버 관리 키를 추가하지 않는다. 아래 탈퇴 SQL/Edge는 10-04에 실제 적용·검증했다.

## 서버 탈퇴 — 2026-10-04 배포·연동 검증 완료

추가 소셜 로그인 준비는 아래 [추가 소셜의 앱 연결](#추가-소셜의-앱-연결--2026-10-04)을 따른다. 서버 탈퇴·Google 프로필 검증에 카카오/네이버 설정은 필요하지 않다.

`supabase/functions/delete-account/`와 `supabase/migrations/20261003111300_account_deletion.sql`을 기존 `running-art-mobile-dev`에 배포했다. 서버 `ACCOUNT_DELETION_ENABLED=true`와 전용 `ACCOUNT_DELETION_RECEIPT_KEY`를 등록하고, 시험 계정 2개의 삭제·501파일 분할 처리·응답 유실 복구를 통과했다. 그 뒤 로컬 `.env.local`의 공개 빌드 플래그 `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true`를 적용했다. 새 환경의 `.env.example`과 코드 기본값은 계속 false다. 서버 플래그/관리 키/확인표 키가 없으면 함수는 503 `unavailable`을 반환한다. 전용 키는 암호학적으로 무작위인 32바이트의 64자리 hex 값이며 서버에만 존재한다. 관리 키와 확인표 키를 앱 환경 파일에 추가하지 않았다. [실제 검증 결과](../quality/account-mypage-verification.md).

1. POST `{"action":"prepare"}`와 살아 있는 Bearer를 받아 Auth `getUser(token)`이 검증한 본인에게 조회용 확인표(`receipt`, `expiresAt`)를 발급한다. 이 단계는 자료를 삭제하거나 접근을 차단하지 않는다. 사용자 확인 후 앱이 확인표·소유자·확인 상태를 SecureStore에 저장하고 다시 읽어 대조한다. 다음 SQLite 트랜잭션에서 러닝 종료 여부를 확인하고 탈퇴 진행/동기화 중지를 기록한 뒤 삭제 요청한다. 저장 실패 시 삭제 요청하지 않는다.
2. POST `{"action":"delete","confirmation":"delete-my-account","receipt":"..."}`는 매 요청마다 살아 있는 본인 Bearer와 확인표의 소유자가 같아야 한다. 사용자 ID/파일 경로를 요청에서 받지 않으며 익명 사용자를 거절한다.
3. 서비스 역할 전용 RPC로 `account_deletions`에 진행 상태를 기록한다. 계정 단위 트랜잭션 잠금과 RLS·동기화 커밋 검사로 이후 접근/업로드/커밋을 차단한다. 이미 끝난 업로드의 잔여 파일도 삭제 대상이다.
4. 본인 `personal-records` 경로를 최대 100개씩 읽어 Storage API로 제거한다. SQL로 Storage 메타데이터를 삭제하지 않는다. 매번 남은 첫 페이지를 읽고 5배치 후 202 `deleting`으로 이어서 요청하도록 한다. 다른 소유자·예상 밖 경로는 실패한다.
5. 남은 파일이 없음을 다시 확인한 뒤 Auth 계정을 영구 삭제한다. 요약과 진행 상태는 FK로 함께 제거된다. 아직 만료되지 않은 JWT도 실제 계정 존재 검사를 통과하지 못한다. 다른 계정 자료는 범위 밖이다.

중간 오류는 503 `retry_required`이며 이미 지운 파일을 되돌리거나 접근 차단을 자동 해제하지 않는다. 인증이 유지되면 같은 삭제 요청으로 남은 처리를 재개한다. **401이나 일반 404를 완료 증거로 삼지 않는다.** 실제 사용자 자료로 이 기능을 시험하지 않는다.

Auth 삭제 성공 응답이 끊기면 POST `{"action":"status","receipt":"..."}`로 확인한다. 이 요청만 로그인 Bearer 대신 확인표의 HMAC-SHA256 서명·서버/용도/소유자·유효기간을 검증한다. 관리자 `getUserById`에서 정확히 404와 `user_not_found`를 함께 확인해야 `deleted`를 반환하며, 계정이 있으면 `not_deleted`, 다른 오류는 503이다. `not_deleted`는 일부 파일이 이미 삭제되었을 수 있어 취소/원상복구를 의미하지 않는다.

확인표는 24시간 동안 해당 계정의 존재 여부만 조회할 수 있고, 삭제 권한이나 프로필·기록 조회 권한은 없다. 서버에 별도 확인표/사용자 보존 행을 만들지 않는다. 확인표만으로는 새 삭제를 시작할 수 없으며 변조·다른 프로젝트·만료·키 변경 시 완료 여부를 추측하지 않는다. 만료되었는데 같은 계정으로 인증할 수 있으면 재발급해 저장하고, 계정이 이미 없어 확인할 수 없으면 자료를 유지한 채 지원을 요청하도록 안내한다. 이 예외의 실제 지원/수동 복구 경로는 운영 후속이다. 기기 자료는 확인표 만료만으로 자동 정리하지 않는다.

### 기기 자료 보관 정책 — 2026-10-04 사용자 결정

“탈퇴 시 일단은 기기자료 삭제하지 말자 필요시 이후 수정”을 적용했다. 서버의 명시적 `deleted` 응답을 받은 뒤 해당 소유자의 코스/러닝을 하나의 SQLite 트랜잭션으로 비로그인 소유권으로 바꾼다. ID·이름·경로 JSON/해시·GPS 좌표·거리/시간·코스 사본/안내·기존 시각·메모는 삭제하지 않는다. 기존 비로그인 자료와 다른 계정 자료도 유지한다.

이전 서버의 버전/재전송 식별자는 초기화하고 그 계정의 동기화 대기 삭제/충돌 메타데이터를 정리한다. 기존 계정 설정 행은 남기며 비로그인 설정이 없을 때만 사본으로 사용한다. 다른 계정에 자동 연결/업로드하지 않는다. 동기화의 ‘기기 기록 연결’을 사용자가 다시 선택해야 연결된다.

동기화를 중지하고 진행 중 러닝이 있으면 탈퇴 요청을 진행하지 않는다. SQLite 진행 표식 이후에는 해당 계정의 새 코스/러닝과 동기화 쓰기를 차단한다. 서버 응답 유실 후 앱 재시작/세션 만료 시 확인표로 완료를 조회하며 401/일반 404/장애를 성공으로 간주하지 않는다. 기기 보관 트랜잭션 실패는 전부 롤백하고 요청을 남긴다. 기기 보관 완료 후 세션/확인표 정리만 실패한 경우에는 완료 시각을 근거로 재시도하므로 확인표 만료 후에도 기록을 중복 변경하지 않는다. 복원 중 다른 계정이 로그인되어 있으면 그 계정을 로그아웃시키지 않는다.

`supabase/config.toml`과 실제 함수 설정 모두 해당 함수만 `verify_jwt=false`다. 삭제 후 무효화된 JWT 때문에 상태 조회가 차단되지 않도록 하되, `prepare`/`delete`는 함수 내부에서 Auth 서버 본인 검증을 계속 수행한다. 상태 조회도 서명 없는 요청은 거절한다. 실제 익명 요청 401·다른 계정 확인표 403과 삭제 후 서명 조회 200을 확인했다.

로컬 검증 명령(PowerShell, 모바일 루트):

```powershell
. .\scripts\env.ps1
npm.cmd run check:server
node --test tests/account-deletion*.test.mjs
npm.cmd install --prefix .cache/account-server-qa --no-audit --no-fund @electric-sql/pglite@0.5.8
npm.cmd run test:account-server
```

PGlite는 무시된 `.cache`에만 설치하며 앱 의존성에 넣지 않는다. PostgreSQL 엔진에서 두 마이그레이션과 권한/삭제 상태 검사를 실행하고 합성 행을 롤백한다. 실제 Supabase에서도 같은 트랜잭션 검사를 통과했다. `scripts/qa/bundle-account-function.mjs`는 소스 4개를 Dashboard 편집용 단일 파일로 만들며 비밀 값을 포함하지 않는다. `scripts/qa/account-hosted.mjs --run-disposable`은 무시된 `fixtures.private.json`의 일회용 계정 2개만 허용하고 실제 앱 저장/동기화·탈퇴 모듈과 별도 PC SQLite를 사용한다. 10-04 실제 Storage API 삭제·Auth 삭제·기존 토큰 재접근 차단을 통과했다. 여러 DB 세션을 고의로 겹치는 잠금 경합의 부하 시험은 이번 범위 밖이다.

`scripts/qa/profile-hosted.mjs --verify-google`는 `localhost:3000`의 정상 Google OAuth와 실제 앱 `saveProfile`을 사용한다. 개인 정보/토큰을 화면에 표시하지 않고, 원래 메타데이터는 무시된 캐시에 보존한 뒤 검증 종료 시 복구·대조한다. 시험 세션만 `scope: local`로 종료한다. 키가 원래 없던 경우 null 업데이트로 제거되는 [Auth 소스 계약](https://github.com/supabase/auth/blob/master/internal/models/user.go)과 실제 복구 결과를 확인했다. 이번 종료 후 자격 정보·프로필 원본 캐시와 로컬 서버는 정리했다. 스크립트는 외부 서버를 변경하는 수동 QA 도구이며 일반 자동 검사에 포함하지 않는다.

공식 근거: [관리자 계정 삭제](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [Storage 파일 삭제 API](https://supabase.com/docs/reference/javascript/storage-from-remove), [사용자 삭제·토큰/Storage 제약](https://supabase.com/docs/guides/auth/managing-user-data).

조회/인증 근거: [관리자 계정 조회](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid), [Auth 오류 코드](https://supabase.com/docs/guides/auth/debugging/error-codes), [함수별 인증 설정](https://supabase.com/docs/guides/functions/function-configuration).

## 추가 소셜의 앱 연결 — 2026-10-04

앱의 `authentication.signIn(provider)`는 `google`, `kakao`, `custom:naver`를 지원한다. 모두 기존 S256 PKCE·SecureStore·`runningart://auth/callback`을 사용한다. 요청 중 다른 제공자의 로그인을 시작하지 않으며 앱 재시작 후에도 선택한 제공자로 복귀한다. 이전 Google 전용 버전의 진행 중 로그인 저장 형식도 읽는다. Google의 계정 선택 옵션은 다른 제공자에 전달하지 않는다.

기본 앱에서는 **Google만 표시**한다. 실제 Supabase 제공자 설정·동의/취소·앱 복귀·세션 유지·프로필·로그아웃 검증을 끝낸 제공자에만 공개 빌드 플래그 `EXPO_PUBLIC_AUTH_KAKAO_ENABLED=true` 또는 `EXPO_PUBLIC_AUTH_NAVER_ENABLED=true`를 사용한다. 플래그가 없거나 정확히 `true`가 아니면 추가 버튼을 숨기고 직접 요청도 거절한다. 플래그만으로 외부 연동이 만들어지는 것은 아니다. 현재 로컬 실제 설정에 두 플래그를 추가하지 않았다.

| 제공자 | 서버 설정 방향 | 현재 증거·남은 검증 |
| --- | --- | --- |
| Google | 기존 Supabase Google·웹 OAuth 클라이언트·동일 앱 복귀 주소 | 기존 실제 휴대폰 인증 검증 유지. 새 공통 제어의 설치 SDK 회귀 검사 통과 |
| 카카오 | Supabase 내장 `kakao`, Kakao Developers REST API key/Client Secret·Supabase callback 등록 | 앱의 요청/복귀/취소·SDK 검사 통과. 실제 개발자 앱/서버 설정·동의 항목·이메일 없는 로그인·기기 복귀 미검증 |
| 네이버 | Supabase custom OIDC `custom:naver`, issuer `https://nid.naver.com`, 서버에서 discovery·client 자격 정보 설정 | 공식 discovery에서 RS256·S256·openid/profile·OIDC 전용 authorize/token 확인. 실제 토큰 교환의 state/nonce·프로필 매핑·이메일 선택·기기 복귀 미검증 |

카카오/네이버 Client Secret은 Supabase 서버 설정에만 저장한다. 네이버의 기존 OAuth2.0(`/oauth2.0/`)과 OIDC(`/oauth2/`) 경로를 혼용하지 않으며 nonce 검사를 임의로 끄지 않는다. 실제 프로필 항목을 검증하기 전 임의의 이메일을 만들어 가입시키거나 앱에서 사용자 ID를 조합하지 않는다. 계정별 SQLite 접근·동기화는 계속 Supabase 사용자 UUID를 기준으로 한다.

공식 근거: [Supabase 카카오](https://supabase.com/docs/guides/auth/social-login/auth-kakao), [Custom OAuth/OIDC](https://supabase.com/docs/guides/auth/custom-oauth-providers), [네이버 OIDC 개발 안내](https://developers.naver.com/docs/login/devguide/devguide.md), [네이버 공개 discovery](https://nid.naver.com/.well-known/openid-configuration). 2026-10-04 조회했으며 실제 사용자 인증 성공을 대신하는 증거는 아니다.

`tests/auth-providers.test.mjs`는 공개 플래그·선택/복귀·이메일 없음·취소·동시 요청·초기 세션 복원 중 계정 전환 방지와 설치된 SDK의 실제 S256/코드 검증자 일치를 검사한다. HTTP 응답은 로컬 계약 시험이며 외부 로그인은 아직 미검증이다.

## 남은 범위

1. 탈퇴 전체 흐름의 실제 Android 기기 보관·응답 유실 복구와 다른 휴대폰의 프로필 표시, 최신 APK의 실제 로그아웃 확인 흐름. 이번 휴대폰 마이페이지/프로필 저장·재시작·동기화/탈퇴 안내 검증과 구분한다.
2. 카카오·네이버 실제 설정·로그인, 프로필 사진 업로드·전체 앱/지도 테마·5탭·배지/서비스 안내. Figma 디자인은 사용자가 후속으로 미뤘다. 이 항목들은 수정된 두 작업 목표의 완료 조건이 아니다.
3. 확인표 만료 후 지원/수동 복구 운영 절차와 실제 출시 점검. 실제 사용자 계정을 검증 목적으로 삭제하지 않는다.
4. 휴대폰 보류는 사용자의 후속 승인 범위에서 해제됐고 최신 계정 APK를 자료 유지 설치했다. 이번에는 실제 사용자 탈퇴와 야외 러닝·배터리 검증을 수행하지 않았다.

[검증](../quality/account-mypage-verification.md) · [실행 기록](../history/executed-plans/2026-10-03-1828-account-mypage.md)
