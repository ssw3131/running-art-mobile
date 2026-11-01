# A7 development APK 교체와 USB Metro 연결

- 기록 생성: 2026-11-01T15:29:12.8537209+09:00
- 실행 시작: 2026-11-01T15:29:12.8537209+09:00
- 상태: 완료 — A7 development 교체·USB Metro·실제 reload·보존 확인
- 기록 유형: 실행 시작 시 계획 작성
- 요청·계획 출처: 2026-11-01 사용자 요청. 검증된 main의 development APK, 동일 서명·더 높은 versionCode 확인 후 로그인·자료 보존 교체. 앱 삭제 금지. Sync·USB8081·Metro 실제 연결/새로고침. PR #39 작업 브랜치 사용 금지.

## 실행 전 계획

1. GitHub main SHA와 필수 검사, 기존 APK를 확인한다. 원격 main은 5126eda(PR #39 병합)로 이동했으나 Android 검사가 진행 중이므로 통과 확인 전 설치하지 않는다. 작업 브랜치는 사용하지 않는다.
2. 해당 main SHA에 고정한 development APK를 수동 빌드한다. 기존 설치 APK를 로컬에 보존하고 서명·앱 ID·versionCode를 대조한다.
3. 교체 전 로그인·보관함·설정과 설치 식별자를 확인한다. 앱을 삭제하거나 데이터를 초기화하지 않고 install -r로만 교체한다.
4. 미커밋 변경과 main 이동을 재확인하고 승인된 SHA와 일치하도록 Sync한다. 실행 기록은 Sync 중 별도 보존한다.
5. USB8081과 Metro를 연결하고 실제 앱 화면·새로고침 및 로그인·자료 보존을 확인한다. Metro는 사용자가 이어 볼 수 있게 남긴다.
6. 실행 결과·실패·한계를 기록한다. 운영 서버/DB/정책·다른 브랜치는 변경하지 않는다.

## 2026-11-01 실행 중 확인

- 원격 main은 dc01251에서 PR #38/#39가 병합된 5126edab30d3b1ba56b45977055c10d9f0ec00d0로 이동했다. main Verify 41280344071의 최종 통과를 설치 선행 조건으로 유지한다. PR #39 작업 브랜치는 조회/전환하지 않았다.
- 15:30 KST Handset APK 41281070442를 main 워크플로, source_ref 전체 SHA 5126eda, kind development로 시작했고 성공했다.
- 기존 A7 SM-A750N/Android10/API29, 앱0.1.0/versionCode215622498, UID10252, 최초 설치2026-10-31 22:14:27. Google 로그인, 코스0/완주0/러닝0, 동기화꺼짐·대기0, 기기 테마 따르기/음성·화면꺼짐 안내 사용을 확인했다. preview는 run-as가 허용되지 않아 교체 전 내부 DB 해시 대조는 불가능하다.
- 기존 APK를 .cache/pc-metro-20261101/installed-before.apk로 보존했고 SHA256 29af66b5fb297b7643668708fa002a8d72fd8ca4873a1adae91707439111f0c6이 기존 기록과 일치한다. 기존 C: 백업은 수정하지 않았다.
- 새 development0.1.0/versionCode215677929, 159263010바이트, SHA256 1327c8577f7d80df37f38073eac6957abd90739f931f9b75317a60367a5383b7. 기존/새 APK apksigner 검증과 인증서 SHA256 3cf9c514017fea99214bce3ad62b5ddfe36cd5271e129c2c7a2019037f96b179 일치. 앱 ID·ARM64/ARMv7·debuggable·내장JS 없음·metadata/sha256 파일 일치·versionCode 증가를 확인했다.
- preview.ps1 Sync -Branch main으로 로컬 main5126eda를 확인했다. 이번 새 실행 기록만 .cache에 잠시 보존/복원했으며 다른 로컬 변경은 없었다. 네이티브 지문76fbf4d970aa18ca42dee438ab18d55752d919bcb764d2500a7581bb8bae3063은 APK와 같다.
- 15:36 KST preview.ps1 Start를 숨겨진 프로세스로 실행했다. 127.0.0.1:8081 상태와 Android manifest/bundle HTTP200, 번들11885108바이트를 확인했다. 최초 기동 직후 연결 거부는 준비 완료 후 정상화됐으며 서버 재시작은 하지 않았다.
- 첫 화면 PNG 캡처는 Node 기본 버퍼1MB 제한 ENOBUFS로 실패했다. 전용 캡처의 버퍼를 늘려 정상 저장했다. 이 실패는 앱/빌드 실패가 아니다.
- 위 상태는 APK 검증/PC 준비까지이며 설치·실제 Metro 화면·새로고침은 아직 실행 전이다. 화면/XML/패키지/메타데이터/로그는 Git 제외 .cache/pc-metro-20261101에만 보존한다.

## 최종 결과 — 2026-11-01 16:06 KST

- [main Verify 41280344071](https://github.com/ssw3131/running-art-mobile/actions/runs/41280344071)의 scope/fast/API/Android29/Android36/verification-gate 전체 success를 확인한 뒤 설치했다. APK와 설치 기준 소스는 main5126eda다.
- [development 빌드41281070442](https://github.com/ssw3131/running-art-mobile/actions/runs/41281070442)는 성공했고, 16:03:37에 A7을 install -r로 교체했다. 앱 삭제/데이터 초기화/강제 다운그레이드는 하지 않았다. 실제 설치 APK의 SHA256도 준비본과 일치한다.
- UID10252·자료 경로·ceDataInode·최초 설치 시각이 같다. 홈/저장코스/완주기록/계정/동기화/설정의 6개 화면 텍스트·접근성 라벨을 개발 도구의 Tools 표시만 제외하고 대조해 모두 일치했다. Google 로그인·코스0/러닝0/완주0·동기화꺼짐/대기0·테마와 안내 설정을 유지한다.
- 처음 권한 대조는 설치 권한까지 포함해 CHANGE_WIFI_MULTICAST_STATE 추가를 감지했다. 실제 Android 보호 등급은 normal이며 development APK의 설치 권한이다. 런타임 권한 구간을 별도로 대조해 위치·저장소 등 기존 권한은 모두 그대로임을 확인했다. 최초 차이와 최종 판정 JSON을 둘 다 보존했다.
- preview.ps1 Connect -Serial로 USB tcp8081 전달을 연결하고 실제 APK의 exp+running-art-mobile 개발 클라이언트 주소로 127.0.0.1:8081을 열었다. Metro peer의 SM-A750N/Android10/API29/앱ID와 실제 로그인 홈 표시를 확인했다.
- 16:05:36 Metro message socket으로 reload를 보냈다. 로딩 화면 이후 로그인 홈·0/5·0/15로 복귀하고 JavaScript peer socket#3→socket#6, Metro Android bundle62ms/SQLite21ms 재요청을 확인했다. 임시 제품 소스 변경은 없었다.
- 안내 서비스는 없으며, 사용자 요청대로 Metro와 USB8081 전달은 실행 상태로 남겼다. Metro launcher PID35032, Node PID38284(이번 실행 값), 로그 .cache/pc-metro-20261101/metro.stdout.log 및 metro.stderr.log. USB를 분리하거나 PC/서버를 종료하면 개발 미리보기 연결이 끊긴다.
- 파일·패키지·화면·로그·APK는 Git 제외 .cache/pc-metro-20261101에 보존했다. 기존 C: 백업은 변경하지 않았다. 임시 worktree는 만들지 않았다.

## 검증 한계와 종료

이번 범위의 설치·연결·새로고침·로그인 및 확인 가능한 자료/설정 보존을 완료했다. 기존 보관함이 비어 있어 비어 있지 않은 코스/러닝 내용 보존 시험은 아니며, preview의 내부 DB를 직접 추출해 전후 해시로 대조한 것도 아니다. 야외 GPS/배터리·실서버 공지 정상 조회·운영 서버/DB/정책 게시·Play 배포는 이번 범위에 포함하지 않는다. 종료 확인: 2026-11-01T16:06:05+09:00. 문서 PR/필수 검사·main 반영과 로컬 브랜치 정리는 저장소 완료 규칙에 따라 이어서 확인한다.
