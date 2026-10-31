# 클라우드 개발·PC 미리보기·휴대폰 APK

코드는 GitHub를 기준으로 관리하고 Codex 클라우드에서 수정합니다. 기본 PC에는 Git, 프로젝트 Node/npm, ADB, Metro만 둡니다. Java·전체 Android SDK·에뮬레이터는 필수가 아닙니다. 기존 전체 로컬 빌드 안내는 직접 빌드할 때만 사용합니다.

## Codex 클라우드

이 GitHub 저장소를 연결한 Linux x86_64 환경에 다음 명령을 등록합니다.

- 최초 설치/잠금 파일 변경 후: `bash scripts/cloud.sh setup`
- 타입·린트: `bash scripts/cloud.sh check`
- 빠른 검사: `bash scripts/cloud.sh fast`

스크립트는 고정 Node를 공식 SHA-256으로 확인하고 프로젝트 내부에 설치합니다. 설치에는 nodejs.org, registry.npmjs.org 및 잠금 파일의 배포 호스트 접근이 필요합니다. 개인 서명키·운영 관리 자격 증명을 이 환경에 제공하지 않습니다. 빠른 검사는 기존 CI의 격리 API/Android 검증을 대체하지 않습니다.

스크립트 추가와 실제 환경 게시는 별개입니다. 새 클라우드 작업에서 위 명령의 성공을 확인해야 클라우드 세팅 완료입니다.

`codex/` 작업 브랜치에서 수정하고 확인할 시점에 커밋·push합니다. 클라우드 미커밋 수정은 PC로 실시간 전송되지 않습니다. 완료 조건은 PR 필수 검사·main 반영 확인과 사용한 임시 작업 폴더 정리입니다.

## 기본 PC

기본 폴더 `D:\running-art\running-art-mobile`에서 실행합니다. 사용자/시스템 Path는 변경하지 않습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Setup
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Devices
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Connect -Serial DEVICE_SERIAL
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Start
```

Setup은 Node·ADB·잠금 파일 의존성만 준비합니다. USB 디버깅 승인은 휴대폰에서 합니다. Connect는 명시한 기기에 8081 포트를 전달하며 앱을 설치/삭제하지 않습니다. 개발용 APK를 설치한 휴대폰에서 개발 서버 주소 http://127.0.0.1:8081 로 연결합니다. Start는 USB 포트 전달에 맞게 IPv4 localhost로 실행합니다. Node의 주소 선택 옵션은 Metro 실행 중에만 적용하고 종료 시 원래 값으로 복원합니다.

클라우드 변경 확인 시 Metro를 종료하고 다음 명령을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Sync -Branch codex/작업브랜치
powershell -ExecutionPolicy Bypass -File .\preview.ps1 Start
```

Sync는 추적/새 파일 변경이 있으면 멈추고 ahead/diverged 브랜치를 덮어쓰지 않습니다. fast-forward만 허용하고 잠금 파일이 바뀌면 npm ci를 실행합니다. 설치 실패 시 소스는 이미 갱신됐을 수 있으므로 Setup을 재실행합니다. Git 제외 로컬 설정은 유지합니다.

일반 JS/TS·스타일 수정은 호환되는 개발 APK에서 새로고침합니다. 네이티브 라이브러리·권한·앱 설정·네이티브 모듈 수정은 새 APK가 필요합니다. Sync의 native fingerprint와 APK metadata.json을 비교합니다. 이 지문은 보수적인 판단 자료이며 모든 네이티브 호환성을 보증하지 않습니다.

## APK 생성·다운로드

