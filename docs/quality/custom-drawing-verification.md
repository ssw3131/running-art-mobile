# 직접 그리기 검증 — 2026-10-04

**2026-10-05 휴대폰 후속 완료:** 실제 터치·기본 도형 전환/취소·5후보 계산/취소·3.01km 저장/재열기, v3 실제 서버 전송·오프라인 수정 재시도·빈 휴대폰 복원과 내용 해시 대조를 통과했다. 시험 자료를 정리하고 원본 자료/계정을 보존했다. 아래 미검증은 당시 기록이며 [후속 검증·한계](phone-validation-20261005.md)를 우선한다.

## 후속 휴대폰 설치 — 23:53:59 KST 완료

사용자가 “폰 연결했어 최종 작업 폰 설치하고 커밋해”라고 요청해 SM-S942N·Android 16에 아래 최종 APK를 `adb install -r --no-streaming`으로 업데이트했다. 설치 성공과 설치본 SHA-256 `427902bff967b436198e814e4e114de8430a5c2cb72389a282ba0cffe2faa7b9` 일치, 앱 ID `com.runningart.mobile.dev`·appId 10319·최초 설치 시각 `2026-09-27 16:29:39`·자료 경로 `/data/user/0/com.runningart.mobile.dev` 유지를 확인했다. APK의 ID/서명은 기존 에뮬레이터 검증본과 같다.

`am start -W`는 Status ok, 앱 프로세스 실행을 확인했고 전후 앱 서비스는 `(nothing)`이다. 새 코스·러닝·공유를 만들거나 계정을 변경하지 않았다. 이번에는 설치·기본 실행 확인만 수행했으며 내부 DB 전체 내용 해시·자료 개수·휴대폰 터치/야외 검증은 하지 않았다. 비공개 자료 디렉터리의 inode 조회는 기기 권한으로 차단되어 확인값으로 사용하지 않는다. 증거는 `.cache/custom-drawing-phone/before-package.txt`, `after-package.txt`와 설치·해시·실행 명령 결과다. 클라우드 설정·배포 변경 없음.

## PC 결과

- 새 검사 7개와 기존 검사 포함 **344개 통과**, TypeScript·ESLint 통과.
- 정규화·종횡비·y축 방향·미리보기, 작은 틈 닫기, 빈/직선/작은/교차/범위 밖/과다 입력 거절, 1,400점 곡선의 49점 이하 단순화를 확인했다.
- 실제 엔진의 사용자 도형 자유 순환 후보 계산, JSON v3의 원형/배치 도형/경로/도로 참조 유지, 손상·미래 형식 거절을 확인했다. 기존 v0.2 원본 회귀 검사도 통과했다.
- SQLite 중복 저장·저장소 재열기, 개인 동기화 파일의 다른 SQLite 복원, 러닝 시작→GPS 저장→종료→원래 코스 삭제 뒤에도 러닝 사본·원형 보존, 러닝 동기화 복원·GPX 설명·공유 목표 도형 유지를 확인했다.
- 비동기 도로 로딩 중 호출자 입력 변경과 취소 후 늦은 결과 억제를 검사했다.
- Android release 빌드 성공(arm64-v8a·x86_64), 네이티브 의존성 추가 없음.

명령: `npm run check`, `node --test tests/*.test.mjs`, `:app:assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a,x86_64`.

## API 36 에뮬레이터

- 최종 APK에서 빈 입력의 적용 비활성, 열린 선 거절, 지우기, 실제 한 획 터치 입력·정리된 미리보기·적용을 통과했다. 삼각형으로 편집하다 취소한 뒤 이전 사각형이 유지되는 것도 확인했다.
- 계산 취소→재계산, 서울 실제 도로 후보 5개·선택·저장·중복 저장 방지를 통과했다. 최종 선택은 3.572523846km, 원형 10점·도로 경로 195점, JSON v3·구간 참조 보존. 67.3초는 UI 자동화 관측을 포함한 단일 계산 대기 시간으로 성능 벤치마크가 아니다.
- 앱 완전 종료 후 저장 코스 재열기·목표 도형 표시, 코스 러닝 준비→시작→GPS 수신→종료·저장과 러닝 사본의 원본 일치를 확인했다. 전체 한 바퀴 이동은 이번 검사에서 반복하지 않았다.
- 도형 선택 안내의 줄바꿈 표시 문제를 수정하고 최종 타입/린트·release·전체 UI 흐름을 재확인했다. 자동화 좌표 인수의 원격 셸 인용, 손 입력의 실제 모서리 점 수와 종료 버튼 문구를 수정한 뒤 최종 스크립트를 통과했다.
- 시험 전 SQLite v7은 빈 검증 DB였다. 시험 후 모든 테이블의 개수·내용 SHA-256과 버전을 동일하게 복구했다. 임시 UI/터치 도우미를 제거하고 앱 서비스를 종료했다. 휴대폰에는 접근하지 않았다.
- 증거: `.cache/custom-drawing-qa/report.json`, `before.json`, `restored.json`, `drawing-square.png`, `drawing-cancel-preserved.png`, `custom-candidate.png`, `saved-reopened.png`, `custom-run-ready.png`, `custom-run-started.png`. 재현 도구는 `scripts/qa/build-drawing-ui.ps1`, `scripts/qa/custom-drawing-emulator.py`이며 emulator-5556만 사용한다.

## 범위와 한계

최초 범위는 기존 화면 스타일의 기능 구현·PC·에뮬레이터·APK 준비였고, 이후 사용자 요청으로 위 휴대폰 설치·기본 실행까지 완료했다. 실제 손가락의 체감·야외 GPS·배터리·실제 Supabase의 v3 왕복은 미검증이다. 클라우드 설정·배포는 바꾸지 않았다. 지도 확대 지연·이미지 도형 추출·Figma 적용은 후속이다.

## APK

- 파일: `build/install/running-art-0.1.0-20261004-custom-drawing.apk`
- 크기: 96,929,042바이트. SHA-256: `427902bff967b436198e814e4e114de8430a5c2cb72389a282ba0cffe2faa7b9`.
- 기존 공유 APK와 같은 서명 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, 앱 ID `com.runningart.mobile.dev` 유지. 최초 PC 완료 때 미설치였으며 후속 승인으로 23:53:59에 휴대폰 설치를 완료했다.
- 최종 에뮬레이터 설치 APK SHA-256도 위 준비 파일과 일치한다.
