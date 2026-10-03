# Google 로그인

2026-10-03 앱의 Google 로그인·앱 복귀·계정 표시·보안 세션 보관·갱신·이 기기 로그아웃을 구현했다. 2026-10-02에 완료한 Google Cloud·Supabase 설정을 재사용한다. **SM-S942N·Android 16에서 실제 Google 로그인 → 앱 복귀 → 계정 표시 → 앱 강제 종료/재시작 후 유지 → 로그아웃을 모두 통과했다.** 로그아웃 후 재시작·재로그인·기존 자료 보존도 확인했고 최종 기기 상태는 로그아웃이다. [검증 결과](../quality/google-sign-in-verification.md).

## 앱 사용법

1. 홈의 **Google 로그인 · 내 계정**을 열고 **Google로 로그인**을 누른다.
2. 시스템 브라우저에서 등록된 테스트 Google 계정을 선택하고 로그인한다. 테스트 중인 서비스이므로 Google 테스트 사용자로 등록된 계정만 사용한다.
3. `runningart://auth/callback`으로 복귀하면 내 계정에 이름·이메일을 표시한다. 앱을 종료하고 다시 열면 기기에 보관한 세션을 복원한다.
4. **이 기기에서 로그아웃**은 현재 Supabase 세션만 종료한다. Google 브라우저 계정 자체에서 로그아웃하거나 다른 기기의 세션을 종료하지 않는다.

취소하면 로그인 전 상태로 돌아가며 다시 시도할 수 있다. 네트워크·인증 실패는 토큰이나 서버 원문을 노출하지 않고 안내한다. 오프라인 로그아웃은 설치 SDK가 기기 세션을 삭제한 것을 확인한 경우 기기 로그아웃과 서버 종료 미확인을 구분한다.

코스·러닝·메모는 기존 SQLite에 유지한다. 로그인 없이 로컬 기능을 사용할 수 있고, 로그아웃으로 삭제하거나 Google 계정으로 업로드하지 않는다. 계정 간 동기화와 로컬 자료 소유권 이전은 별도 후속이다.

## 앱 연결 설정과 구현

Git 제외 `.env.local`에 `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 넣고 다시 빌드한다. `.env.example`은 빈 예시만 제공한다. 현재 개발 프로젝트의 공개 연결 설정은 연결했고 `/auth/v1/settings`에서 HTTP 200·Google 활성화를 확인했다. 공개 키는 앱에 포함되는 식별 설정이다. `sb_secret_`·`service_role`·Google Client Secret은 앱에 넣지 않는다. 설정이 없으면 계정 화면이 비활성 사유를 표시하며 로컬 기능은 계속 사용할 수 있다.

- `src/modules/auth/`: 공개 설정 검증, 정확한 콜백 주소 검사, Supabase 클라이언트, 인증 상태·로그인/로그아웃·취소·중복 콜백 처리.
- `crypto.ts`: Hermes에 Expo 네이티브 난수와 SHA-256을 연결한다. OAuth URL의 `code_challenge_method=s256`을 확인하며 `plain` 흐름은 시작하지 않는다.
- `secure-storage.ts`: 세션과 진행 중 로그인 정보를 Expo SecureStore에 보관한다. 긴 세션은 400코드포인트 단위로 나누고 새 조각을 저장한 뒤 참조를 바꾸므로 쓰기 실패 시 이전 세션을 유지한다. 세션을 일반 SQLite·AsyncStorage·로그에 기록하지 않는다.
- 진행 중 요청은 15분 동안 유효하다. 재시작 뒤 복귀에는 저장된 PKCE flow ID·verifier를 사용한다. 취소/로그아웃 이후 늦은 콜백은 새 로그인으로 처리하지 않는다.
- 홈·내 계정·콜백 화면과 루트의 최초/실행 중 딥링크 수신을 연결했다. 앱 전경에서 세션 자동 갱신을 시작하고 백그라운드에서는 중지한다.
- Android가 현재 검증 대상이며 웹 로그인과 iOS 검증은 제공하지 않는다. 저장 정보 복원은 UI용이며 향후 서버 자료 접근 권한은 서버의 Auth·RLS로 검사한다.

공식 참고: [Supabase 모바일 복귀](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) · [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow) · [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).

## 저장된 설정

| 항목 | 설정 |
| --- | --- |
| Google Cloud 프로젝트 | `Running Art Mobile` / `running-art-mobile` |
| 동의 화면 앱 이름 | `Running Art` |
| 대상·게시 상태 | 외부 / 테스트 중 |
| 지원·개발자 연락처 | 설정 당시 로그인한 관리자 Google 계정 |
| 테스트 사용자 | 같은 관리자 계정 1명 |
| 데이터 액세스 범위 | `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile` |
| OAuth 클라이언트 | `Running Art Mobile Supabase` / 웹 애플리케이션 |
| Google 승인된 리디렉션 URI | `https://zymfblgzpidgfjjgrino.supabase.co/auth/v1/callback` |
| Supabase 프로젝트 | `running-art-mobile-dev` / `zymfblgzpidgfjjgrino` |
| Supabase Google 제공자 | 발급한 Client ID·Client Secret 연결 / Enabled |
| Supabase Redirect URLs | `runningart://auth/callback` |

