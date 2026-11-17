# 최소 50점 서버 배포 준비 — 2026-11-17

사용자의 운영 배포 요청 후 준비한 근거다. **업로드와 트래픽 전환은 미실행이며 배포 성공 증거가 아니다.** 현재 클라우드에는 Google Cloud 배포 인증이 없다. 기존 PC의 인증을 사용하거나 이 클라우드에 인증을 연결해야 이어갈 수 있다.

- 소스: main `c25f6c78ec5492e1dd4ebbcbd7f7348a86e1fe15`, [필수 main 검사 성공](https://github.com/ssw3131/running-art-mobile/actions/runs/43891613731).
- [묶음 확인](bundle-verification.json): 허용 목록23소스/생성4파일, 커밋과 전체 소스 바이트 일치. ZIP57,880바이트, SHA-256 `92ab45600f43eec903f3962db788e5c080d6ded6cc4717d6d306a8232c12eb38`.
- 로컬 Node24.21.0의 `node --test tests/route-compute-package.test.mjs tests/nearby-minimum-score.test.mjs tests/nearby-stream.test.mjs`: 9통과/0실패. 독립 시작/계산, 원점수50점 경계, 미달 단계 확장/빈 결과, 스트림/취소/예약 해제 확인. 운영 인증 생성은 실행하지 않았다.
- [운영 사전 확인](production-preflight.json): 직접 Cloud Run과 앱 도메인 각각 health200, 잘못된 본문400, v1/v2/v3의 operation_required400, 총10개 통과. 공개 강남 좌표만 사용했으며 작업 ID/인증 헤더가 없어 계산·사용량 예약 전에 거부된다. 이 결과는 현재 서버의50점 필터 적용이나 현재 리비전을 증명하지 않는다.

실제 묶음은 Git 제외 `build/route-compute/minscore-c25f6c7/`와 `.cache/releases/runpen-minscore-c25f6c7.zip`에 있다. PC에 자동 전달되지 않는다. 해당 커밋에서 지원 Node24.21 이상24.x로 `node scripts/route-compute/package.mjs build/route-compute/NEW-REVISION`을 실행해 재생성한다. 생성 시각이 달라 ZIP 해시는 바뀔 수 있으므로 bundle.json의23개 원본 소스 해시도 대조한다.

인증된 환경에서 현재 서비스 리비전/트래픽/자원/서비스 계정/환경·비밀 참조/IAM을 읽고 복구 기준을 남긴다. 기존 설정을 유지한 새 리비전의 트래픽0 배포·임시 태그 확인·100% 전환·이번 임시 태그 제거를 순서대로 실행한다. 마지막 기록의 nearby1115-230484d를 현재 상태로 단정하지 않는다. [기존 배포 절차](../../../development/cloud-run-routes.md)와 [승인·실행 기록](../../../history/executed-plans/2026-11-16-2230-nearby-minimum-score.md)을 함께 따른다. 과거 문서의17파일·로그인 불필요 설명은 현재23파일/사용량 인증 계약의 증거로 사용하지 않는다.

## 2026-11-17 PC 후속 — 운영 배포 완료

기존 PC 인증으로 이어서 실행했다. 위 인증 대기/미배포 설명은 최초 준비 시점의 기록이다. [배포 영수증](deployment-pc.json)에 최신 main5aae28b·Cloud Build ID·실제 업로드23개 소스 검증·이미지 digest·후보/운영 공개 검사15개·최종 트래픽을 보존했다.

- 새 리비전: `runpen-route-compute-minscore1117-5aae28b`, 트래픽100%. 배포 전 `nearby1115-230484d`는 복구용으로 유지한다. 이번 `qa-minscore1117` 태그만 제거했고 기존 `usage-validation`은 유지했다.
- Node24.21.0 관련9개 모두 통과. 최초 샌드박스에서는 로컬 HTTP 연결 EACCES로3개 실패했고 같은 소스를 네트워크 권한으로 재검사해 통과했다. 배포 전 설정 비교 도구의 JSON 키 순서 차이는 키별 비교로 정정했고 실제 설정 변경은 없었다.
- CPU1/1GiB·동시8·70초·최소0/최대2·CPU 정책·서비스 계정·환경 값 해시/비밀 참조·IAM 모두 보존했다. Cloud Build 성공 이미지와 리비전 digest가 일치한다.
- 운영 인증 생성/사용량 예약은 수행하지 않았다. 50점 동작은 동일 소스의 독립 HTTP/엔진 검사와 배포 소스·이미지 추적으로 확인했다. APK/Worker/DB 변경과 실제 폰 검증은 없다.

복구 명령은 기존 인증 환경에서 `gcloud run services update-traffic runpen-route-compute --project=running-art-mobile --region=asia-northeast3 --to-revisions=runpen-route-compute-nearby1115-230484d=100`이다. 복구 시 최소50점 변경이 빠진다. 상세 로컬 실행 원본은 기본 프로젝트의 Git 제외 `.cache/minscore-deploy-20261117/`에 보존했다.
