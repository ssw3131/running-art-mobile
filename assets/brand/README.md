# RunPen launcher

- Source: [Figma UI, runpen-launcher-color-rounded-432 1](https://www.figma.com/design/QYRGII8OdvQB1SrtH3BA08/?node-id=319-2228).
- Retrieved: 2026-10-17, `get_design_context` with node screenshot.
- Original PNG: 432 × 432 RGBA; SHA-256 `beddd36f9533ed797f789a33e0ddb08b5d434b526a0a375b0caf444fd1e733dd`.
- `runpen-launcher.png` is the downloaded original, without cropping, redraw, recoloring or alpha modification.
- `app.json` uses it for the app icon, startup image and web favicon. Existing in-app wordmark stays unchanged.
- The source is an already composed rounded icon, not separated adaptive layers. Android uses the standard icon path so the OS can fit the full original without adaptive foreground cropping. No Expo monochrome fallback is configured. OS launcher masking/wrapping can vary.
- iOS and web use the same source configuration; only Android is built and device-verified in this task.
