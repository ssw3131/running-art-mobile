# GPX 내보내기 검증

검증일: 2026-10-01 (Asia/Seoul). 서버 가입 전 가능한 작업으로 저장 코스의 GPX 내보내기를 구현하고 자체 코드 검토·PC 자동 검사·API 36 에뮬레이터 검증을 완료했다. [사용법](../development/gpx-export.md) · [기기 보고서](gpx-export-emulator-report.json) · [실행 기록](../history/executed-plans/2026-10-01-0001-gpx-export.md)

후속 사용자 요청으로 **SM-S942N(Android 16)의 GPX 검증도 완료했다.** 00:56:22 KST에 같은 APK를 업데이트했고, 기존 코스·메모를 보존하며 실제 파일 전달·오프라인 취소/재시도를 확인했다. [휴대폰 보고서](gpx-export-phone-report.json)

## 검사 결과

| 확인 | 결과 |
| --- | --- |
| `npm test` | 전체 130개 통과. 마지막 소수 호환성 보완 뒤 관련 GPX 11개 재통과 |
| `npm run check` | 최종 타입·린트 통과 |
| 공식 GPX 1.1 XSD | 생성 파일 32개 통과. 기준 후보 25개의 전체 좌표·순서·이름을 별도 XML 파서로 대조 |
| 실제 SQLite·UTF-8 파일 | DB의 최신 이름 읽기, 내보내기 전후 자료 유지, 공유 콜백에서 실제 파일 읽기 통과 |
| Android release 빌드 | 최종 소스 arm64-v8a·x86_64 공용 빌드 성공. Metro 없이 실행 |
| `npx expo-doctor` | 20/21. 기존 expo 57.0.25→26, expo-constants 57.0.19→20, expo-router 57.0.23→24 패치 안내. 추가 모듈 호환성 오류 없음 |
| 에뮬레이터 API 36 | 오프라인 저장 코스 → 공유 취소 → 재시도 → 별도 앱 파일 수신, 이름 변경·강제 종료 후 재수신 통과 |

초기 GPX 공식 스키마 검사에서 극단적으로 긴 소수의 검증기 호환 문제를 발견했다. 해당 값을 반올림하지 않고 명시적으로 거부하도록 보완했다. 소수 20자리 한도는 앱의 호환성 정책이며 XSD의 표준 제한이 아니다. 최종 관련 검사·XSD·타입·린트·release 빌드를 다시 확인했다.

자동 검사는 25개 기준 후보의 모든 경로점, 최대 20,000점과 반복점, XML 특수문자·한글·이모지·잘못된 유니코드, 안전한 파일명, 경도 +180 처리, 지수 표기·극소 좌표 거부를 포함한다. DB의 이름 변경·손상·삭제, 공유 미지원, 읽기/쓰기 도중 취소, 화면 요청의 AbortSignal, 중복 실행, 공유 창 종료, 쓰기/공유 실패 뒤 잠금 해제·재시도, 공유된 파일의 보존도 확인했다. 네이티브 실패를 인위적으로 발생시킨 검사가 아니라 주입한 서비스의 실패 처리 검사다.

## Android에서 실제 파일 전달

기존 `RunningArt_API_36` AVD의 앱을 `install -r`로 업데이트했다. 앱 데이터 UID 10216·디렉터리 inode 361851을 유지했다. 검사 시작 시 저장 코스·메모는 각각 0개였으며 임시 QA 코스를 UI에서 계산·저장했다. Wi-Fi·모바일 데이터는 시작부터 꺼져 있었고 끝까지 같은 상태였다. GPS나 Metro를 사용하지 않았다.

