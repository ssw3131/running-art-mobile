# 프로젝트 참여자용 설치·사용 안내

2026-11-01 기준. GitHub 저장소를 공유받은 사람을 위한 Android 사용 안내다. 환경 상세는 [클라우드·PC·APK 안내](cloud-preview.md), 실제 구현·검증 상태는 [인수인계](../handoff/status.md)를 따른다. 이 문서는 설치 절차이며 모든 PC·기기에서 검증이 완료됐다는 뜻은 아니다.

## 목적에 따라 선택

| 목적 | 준비물 | 읽을 절 |
| --- | --- | --- |
| 폰에서 앱만 사용·검증 | Android 폰, preview APK | 폰 검증만 하기 |
| 개발 중 화면을 빠르게 확인 | Windows PC, Git, 최소 도구, development APK, USB | PC에서 화면 확인 |
| 코드 개발 | 저장소 접근, Codex 클라우드 환경 | 클라우드에서 개발 |
| PC에서 직접 Android 빌드 | Java·Android SDK 등 별도 도구 | [전체 로컬 빌드 안내](android-studio.md) |

## 현재 환경 구조

```text
Codex 클라우드: 코드 수정·빠른 검사
    ↓ 커밋·push
GitHub: 작업 브랜치 → PR → 필수 CI → main 병합·검사
    ├─ PC 소스 동기화 → Metro → USB로 개발용 앱 확인
    └─ Handset APK 수동 빌드 → 폰에 설치·독립 실행 검증
```

기본 PC에는 Git·프로젝트 Node/npm·ADB·Metro를 사용한다. Android Studio·Java·전체 Android SDK·에뮬레이터는 직접 로컬 빌드할 때 준비한다. 클라우드의 미커밋 변경은 PC로 전송되지 않는다. 서버·DB·정책 배포는 소스 동기화나 APK 설치와 별개다.

## 폰 검증만 하기

소스 클론·개발 도구·USB 디버깅이 필요 없다.

