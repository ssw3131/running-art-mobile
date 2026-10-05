# 계정 확장 구현·검증 — 2026-10-05

**18:19 후속:** 승인된 임시 계정 2개로 실제 사진 서버 7개 검사, 사진 ON APK의 휴대폰 선택/자르기/저장/재시작/오프라인 실패, 두 인스턴스 프로필 충돌·기록 동기화, 실제 Android 탈퇴/중단 복원/기기 보관을 통과했다. 임시 계정·자료·비밀 파일·도우미를 정리했고 기존 서버/폰 내용 해시는 보존했다. 사용자 복귀 후 원래 Google 계정·동기화 ON/대기 0건 확인까지 완료했고 사진 직접 업로드는 활성화됐다. 아래 사진 미검증/승인 대기와 과거 최종 로그인 상태보다 [최신 검증과 한계](remaining-verification-20261005.md)를 우선한다.

상태: 계정 확장 부분 완료, **소셜 로그인은 서버·PC·휴대폰 검증 완료** — 2026-10-05 15:47 KST. 사진 앱 구현·SQL/Edge 배포·전체 352개·release 준비본 완료. 두 소셜 서버 설정·실제 사용자 동의/이메일 없는 로그인·사진·PC 세션 복원/갱신·정리 완료. 네이버 프로필 누락을 수정했고 관련 59개·타입/전체 lint 통과. 휴대폰 통합 APK 적용·계정 분리·기존 Google 복귀와 원본 해시 보존까지 통과했다. 실제 사진 업로드/활성화·네이버 공개 검수는 후속이다. [계획 원문](../history/executed-plans/2026-10-05-1300-account-expansion.md) · [사용법/서버 계약](../development/account-expansion.md).

## 실제 휴대폰 후속 — 15:27:53 설치, 15:47 검증 완료

사용자의 “폰 연결했어 검증해” 요청으로 SM-S942N·Android 16에 아래 통합 social APK를 `adb install -r --no-streaming`으로 업데이트했다. 설치본 SHA-256 일치, 기존 appId 10319·최초 설치 `2026-09-27 16:29:39`·자료 경로와 Google 프로필 유지 확인. 제품 코드를 추가로 수정하거나 APK를 재빌드하지 않았다.

| 항목 | 실제 결과 |
| --- | --- |
| 카카오 | 취소/앱 복귀, 사용자 직접 인증 후 성공 메시지·닉네임/제공자 사진·이메일 없음, PID가 달라진 재시작 후 유지, 로그아웃 후 재시작 통과 |
| 네이버 | 동일한 취소/인증 복귀·닉네임·이메일 없음·새 프로세스 복원·로그아웃 통과. 제공자 기본 프로필 이미지 표시 확인 |
| 계정 분리 | 두 추가 계정 모두 코스/러닝 0건·거리 0·동기화 OFF/대기 0건. 기존 Google 소유 자료가 섞이지 않음 |
| 원래 계정 복귀 | 사용자 Google 재로그인 후 검증 전 이름/이메일 일치, 코스 2개·러닝 2회·0.72km·14분, 재시작 후 유지 |
| 최종 동기화 | 기존 ON 설정 유지·대기 0건·전송/복원 0건, 충돌/삭제 대기 0건 |

읽기 전용 검사 도우미로 원문 DB나 인증 저장소를 추출하지 않고 내용 해시만 대조했다. 변경 가능한 동기화 시각/상태를 제외한 내용과 소유자 ID를 비교한다.

| 자료 | 전후 개수 | 전후 동일 SHA-256 |
| --- | --- | --- |
| 코스 | 2 | `4bb985f6b2223c7607b44867e8aba0d77d9c48d8aeca791efc46c28d9c37f4de` |
| 러닝 | 2 | `f3ce10eed8596e1c0b8d04380f55288b73f21ddf1ca129f133b993cb2f7dd34b` |
| GPS 좌표 | 209 | `b6ef3a573ec5334bdfb353f8ec06ca8ffc0c3f5d5ab4503b292bbeb80a57c96b` |
| 메모 | 1 | `c30c777c63fa7efd60cbec6bd4d09ed534a62aaa8d49c458e3c2630e05798067` |