Google 클라이언트의 JavaScript 원본은 비어 있다. 이번 구성은 Supabase를 거치는 웹 OAuth 흐름이며 Android 네이티브 Google SDK 클라이언트는 만들지 않았다. Client Secret은 Google 발급 화면에서 Supabase 설정으로 직접 전달했으며 앱·환경 파일·문서·채팅에 값을 저장하지 않았다.

기존 Supabase Site URL `http://localhost:3000`, 신규 가입 허용·이메일 확인 켜짐, 수동 연결·익명 로그인 꺼짐, 기존 Email 제공자를 유지했다. Google의 `Skip nonce checks`·`Allow users without an email`도 꺼짐을 유지했다. 앱에서는 허용한 `runningart://auth/callback`을 명시해 복귀를 요청해야 한다.

관리 화면: [Google 브랜딩](https://console.cloud.google.com/auth/branding?project=running-art-mobile) · [Google 대상·테스트 사용자](https://console.cloud.google.com/auth/audience?project=running-art-mobile) · [Google 클라이언트](https://console.cloud.google.com/auth/clients?project=running-art-mobile) · [Supabase 제공자](https://supabase.com/dashboard/project/zymfblgzpidgfjjgrino/auth/providers) · [Supabase 복귀 주소](https://supabase.com/dashboard/project/zymfblgzpidgfjjgrino/auth/url-configuration).

## 2026-10-02 서비스 설정 검증 이력

- 저장 후 Google 브랜드·연락처, 외부·테스트 중 상태, 테스트 사용자 1명, 민감하지 않은 범위 3개와 민감/제한 범위 없음, 웹 클라이언트와 콜백 URI를 확인했다.
- Supabase 제공자 설정을 다시 열어 Google 활성화와 Client ID·Secret 저장을 확인했다. 복귀 주소 화면도 다시 열어 정확한 주소 1개와 기존 Site URL을 확인했다.
- Supabase의 `/auth/v1/authorize`에 `provider=google`, `redirect_to=runningart://auth/callback`, `prompt=select_account`를 지정해 실제 브라우저에서 요청했다. Google의 `계정을 선택하세요.` 화면과 해당 Supabase 프로젝트 도메인을 확인했다.
- 계정 선택·최종 로그인 동의·인증 코드 교환·Supabase 세션 생성·앱 복귀는 수행하지 않았다. Client Secret을 사용하는 최종 코드 교환 성공과 앱 로그인 완료는 아직 미검증이다.
- 화면 증거는 Git 제외 `.cache/supabase-setup/google-client-saved.png`, `google-provider-enabled.png`, `oauth-redirect-saved.png`, `google-account-chooser.png`에 보관했다. 비밀 값이 보이는 화면은 저장하지 않았다.

## 이어서 할 작업

1. 기존 SQLite 코스·완료된 러닝 자료의 소유권, 회원별 DB/비공개 Storage 접근 정책, 재전송·삭제·충돌·기기 복원을 설계하고 동기화를 구현한다.
2. 장시간 만료 후 갱신·오프라인 재시작·기기 보안 저장소 복원 실패·iOS를 후속 검증한다.
3. 카카오·네이버 연결은 별도로 진행한다. 공개 출시를 위한 도메인·개인정보처리방침·Google 게시/검증 작업도 후속이다.

기존 인증 패키지와 Expo config plugin을 사용한다. 2026-10-03에 앱 소스·네이티브 생성물·APK를 준비했고 10:49:20 KST에 휴대폰에 업데이트한 동일 APK로 목표 검증을 완료했다. [실행 기록](../history/executed-plans/2026-10-02-2247-google-login.md) · [현재 상태](../handoff/status.md).
