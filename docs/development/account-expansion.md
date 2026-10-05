# 계정 확장 — 추가 소셜·프로필 사진

2026-10-05 작업. 실제 배포·활성화 여부는 [검증 기록](../quality/account-expansion-verification.md)과 [현재 상태](../handoff/status.md)를 우선한다.

**15:47 휴대폰 소셜 검증 완료:** 15:27:53에 동일 ID/서명의 통합 APK를 SM-S942N에 자료 유지 설치했다. 카카오·네이버의 취소/실제 인증/앱 복귀·닉네임/제공자 사진·이메일 없는 계정·강제 종료 후 세션 복원·로그아웃·Google 자료 분리를 통과했다. 최종 원래 Google 로그인·동기화 ON/대기 0건과 기존 자료 내용 해시를 보존했다. 사진 직접 업로드는 비활성이며 아래 사진 사용법은 구현된 준비 기능의 계약이다. 네이버 공개 검수도 별도다.

## 프로필 사진

마이페이지 → 프로필 편집 → 내 사진 선택 → 정사각형 자르기 → 미리보기 → 저장 순서다. 취소하면 업로드하지 않는다. 연결 계정 사진·닉네임 기본 이미지도 선택할 수 있고 제공자 원본 이름/사진은 바꾸지 않는다. 사진 선택 중·저장 중 중복 조작을 막고 계정이 바뀌거나 화면을 떠난 뒤 돌아온 선택 결과는 폐기한다.

Expo의 시스템 사진 선택기를 사용한다. 카메라·마이크 기능/권한을 추가하지 않는다. 선택 사진은 기기에서 최대 512×512 JPEG로 다시 인코딩하고 EXIF/XMP/IPTC/주석 및 파일 뒤의 부가 데이터를 제거한다. 변환 결과의 제한은 1MiB다. 개인 사진·좌표·토큰을 로그에 기록하지 않는다.

`profile-photos`는 비공개 Supabase Storage 버킷이며 소유자 UUID 아래의 SHA-256 파일명을 사용한다. 업로드는 덮어쓰기를 허용하지 않는다. 같은 파일이 이미 있으면 제한된 스트림으로 내려받아 해시를 대조한다. 앱은 1시간 서명 URL을 메모리에서만 사용하며 화면에 머무는 동안 만료 전에 갱신한다. 처음 읽을 수 없는 오프라인 상태에서는 닉네임 기본 이미지로 표시한다. 사진의 영구 오프라인 캐시는 이번 범위에 포함하지 않는다.

`save_account_profile` RPC는 현재 인증 사용자와 요청 소유자가 일치하는지, 탈퇴 진행 여부, 사진 경로/객체 존재를 검사한다. 닉네임·표시 방식·사진 포인터를 Auth의 `runpen_*` 필드에 한 트랜잭션으로 저장하고 다른 메타데이터는 보존한다. 앱은 저장 후 세션을 갱신해 서버 결과를 반영한다. SQLite 스키마와 기존 코스·러닝·동기화 계약은 바꾸지 않는다.

프로필 revision 비교로 다른 기기의 늦은 저장을 거절하고, 응답 유실 재시도에는 같은 변경 ID를 사용한다. 내용이 달라진 요청은 새 ID를 사용한다. 결과가 불명확할 때는 사진을 삭제하거나 성공으로 표시하지 않는다. 저장 성공 후 이전 사진과 하루 이상 지난 미참조 파일을 Storage API로 정리한다. 현재 참조 파일은 서버 정책으로 삭제를 막고, 정리 실패는 다음 저장이나 탈퇴에서 재시도한다.

탈퇴 함수는 기존 개인 기록 파일에 이어 프로필 사진을 100개씩 읽어 Storage API로 지운 뒤 Auth 계정을 삭제한다. 다른 사람의 사진·예상 밖 경로·조회 실패는 계정 삭제를 진행하지 않는다. 기존 기기의 코스·러닝 보관 정책은 그대로다.

## 적용 순서

