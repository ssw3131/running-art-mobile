# 휴대폰 독립 실행 테스트 APK

개발 서버 없이 휴대폰에서 실행하려면 JavaScript·Hermes 바이트코드·앱 자산이 포함된 릴리스 방식 APK를 사용한다. 기존 `start:performance`는 개발 APK에 배포용 JS를 공급하므로 여전히 Metro가 필요하며, 이 APK와 다르다.

2026-09-29 수정본은 `build/install/running-art-0.1.0-20260929.apk`다. 새 지역 조회의 공급자 전환과 지도 이동 후 결과 유지를 포함한다. 같은 폴더에 `.apk.sha256`과 `INSTALL-20260929-ko.txt`가 있다. 기존 테스트 서명·앱 ID와 데이터를 유지한 업데이트 설치용이다. 아래 GitHub 링크의 **2026-09-27 APK에는 이번 수정이 없으며**, 새 파일의 외부 공개 배포는 하지 않았다. [이번 검증](../quality/road-search-results-verification.md)을 참고한다.

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

계산 코드는 APK 내부에 있다. 서울 OSM에서는 지도 타일과 새 위치의 도로 조회에 인터넷 연결이 필요하다. [지도 중심 기준 조회](route-center.md)는 메모리 캐시를 사용하며, 영구 도로 파일 저장·러닝 추적·코스 저장은 후속 범위다.

코드를 고쳐도 설치한 독립 실행 APK가 자동으로 바뀌지 않는다. 새 APK를 빌드해 업데이트해야 한다. 다시 개발 클라이언트를 쓰려면 같은 테스트 서명의 개발 APK를 업데이트 설치한 뒤 Metro를 시작한다. 최신 결과는 [현재 상태](../handoff/status.md)·[지도 중심 검증](../quality/route-center-verification.md), 이전 휴대폰 고정 표본 검증은 [당시 실행 기록](../history/executed-plans/2026-09-27-1758-standalone-android-test.md)에 있다.
