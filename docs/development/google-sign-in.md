# Google 로그인 서비스 설정

2026-10-02 Google Cloud와 Supabase의 로그인 연결 설정을 완료했다. **앱 로그인 화면·코드·빌드·휴대폰 설치는 이번 범위에서 제외했다.** 현재 검증은 Supabase 로그인 시작 요청이 Google 계정 선택 화면에 도달하는 데까지다.

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

## 확인한 동작과 한계

- 저장 후 Google 브랜드·연락처, 외부·테스트 중 상태, 테스트 사용자 1명, 민감하지 않은 범위 3개와 민감/제한 범위 없음, 웹 클라이언트와 콜백 URI를 확인했다.
- Supabase 제공자 설정을 다시 열어 Google 활성화와 Client ID·Secret 저장을 확인했다. 복귀 주소 화면도 다시 열어 정확한 주소 1개와 기존 Site URL을 확인했다.
- Supabase의 `/auth/v1/authorize`에 `provider=google`, `redirect_to=runningart://auth/callback`, `prompt=select_account`를 지정해 실제 브라우저에서 요청했다. Google의 `계정을 선택하세요.` 화면과 해당 Supabase 프로젝트 도메인을 확인했다.
- 계정 선택·최종 로그인 동의·인증 코드 교환·Supabase 세션 생성·앱 복귀는 수행하지 않았다. Client Secret을 사용하는 최종 코드 교환 성공과 앱 로그인 완료는 아직 미검증이다.
- 화면 증거는 Git 제외 `.cache/supabase-setup/google-client-saved.png`, `google-provider-enabled.png`, `oauth-redirect-saved.png`, `google-account-chooser.png`에 보관했다. 비밀 값이 보이는 화면은 저장하지 않았다.

## 이어서 할 앱 작업

1. Supabase 공개 연결 설정과 Google 로그인 버튼·시스템 브라우저 실행을 구현한다. Google Client Secret은 앱에 넣지 않는다.
2. `runningart://auth/callback` 수신, 로그인 취소·오류·중복 콜백, 인증 코드 교환과 세션 보관·갱신·로그아웃을 구현하고 검증한다.
3. 기존 SQLite 코스·완료된 러닝 자료의 소유권, 회원별 DB/비공개 Storage 접근 정책, 재전송·삭제·충돌·기기 복원을 설계하고 동기화를 구현한다.
4. 카카오·네이버 연결은 별도로 진행한다. 공개 출시를 위한 도메인·개인정보처리방침·Google 게시/검증 작업도 후속이다.

앞선 앱 작업에서 설치한 인증 관련 패키지와 Expo config plugin은 유지한다. 이번 설정 재개에서는 패키지·앱 소스·APK·휴대폰을 추가 변경하지 않았다. [실행 기록](../history/executed-plans/2026-10-02-2247-google-login.md) · [현재 상태](../handoff/status.md).
