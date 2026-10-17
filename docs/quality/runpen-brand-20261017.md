# RunPen 앱 아이콘 — 2026-10-17

사용자가 Figma의 앱 로고 적용을 요청했다. [원본](https://www.figma.com/design/QYRGII8OdvQB1SrtH3BA08/?node-id=319-2228)은 UI 페이지의 `runpen-launcher-color-rounded-432 1`(319:2228)이다. `get_design_context`의 원본 이미지와 화면을 확인하고 432×432 RGBA PNG 바이트를 그대로 [앱 자산](../../assets/brand/runpen-launcher.png)에 저장했다. SHA-256은 `beddd36f9533ed797f789a33e0ddb08b5d434b526a0a375b0caf444fd1e733dd`다.

## 변경

[app.json](../../app.json)의 기본 아이콘·시작 화면·favicon을 원본으로 연결했다. Expo 시작 아이콘 및 iOS 전용 Expo 덮어쓰기·Android Expo adaptive/monochrome 지정을 제거했다. 휴대폰 표시 이름은 RunPen이다. 패키지 `com.runningart.mobile.dev`, 버전 0.1.0, scheme `runningart`, 기존 서명을 유지한다. 앱 내부 가로 워드마크·서비스 화면·기능·데이터 형식은 변경하지 않았다.

원본은 배경과 러너/펜을 합친 둥근 사각형으로, 별도 adaptive 전경/배경 또는 단색 원본은 제공되지 않았다. Expo의 표준 아이콘 경로는 완성된 원본을 잘라 확대하지 않고 OS 런처가 전체를 맞춰 표시하도록 한다. OS별 외곽 마스크/여백은 다를 수 있다. 원본의 투명도와 가장자리 픽셀도 편집하지 않았다.

## 로컬 검증

- `npm run prebuild:android -- --no-install`: 성공. 기존 native 폴더 유지, Android label RunPen·표준 아이콘 연결·adaptive XML 제거 확인.
- `ic_launcher.webp` 생성물을 직접 보고 러너/펜·색상·전체 비율을 확인했다.
- 최초 제한 환경의 Gradle daemon 연결 오류를 보존했다. 같은 소스로 일반 로컬 권한에서 재실행해 release 빌드 성공(5분 42초, 920 tasks)을 확인했다.
- `npm run check`: 타입·린트 성공. release·실기기까지 통과했다.
- 생성된 시작 화면 리소스도 직접 보고 원본 러너/펜과 전체 비율을 확인했다.

## 실기기와 CI

SM-S942N(Android17)에 14:56:18 KST 자료 유지 업데이트했다. APK `runpen-0.1.0-20261017-brand.apk`는 127,214,637바이트, SHA-256 `4ae28b04c8878c4261eeac116348585ce41eb85f938cbcffb3986d069a2b241b`이며 arm64-v8a/x86_64를 포함한다. 기존 인증서 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`와 일치한다.

- 실제 홈 화면에 새 러너/펜 아이콘·RunPen 이름 표시, 아이콘 탭→서비스 홈, 강제 종료 후 재시작 통과. 시작 화면 전환 중 새 아이콘도 직접 확인했다.
- 기존 4코스·6러닝·1,907좌표·1메모 전체 내용 해시가 설치 전후 일치한다. 기존 Google 로그인·계정 설정/동기화 선택, Wi-Fi/모바일/비행기모드·글꼴 1.0을 보존했다.
- 최초 설치 시각 2026-09-27 16:29:39·자료 경로 유지, 설치된 APK 해시 일치, 동기화 삭제/충돌 0건, 시험 기록 없음.
- 내부 복구본·검사 도우미·UI jar/XML 정리, 실행 중 서비스 없음, 앱 홈으로 복귀했다. USB 분리 가능하다.
- 상세 수치/해시는 [기계 판독 근거](runpen-brand-20261017.json)에 보존했다. 실제 폰 전체 화면은 개인 정보가 있어 로컬 `.cache/runpen-brand-20261017/phone/`에만 보관한다.

[PR #22](https://github.com/ssw3131/running-art-mobile/pull/22)를 main `e5d9ffa`에 squash 병합했다. [PR 전체 검사](https://github.com/ssw3131/running-art-mobile/actions/runs/39008153021)와 [main 전체 검사](https://github.com/ssw3131/running-art-mobile/actions/runs/39009961393)의 필수 `verification-gate`가 모두 성공했다. APK의 제품 변경은 이 병합 소스와 같고 후속 변경은 검증 문서다.

| 항목 | PR | main |
| --- | --- | --- |
| 로직 / Jest | 453 / 38 | 453 / 38 |
| 실제 격리 DB | 3 | 3 |
| API 36 | 14단계, 재시도 0 | 14단계, 실패 작업 진단 재실행 1회 |
| API 29 | 변경 범위 규칙에 따라 미실행 | 6단계, 재시도 0 |
| 4개 정적 화면 차이 | 모두 0 | 모두 0 |
| 시험 원본 보존 / 정리 | 통과 | 통과 |

main 첫 실행은 기능 14단계·원본 보존/정리를 통과했으나 마이페이지 화면 비교가 9,424픽셀 차이로 실패했다. [기준](runpen-brand-20261017/first-main-account-baseline.png)·[실제](runpen-brand-20261017/first-main-account-current.png)·[차이](runpen-brand-20261017/first-main-account-diff.png)를 직접 대조했고, 차이는 오른쪽 스크롤바 `x=1069..1079, y=346..1204`에만 있었다. 기준에는 스크롤바가 보이고 실제 캡처에는 사라져 있었다. 소스·기준 이미지·마스크·임계값을 바꾸지 않고 실패한 Android 작업만 1회 진단 재실행해 최종 통과했다. 전체가 최초 실행 통과한 것은 아니다. 캡처 시점의 스크롤바 안정화는 별도 CI 개선 후보로 남긴다.

PR API36의 UI 준비 대기 1회·main 최초 5회를 보존했다. main의 준비 대기·덤프 경고 수는 JSON의 `ci.main.androidDiagnostics`를 따른다. 검사 재시도와 UI 덤프 준비 대기는 구분한다. 로컬 근거 집계 도구는 첫 실행에서 하위 화면 보고서를 실행 보고서로 읽어 `dirty` 키 오류가 났고, 보고서 경로를 구분해 같은 CI 결과를 다시 대조했다. 제품/CI 재실행은 아니다.

검증 종료: 2026-10-17T16:40:39.558191+09:00.

## 범위

iOS 및 웹은 동일 원본을 연결하는 설정만 변경했으며 해당 플랫폼 실행 검증은 하지 않았다. 스토어 제출/업로드는 하지 않았다. 기존 실제 GPS·야외/장시간과 운영 정책/문의 통합은 [폰 후속](s942n-phone-20261017.md)의 남은 범위다.
