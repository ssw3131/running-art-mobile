# 최소 50점 추천 검증 — 2026-11-16

기준 cb3a6be의 엔진과 변경 엔진을 공개 저장소 고정 도로 입력으로 비교했다. Node24.21.0, 각1회이며 병렬 검사/초기 컴파일 영향을 포함하므로 성능 개선율을 주장하지 않는다. 점수는 표에서만 소수2자리로 표시하며 필터는 반올림 전 점수다.

| 표본 | 이전 단계 → 이후 단계 | 후보 수 | 대표 점수/합류 거리(m) | 계산 시간(ms), 이전 → 이후 |
| --- | --- | --- | --- | --- |
| grid heart 1km | [300] → [300, 500, 1000] | 5 → 0 | 44.76/180.0 → 없음 | 9342 → 6078 |
| seoul whale 1km | [300] → [300] | 5 → 5 | 51.58/135.4 → 51.58/135.4 | 5157 → 4812 |
| seoul heart 3km | [300, 500, 1000] → [300, 500, 1000] | 5 → 5 | 67.96/459.9 → 67.96/459.9 | 11779 → 10492 |
| seoul whale 3km | [300] → [300] | 5 → 5 | 56.62/0.0 → 56.62/0.0 | 9572 → 9392 |

실제 도로3표본의 전체5개 점수·합류 거리·기본 선택은 전후 동일하다. 격자 하트1km는 이전 44.76~45.99점5개/300m 중단에서 이후3단계 검토/0개로 바뀌었다. 기존 광역 baseline과 점수식은 유지한다.

## 로컬 검사

검증 진행 중. 초기 Node24.19 경고와 sandbox의 HTTP/자식 프로세스 제한·Expo 홈 쓰기 제한을 확인해 지원 Node24.21 및 필요한 네트워크 권한/직접 ESLint로 검증한다. 최초 UI 문구 부분 문자열 검사의 exact-match 실패는 정규식으로 수정했고, 기존 UI-GEN-01의 병렬 초기 렌더 시간 초과는 원본 `/tmp/nearby-ui.log`에 보존했다. HTTP 진행은200ms 제한 때문에 중간500m 이벤트를 생략할 수 있어 최종 메타데이터의 세 단계를 검증하도록 테스트 기대를 수정했다. 제품 서버의 진행 전송 정책은 변경하지 않았다.

### 22:37 KST 로컬 결과

- Node24.21.0의 `--test tests/nearby-*.test.mjs tests/route-engine-*.test.mjs tests/usage-generation-credit.test.mjs`: 55개 통과.
- 관련 UI `course-generation`/`recommendation-approach`: 23개 통과. 처음 UI-GEN-01 시간 초과는 같은 제품 코드로 지원 Node/네트워크 권한에서 재검증해 통과했으며 원인은 확정하지 않는다.
- TypeScript `tsc --noEmit` 통과. 전체 UI/Expo lint·PR CI는 진행 중.
- 직접 `eslint .`는 Expo의 기존 검사 범위를 벗어난 scripts/tests까지 검사해 기존 no-undef 등을 보고했다. 제품 변경으로 해결하지 않고 프로젝트 명령인 `expo lint`를 실행한다.

### 22:39 KST 후속

전체 UI44 suites/250개·프로젝트 `expo lint` 통과. 서버 번들은 파일 목록을 명시하므로 새 공통 상수를 두 패키저에 추가했다. 이는 배포 파일 누락 방지이며 API/운영 배포 변경은 아니다. 기존 격리 패키지 검사를 추가 실행한다. [PR70](https://github.com/ssw3131/running-art-mobile/pull/70) draft/빠른 검사 진행 중.

격리 서버 번들 검사1개 통과(저장소 밖 복사본의 기동·확장 입력 계산). `/tmp/nearby-package.log`. 이 검사에서 실제 운영 서버를 호출하거나 배포하지 않았다.

## 2026-11-16T23:57:03+09:00 최종 결과

[PR70](https://github.com/ssw3131/running-art-mobile/pull/70)을 main9dcd638에 squash 반영했다. [최종 전체 검사](https://github.com/ssw3131/running-art-mobile/actions/runs/43878480608)는 fast/API·Android36 기능15단계/정적4화면 차이0·Android29 호환7단계·자료 보존/정리·verification-gate가 통과했다. 원격 로직609개/기존skip1·UI250개다. [main 검사](https://github.com/ssw3131/running-art-mobile/actions/runs/43890837738)도 같은 tree의 PR 증거 재사용으로 통과했다.

최초 Android29는 Maestro 서버의 포트46251 bind 충돌(Address already in use)로 첫 흐름 실행 전 실패했다. 기기 로그/실패 보고서/정리 결과를 보존하고 해당 job만 같은 소스로1회 재실행해 통과했다. Android36은 첫 회차 통과다. draft 중단 이력과 최초 재실행 요청의 실행중403도 [원본 근거](evidence/pr70-minimum-score/README.md)에 구분했다. 코드·검사 기한·화면 기준을 완화하지 않았다.

새 회귀4개를 수정 전 엔진에도 적용해 최소 점수·빈 결과·중복/상한·단계 확장의4개 모두 실패하고, 수정 후4개 모두 통과함을 확인했다. 실제 도로3표본/격자1표본 비교와 로컬55개·번들1개 결과는 위와 같다. 운영 배포·휴대폰 설치·야외 시험은 이번 범위 밖이며 미실행이다.