`scripts/qa/verify-social-phone.py`의 프로필·로그인/취소/재시작/로그아웃·계정 분리·자료 해시·설치 동일성 대조 5개 묶음 모두 통과했다. 증거는 무시된 `.cache/account-phone-qa/social-*`와 `.cache/social-phone/`의 설치/해시/PID/`result.json`이다. UI 증거의 실제 이름/이메일은 공유 문서에 옮기지 않는다.

검사 도우미 `com.runningart.authdigest`를 제거하고 임시 `runpen-phone-ui.xml`·`runpen-social-install.xml` 부재를 확인했다. 설치 중 Google 전송 선택은 거절했으며 보안 설정은 변경하지 않았다. 최종 Google 로그인·동기화 ON/대기 0건, 앱 실행 서비스 없음으로 USB 분리 가능하다. 사진 업로드·새 시험 계정 생성·계정 탈퇴는 수행하지 않았다. 아래 미설치/휴대폰 변경 없음 표현은 이전 준비/PC 검증 시점이다.

## 로컬 결과

- 새 사진 선택/미리보기·개인 Storage·원자적 프로필 저장·참조 파일 보호·탈퇴 정리 코드를 추가했다.
- 최종 전체 자동 검사 **352개 통과**, 실패/건너뜀 0. 사진 관련 6개에 응답 유실 재시도 중 닉네임 변경도 포함한다. 관련 계정/탈퇴 최초 25개도 통과했다.
- `npm run test:account-server`: PGlite 실제 PostgreSQL 엔진에서 기존 계정 삭제와 새 사진 정책 검사가 통과했다. 타인/익명/탈퇴 중 접근 거절, 파일 존재 검사, 프로필 원자 저장·충돌/멱등·원래 메타데이터 보존·계정 전환 차단·기존 사진 보호를 확인했고 시험 행은 롤백됐다.
- 앱 타입/린트·서버 타입/린트 통과. 사진 선택기·이미지 변환기 설치 및 `prebuild:android --no-clean --no-install` 완료.
- Expo doctor 20/21. 새 사진 패키지는 SDK 57 호환 버전이며 기존 `expo 57.0.25`, `expo-constants 57.0.19`, `expo-router 57.0.23`에 각각 다음 패치 버전 권고가 있다. 이번 기능과 무관한 프레임워크 패치 업데이트/제외 설정은 하지 않았다.
- 첫 release 빌드와 기존 Gradle daemon 재사용 시 Maven 접근 권한 오류가 발생했다. 승인된 네트워크 실행에서 `--no-daemon`으로 새 프로세스를 사용해 **release 빌드 성공**(5분 27초, 846 tasks)을 확인했다. 카메라/마이크/READ_MEDIA_IMAGES 권한이 APK에 추가되지 않았다.

로그: 무시된 `.cache/account-expansion/`의 `tests-final.log`, `photo-tests.log`, `server-tests.log`, `check.log`, `build.log`.

## 실제 외부 상태