1. `supabase/migrations/20261005040000_profile_photos.sql`을 기존 프로젝트에 적용한다.
2. `scripts/qa/bundle-account-function.mjs`로 생성한 사진 정리 포함 `delete-account`를 배포한다. 기존 활성화/서명 키와 `verify_jwt=false` 설정을 유지한다.
3. 실제 사진 업로드·본인/타인 권한·프로필 저장·갱신·교체·탈퇴를 일회용 계정으로 확인한다.
4. 완료한 환경의 `EXPO_PUBLIC_PROFILE_PHOTOS_ENABLED=true`로 앱을 빌드한다. 예시/기본값은 false이며 서버 준비 전에는 새 업로드 버튼을 노출하지 않는다.

기존 APK는 자동으로 갱신되지 않는다. 새 네이티브 의존성 때문에 새 APK가 필요하다.

## 카카오·네이버 등록

사용자는 10-05 두 개발자 콘솔에 직접 로그인하고 카카오를 우선했다. 개인 개발자로 앱 이름/회사명 `RunPen`, 건강/피트니스의 일반 앱 `1597696`을 직접 만들었다. 로그인 ON·닉네임/프로필 사진 필수 동의·아래 callback 등록과 로그인 Client Secret ON을 확인했고 사용자가 Supabase에 키/Secret 및 이메일 없는 로그인 허용을 저장했다. 저장되지 않았던 Kakao enabled 스위치를 후속으로 켜 공개 설정의 활성화까지 확인했다. 네이버는 후속에서 사용자가 RunPen을 직접 등록했으며 서버 연결·실제 인증과 별명/사진 보완 결과는 아래를 따른다.

Supabase 프로젝트는 기존 `running-art-mobile-dev`를 사용한다. 카카오의 Dashboard에서 확인한 OAuth callback은 `https://zymfblgzpidgfjjgrino.supabase.co/auth/v1/callback`이다. 앱 복귀 주소 `runningart://auth/callback`과 서로 다른 용도다. 카카오 REST API key/Client Secret, 네이버 Client ID/Secret은 해당 제공자와 Supabase 서버 설정에만 사용하며 앱·문서·Git에는 저장하지 않는다.

- 카카오: Supabase 내장 `kakao`, `Allow users without an email` ON. 앱은 `queryParams.scope = 'profile_nickname profile_image'`로 이메일 없는 동의항목을 명시한다. Supabase의 기본 Kakao scope에는 `account_email`이 들어 있고 `options.scopes`는 기본 목록에 추가만 하므로 이 설정만으로 이메일을 제외할 수 없다. 실제 기본 요청의 `KOE205 account_email` 오류와 수정 뒤 닉네임/사진 동의 화면을 확인했다. 임의 이메일은 만들지 않는다. Google 계정과 자동으로 합쳐지지 않는 별도 계정 흐름이며 기록 소유권을 이전하지 않는다.
- 네이버: Supabase `custom:naver` OIDC, issuer `https://nid.naver.com`. 실제 등록 화면의 callback을 대조하고 discovery·PKCE·nonce 검증과 프로필 매핑을 확인한다.
- 앱 공통 S256 PKCE·취소/복귀·계정 소유권 처리는 기존 구현을 유지한다. 실제 연결이 완료된 제공자만 `EXPO_PUBLIC_AUTH_KAKAO_ENABLED`/`EXPO_PUBLIC_AUTH_NAVER_ENABLED`로 켠다.

