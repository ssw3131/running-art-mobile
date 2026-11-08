# 개발 피드백과 통합 검증 시간 단축

- 기록 생성·실행 시작: 2026-11-09T04:36:07+09:00 (Asia/Seoul)
- 상태: 완료 — PR52/main 병합·전체 검증 및 실제 재사용 확인
- 구현·검증 마감: 2026-11-09T06:24:23+09:00 (Asia/Seoul)
- 기록 유형: 실행 시작 시 계획 작성
- 요청·계획 출처: PR49/로컬 작업 통합 완료 후 사용자가 목표 등록과 개선 적용을 요청했다. PC 검증 활용, 머지 시 간소화, 개발 중 기획 변경에 맞춘 테스트 갱신을 함께 검토한다.

## 실행 전 계획

1. 실제 Actions 시간과 반복 실패 원인을 측정하고 유지해야 할 검증 범위를 정한다.
2. 개발 중 draft PR은 빠른 피드백, ready PR은 최종 Android29/36 통합 검증으로 나눈다. 동일 내용의 main은 성공한 전체 PR 검사 증거가 확인될 때만 재사용하고, 증거가 없거나 다르면 전체 검사로 돌아간다.
3. 후반 실패를 빨리 재현할 수 있도록 기존 Android 분야별 진단을 수동 CI에서 선택하게 한다. 진단은 필수 통합 게이트를 대체하지 않는다.
4. PC에서 변경 분야별 기획·테스트·화면 기준 검토 경로를 안내하고, 기획/기대 동작/검사 변경을 같은 작업에서 정리하는 절차와 PR 양식을 적용한다.
5. 재사용 오판·draft/수동 검사 우회·알 수 없는 변경의 누락을 회귀 검사한다. 실제 PR/main 실행으로 검증하고 근거·한계를 기록한 뒤 로컬을 정리한다.

## 측정과 결정

- main 실행213의 API36 작업은2092초(34분52초), 그중 APK 빌드401초·에뮬레이터/시나리오1524초였다. API29는1453초, fast175초, API141초다. 병합 전 PR212에서 동일 트리의 전체 검사가 이미 성공했으므로 main의 중복 Android 실행이 가장 확실한 절감 대상이다.
- 이번 반복 실패에는 스크롤/고정 버튼, 잠금 기본값, 초기 GPS 완료 시점, 확인창 주소 표시 등 변경된 계약과 검사 가정의 차이가 있었다. 다운로드/ADB 준비 장애는 별도로 보존한다.
- PC의 빠른 검사와 Linux 네이티브/실제 DB 검사는 환경·범위가 다르다. PC에서 실행했다고 전체 검사 통과로 표시하지 않는다. 기존 환경에 전체 Android SDK를 새로 설치하지 않는다.
- 준비된 PR에서 API29/36을 함께 검증해 기존 PR+main의 최종 범위를 유지한다. draft/분야별 진단으로 개발 도중 전체 회귀 반복을 줄이고, 내용이 같은 main에서 그 증거를 재사용한다.

## 실행 결과·검증

### 2026-11-09T04:46:42+09:00 구현과 로컬 검증

- Verify를 draft 빠른 검사/development-feedback, ready 전체 검사/verification-gate, 수동 진단/manual-verification으로 구분했다. ready의 API29/36 전체 성공 뒤 Git 트리 증거를 발행하고, main은 연결 PR·최신 성공 실행·실제6개 작업·동일 트리/회차/만료 전 아티팩트를 대조한다. 조회 실패/불일치/누락은 전체 실행으로 돌아간다.
- 기존 Android 분야별 진단을 입력 선택으로 연결했다. 검사 도구의 Python 회귀는 fast에서도 먼저 실행한다. 제품 코드·화면 기준·허용 오차는 변경하지 않았다.
- qa:plan은 미커밋/새 파일을 포함한 분야별 계약·UI 검사·Android 진단·화면 검토 경로를 안내한다. qa:local은 기본 PC의 타입·린트·UI 범위를 명시하고 전체 qa:fast/Android 통과로 표시하지 않는다. 기획 변경 절차·기존 보존 조건·PR 양식과 AGENTS 안내를 함께 보완했다.
- 새 정책/검토 경로 회귀7개, 타입·린트, 전체 UI39묶음191개 통과. actionlint1.7.12 공식 Windows 배포본을 SHA256 6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9로 검증해 워크플로 구문/표현식 검사 통과. 수동 generation 선택의 실제 scope 출력은 matrix=[36], --generation-only였다.
- 최초 PC qa:fast는 로컬 HTTP·임시 Git 저장소의 샌드박스 권한과 실행 가능한 Python 부재로 Node 일부 실패, 사용자 임시 폴더의 Jest 변환 캐시 rename EPERM으로 UI 실행 전 실패했다. source/server-source/OpenAPI/정책 검사는 통과했다. 기존 증거를 .cache/faster-integration/local-fast-first에 보존한다. Jest 캐시를 프로젝트 .cache/jest로 지정한 뒤 UI191개를 재실행해 통과했으며, 이 결과를 전체 qa:fast 성공으로 기록하지 않는다.
- 다음은 draft CI의 비용 축소, ready 전체 검증, 실제 main 재사용 결과를 확인하는 단계다. 아직 원격 동작 검증 완료가 아니다.

