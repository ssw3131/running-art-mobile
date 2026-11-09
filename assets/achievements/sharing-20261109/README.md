# Sharing assets

Original exports from Figma `QYRGII8OdvQB1SrtH3BA08`, retrieved 2026-11-09.

| File | Original node | Design slot / effective size |
| --- | --- | --- |
| instagram.png | 643:4387 | Platform selector, 24×24 |
| story.png | 643:4390 | Platform selector, 24×24 |
| link.svg / link-selected.svg | Link vectors in 643:4169 / 643:6323 | Platform selector, intrinsic 24×24 |
| image.svg / image-selected.svg | Image vectors in 643:4169 / 643:4439 | Platform selector, intrinsic 26×26 |
| ../brand-runner.png / ../brand-name.png | image 11 / image 4 in 643:4439 | Existing transparent originals, SHA-256 identical to the provided Figma files; proportional composition inside the 58×35 design group |
| map.svg | 253:6487 in 643:6323 | Link preview, intrinsic 20×20 |
| share.svg | ShareIcon in 35:5820 | Completed-record button, intrinsic 21.5×20.666 inside the 22px design slot |
| kakao.svg | 654:6544 | Link action, intrinsic 40×40 |
| chevron.svg | 654:6546 | Link action, intrinsic 30×30 |

Callsites: `SharingPlatformView`, `PlatformShareCard`, `RunSharePanel`, `CompletedDetail`.
The sample avatar, route map, address and numbers are dynamic record/account data,
not exported Figma examples. Map images retain provider attribution. No temporary
asset URL is used at runtime; SVG source paths and root dimensions are unmodified.

CI artifact visual review found opaque group-export backgrounds on selector icons and the brand. Original normal/selected SVGs now provide the selector colors without raster tinting. The brand uses the exact existing transparent component images rather than a flattened group export. Both brand images must display before capture.
