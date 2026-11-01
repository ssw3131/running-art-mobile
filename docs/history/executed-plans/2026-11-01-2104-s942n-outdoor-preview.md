# SM-S942N 야외 테스트용 preview 설치

- 기록 생성: 2026-11-01T21:02:43.6631680+09:00 (Asia/Seoul)
- 실행 시작: 2026-11-01T21:02:43.6631680+09:00
- 상태: 완료
- 기록 유형: 실행 시작 시 계획 작성
- 요청 출처: 사용자의 ‘폰 바꿨어 여기엔 야외 테스트용 설치해보자’

## 실행 전 계획

연결된 SM-S942N의 기존 설치·로그인·자료 상태를 확인한다. 검증된 main 8fa5cdc(5126eda 이후 문서만 변경)의 preview APK를 수동 빌드한다. 앱 ID·서명·versionCode 증가·APK 해시를 대조한 뒤 삭제/자료 초기화 없이 교체한다. USB Metro 전달 없이 홈·기존 기록·재실행을 확인하고 결과와 미검증 범위를 기록한다. 야외 기록을 대신 시작하거나 기존 자료를 수정하지 않는다.

## 실행 결과

진행 중. 기존 versionCode 1, Android 17/API37, 실행 중 앱 서비스 없음. 증거는 Git 제외 .cache/outdoor-preview-20261101에 보관한다.

## 2026-11-01T21:07:43.1848474+09:00 서명 대응·사용자 후속

기존 설치본은 과거 Expo 기본 테스트 인증서 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c이고 Actions 공통 키 3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179와 다르다. 현재 설치된 expo/template.tgz의 기본 debug.keystore 인증서가 기존 설치본과 일치함을 확인했다. Actions 원본 산출물을 보존하고 기기 호환용 사본만 기존 테스트 키로 재서명하며 APK 페이로드가 동일한지 대조한다. C: 백업과 Actions 키 설정은 변경하지 않는다.

사용자가 ‘꼭 자료 유지할 필요는 없어’라고 후속 지시했다. 보존을 필수 조건으로 삼지 않고 추가 장시간 자료 검사는 생략한다. 이미 코스4·러닝11·좌표1918·메모1의 해시와 Google 로그인·동기화 ON/대기0을 읽기 전용으로 확보했다. 현재 서명 호환 설치가 가능하므로 삭제 없이 진행한다.

## 설치·검증 결과 (2026-11-01T21:19:32.0842305+09:00)

- 소스: main 8fa5cdcc6d881a3f9b4805a2eaae6cdd09234303. 전체 Android 검증 main 5126eda 이후 문서만 변경, 최신 main Verify 41283967709 success.
- [Handset APK 실행](https://github.com/ssw3131/running-art-mobile/actions/runs/41304640664): source/build success, artifact 13082524333. ZIP SHA-256 fe0699c03a7eb42fe49e244f94c5be0946aebf3cb48b60ac7774df175cca0564.
- preview 원본 SHA-256 14825b481ca1bd94be0c7395ab7a6004a29d43ed200aba348c17df36005d25d4. versionCode 215697928(기존1보다 높음), arm64-v8a/armeabi-v7a, non-debuggable, JS 번들 포함.
- 기존 테스트 키로 재서명한 기기용 사본 SHA-256 81fd9ea859449a5dff42dcedc3010a667acf3e6ea1d57b87179c855da30104cc. 원본과 서명 메타데이터를 제외한 1,461개 ZIP 항목의 압축 해제 바이트 해시가 모두 같다. Actions 원본 metadata는 수정하지 않았고 재서명 검증은 별도 apk-verification.json으로 보관했다.
- 21:18:14 KST SM-S942N(Android17/API37)에 adb install -r --no-incremental 성공. 실제 설치 APK 해시 일치, 앱 ID/최초 설치시각(2026-09-27 16:29:39)/자료 디렉터리/ceDataInode 유지. RunPen 삭제·데이터 초기화 없음.
- Google 로그인 화면 동일, 저장 코스4·러닝11·좌표1918·메모1의 내용 해시 전후 일치. 사전에 확보한 비교만 짧게 수행했다. 위치 ON, 정확한 위치·백그라운드 위치·알림 권한 허용 상태를 확인했다.
- 해당 기기 reverse 목록이 빈 상태에서 홈 실행과 force-stop 후 재실행 통과. Metro/PC 연결 없이 사용하는 preview다. 지도·계정·온라인 계산에는 인터넷이 필요하다.
- 기존 PhoneValidation 도우미의 inspect(읽기 전용)만 사용했다. 임시 도우미 패키지를 제거했고 최종 앱 서비스 없음·홈 복귀를 확인했다. Play Protect의 선택적 앱 전송은 거절했으며 시스템 보호 설정은 변경하지 않았다.
- APK·원본 ZIP·metadata·비교 JSON·화면·검사 스크립트는 Git 제외 .cache/outdoor-preview-20261101에 보관한다. 이전 A7 development와 PC Metro는 변경하지 않았다.

## 실패·제약과 후속

- keytool의 기본 한국어 locale 출력 오류는 영어 locale을 지정해 인증서를 확인했다. 기존/Actions 서명 불일치는 설치 시도 전에 발견하고 동일 기존 키 재서명으로 해결했다. 빌드·설치 실패나 앱 삭제로 해결하지 않았다.
- 앞으로 이 휴대폰은 기존 fac617… 인증서를 유지하므로 공통 Actions 3cf9c5… APK를 그대로 업데이트할 수 없다. 같은 키로 호환 사본을 준비해야 한다. 이번 작업에서 전역 서명 설정을 바꾸지 않았다.
- 야외 실제 이동·GPS 정확도·잠금 장시간·배터리 소모 시험은 사용자 후속이다. 실제 러닝을 시작하거나 새 시험 자료를 생성하지 않았다.
- 새 Cloud 환경 재게시 검증은 사용자가 나중으로 미뤘으므로 실행하지 않았다. 운영 서버·DB·정책·Play 배포 없음.
- 설치 작업 종료: 2026-11-01T21:19:32.0842305+09:00. 문서 변경은 필수 PR/main 검사와 병합 후 기본 main으로 복귀한다.