1. 합성 하트 5km의 1순위 코스를 저장하고 상세에서 GPX 버튼을 연속 눌렀다. 공유 창에는 한글 이름의 파일 1개가 표시됐다.
2. 뒤로 가기로 공유를 취소했다. 앱은 저장 성공을 주장하지 않는 종료 안내를 표시했고 다시 내보낼 수 있었다.
3. 인터넷 권한이 없는 별도 **GPX QA Receiver** 앱을 선택했다. Android `content://`의 읽기 권한으로 이름·MIME을 조회하고 실제 내용을 자기 내부 저장소로 복사했다. 10,143바이트·151점의 GPX가 공식 XSD와 저장된 모든 좌표에 일치했다.
4. 코스 이름에 `_GPX_QA`를 저장하고 앱을 강제 종료했다. 오프라인으로 상세를 다시 연 뒤 내보내어 최신 한글 이름의 파일 10,157바이트·151점을 다시 수신했다.
5. 각 내보내기 직전/직후 SQLite 전체 SQL dump가 같았다. QA 코스만 UI에서 삭제한 후 시작 시 DB 내용과 다시 같음을 확인했다. 수신 앱을 제거하고 이번에 시작한 에뮬레이터를 종료했다.

실제 수신 파일 2개를 파싱해 전체 좌표·트랙 이름·MIME·바이트 수·SHA-256을 대조했다. 수신 결과의 해시와 APK 정보는 [보고서](gpx-export-emulator-report.json)에 있다. 원본 UI XML·스크린샷·DB 비교본·수신 GPX는 Git 제외 경로 `.cache/gpx-qa/`에 보관한다. 이는 합성 테스트 위치이며 실제 사용자 위치를 수집한 검사가 아니다.

## 재현

프로젝트 루트에서 실행한다. Python XML 검사는 `lxml`이 설치된 Python이 필요하며 현재 PC에서는 번들 Python을 사용했다.

```powershell
. .\scripts\env.ps1
npm run test:gpx
npm run check
Invoke-WebRequest -Uri https://www.topografix.com/GPX/1/1/gpx.xsd -OutFile .cache/gpx-tests/gpx.xsd
python scripts/qa/verify-gpx.py .cache/gpx-tests --schema .cache/gpx-tests/gpx.xsd
powershell -ExecutionPolicy Bypass -File scripts/qa/build-gpx-receiver.ps1
# 연결 기기의 SERIAL로 지정하고 release APK와 로컬 수신 앱을 설치한다.
adb -s SERIAL install -r build/install/running-art-0.1.0-20261001-gpx.apk
adb -s SERIAL install -r .cache/gpx-qa/receiver/receiver.apk
```

