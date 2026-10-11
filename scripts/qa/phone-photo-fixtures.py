"""Generate synthetic photo-format fixtures in the ignored QA directory."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache/phone-followup-20261011'
sys.path.insert(0, str(OUT / 'python'))
from PIL import Image, ImageDraw, ImageFont, TiffImagePlugin
import pillow_heif

pillow_heif.register_heif_opener()
photos = OUT / 'photos'
photos.mkdir(exist_ok=True)
report = []
for name, size, fmt in [('qa-20261011-exif.jpg', (1200, 800), 'JPEG'),
                        ('qa-20261011-heic.heic', (1200, 800), 'HEIF'),
                        ('qa-20261011-large.jpg', (8000, 6000), 'JPEG')]:
    label = 'HEIC' if fmt == 'HEIF' else '48MP' if size[0] == 8000 else 'EXIF'
    image = Image.new('RGB', size, {'HEIC': '#93419d', '48MP': '#c76710', 'EXIF': '#176f83'}[label])
    draw = ImageDraw.Draw(image)
    w, h = size
    draw.rectangle((w//8, h//8, w*7//8, h*7//8), fill='#fff1d2')
    draw.polygon([(w//2, h//4), (w*3//4, h*3//4), (w//4, h*3//4)], fill='#bd6225')
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', w//9)
    draw.text((w//5, h//3), label, fill='black', font=font)
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = 'RunPen synthetic fixture; not a personal photograph'
    ratio = TiffImagePlugin.IFDRational
    exif[34853] = {1: 'N', 2: (ratio(37), ratio(29), ratio(52)),
                   3: 'E', 4: (ratio(127), ratio(1), ratio(39))}
    target = photos / name
    image.save(target, format=fmt, quality=85, exif=exif)
    with Image.open(target) as loaded:
        assert loaded.size == size and loaded.getexif().get(274) in [1, 6]
        assert loaded.getexif().get_ifd(34853)
        orientation = loaded.getexif().get(274)
    report.append({'name': name, 'size': size, 'format': fmt, 'bytes': target.stat().st_size,
                   'orientation': orientation, 'gpsExif': True, 'synthetic': True})
(photos / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