- Chrome·Codex 브라우저 모두 최초 카카오/네이버 로그아웃 상태였다. 사용자가 Chrome 두 곳에 직접 로그인한 뒤 상태를 확인했다.
- 카카오: 기존 다른 앱 3개는 변경하지 않았다. 사용자가 직접 등록한 `RunPen`(1597696), 앱 이름/회사명 RunPen·건강/피트니스·Owner·일반 앱 상태를 확인했다. 14:10 후속으로 닉네임/프로필 사진 필수 동의, 이메일 권한 없음, Supabase callback URI 일치, 카카오 로그인 Client Secret ON을 확인했다. 사용자 키/Secret·이메일 없는 로그인 허용 저장 뒤 OFF였던 Kakao enabled를 14:22 후속으로 켰고 공개 설정 HTTP 200·Google/Kakao true를 확인했다.
- 네이버 최초 조회는 API 이용약관 단계였으나 14:46 재개에서는 바로 앱 등록 폼에 접근했다. 사용자가 직접 RunPen을 등록했고 저장된 네이버 로그인·별명 필수/사진 선택, PC/Mobile 웹의 실제 RunPen 공유 서비스 URL·Supabase callback을 확인했다. 개발 중 상태이며 공개 검수는 별도다. Supabase `custom:naver` OIDC·issuer/scopes/이메일 선택 초안을 준비하고 사용자에게 Client ID/Secret 직접 입력·생성을 인계했다. 공통 `social-hosted.mjs --verify-naver` 도구와 카카오 호환 진입점의 문법·lint 통과, 실제 네이버 연결은 미완료다.
- 네이버 후속: 사용자가 Supabase에 키를 저장한 뒤 OIDC Enabled를 확인했다. 본인 동의 후 가입/코드 교환은 성공했지만 별명 누락 검사에서 실패했다. ID token 메타데이터에는 식별 claim만 있고 공식 프로필 API는 200·별명/사진·일치하는 식별자를 반환했다. 앱에 동일 계정의 프로필 조회/표시 메타데이터 저장을 연결한 후 실제 이메일 없는 로그인·별명·HTTPS 사진(`ssl.pstatic.net`, 200/image)·SDK/controller 복원·세션 갱신·PC 세션 정리 5개를 통과했다. 전용 표시 필드만 저장하며 사용자 지정 프로필·Google 자료·휴대폰은 수정하지 않았다. 관련 21개 + 인증/탈퇴/사진 회귀 38개, 앱 타입/전체 lint와 QA 도구 문법/lint 통과. 증거는 `naver-result.json`, `naver-tests.log`, `naver-auth-regression.log`, `naver-check.log`, `naver-complete.png`다.
- 최초 조회의 Google 활성·Kakao 비활성·custom provider 없음에서 Kakao 활성까지 진행했다. 기본 요청은 `KOE205 account_email`을 반환했고, `queryParams.scope='profile_nickname profile_image'` 수정 뒤 실제 동의 화면의 두 항목을 확인했다. 첫 loopback 도구 요청은 `Referrer-Policy: no-referrer`의 로컬 POST Origin 검사 실패 후 `strict-origin`으로 수정해 카카오에 도달했다. 사용자가 직접 동의한 뒤 실제 별도 카카오 가입/로그인·코드 교환·닉네임 매핑·SDK/controller 복원·세션 갱신·PC 세션만 로그아웃을 통과했다.
- 카카오 사진 응답은 HTTP의 `k.kakaocdn.net`이어서 기존 HTTPS 필터에 거절됐다. 이 호스트의 일반 포트만 HTTPS로 정규화하고, 실제 재로그인에서 이미지 응답 200/image 형식까지 확인했다. 최종 `kakao-result.json`: 2026-10-05T05:35:13.713Z 완료, 이메일 없음, 사진 매핑 성공, 5개 확인 통과. 계정 프로필을 수정하거나 원래 Google 기록을 이동/삭제하지 않았다. 시험 세션은 메모리에만 두고 종료했다. 관련 계정/제공자 **16개**와 `npm run check`의 앱 타입/전체 lint 통과.
- `20261005040000_profile_photos.sql`을 실제 프로젝트에 적용했다. `supabase/tests/profile_photos.sql`도 실제 PostgreSQL에서 PASS, 합성 Auth/Storage 행은 트랜잭션 롤백으로 제거됐다. 실제 파일 바이트 업로드를 검사한 것은 아니다.
- 사진 정리를 포함한 `delete-account` Edge를 배포했고 설정 화면의 갱신 시각과 `Verify JWT with legacy secret` OFF 유지 확인. 함수 내부의 실제 Auth 검증은 유지한다. 배포 번들 12,436바이트, SHA-256 `649efd48f16310210c4d082f7f8c2e9d40ebb17e6f8e904ffb90eefce80b0224`. 공개 키만 사용한 GET은 405, 인증 없는 prepare는 401을 반환했다.
- 실제 임시 계정 2개 생성·로그인 정보의 무시된 로컬 파일 보관이 자동 승인 검토에서 거절됐다. 계정 확장 요청만으로 추가 계정 생성/정보 보관까지 명시적 승인으로 보기 어렵다는 이유다. 사용자에게 생성·사진 왕복/탈퇴·정리를 함께 승인 요청했다. **계정/사진/로그인 정보는 생성하지 않았으며** 다른 수단으로 우회하지 않았다. 승인 후 실행할 `scripts/qa/profile-photo-hosted.mjs`를 준비하고 문법만 확인했다.
- 기존 사용자 프로필·코스/러닝·설치 APK·휴대폰 자료는 변경하지 않았다. 서버의 배포 전후 기준값은 아래와 같다.

