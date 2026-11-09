# Sharing assets

Original exports from Figma `QYRGII8OdvQB1SrtH3BA08`, retrieved 2026-11-09.

| File | Original node | Design slot / effective size |
| --- | --- | --- |
| instagram.png | 643:4387 | Platform selector, 24×24 |
| story.png | 643:4390 | Platform selector, 24×24 |
| link.png | 643:6496 | Platform selector, 24×24 |
| image.png | 643:4393 | Platform selector, 26×26 |
| brand.png | 643:4368 | Original 58×35 brand, scaled proportionally on export canvas |
| map.svg | 253:6487 in 643:6323 | Link preview, intrinsic 20×20 |
| share.svg | ShareIcon in 35:5820 | Completed-record button, intrinsic 21.5×20.666 inside the 22px design slot |
| kakao.svg | 654:6544 | Link action, intrinsic 40×40 |
| chevron.svg | 654:6546 | Link action, intrinsic 30×30 |

Callsites: `SharingPlatformView`, `PlatformShareCard`, `RunSharePanel`, `CompletedDetail`.
The sample avatar, route map, address and numbers are dynamic record/account data,
not exported Figma examples. Map images retain provider attribution. No temporary
asset URL is used at runtime; SVG source paths and root dimensions are unmodified.
