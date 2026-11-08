# 외부 서비스 공동 관리자 추가

- 기록 생성: 2026-11-01T21:38:53+09:00 (Asia/Seoul)
- 실행 시작: 2026-11-01T21:38:53+09:00
- 상태: 부분 완료
- 기록 유형: 실행 시작 시 계획 작성
- 요청·계획 출처: 사용자가 팀 계정을 외부 서비스의 추가 관리자로 요청하고, 기존 계정과 함께 전체 운영·멤버·결제까지 관리하도록 선택했다. 공개 기록에서는 이메일·계정 식별 정보를 제외한다.

## 실행 전 계획

1. 현재 프로젝트 문서와 로그인된 콘솔에서 사용 중인 서비스와 관리 범위를 확인한다.
2. 기존 관리자를 유지하고 Cloudflare 최고 관리자, Supabase 조직 Owner, Google Cloud 프로젝트 소유자 및 연결 결제 계정 관리자로 대상 계정을 추가한다.
3. 나머지 외부 서비스는 실제 로그인·멤버 기능·요금제와 계정 식별 조건을 확인한다. 계정 이전·유료 전환은 수행하지 않는다.
4. 초대 발송, 수락 대기, 적용 완료, 접근 불가를 구분하여 결과와 남은 작업을 기록한다. 앱·API·DB 데이터·배포는 변경하지 않는다.

## 실행 결과

| 서비스 | 범위·권한 | 2026-11-01 확인 결과 |
| --- | --- | --- |
| Cloudflare | 기존 계정 전체, Super Administrator - All Privileges | 초대 발송, Pending. 멤버 상세의 Entire account·최고 관리자 정책 확인 |
| Supabase | 운영 조직, Owner | 초대 발송 성공, 대상 계정·Invited·Owner 확인 |
| Google Cloud | 운영 프로젝트, Owner (Legacy) | 초대 발송, IAM 경고 팝업의 수락 대기 확인 |
| Google Cloud Billing | 연결된 기존 결제 계정, 결제 계정 관리자 | 정책 저장 성공, 관리자 2명으로 기존 계정과 대상 계정 확인 |

기존 관리자를 제거하거나 권한을 낮추지 않았다. 결제 계정은 두 프로젝트가 공유하고 있어 결제 관리 범위는 연결된 두 프로젝트를 포함한다. 결제 수단·유료 전환·예산·서비스 배포·앱·DB 자료는 변경하지 않았다. Google Payments 프로필 사용자 권한은 별도로 검증하지 않았다.

MapTiler, 카카오, 네이버는 기존 관리자 로그인이 풀려 있어 로그인 화면까지 준비했다. 카카오는 대상 이메일이 실제 카카오 로그인 이메일인지, 네이버는 추가 대상 네이버 아이디 확인이 필요하다. GitHub는 개인 소유 저장소로 공동 소유자 추가를 지원하지 않으므로 조직 전환은 별도 결정 사항이다. 예스닉 도메인 등록 계정과 Figma 관리 권한은 이번에 변경하지 않았다.

## 검증

로그인된 Chrome 콘솔에서 초대 전후 멤버 목록·역할·상태를 확인했다. Google 결제 정책 저장이 지연되어 같은 관리 화면을 새 탭으로 읽었고, 관리자 2명과 기존 탭의 저장 성공 알림을 확인했다. 중복 저장하지 않았다.

로컬 증거는 `test-results/shared-service-admin/`의 Cloudflare 정책, Supabase Invited Owner, Google 소유자 수락 대기, Google 결제 관리자 화면 4장이다. 대상 계정으로 수락·실제 로그인한 결과는 아직 없다.