| 대상 | 전후 개수 | 전후 MD5 |
| --- | --- | --- |
| Auth 프로필 | 1 | `a4e12a01ebb5b810df206e3e3aaaa406` |
| personal_records 전체 행(삭제 표식 포함) | 10 | `d6da8855e251afdaac2c5a2815cd9eac` |
| Storage 객체 메타데이터 | 4 | `c8da583cee3bdc8f7c5032a785e442e8` |

`server-before.txt`, `server-after.txt`, `server-policy.txt`, `edge-deployed.png`은 무시된 캐시 증거다. Storage 메타데이터 해시와 실제 사진 바이트 왕복은 서로 다른 검사다.

## 준비 APK

### Google·카카오·네이버 통합 — 15:21 KST

`build/install/running-art-0.1.0-20261005-social.apk`, 97,461,285바이트, arm64-v8a/x86_64. SHA-256 `33f6920a2e3591838b57b777bd7e1f2eb59fdadf333a7cdca5a0e7697e964952`. release 오프라인 빌드 4분 14초/846 tasks(36 실행) 성공. 기존 app ID `com.runningart.mobile.dev`·0.1.0/1과 서명 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 일치. 네이버 프로필 API 보완과 카카오/네이버 활성화를 포함하며 사진 업로드는 비활성이다. **휴대폰 미설치·Android 실제 복귀/보안 저장소 미검증**이다. `social-build.log`, APK의 `.sha256`과 `INSTALL-social-20261005-ko.txt`에 기록했다.

마지막 실제 네이버 결과는 2026-10-05T06:17:59.539Z 완료, 이메일 없음·HTTPS 사진 있음·식별자/별명 일치·5개 성공이다. PC 검증 도우미/시험 세션은 종료했고 토큰·프로필 값은 보관하지 않았다.

### 카카오 활성화 후속 — 14:41 KST

`build/install/running-art-0.1.0-20261005-kakao.apk`, 97,457,789바이트, arm64-v8a/x86_64. SHA-256 `452b0a38d977d0dbc2b047fc0626899c17d98135c160c0793a8e1226b355246d`. `assembleRelease --offline --no-daemon` 성공(4분 54초, 846 tasks), 기존 `com.runningart.mobile.dev`·0.1.0/1과 아래 서명 일치. `.env.local`에서 카카오만 활성화했고 네이버/사진 업로드는 비활성이다. 이전 준비본 이후 이메일 scope/카카오 사진 HTTPS 수정을 포함한다. **기기에 설치하거나 Android 로그인 복귀를 확인한 것은 아니다.**

증거: `.cache/account-expansion/kakao-build.log`, `kakao-result.json`, `supabase-kakao-enabled.png`, `kakao-consent-ready.png`, `kakao-login-complete.png`. 확인용 loopback 프로세스와 PC 인증 세션은 종료했다.

### 최초 계정 확장 준비본

`build/install/running-art-0.1.0-20261005-account-prepared.apk`, 97,457,793바이트, arm64-v8a/x86_64. SHA-256 `140f262b094a67550bee7e07f0c1c90c957494357d53769c91e1d8b30acfa19f`.

기존 `com.runningart.mobile.dev`·0.1.0/1과 서명 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 일치. 이 이전 준비본의 사진·추가 소셜 플래그는 꺼져 있다. **활성화된 최종 APK가 아니며 에뮬레이터/휴대폰 설치나 사진 선택 UI 검증은 하지 않았다.**

## 남은 범위

1. 카카오/네이버 서버·PC·Android 실제 로그인을 완료했다. 공개 서비스용 네이버 검수는 별도다. 비밀 값은 채팅/문서/Git에 남기지 않는다.
2. 임시 계정 생성 승인을 받은 뒤 실제 JPEG 업로드·본인/타인/익명 접근·서명 URL·중복 파일·교체·탈퇴·시험 자료 정리를 확인한다.
3. 사진 왕복 성공 후 사진 플래그를 켜 APK를 만들고 네이티브 사진 선택/자르기/취소/저장을 검증한다. 소셜 통합 APK와 실제 카카오/네이버 복귀·세션/계정 분리는 완료했다.
