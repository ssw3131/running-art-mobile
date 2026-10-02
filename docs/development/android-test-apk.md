# 휴대폰 독립 실행 테스트 APK

**2026-10-02 전국 공급 APK 생성:** `build/install/running-art-0.1.0-20261002-national.apk`(95,680,819바이트, arm64·x86_64)의 일반 계산과 도로 캐시를 전국 채널로 전환했다. 대전·제주·울릉도 선택과 기존 저장 코스·GPX·시뮬레이션을 포함한다. 전체 자동 검사 164개·타입·린트·release 빌드와 이전 테스트 APK와의 서명 일치를 확인했다. **사용자 결정에 따라 실제 휴대폰에는 설치하지 않았다.** 현재 휴대폰 설치본은 아래 판교 APK다. 같은 폴더에 SHA-256과 `INSTALL-national-20261002-ko.txt`를 보존하며 [전국 검증](../quality/national-roads-verification.md)·[앱 결과/해시](../quality/national-roads-app-report.json)를 따른다.

**2026-10-02 시뮬레이션 검증 APK 생성:** `build/install/running-art-0.1.0-20261002-simulation.apk`(95,673,331바이트, arm64·x86_64)에 저장 코스 오프라인 재생을 추가했다. API 36 에뮬레이터의 인터넷/위치 해제·속도 변경·앱 복귀·도착 자동 종료를 확인했다. **실제 휴대폰에는 설치하지 않았으며 아래 판교 APK가 현재 휴대폰 설치본이다.** 공유 작업 폴더 빌드에 포함된 다른 채팅의 전국 도로 변경은 별도 검증 대상이다. [사용법](course-simulation.md)·[검증과 SHA-256](../quality/course-simulation-verification.md). 같은 폴더에 SHA-256 파일과 `INSTALL-simulation-20261002-ko.txt`를 보존한다.

**최신 판교 추가 APK:** 2026-10-01 23:41:32 KST에 `build/install/running-art-0.1.0-20261001-pangyo.apk`(95,662,219바이트)를 SM-S942N에 업데이트했다. 판교로228번길 17 선택·기존 목록 자동 갱신·재시작 후 완전 오프라인 계산·기존 코스/메모 보존과 설치본 해시를 확인했다. [검증과 SHA-256](../quality/pangyo-roads-verification.md).

**2026-10-01 22:56 R2 연결 APK:** `build/install/running-art-0.1.0-20261001-r2.apk`(95,662,059바이트, arm64·x86_64)를 SM-S942N에 업데이트했습니다. 일반 계산을 R2 표본·영구 캐시로 전환했고 첫 수신·취소/재시도·강제 종료 후 완전 오프라인 계산을 확인했습니다. 기존 코스 1개·메모 1개와 최초 설치 시각·데이터 경로를 보존했습니다. [휴대폰 보고서와 해시](../quality/road-cache-phone-report.json)·[사용법](route-center.md). 이전 APK와 GitHub 공개 파일은 유지합니다.

**2026-10-01 GPX APK·휴대폰 검증 완료:** `build/install/running-art-0.1.0-20261001-gpx.apk`(95,659,943바이트, arm64·x86_64)에 저장 코스의 GPX 내보내기를 추가했다. API 36에서 PC·인터넷 없이 공유 취소·재시도·실제 파일 수신·이름 변경 후 재공유를 확인했다. 같은 폴더에 `.apk.sha256`·`INSTALL-gpx-20261001-ko.txt`가 있다. **후속 요청으로 00:56:22 KST에 SM-S942N에도 업데이트했다.** 기존 코스 1개·메모 1개 보존, PC 없이 실행, 완전 오프라인 재실행·공유 취소/재시도와 실제 GPX 수신을 확인했다. 설치본 해시가 같다. [휴대폰 결과](../quality/gpx-export-phone-report.json). [사용법](gpx-export.md)·[검증과 해시](../quality/gpx-export-verification.md)를 참고한다. 이전 APK·GitHub 공개 파일은 유지한다.

**2026-09-30 22:09 당시 설치본:** `build/install/running-art-0.1.0-20260930-courses.apk`를 SM-S942N(Android 16)에 업데이트했다. 코스 저장·목록·상세·이름 변경·삭제가 포함된다. 기존 서명·데이터 경로·최초 설치 시각을 유지했으며 이전 앱의 테스트 메모도 보존됐다. PC 개발 서버 없이 실행·같은 코스 중복 방지·이름 변경·네트워크 완전 해제 후 강제 종료와 복원·삭제 취소/완료를 확인했다. [이번 검증](../quality/saved-courses-verification.md)과 [휴대폰 결과·SHA-256](../quality/saved-courses-phone-report.json)을 참고한다.