공식 근거: [Cloudflare 역할](https://developers.cloudflare.com/fundamentals/manage-members/roles/), [Supabase 접근 제어](https://supabase.com/docs/guides/platform/access-control), [Google 결제 권한](https://docs.cloud.google.com/billing/docs/how-to/grant-access-to-billing), [MapTiler 팀 계정](https://docs.maptiler.com/guides/account/team-account/), [카카오 팀 관리](https://developers.kakao.com/docs/ko/app-setting/app), [네이버 관리자](https://developers.naver.com/products/intro/faq/faq.md), [GitHub 개인 저장소 권한](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository).

## 남은 작업과 종료

- Cloudflare·Supabase·Google 프로젝트 소유자 초대 수락 및 대상 계정 접근 검증.
- MapTiler·카카오·네이버 기존 관리자 로그인, 대상 계정 식별 후 지원되는 공동 관리 권한 추가.
- GitHub 조직 전환 여부 결정. 예스닉·Figma 공동 관리 방식 확인.
- 마지막 확인: 2026-11-01T21:43:27+09:00. 전체 서비스 관리자 추가 완료로 간주하지 않는다.

## 기록 저장 후속

문서 링크 검사와 docs-only 범위 검사를 통과했다. 로컬 작업 브랜치에 결과를 커밋했다. 최초 push는 DNS 제한으로 실패했고, 네트워크 권한 요청은 자동 승인 검토에서 관리자·계정 정보의 공개 외부 저장소 전송을 사용자에게 명시적으로 승인받지 않았다는 이유로 거부됐다. 우회하지 않았으며 공개 전 정보 제거 또는 공개 승인 여부를 사용자에게 질문했다. 원격 push·PR·필수 검사·main 반영은 미완료다.

사용자는 민감한 계정 정보를 제외한 기록만 공개하도록 선택했다. 원본 커밋은 로컬에 보존하고, 기존 main에서 만든 별도 공개용 브랜치에는 이메일·계정 식별 정보를 제거한 문서만 새 커밋으로 담는다. 원본 민감 커밋과 화면 증거는 원격에 전송하지 않는다.

공개용 기록의 로컬 문서 검사와 범위 검사를 통과하고 [PR #44](https://github.com/ssw3131/running-art-mobile/pull/44)를 생성했다. 최신 main의 별도 사용 안내 기록과 목록 충돌은 두 항목을 모두 보존하여 해결했다. 이 PR의 병합·검사 상태는 GitHub 결과를 따른다.

## 2026-11-08 카카오·네이버 후속 재개

- 재개 시각: 2026-11-08T10:45:32+09:00.
- 사용자 제공 대상 계정으로 카카오 Editor와 네이버 애플리케이션 관리자를 추가한다. 기존 소유자·관리자를 유지하고, 등록 전후 목록 및 역할·초대 상태를 확인한다.
- 공개 기록에는 이메일·아이디·계정 식별 정보를 포함하지 않고 화면 증거는 로컬에 보관한다. 다른 서비스의 초대 수락이나 대상 계정 실제 접근을 이번 등록 결과로 대체하지 않는다.
- 실행 결과: 카카오·네이버 등록 완료. 전체 외부 서비스 작업은 부분 완료 상태를 유지한다.

### 실행 결과와 검증

- 카카오: 기존 Owner의 활성 상태를 확인한 뒤 사용자 지정 계정을 Editor로 추가했다. 저장 후 멤버 목록에서 대상 계정의 `Editor`·`활성`과 기존 Owner 유지를 확인했다. UI에 명시된 Editor 제한은 앱 삭제·멤버 추가·앱 키 재발급 제외다.
- 네이버: RunPen의 멤버관리에서 사용자 지정 네이버 ID를 관리자 항목에 입력하고 추가했다. 입력용 칸과 별도로 읽기 전용 관리자 행이 생성되어 등록된 것을 확인했다. 기존 소유자 변경이나 테스터 등록은 하지 않았다.
- 로컬 증거: `test-results/shared-service-admin/kakao-editor-active-20261108.png`, `test-results/shared-service-admin/naver-admin-added-20261108.png`. Git 제외 여부를 확인하며 원격에는 전송하지 않는다.
- 두 대상 계정으로 실제 로그인해 관리 기능을 사용하는 검증은 미실행이다. 기존 Cloudflare·Supabase·Google 프로젝트 초대 수락 여부는 이번에 재조회하지 않았다.
- 이전 대화의 후속 조사: MapTiler Free 계정의 Team 화면에는 업그레이드 안내만 있어 추가하지 않았다. 공식 팀 계정 안내는 Custom 플랜을 명시한다. 요금제 변경·계정 이전은 미실행이다.
- 마지막 서비스 확인: 2026-11-08T10:47:16+09:00.

### 남은 작업

카카오·네이버 대상 계정의 실제 접근 확인, 기존 세 서비스의 초대 수락·접근 검증, MapTiler 공동 관리 요금제 결정, GitHub 조직 전환 여부 및 예스닉·Figma 공동 관리 방식 확인이 남아 있다. 앱·API·DB·배포·결제 수단은 이번 후속에서 변경하지 않았다.
