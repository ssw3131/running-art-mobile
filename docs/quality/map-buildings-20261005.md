# 모바일 지도 건물 숨김 — 2026-10-05

사용자 요청: 확대 때 배경이 상세해지며 느려지는 현상에 대해 우선 건물 면·윤곽·입체 건물만 숨긴다. 다른 지도 요소와 계산·저장 기능은 이번 변경 대상이 아니다.

**사용자 검증 완료 — 2026-10-05:** SM-S942N 설치 후 사용자가 직접 검증을 마쳤으며 “성능 개선됐어”라고 확인했다. 건물 숨김 적용과 사용자 체감 성능 개선 확인까지 완료했다. 별도의 FPS·프레임 시간·개선율 수치는 측정하지 않았다.

## 구현

- 실제 Streets v2 스타일을 HTTP 200으로 확인했다. 키/요청 URL/전체 스타일은 저장하거나 출력하지 않았다. 최초 샌드박스 요청은 EACCES였고 이번 요청의 목적·전송 범위를 명시한 승인 검토 후 읽기에 성공했다.
- 해당 건물 데이터는 `maptiler_planet` / `building`이며 실제 연결된 레이어는 `Building`(`fill`)과 `Building 3D`(`fill-extrusion`) 두 개다. 별도 건물 선 레이어는 없으며 면의 윤곽도 면과 함께 숨겨진다.
- `src/modules/map/buildings.ts`에서 MapLibre의 `setSourceVisibility(false, 'maptiler_planet', 'building')`를 사용한다. 설치된 11.4.0 Android 구현의 fill/line/fill-extrusion source-layer 매칭을 확인했다.
- `MapSurface`와 `GuidanceMap`의 스타일 로딩 완료마다 적용한다. 준비 완료 처리는 숨김 요청 성공을 기다리고 실패 시 기존 지도 오류/배경 없는 안내 처리를 사용한다. 합성·배경 없는 지도는 호출을 생략한다.
- MapTiler Cloud 계정 스타일·공유 웹·도로 그래프·코스/러닝 DB·현재 위치·카메라 확대율·POI/지명은 변경하지 않았다. 타일 소스 자체는 유지되므로 다운로드/해석 비용의 제거를 뜻하지 않는다.

## 검증

- `npm run check`: 타입·린트 통과.
- `npm run test:location`: 기존 위치/지도 설정 17개 통과.
- `git diff --check`: 통과.
- Android `assembleRelease --offline --no-daemon --max-workers=2`: **6분 22초, 846 tasks(55 실행)** 성공. 변경한 소스 3개가 번들 source map의 원문과 일치한다.
- APK: `build/install/running-art-0.1.0-20261005-no-buildings.apk`, **114,277,783바이트**, arm64-v8a/x86_64. SHA-256 `98d4f75b0f6415582c1f971ade465cf3cd07c7a0b5fffaac9ed2a5f3e4bd6389`.
- 기존 공통 UI APK와 app ID `com.runningart.mobile.dev`·0.1.0/1 및 서명 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 일치.
- 처음 연결된 SM-A750N은 잠겨 있어 해제를 요청했다. 이후 기기 연결이 바뀌어 그 기기 설치 시도는 `device not found`로 끝났으며 SM-A750N을 업데이트하지 않았다.
- 사용자 후속 요청 “지금 연결한 폰에 설치해”에 따라 연결을 재확인하고 **SM-S942N에 22:51:45 KST 자료 유지 업데이트(`adb install -r`) 성공**. 설치된 base.apk 해시가 준비본과 일치하고 최초 설치 시각 `2026-09-27 16:29:39`·자료 경로가 유지됐다. 앱 삭제/초기화는 하지 않았다.
- 설치 후 기존 모의 안내 화면을 열어 지도 배경·코스선·위치 점과 준비 상태(0m/0초)를 확인했다. 재생/GPS 기록은 시작하지 않았다. 증거: `.cache/map-buildings/installed-guidance.png`. 이 고정 표본은 도심이 아니므로 조밀한 건물 지역의 전후 시각 대조나 성능 측정을 통과한 것으로 확대하지 않는다.

## 한계

구현·빌드·휴대폰 설치와 사용자의 직접 검증·체감 성능 개선 확인을 완료했다. 정량적인 동일 조건 프레임 측정이나 다른 기기의 성능까지 검증한 것은 아니며 기존 계획의 모든 수치 기준을 통과했다고 확대 해석하지 않는다. 이번 설치에서는 기존 자료의 DB 내용 해시를 재검증하지 않았다.

[실행 기록](../history/executed-plans/2026-10-05-2238-hide-map-buildings.md) · [기존 성능 진단](map-performance-20261004.md)