공식 근거: [Supabase Kakao](https://supabase.com/docs/guides/auth/social-login/auth-kakao), [Custom OAuth/OIDC](https://supabase.com/docs/guides/auth/custom-oauth-providers), [Expo SDK 57 ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [ImageManipulator](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/).

카카오가 반환한 `http://k.kakaocdn.net/…` 사진은 동일 CDN의 HTTPS로 바꿔 표시한다. 임의 HTTP·유사 도메인·비표준 포트·사용자정보가 포함된 URL은 계속 거절한다. 카카오 API의 `secure_resource` 기본값은 false이며 Supabase의 Kakao 제공자는 이 옵션을 별도 지정하지 않는다. 실제 로그인 응답의 형식과 변환된 HTTPS 이미지 200을 확인했다. [카카오 사용자 정보](https://developers.kakao.com/docs/ko/kakaologin/rest-api#req-user-info)·[Supabase 제공자 구현](https://github.com/supabase/auth/blob/master/internal/api/provider/kakao.go).

### PC 카카오 연결 확인

`node --env-file=.env.local scripts/qa/kakao-hosted.mjs --verify-kakao`는 기존 Site URL인 `http://localhost:3000`의 loopback 서버를 연다. 앱의 controller와 S256 PKCE를 그대로 사용하고 시험 복귀 주소만 localhost로 바꾼다. 브라우저에서 사용자가 직접 동의한 뒤 코드 교환·프로필 매핑·새 SDK/controller 복원·세션 갱신·시험 세션만 로그아웃을 확인한다. 토큰/프로필은 메모리에만 두고 결과 파일에는 개인 식별 정보를 남기지 않는다. 계정 삭제·원래 프로필 수정·러닝 자료 전송은 수행하지 않는다. 15분 뒤 서버를 종료하므로 시간이 지나면 다시 실행한다. 이 확인은 Android의 앱 복귀/보안 저장소 검증을 대신하지 않는다.

### 네이버 등록·서버 연결 — 2026-10-05 후속

사용자가 RunPen 네이버 앱을 등록했고 저장된 네이버 로그인·별명 필수/사진 추가(선택)를 확인했다. PC 웹과 Mobile 웹을 추가했으며 서비스 URL은 현재 RunPen 공유 안내가 표시되는 `https://runpen-shared-runs.ssw3131.workers.dev/`, callback은 위 Supabase 주소다. 네이버 네이티브 SDK가 아닌 서버 OAuth 흐름이므로 이 두 웹 환경을 사용한다. 현재 개발 중 상태로 등록 멤버만 로그인할 수 있으며 공개 서비스용 네이버 검수는 별도다.

Supabase 설정: Identifier 입력란은 `naver`(UI가 `custom:`를 붙임), 이름 네이버, Auto-discovery, issuer `https://nid.naver.com`, scopes `openid, profile`, Allow users without email ON. discovery URL은 비워 표준 경로를 사용한다. 사용자가 네이버 발급 Client ID/Secret을 직접 넣어 생성했고 `custom:naver / oidc / Enabled`를 확인했다. PKCE/nonce 검증은 기본 설정을 유지한다.

실제 네이버 OIDC 응답은 식별 claim만 제공해 Supabase 기본 메타데이터에 별명/사진이 없었다. `src/modules/auth/naver-profile.ts`는 로그인 직후 세션의 provider token으로 공식 `https://openapi.naver.com/v1/nid/me`를 조회하고, 인증된 `custom:naver` identity의 `sub`와 응답의 `id`를 대조한다. 15초 제한·리다이렉트 거절·현재 계정 확인 뒤 표시용 `runpen_naver_nickname`/`runpen_naver_avatar_url`만 저장한다. 이메일이나 추가 개인정보는 저장하지 않는다. [네이버 공식 프로필 API](https://developers.naver.com/docs/login/devguide/devguide.md#3-4-5-접근-토큰을-이용하여-프로필-API-호출하기).

사용자가 정한 `runpen_nickname`·사진 표시 방식·업로드 사진·revision은 보존한다. 사진 미동의/철회 시 제공자 사진은 null로 지우며 과거 사진으로 되돌아가지 않는다. 조회/저장 실패는 이미 성공한 로그인과 구분해 안내하고 재로그인 시 다시 시도한다. 이후 세션 복원/갱신은 저장된 표시 정보를 사용하므로 네이버 토큰 갱신·Client Secret의 앱 저장은 필요 없다.

PC 확인은 공통 `node --env-file=.env.local scripts/qa/social-hosted.mjs --verify-naver`를 사용한다. 기존 카카오 명령은 호환 진입점으로 유지한다. 동의된 프로필 API와 식별자/별명을 대조하고 HTTPS 사진·새 SDK/controller 복원·갱신·PC 세션 종료를 확인하며 결과 파일에 개인 값/토큰을 남기지 않는다. 실제 네이버 검증 성공 후 로컬 `EXPO_PUBLIC_AUTH_NAVER_ENABLED=true`를 켰다. 후속 Android 앱 복귀·보안 저장 세션의 새 프로세스 복원까지 통과했고 공개 네이버 검수는 별도다.