GitHub Actions의 **Handset APK → Run workflow**에서 워크플로 브랜치는 main으로 두고 source_ref와 kind를 선택합니다. source_ref는 main, 저장소의 codex/* 브랜치 또는 해당 브랜치에서 도달 가능한 전체 SHA만 허용합니다. 빌드 기능을 포함한 커밋을 선택해야 합니다.

| kind | 용도 |
| --- | --- |
| development | Metro 연결로 화면 반복 확인 |
| preview | 코드·자산을 포함해 Metro 없이 실행. 다른 PC/휴대폰·성능·GPS 확인 |

두 종류는 `com.runningart.mobile.dev` 및 동일 고정 테스트 서명으로 교체 설치합니다. 동시에 설치되는 별도 앱이 아닙니다. ARM64와 ARMv7을 포함해 기존 32비트 A10e도 대상으로 합니다. 기존 Verify의 x86_64·localhost APK는 CI 전용입니다.

versionCode는 2020-01-01 이후 빌드 시점의 초 값입니다. 오래된 APK로 돌아갈 때 버전 제한이 생길 수 있으며 자동 삭제로 해결하지 않습니다.

성공한 실행의 Artifacts에서 묶음을 받아 압축을 풀면 APK, metadata.json, SHA-256, 한글 설치 안내가 있습니다. 해당 산출물 접근이 가능한 GitHub 로그인이 필요하며 소스 클론·Node·Android Studio는 필요하지 않습니다. 현재 저장소는 공개이므로 서명키나 비밀 자료를 산출물에 넣지 않습니다. 휴대폰으로 직접 받아 설치할 수도 있습니다. 다른 Windows PC에서 APK 자체를 실행하려면 별도 에뮬레이터가 필요합니다.

Artifacts는 7일 후 만료됩니다. 중요한 설치본은 메타데이터·해시와 함께 별도 백업합니다. Play 배포나 공개 Release는 자동 실행하지 않습니다. 독립 실행 앱도 로그인·온라인 데이터 기능에는 인터넷이 필요합니다.

## CI 설정·서명

`handset-build` GitHub Environment의 실행 브랜치를 main으로 제한합니다. 저장소 관리자가 신뢰할 수 있는 main/codex 소스만 수동 빌드합니다. 기존 Verify에는 실제 설정/키를 넣지 않습니다.

Environment secrets:

- RUNPEN_KEYSTORE_BASE64, RUNPEN_STORE_PASSWORD, RUNPEN_KEY_PASSWORD, RUNPEN_KEY_ALIAS
- EXPO_PUBLIC_MAPTILER_API_KEY, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- EXPO_PUBLIC_COMPUTE_BASE_URL, EXPO_PUBLIC_ROAD_BASE_URL, EXPO_PUBLIC_RUN_SHARE_URL

Environment variables:

- RUNPEN_CERT_SHA256
- 기존 EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED, EXPO_PUBLIC_AUTH_KAKAO_ENABLED, EXPO_PUBLIC_AUTH_NAVER_ENABLED, EXPO_PUBLIC_PROFILE_PHOTOS_ENABLED

EXPO_PUBLIC 값은 앱에 포함됩니다. 서버 관리키를 넣지 않습니다. 빌드 전에 필수 값·HTTPS·로컬 주소·Supabase secret/service-role 혼입을 검사합니다. 서명 변경에 영향을 받는 OAuth/키 해시 등록은 실제 로그인으로 확인합니다.

키는 빌드 시 임시 복원하고 종료 시 제거합니다. 캐시나 Artifacts에 포함하지 않습니다. 암호화된 키와 암호 복구 수단을 별도 보관합니다. Windows DPAPI 암호 파일은 같은 PC·사용자에 종속되므로 다른 PC 복원을 위해 비밀번호 관리자에도 암호를 보관해야 합니다.

기존 키가 없으면 새 고정 키로 시작합니다. 기존 설치본과 서명이 다르면 자료 보존 여부를 확인한 뒤 재설치합니다. 앱 설치 성공만으로 로그인·GPS·성능 통과로 기록하지 않습니다.

## 검증·비용·백업

Codex 포함 한도로 시작하고 추가 크레딧을 구매하지 않습니다. 표준 Ubuntu Actions 러너와 수동 APK 생성만 사용합니다. 실제 계정 사용량을 확인하며 예산·유료 러너·저장 한도를 임의 상향하지 않습니다.

새 클라우드 작업, PC Metro/ADB, 개발 APK 새로고침, preview 독립 실행, 두 APK 교체 설치, 다른 PC 다운로드를 각각 검증합니다. 실제 기기·다른 PC를 확인하지 못한 항목은 미검증으로 기록합니다.

기존 자료의 C: 백업에는 파일·해시·Git bundle·미커밋 patch·복원 설명이 있습니다. 복원은 새 경로에서 먼저 확인합니다. 삭제는 백업과 마지막 원본 상태 확인 및 최소 환경 검증 후 수행합니다. junction 연결 대상, 미확인 파일, 다른 프로젝트/전역 도구는 제거하지 않습니다.