이 코스 저장 APK는 **95,595,419바이트**, arm64·x86_64 공용이다. 같은 폴더의 `.apk.sha256`, `INSTALL-courses-20260930-ko.txt`와 함께 로컬에 보관한다. 이전 설치 파일·GitHub 공개 APK는 유지한다. 당시 코스 저장 APK의 공급은 기존 API였으며 현재 R2 APK와 구분한다.

**2026-09-30 00:49 이전 설치본:** 사용자 후속 요청으로 `build/install/running-art-0.1.0-20260930.apk`를 빌드해 00:49:45 KST에 SM-S942N에 업데이트했다. 앱의 API 1회 호출·65초 제한을 포함한다. 기존 데이터 경로·최초 설치 시각·서명을 유지했고 설치본 해시 일치·개발 서버 없는 새 실행·지도 화면 표시를 확인했다. 서버는 아직 이전 코드이므로 새 서버 시간 제한·본문 검증은 운영 미반영이다. [재시도 검증과 설치 해시](../quality/road-retry-verification.md)를 참고한다.

이전 00:49 APK는 95,416,995바이트, arm64·x86_64 공용이다. 같은 폴더에 `.apk.sha256`과 `INSTALL-20260930-ko.txt`를 준비했다. 기존 9월 29일 APK도 보존하며 GitHub에는 새 APK를 공개하지 않았다.

개발 서버 없이 휴대폰에서 실행하려면 JavaScript·Hermes 바이트코드·앱 자산이 포함된 릴리스 방식 APK를 사용한다. 기존 `start:performance`는 개발 APK에 배포용 JS를 공급하므로 여전히 Metro가 필요하며, 이 APK와 다르다.

2026-09-29 수정본은 `build/install/running-art-0.1.0-20260929.apk`다. 새 지역 조회의 공급자 전환과 지도 이동 후 결과 유지를 포함한다. 같은 폴더에 `.apk.sha256`과 `INSTALL-20260929-ko.txt`가 있다. 기존 테스트 서명·앱 ID와 데이터를 유지한 업데이트 설치용이다. 아래 GitHub 링크의 **2026-09-27 APK에는 이번 수정이 없으며**, 새 파일의 외부 공개 배포는 하지 않았다. [이번 검증](../quality/road-search-results-verification.md)을 참고한다.

2026-09-29 23:23 KST에 연결된 SM-S942N에 이 수정본을 `adb install -r --no-streaming`으로 업데이트했다. 기존 최초 설치 시각·데이터 경로가 유지됐고 설치본 SHA-256이 전달 파일과 일치한다. Metro 포트 전달 없는 새 실행과 코스 계산 테스트의 지도·현재 위치 확인 상태를 확인했다. 실제 위치에서 도로 조회·코스 계산이 완료되는지는 이번 설치 확인 범위에 포함하지 않았다.

2026-09-27 지도 중심·조회 시간 기능이 포함된 설치 파일은 `build/install/running-art-0.1.0-20260927.apk`다. 크기는 95,414,459바이트(약 95.4MB), arm64 휴대폰과 x86_64 에뮬레이터용 코드를 함께 포함한다. 같은 폴더의 `.apk.sha256`으로 파일을 확인할 수 있다. 생성물은 Git에서 제외한다. 에뮬레이터에서 검증한 동일 파일을 후속 사용자 요청으로 SM-S942N에도 업데이트 설치했다. 기존 설치 시각·데이터 경로 유지, 설치본 해시 일치와 개발 서버 없이 홈 실행을 확인했다. 실제 GPS 기준 조회·계산은 이번 설치 확인에 포함하지 않았다.

## GitHub에서 휴대폰으로 설치

