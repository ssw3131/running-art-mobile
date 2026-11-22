# 최신 main APK 빌드·공개 다운로드 검증

2026-11-22 사용자 요청으로 main `edc1114fd9f1dbd107da6f5aa4e53c33f68ae817`의 독립 실행 preview217513425를 새로 만들고21:36:38KST [GitHub 릴리스](https://github.com/ssw3131/running-art-mobile/releases/tag/v0.1.0-preview.20261122.217513425)에 공개했다.21:36:57KST까지 자산7개의 인증 없는 전체 다운로드와 SHA256·바이트 일치를 확인했다.

| 설치 대상 | 파일 |
| --- | --- |
| 신규 설치·이전 GitHub preview·현재 A7 | [기본 APK](https://github.com/ssw3131/running-art-mobile/releases/download/v0.1.0-preview.20261122.217513425/runpen-preview-edc1114fd9f1-217513425.apk) |
| 기존 PC 테스트 서명·현재 신형폰 | [호환 APK](https://github.com/ssw3131/running-art-mobile/releases/download/v0.1.0-preview.20261122.217513425/runpen-preview-edc1114fd9f1-217513425-legacy.apk) |

기존 앱을 삭제하지 않고 같은 서명의 파일로 업데이트한다. 두 파일은 같은 앱·내용·버전이며 서명만 다르다. Metro 없이 실행하며 온라인 기능에는 인터넷이 필요하다.

## 빌드와 파일 근거

- [Handset APK45021865264](https://github.com/ssw3131/running-art-mobile/actions/runs/45021865264)의 소스 확인·타입/린트·ARM 빌드·서명/패키징·산출물 업로드가 통과했다. source_ref는 정확한 main SHA, kind는 preview였다.
- artifact14754124397은75,115,418바이트이며 ZIP SHA256 `8c657708b66b06a7632ce0a5c684936905eb8a38d70afe6f9955ef6b5a513e46`이 GitHub digest와 일치했다. 예상한 최상위 파일4개만 있는 것을 확인하고 추출했다.
- 앱 ID `com.runningart.mobile.dev`, versionCode217513425(이전217503281보다 큼), Android7.0/API24 이상·target36, ARM64/ARMv7·OpenGL, 내장 JS와 non-debuggable을 확인했다.
- 기본 APK는116,903,063바이트, SHA256 `c9a43ee898ef6caf6a1df7678e15b156c411f48e0cf85fd30e1621cf593fd7de`, 기존 GitHub 서명 `3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179`이다.
- 호환 APK는117,017,914바이트, SHA256 `badea958388752297b30a20bc3be3d3074fb25fb60ebf81e50cdf3bfc889f7bb`, 기존 PC 서명 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`이다. 기존 테스트 키로 만든 사본이며 키 자체를 게시하지 않았다.
- apksigner와 aapt로 두 파일의 서명·앱 ID·버전·ABI를 대조했다. 서명 항목을 제외한 ZIP 내용1,576개의 해시가 전부 같다. Java native-access 경고는 있었지만 서명/패키지 검사와 명령 종료는 성공했다.

## 게시·다운로드

릴리스454436176을 초안으로 만들고 APK2개·체크섬2개·설치 안내·원본 metadata·서명별 variants만 업로드했다. 서버 자산의 이름·수·바이트·digest를 확인한 뒤 prerelease로 공개했다. 태그 `v0.1.0-preview.20261122.217513425`가 정확한 빌드 소스를 가리키는 것을 확인했고 기존 릴리스3개와 자산은 보존했다.

인증 헤더 없이7개 공개 URL을 각각 HTTP200으로 끝까지 읽어 원본과 바이트·SHA256이 모두 일치했다. Actions artifact7일 만료와 별도로 공개 릴리스에서 받을 수 있다. [설치 안내](https://github.com/ssw3131/running-art-mobile/releases/download/v0.1.0-preview.20261122.217513425/INSTALL-ko.txt)와 서명별 파일을 README·클라우드 안내·인수인계에 연결했다.

## 범위와 보존

이번 빌드 소스와 기존 preview217503281의 sourcefe01b22 사이 차이는 문서뿐이다. 기존 [A7 실기기17개·S942N 설치 결과](billing-handset-20261122.md) 및 [제품 전체 CI](billing-foundation-20261122.md)를 이번 새 APK의 설치 검증으로 바꾸지 않는다. 이번에는 폰을 조작하거나 재설치하지 않았으며 실제 결제·지급/차감·환불·운영 서버/DB·고객 정책 게시도 수행하지 않았다.

빌드/업로드/다운로드는 첫 실행에 통과했다. 워크플로별 조회 경로는 커넥터에서 지원되지 않아 전체 runs의 SHA/event 필터로 조회했다. 원본 ZIP·APK·메타데이터·공개 다운로드 영수증·릴리스 응답은 PC `output/latest-apk-release-20261122`에 보존한다. 개인 기기 화면·계정/위치 자료·서명키·관리 자격 증명은 자산에 포함하지 않았다. 최종 문서 PR/main 검사·PC 동기화·브랜치 정리는 [실행 기록](../history/executed-plans/2026-11-22-2120-latest-apk-release.md)과 해당 PR 본문을 따른다.
