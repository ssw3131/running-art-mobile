# 앱 로컬 글꼴

정적 TTF는 잠금 파일로 고정한 Expo Google Fonts 패키지에서 직접 import하며 Metro가 앱에 포함한다. 실행 중 외부 글꼴 서버에 접속하지 않는다.

- Noto Sans KR: `@expo-google-fonts/noto-sans-kr` 0.4.3, Regular 400 / Medium 500 / SemiBold 600 / Bold 700.
- Roboto: `@expo-google-fonts/roboto`, 동일 네 가지 굵기. 정확한 버전은 package-lock.json 참조.
- [원본 저장소](https://github.com/expo/google-fonts), 각 패키지 LICENSE_FONT 사본을 이 폴더에 보존했다.

각 굵기의 하위 경로를 직접 import해 사용하지 않는 굵기·이탤릭을 번들에서 제외한다. 앱 적용은 src/theme/FontGate.tsx, 선택은 AppText의 family/weight로 명시한다.
