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

## 폰 검증만 하기 — GitHub로 진행

기본 흐름은 **GitHub에서 preview APK 받기 → 폰에 설치·검증 → GitHub Issues에 결과 남기기**다. 소스 클론·개발 도구·USB 디버깅은 필요 없다. 개발자에게 매번 APK 파일을 전달받을 필요도 없다.

### 1. 검증할 APK 다운로드

1. GitHub에 로그인하고 [저장소 Actions](https://github.com/ssw3131/running-art-mobile/actions)에서 **Handset APK**를 선택한다.
2. 검증 요청에 지정된 브랜치·커밋의 성공한 실행을 연다. 단순히 최신 실행을 고르지 말고 대상 버전을 확인한다.
3. 하단 **Artifacts**에서 `runpen-preview-…` 묶음을 내려받고 압축을 푼다. APK와 metadata.json·SHA-256·설치 안내가 함께 들어 있다.

다운로드에는 산출물에 접근 가능한 GitHub 로그인이 필요하며 워크플로 실행 권한은 필요하지 않다. Artifacts는 7일 후 만료되므로 필요한 APK·메타데이터·해시는 별도로 보관한다. 만료된 경우 새 빌드를 요청한다.

### 2. 폰에 설치하고 검증

APK를 Android 폰으로 옮겨 설치한다. 필요하면 해당 브라우저·파일 앱의 ‘알 수 없는 앱 설치’를 허용한다. 기존 RunPen 위에 업데이트 설치하고 요청받은 항목을 확인한다.

preview는 PC·Metro 없이 실행하지만 로그인·온라인 데이터에는 인터넷이 필요하다. **앱 삭제나 데이터 초기화로 설치 오류를 해결하지 않는다.** 기존 기록이 사라질 수 있다. 버전·서명 오류가 나면 오류 내용과 기존/새 APK 버전을 남긴다.

### 3. GitHub Issues에 결과 등록

[GitHub Issues](https://github.com/ssw3131/running-art-mobile/issues)에서 기존 관련 이슈를 확인하고, 있으면 댓글로 결과를 추가한다. 새 문제면 New issue로 등록한다. 정상 확인 결과도 관련 검증 이슈에 남겨 어떤 버전을 어디까지 확인했는지 공유한다. Issues 작성에는 저장소의 해당 기능 접근 권한이 필요하다.

다음 양식을 본문에 복사한다. 계정·토큰·개인 위치 등은 캡처와 로그에서 제외한다.

```text
검증 대상: 브랜치 / 소스 SHA / versionCode (metadata.json 참고)
APK 빌드: GitHub Actions 실행 링크
기기: 모델 / Android 버전
검증 항목:
재현 순서:
기대한 결과:
실제 결과: 정상 / 오류 / 미검증 및 이유
첨부: 화면 캡처·녹화·오류 메시지
```

### APK를 직접 생성할 권한이 있는 경우

검증 담당자에게 Actions 실행 권한이 있으면 직접 빌드할 수 있다.

1. Actions → Handset APK → **Run workflow**를 선택한다.
2. 워크플로 브랜치는 `main`, `source_ref`는 검증할 `main` 또는 `codex/*` 브랜치 등 허용된 소스, `kind`는 **preview**로 지정한다.
3. 실행 성공 후 Artifacts에서 내려받는다. 환경 승인 대기가 나타나면 승인 권한자의 처리를 기다린다.

실행 버튼이나 권한이 없으면 개발 담당자에게 대상 브랜치의 preview 빌드를 요청하고, 성공한 실행에서 직접 다운로드한다. 빌드 설정·서명키를 검증 담당자의 PC에 설치할 필요는 없다.

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
| 폰 검증 | 검증할 Actions 실행 링크·브랜치/버전·검증 항목·결과를 남길 Issues 링크 |
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