### 2026-11-09T05:16:21+09:00 draft 통과와 단독 생성 진단 보완

- 0173bea의 draft 실행216(42516804170)은 총177초, fast 작업146초에 성공했다. Python 도구20개·Node543통과/1기존skip·UI39묶음191개가 통과했고 API/Android는 skipped, 집계는 development-feedback이다. fast 아티팩트13631263247만 발행했으며 전체 검증 증거는 없다. 원본을 .cache/faster-integration/draft216에 보존했다.
- 같은 커밋을 ready로 전환한 실행217(42517091590)은 fast/API 통과 후 API29/36을 검사 중이다. 기존 전체 성공 main7b2f01b를 실제 API로 조회해도 새 트리 증거가 없으므로 reused=false로 판정함을 확인했다(.cache/faster-integration/pre-receipt-fallback.json).
- 수동 suite=android/android_scenario=generation 실행218(42517588289)은 API36만 실행했고 fast/API는 skipped였다. 게스트 차단 뒤 S2a-01-generation의 distance-3 탐색에서 실패했다. manual-verification도 실패했으며 전체 검증 증거는 발행하지 않았다. 아티팩트13632432503을 .cache/faster-integration/manual218에 ZIP/원본 보고서·화면으로 보존했다. 시나리오 재시도0·실패 후 정리는 통과했고 원본 보존 검증 완료로 기록하지 않는다.
- 소스와 실패 PNG를 대조하면 거리3 버튼은 삭제되지 않았다. 첫 화면에서 distance-value만 보일 때 그 아래 눈금 버튼이 화면 밖이었다. 기존 전체 흐름이 앞서 남긴 스크롤 상태에 의존한 단독 진단 문제다. 실제 distance-3와 전체 slider를 찾아 이동하고, 세로 스크롤 뒤에도 실제 버튼을 찾아 선택 보존을 검사한다. 제스처·선택값·계산·저장 assertion은 유지한다.
- 진행 중인 전체217을 취소하지 않도록 동일 기본 폴더의 임시 진단 브랜치에서 이 수정만 먼저 수동 검증한다. 통과 후 PR52에 반영해 최종 전체 검사와 main 재사용을 확인한다. 두 원본 피처 브랜치는 유지한다.

### 2026-11-09T05:43:13+09:00 전체·단독 진단 근거와 현재 결정 연결

- ready 실행217(42517091590)의 scope/fast/API/Android29/36/verification-gate가 모두 통과했다. API36은15단계·자료 보존·정리·화면4개 차이0, API29는7단계·자료 보존·정리가 통과했다. 둘 다 시나리오 재시도0이고 UI 준비 대기/완료 후 전송 경고는 각각6/0과5/1이다. 원본 아티팩트13633396360/13632752388과 검증 증거13633525606을 .cache/faster-integration/ready217-*에 보존했다. 증거의 tree는8106ea1d7c34eae2e3c9ec91ebb9f702ff56b465, source는19c76b9b5a34f0561c7645e12071168b1e485650이다. 이 결과는 이후 거리 탐색 수정까지 검증한 것으로 확대하지 않는다.
- 거리 탐색 수정556b2bc의 수동 실행219(42519401700)은 API36의 generation-only3단계·자료 보존·정리와 manual-verification이 통과했다. 시나리오 재시도0, UI 준비 대기2/전송 경고0이다. Android 작업1452초, 전체 약24분40초였으며 APK 빌드·기동 비용까지 없어지는 진단은 아니다. fast/API는 skipped이고 전체 검증 증거는 없다. 아티팩트13633288746을 .cache/faster-integration/manual219에 보존했다. APK SHA256은8491e5ab44cf590520989c65219d7359a5f7a5374a11a3d9db172b8a4095a200이다.
- current-regressions.md에 최근 사용자 결정과 회귀 경로를 연결했다. 과거 문서의 당시 기획을 최신 정답으로 오인하지 않도록 근거·현재 기대 동작·자료 보존·검사 갱신을 같은 PR에서 관리한다. qa:plan/PR 양식이 이 문서로 안내하며, 단독 진단은 이전 시나리오의 스크롤·입력 상태에 의존하지 않는다고 명시했다. 정책/연결7개와 실제 qa:plan 출력은 통과했다.
- 다음은 이 수정과 안내를 PR52에 모두 반영한 최종 전체 CI, 병합된 main의 실제 동일 트리 재사용, 최종 문서·로컬 정리다. 아직 main 재사용 성공이나 전체 작업 완료로 기록하지 않는다.

