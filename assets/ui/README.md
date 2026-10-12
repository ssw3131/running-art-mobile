# Figma 원본 아이콘

출처 파일: `QYRGII8OdvQB1SrtH3BA08`, 2026-10-05 및 10-11 개인 연결의 design-context 응답에서 다운로드했다. 임시 URL은 런타임에서 사용하지 않는다. SVG 경로/색을 재작성하지 않는다.

| 파일 | Figma 슬롯 | 원본 크기 |
| --- | --- | --- |
| chevron-down.svg | 입력필드 `253:6025` | 20×20 |
| chevron-right.svg | 메인 버튼 `248:3566` | 32×28 |
| share.svg | 메인 버튼 `248:4593` 벡터 | 21.5×20.666 |
| home.svg | 하단 내비 `253:6488` | 20×20 |
| map.svg | 하단 내비 `253:6487` | 20×20 |
| run.svg | 하단 내비 `253:6489` | 20×20 |
| archive.svg | 하단 내비 `253:6490` | 20×20 |
| user.svg | 하단 내비 `253:6491` | 20×20 |
| runpen-logo.png | MAIN-1 상단 `305:11644` | 표시 100×33, 원본 이미지 fill / cover |
| switch-off.svg | 스위치 `30:4569` | 50×24 |
| switch-on.svg | 스위치 `30:4568` | 50×24 |
| checkbox-on.svg | 체크박스 `54:8929` | 24×24 |
| chevron-left.svg | 상단 바 `253:6222` | 30×30 |
| menu.svg | 상단 바 `253:6226` | 24×24 |
| logout.svg | 팝업 `49:8453` | 16×16 |

Icon의 Expo Image 래퍼는 원본 root 크기와 일치한다. share는 18×18 바깥 슬롯에 left=-2.5, top=-1.6667로 원본 이미지를 배치한다(`248:4593`의 overflow 기하). Checkbox OFF는 에셋이 아닌 Figma `54:8930`의 흰 사각형 primitive(24×24, 모서리 5, #757575 테두리 1.5)를 View로 구현했다.

상단/로그아웃 아이콘은 Code Connect의 Simple Design System 연결을 확인했지만 프로젝트와 설치 의존성에 대응 컴포넌트가 없었다. 해당 노드의 `exportAsync({format:'SVG_STRING'})` 원본 결과를 파일로 보존했다. 렌더링 시 SVG를 코드에 삽입하거나 경로를 다시 그리지 않는다.