테스트 사전 릴리스: [v0.1.0-test.20260927](https://github.com/ssw3131/running-art-mobile/releases/tag/v0.1.0-test.20260927). [APK 바로 다운로드](https://github.com/ssw3131/running-art-mobile/releases/download/v0.1.0-test.20260927/running-art-0.1.0-20260927.apk)를 휴대폰에서 열어 파일을 내려받는다. Android가 요청하면 해당 브라우저·파일 앱의 설치 허용을 켜고 APK를 실행한다. 기존 테스트 앱은 삭제하지 않고 업데이트한다.

릴리스에는 APK, `INSTALL-ko.txt` 한글 설치 안내, `.apk.sha256` 확인 파일이 있다. 로그인 없이 세 파일을 내려받아 원본과 크기·SHA-256 일치를 확인했다. 태그는 APK 소스 커밋 `076d3688ffac4ad56efc6c4a7986f2f223eb6e5a`를 가리킨다. 이후 휴대폰 설치·배포 문서 수정은 APK 코드 변경이 아니다. APK는 Git 이력에 넣지 않고 Releases에 첨부하며 `/build/`·`*.apk` 제외 규칙을 유지한다.

## 빌드·설치

현재 프로젝트 도구가 준비된 Windows PC에서 `running-art-mobile` 루트의 PowerShell로 실행한다. Android Studio 빌드와 동시에 실행하지 않는다. 휴대폰은 USB 디버깅을 허용하고 `adb devices -l`에 `device`로 표시돼야 한다.

```powershell
. .\scripts\env.ps1
npm.cmd run android -- --variant release --device --no-bundler
```

기기 선택에서 연결된 휴대폰을 고르면 빌드·설치·실행한다. 프로젝트에 생성된 `android/`가 있어 기본 prebuild로 재생성할 필요가 없다. Expo 설정이나 네이티브 의존성을 바꾼 경우에만 먼저 `npm run prebuild:android`의 `--no-clean` 경로로 갱신한다.

휴대폰·에뮬레이터 공용 APK를 기기 설치와 분리해서 만들려면 다음처럼 실행한다. 빌드 결과는 `android/app/build/outputs/apk/release/app-release.apk`다.

```powershell
. .\scripts\env.ps1
$env:NODE_ENV='production'
Push-Location android
try {
  .\gradlew.bat :app:assembleRelease --max-workers=2 '-PreactNativeArchitectures=arm64-v8a,x86_64'
} finally { Pop-Location }
adb devices -l
# SERIAL은 위 목록에서 설치할 휴대폰의 식별자로 바꾼다.
adb -s SERIAL install -r android/app/build/outputs/apk/release/app-release.apk
```

현재 앱 ID는 `com.runningart.mobile.dev`, 버전은 `0.1.0`이고 로컬 테스트 서명을 사용한다. 기존 앱과 서명이 같은 APK를 `-r`로 업데이트하며 앱을 먼저 삭제하지 않는다. 서명이 다르면 설치 오류를 확인하고 기존 데이터를 보존한 상태에서 해결한다. arm64 휴대폰만 필요하면 위 아키텍처 값을 `arm64-v8a`로 줄일 수 있다. 이 경우 x86_64 에뮬레이터에는 설치할 수 없다. 스토어 배포 서명은 별도다.

`.env.local`의 MapTiler 공개 클라이언트 키는 빌드 시 앱에 반영된다. 키를 문서·공유 로그에 적지 않는다. APK 안의 공개 클라이언트 키는 비밀 저장소가 아니므로 배포 대상에 맞는 공급자 제한 설정을 별도로 관리한다.

## 설치 후 확인

1. USB를 빼거나 해당 기기의 Metro 포트 전달을 제거한 상태에서 앱을 완전히 종료하고 다시 연다. 개발 서버 선택 화면 없이 홈이 떠야 한다.
2. 코스 계산 테스트 → 서울 OSM에서 현재 위치 또는 지도 이동으로 중심을 정하고 계산한다. 완료 후 지도·후보·계산 기준 좌표·조회/계산/전체 시간을 확인한다. 고정 원본 비교는 합성 격자 → 하트 → 5km로 확인한다.
3. 계산 중 ‘화면 반응 확인’·취소·재시작을 확인한다. 성능은 같은 입력에서 여러 번 측정하고 개발용 APK 결과와 구분한다.
4. 지도·현재 위치·저장소는 각각 권한·네트워크·저장 동작을 따로 확인한다. 코스 계산 성공만으로 전체 기능 검증을 완료했다고 보지 않는다.

계산 코드는 APK 내부에 있다. R2 APK는 저장한 도로 표본으로 PC·인터넷 없이 계산한다. 배경 지도 오프라인 제공은 별도이며 [표본 선택·공급 모드](route-center.md)를 따른다. 저장 코스 목록·상세·이름 변경·삭제·GPX도 그대로 사용할 수 있다.

코드를 고쳐도 설치한 독립 실행 APK가 자동으로 바뀌지 않는다. 새 APK를 빌드해 업데이트해야 한다. 다시 개발 클라이언트를 쓰려면 같은 테스트 서명의 개발 APK를 업데이트 설치한 뒤 Metro를 시작한다. 최신 결과는 [현재 상태](../handoff/status.md)·[지도 중심 검증](../quality/route-center-verification.md), 이전 휴대폰 고정 표본 검증은 [당시 실행 기록](../history/executed-plans/2026-09-27-1758-standalone-android-test.md)에 있다.