1. 담당자에게 **preview APK**와 metadata.json, 검증 항목을 받는다.
2. 직접 받으려면 [GitHub Actions](https://github.com/ssw3131/running-art-mobile/actions)의 성공한 **Handset APK** 실행에서 Artifacts의 `runpen-preview-…` 묶음을 내려받는다. 접근 가능한 GitHub 로그인이 필요하다.
3. 압축을 풀고 APK를 폰으로 옮긴다. 필요하면 해당 브라우저·파일 앱의 ‘알 수 없는 앱 설치’를 허용한다.
4. 기존 RunPen 위에 업데이트 설치하고 실행한다. preview는 PC·Metro 없이 실행하지만 로그인·온라인 데이터에는 인터넷이 필요하다.
5. 기기 모델/Android 버전, metadata.json의 소스 SHA/versionCode, 재현 순서·기대/실제 결과와 화면을 담당자에게 전달한다.

**앱 삭제나 데이터 초기화로 설치 오류를 해결하지 않는다.** 기존 기록이 사라질 수 있다. 버전·서명 오류가 나면 담당자에게 전달한다. Artifacts는 7일 후 만료되므로 필요한 APK·메타데이터·해시는 따로 보관한다.

## PC에서 화면 확인

현재 최소 설치 스크립트는 Windows PowerShell 기준이다. Git for Windows를 먼저 설치하고 원하는 작업 폴더에서 실행한다. 아래 명령의 시작 위치는 저장소 루트다.

```powershell
git clone https://github.com/ssw3131/running-art-mobile.git
cd running-art-mobile
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Setup
Copy-Item .env.example .env.local
```

이미 클론했으면 기존 폴더를 사용한다. `.env.local`이 있으면 복사로 덮어쓰지 않는다. Setup은 프로젝트용 Node·ADB·잠금 파일 의존성을 준비하며 시스템 Path는 변경하지 않는다. `.env.local`에는 담당자가 제공한 앱용 지도·Supabase·공개 서버 주소와 기능 설정을 입력한다. 실제 값은 Git에 올리지 않으며 서버 관리키를 넣지 않는다. 설정이 없으면 지도·로그인·서버 계산 등의 확인이 제한된다.

폰에는 **development APK**를 설치하고 개발자 옵션의 USB 디버깅을 켠다. USB 연결 후 다음 명령으로 기기를 확인하고 폰의 디버깅 허용 창을 승인한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Devices
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Connect -Serial DEVICE_SERIAL
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Start
```

`DEVICE_SERIAL`은 Devices에 표시된 실제 일련번호로 바꾼다. Connect는 해당 폰에 8081 포트를 전달하며 APK를 설치하지 않는다. 폰의 개발용 앱에서 `http://127.0.0.1:8081`에 연결한다. Metro 터미널은 확인 중 켜두고 종료할 때 Ctrl+C를 누른다. USB 재연결 후에는 Connect를 다시 실행한다. Expo Go 대신 프로젝트 development APK를 사용한다.

### 변경 내용 받기

클라우드에서 커밋·push한 뒤 PC의 Metro를 종료하고 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Sync -Branch codex/작업브랜치
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Start
```

병합된 소스를 받으려면 `-Branch main`을 쓴다. Sync는 로컬 변경이나 앞서거나 갈라진 브랜치가 있으면 멈추며 강제로 덮어쓰지 않는다. 의존성 설치 실패 시 소스는 이미 갱신됐을 수 있으므로 Setup 재실행 후 Start한다.

JS/TS·스타일 변경은 호환되는 개발 APK에서 새로고침한다. 네이티브 라이브러리·권한·앱 설정·네이티브 모듈 변경에는 새 APK가 필요하다. Sync의 native fingerprint를 APK metadata.json과 비교하되 호환성의 절대 보증으로 해석하지 않는다.

## 클라우드에서 개발

GitHub 저장소 공유와 Codex 클라우드 환경 접근·준비는 별개다. 저장소를 연결한 Linux x86_64 환경에 아래 설치 명령을 등록한다.

```bash
bash scripts/cloud.sh setup
```

setup은 고정 Node와 의존성을 설치한다. 패키지 다운로드 네트워크, 실제 HOME 아래 `.expo` 생성·쓰기 권한이 필요하다. HOME·상속된 프록시·CA를 유지한다. 환경 준비 후 Publish/Republish와 게시 완료를 확인하고 **새 작업에서 setup/fast의 실제 성공을 확인**한다. 화면별 절차와 권한 요구는 [환경 상세](cloud-preview.md#codex-클라우드)를 따른다.

1. `AGENTS.md`와 [현재 상태](../handoff/status.md)를 읽는다.
2. 기본 작업 폴더에서 `codex/작업명` 브랜치를 만들고 수정한다. 실제 동시 작업일 때만 임시 worktree를 쓴다.
3. 아래 검사 후 커밋·push한다.
4. 필요하면 PC에서 작업 브랜치를 Sync해 화면을 확인한다.
5. PR 필수 검사·main 병합·main 검사 결과를 확인하고 사용한 임시 폴더를 정리한다.

```bash
# 타입·린트
bash scripts/cloud.sh check
# 빠른 검사
bash scripts/cloud.sh fast
```

빠른 검사는 CI의 격리 API·Android 검사를 대체하지 않는다. 빌드 성공, 폰 설치 성공, 실제 기능 검증 성공을 구분해 기록한다.

## APK 생성과 종류 전환

Actions 실행 권한과 기존 `handset-build` 설정이 필요하다. [GitHub Actions](https://github.com/ssw3131/running-art-mobile/actions)에서 **Handset APK → Run workflow**를 선택한다.

| 입력 | 선택 |
| --- | --- |
| 워크플로 브랜치 | main |
| source_ref | main, 저장소의 codex/* 브랜치 또는 허용된 도달 가능한 전체 SHA |
| kind: development | Metro로 개발 화면 반복 확인 |
| kind: preview | 코드·자산을 포함한 독립 실행, 실제 사용·GPS·성능 검증 |

성공한 실행의 Artifacts에는 APK·metadata.json·SHA-256·설치 안내가 있다. CI Verify의 x86_64·localhost APK는 휴대폰 배포용이 아니다. Handset APK는 ARM64·ARMv7을 포함한다.

두 종류는 동일 앱 ID(`com.runningart.mobile.dev`)·고정 테스트 서명으로 **교체 설치**한다. 동시에 설치되는 별도 앱이 아니다. preview 설치 후 Metro를 켜는 것만으로 개발 모드가 되지 않는다. development APK로 교체한 뒤 Connect/Start한다. 낮은 versionCode로 전환이 막히면 원하는 종류를 새로 빌드한다. 삭제로 해결하지 않는다. Play 배포나 공개 Release는 자동으로 실행되지 않는다.

## 담당자에게 받을 자료

| 역할 | 추가로 받을 자료 |
| --- | --- |
| 폰 검증 | preview APK·메타데이터·검증 항목 |
| PC 화면 확인 | development APK·앱용 환경 설정값·작업 브랜치 |
| 개발 | 클라우드 환경 준비 안내·작업 범위·브랜치 |
| APK 생성 | Actions 실행 권한·기존 빌드 설정 사용 안내 |

서명키·서버 관리키는 일반 개발·검증 참여자에게 배포하지 않는다. 키와 CI 환경 구성은 [환경 상세](cloud-preview.md#ci-설정서명)를 참고한다.

## 문제가 생겼을 때

| 증상 | 확인할 내용 |
| --- | --- |
| 폰에서 개발 서버 연결 실패 | development APK인지, Metro 실행·USB 승인·Connect 완료 여부 |
| 클라우드 수정이 안 보임 | 커밋·push 여부, PC Sync 브랜치, 앱 새로고침 |
| 새 기능의 네이티브 모듈 오류 | 현재 소스와 APK 호환성, 새 development APK 필요 여부 |
| 지도·로그인·계산 실패 | `.env.local` 설정, 인터넷, 서버 상태·활성화 설정 |
| Sync 중단 | 로컬 수정·새 파일·브랜치 분기 상태를 보존하고 확인 |
| APK 설치 거부 | versionCode·서명 확인, 담당자에게 새 빌드 요청 |

설치 문제는 사용한 명령·오류 메시지와 함께 전달하며 환경 값·토큰은 로그나 캡처에서 제외한다.