### 2026-11-09T06:24:23+09:00 최종 PR 전체 통과·main 재사용 실증

- 최종 head fe9f4fd680c5dc45425525cd1183a46b131d1912의 [PR52 실행220](https://github.com/ssw3131/running-art-mobile/actions/runs/42521664857)은37분32초에 전체 성공했다. source는28c8c040e327e0ce049288c4799ec4906810210d, tree는fde55c2782c5df6626861c78875d147c4fcd1da0이다. Python 도구20개, Node543통과/1기존skip, UI39묶음191개, API 생성556개와 실제 DB/자료 왕복 검사가 통과했다.
- API29는7단계·자료 보존·정리, API36은15단계·자료 보존·정리·기존4화면 차이0이 통과했다. 둘 다 시나리오 재시도0이며 UI 준비 대기/완료 후 전송 경고는 각각7/1과3/0이다. APK SHA256은29가9fb1b029e48546d9f0cfa2e2ded0f34b27a0b3cf6bb8eef346a3df53052c4fbc, 36이645c33310a9f2a932e362810fb5ac33d917601c4274c977755db289b83e9f9bf다. 기준 이미지·마스크·허용 오차는 바꾸지 않았다.
- 아티팩트13633826811(fast),13633746175(API),13634920496(Android29),13635151322(Android36),13634318521(전체 트리 증거)를 .cache/faster-integration/final220-*에 원본 ZIP/보고서로 보존했다. gate의 증거는 같은 tree/source·실행220·회차1·네 검사 묶음 성공을 기록했다.
- [PR52](https://github.com/ssw3131/running-art-mobile/pull/52)를 검증된 head 지정으로 main7112115df25f068ff459a655e925d0dac7d4d5ae에 squash 병합했다. 원격 main의 Git 트리가 증거와 정확히 일치함을 로컬 Git으로도 확인했다.
- [main 실행221](https://github.com/ssw3131/running-art-mobile/actions/runs/42524952443)은30초에 성공했다. scope가 PR52/실행42521664857/회차1/동일 tree를 실제 조회해 reused=true를 기록했고 fast/API/Android는 skipped, verification-gate는 success였다. 이는 main에서 네이티브를 다시 실행한 결과가 아니라 성공한 동일 내용의 PR 전체 검증을 재사용한 결과다. 아티팩트13634039647의 reuse.json을 .cache/faster-integration/main221-reuse에 보존했다.
- 비교 대상 main213은35분13초였다. 이번 main221은30초로34분43초가 줄었다. draft216은2분57초, 최종 전체220은37분32초, 단독 생성219는24분40초였으며 서로 검사 범위가 다르다. 전체 Android와 APK 빌드 시간을 없앴다고 해석하지 않는다. 러너 상태·변경 범위에 따라 다음 실행 시간은 달라진다.
- 기본 PC를 main7112115로 fast-forward했고 완료된 개선/진단 로컬 브랜치를 정리했다. 원본20174345591b569a22d8b542057c16451449a9c4와 fbe31334cadd89dce8d3221ff9551a6c97850eca는 그대로 보존했다. worktree는 기본 폴더 하나이며 원격 브랜치·실패 증거는 삭제하지 않았다. 이 마감 기록은 별도의 문서 PR로 반영하고 문서 검사/main 동기화까지 확인한다.
- 제품 기능·APK 설치·운영 서버/DB/정책·실제 공급자 인증·야외 GPS/배터리·실서버 공지·새 Cloud 작업 검증은 이번 변경 범위가 아니다. PC Python/권한 실패와 최초 단독 진단218 실패는 보존하며, 다른 진단 선택을 각각 네이티브로 실행했다고 확대하지 않는다.
