# Android Studio 설치 안내와 프로젝트 지침 반영

- 기록 생성: 2026-09-25T18:48:29+09:00 (Asia/Seoul)
- 실행 시작일: 2026-09-25
- 상태: 완료
- 종료 확인: 2026-09-25T18:51:54+09:00 (Asia/Seoul)
- 기록 유형: 실행 시작 시 계획 작성
- 요청: Android Studio 설치법을 안내하고 프로젝트 지침에 추가한다.

## 실행 전 계획

1. 공식 Windows 설치 안내와 현재 SDK·JDK·Node·Gradle·AVD 구성을 확인한다.
2. 기존 프로젝트 도구를 재사용하는 Android Studio 설치·열기·실행 안내를 작성한다. IDE 실행 환경과 Gradle JDK, Metro 연결을 구분한다.
3. README·개발 환경·AGENTS·Android 스킬·현재 상태·실행 기록 목록을 갱신한다.
4. 문서 링크·설정·스킬 형식을 검증하고 실제 설치·GUI 실행을 수행했는지 구분해 기록한다.

## 실행 결과

- `docs/development/android-studio.md`에 공식 Windows 설치, 기존 SDK·JDK·Node·AVD·Gradle 캐시 연결, 환경을 상속한 IDE 실행, Gradle 동기화, Metro와 앱 실행 안내를 추가했다.
- AGENTS.md와 Android 스킬에 Android Studio 사용, JDK·생성물 관리, 설치 안내와 실제 설치 검증을 구분하는 규칙을 추가했다.
- README·문서 목차·Windows 안내·Codex 안내·현재 상태와 실행 기록 목록을 갱신했다.
- 앱 소스·의존성·SDK·빌드 설정은 변경하지 않았다. IDE 설치나 Windows 기능 변경은 실행하지 않았다.

## 검증과 종료

- 공식 Android 설치·JDK·Device Manager 안내 및 Expo의 Android 프로젝트 열기 안내를 확인했다.
- 문서·스킬 Markdown 25개, 내부 링크 67개를 검사했고 깨진 링크가 없었다.
- Codex TOML·VS Code JSON·스킬 메타데이터 검사, 변경한 Android 스킬의 공식 `quick_validate.py` 검사가 통과했다.
- 문서의 PowerShell 예제 5개를 파싱했고 구문 오류가 없었다. 명령을 실행해 IDE를 설치·실행한 것은 아니다.
- `git diff --check`가 통과했다. 문서·스킬 변경이므로 앱 빌드·타입·린트를 재실행하지 않았다.

남은 사용자 작업은 Android Studio 설치와 안내대로 SDK·Gradle 설정을 연결한 뒤 실제 GUI 동기화·앱 실행을 확인하는 것이다. 문서·지침 추가 요청은 완료했으며 설치 완료로 표시하지 않는다.