스키마 출처는 [GPX 1.1 공식 XSD](https://www.topografix.com/GPX/1/1/gpx.xsd), 이번 파일 SHA-256은 `9e4d1988b862edbe556305b130f8f6f1b29864fefd0dc02d5dab04ccdd1f34d6`다. `verify-gpx.py`는 내려받은 스키마만 사용하며 파싱 중 네트워크·외부 엔티티를 사용하지 않는다. 반복 테스트는 임의 DB ID가 들어간 파일을 추가하므로 파일 수는 실행 횟수에 따라 늘 수 있다.

수신 앱은 `scripts/qa/gpx-receiver/`의 작은 Android 검사 도구이며 실제 제품에 포함하지 않는다. 결과는 수신 앱 내부 `files/received.gpx`·`received.json`에 저장된다. 개발 수신 앱의 `run-as com.runningart.gpxreceiver`로 읽어 검증할 수 있다. 테스트 후 수신 앱과 스스로 만든 코스만 정리한다. 일반 사용자의 저장 자료·앱 데이터를 초기화하지 않는다.

## 설치 파일과 한계

`build/install/running-art-0.1.0-20261001-gpx.apk`는 **95,659,943바이트**, SHA-256 `14331b789dcd6b2e67bb47d2e114499d65fe5ad5f6d58c37966f767366e34c97`다. 에뮬레이터 설치본의 해시도 같다. 같은 폴더에 `.apk.sha256`·`INSTALL-gpx-20261001-ko.txt`가 있다. 이전 APK와 기존 테스트 서명은 유지했다.

초기 에뮬레이터 검증 시점에는 휴대폰이 연결되지 않았으나, 후속 요청으로 아래 휴대폰 검증을 완료했다. SM-S942N의 최신 확인 설치본은 2026-10-01 GPX APK다. 타사 지도·피트니스 앱이나 클라우드 저장소의 가져오기, iOS, OS 수준 저장 공간 부족·수신 앱 종료·프로세스 종료 도중 공유는 미검증이다. 수신 앱마다 파일 저장·코스 해석 방식이 다를 수 있다. GPX 전달이 성공해도 서비스 계정의 동기화나 커뮤니티 공유가 구현된 것은 아니다.

실제 R2·Supabase·도메인 설정, 일반 코스 계산의 도로 공급 전환, CI/CD·외부 APK 공개는 실행하지 않았다. 다음 서버 독립 앱 작업은 코스 시뮬레이션이다.

## 후속 SM-S942N 휴대폰 검증

2026-10-01 사용자 요청 “폰 연결했어 검증해”에 따라 Android 16 / API 36의 SM-S942N에서 확인했다. 앱 소스·APK를 다시 변경하지 않고 검증된 공용 release APK를 `adb install -r --no-streaming`으로 00:56:22 KST에 업데이트했다. 설치본 SHA-256이 위 APK와 같고 최초 설치 시각·UID·데이터 경로를 유지했다. Metro 포트 전달 없이 강제 종료 뒤 홈의 독립 실행을 확인했다.

- 업데이트 전 있던 OSM 코스 1개와 메모 1개를 화면으로 확인했다. 업데이트 뒤 코스의 ID·이름·거리·점수·저장 시각, 메모의 ID·내용·수정 시각이 같았다. 마지막 정리 뒤 같은 목록을 다시 확인했다.
- 기존 OSM 코스에서 GPX 공유 창을 취소하고 다시 열어 로컬 검사 앱으로 전달했다. 한글 파일명·MIME `application/gpx+xml`, 16,569바이트·309점, OSM 출처와 공식 XSD 유효성을 확인했다. 타인·메일·클라우드에는 전송하지 않았다.
- 고정 합성 하트 5km의 1순위 코스를 새로 저장하고 이름에 `_GPX_QA_PHONE`을 붙였다. 이 코스는 이번 검사를 위해 만든 자료이며 기존 사용자 코스의 이름·내용은 바꾸지 않았다.
- 01:03:58~01:04:35 KST에 Wi-Fi·모바일 데이터를 끄고 기본 네트워크가 `none`임을 확인했다. 앱 강제 종료·재실행 후 바뀐 이름과 경로를 복원하고 공유 취소 안내·재시도·실제 파일 수신을 검증했다. 10,169바이트·151점의 수신 GPX가 공식 XSD를 통과하고 기준 후보의 전체 좌표·순서와 정확히 일치했다. 최신 한글 이름과 가상 코스 안내도 반영됐다.
- 성공·실패 시 모두 네트워크를 복구하는 검사 절차를 사용했고, 원래 켜져 있던 Wi-Fi·모바일 데이터가 다시 켜짐을 확인했다. 이번 QA 코스와 수신 앱만 제거하고 Running Art 홈을 다시 실행했다.

검증 요약·해시는 [휴대폰 보고서](gpx-export-phone-report.json), 원본 UI XML·수신 GPX·합성 코스 화면은 Git 제외 `.cache/phone-gpx-qa/`에 보관한다. 실제 사용자 코스 좌표와 공유 대상 목록은 공개 문서에 복사하지 않았다. release APK의 개인 SQLite 추출은 Android가 허용하지 않아 수행하지 않았고, 휴대폰 DB 전체 바이트가 같다고 주장하지 않는다. 기존 OSM 코스는 형식·파싱·출처 확인이며 원본 DB 전체 좌표 직접 대조가 아니다. 전체 좌표 대조는 독립 기준이 있는 합성 코스에 수행했다.

이번 후속은 실제 휴대폰 UI·파일 전달 검사와 문서 갱신이다. 앱 코드·의존성 변경이 없어 앞선 자동 검사·빌드를 반복하지 않았다. 타사 지도·피트니스 앱의 가져오기와 OS 수준 실패 상황 등 위 미검증 항목은 유지한다.
