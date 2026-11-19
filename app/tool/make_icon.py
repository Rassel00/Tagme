"""TagMe 앱 아이콘 생성 (로그인 화면 로고와 같은 모양).

빨간 둥근 사각형 위에 흰 Material 아이콘 monitor_heart_rounded (lib/widgets/common.dart 의 AppLogo).
11/19 에 방패+십자에서 로그인 화면 중앙 로고로 바꿨다. 안드로이드 런처 아이콘 전부를 만든다.
  - mipmap-*/ic_launcher.png            : 일반 아이콘 (둥근 사각형)
  - mipmap-*/ic_launcher_foreground.png : 적응형 아이콘 전경 (108dp, 가운데 66dp 안에 그림)
  - mipmap-*/ic_launcher_monochrome.png : Android 13 테마 아이콘
  - mipmap-anydpi-v26/ic_launcher.xml, values/ic_launcher_background.xml
  - assets/icon/tagme_icon_1024.png     : 원본 미리보기

글리프는 Flutter SDK 에 들어 있는 Material Icons 폰트(Apache 2.0)에서 그린다.
FLUTTER_ROOT 환경 변수가 없으면 PATH 의 flutter 위치에서 찾는다.

실행: python tool/make_icon.py   (app/ 에서, Pillow 필요)
"""
import os
import shutil

from PIL import Image, ImageDraw, ImageFont

RED = (229, 72, 77, 255)  # AppColors.red #E5484D
WHITE = (255, 255, 255, 255)
SS = 4  # 슈퍼샘플링 배율
GLYPH = chr(0xF0354)  # Icons.monitor_heart_rounded
GLYPH_RATIO = 0.58  # AppLogo: 아이콘 크기 = 사각형 크기 * 0.58


def material_icons_font_path():
    root = os.environ.get('FLUTTER_ROOT')
    if not root:
        exe = shutil.which('flutter') or shutil.which('flutter.bat')
        if not exe:
            raise SystemExit('Flutter SDK 를 찾지 못했어요. FLUTTER_ROOT 를 지정하세요.')
        root = os.path.dirname(os.path.dirname(os.path.realpath(exe)))
    path = os.path.join(root, 'bin', 'cache', 'artifacts', 'material_fonts', 'materialicons-regular.otf')
    if not os.path.exists(path):
        raise SystemExit(f'Material Icons 폰트가 없어요: {path} (flutter precache 실행)')
    return path


FONT_PATH = material_icons_font_path()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def draw_mark(img, cx, cy, size, color):
    """size: 로고 사각형 한 변(px). 그 0.58 크기로 글리프를 가운데에 그린다"""
    glyph_px = round(size * GLYPH_RATIO)
    font = ImageFont.truetype(FONT_PATH, glyph_px)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    left, top, right, bottom = d.textbbox((0, 0), GLYPH, font=font)
    # 아이콘 폰트는 em 상자 전체가 아이콘 영역이라, 그린 모양의 경계 상자로 가운데를 맞춘다
    d.text((cx - (left + right) / 2, cy - (top + bottom) / 2), GLYPH, font=font, fill=color)
    img.alpha_composite(layer)


def render(px, kind):
    big = px * SS
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = big / 2
    if kind == 'legacy':
        # 런처가 모양을 씌우지 않는 예전 기기용: 여백 조금 둔 둥근 사각형 (AppLogo 모서리 0.26)
        m = big * 0.06
        side = big - 2 * m
        d.rounded_rectangle((m, m, big - m, big - m), side * 0.26, fill=RED)
        draw_mark(img, c, c, side, WHITE)
    elif kind in ('foreground', 'monochrome'):
        # 108dp 캔버스에서 런처가 보여 주는 영역은 가운데 72dp 정도. 그 영역을 로고 사각형으로 보고 글리프를 그린다
        draw_mark(img, c, c, big * 72 / 108, WHITE)
    elif kind == 'preview':
        d.rounded_rectangle((0, 0, big, big), big * 0.26, fill=RED)
        draw_mark(img, c, c, big, WHITE)
    return img.resize((px, px), Image.LANCZOS)


def write(path, img):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


def main():
    for name, scale in DENSITIES.items():
        folder = os.path.join(RES, f'mipmap-{name}')
        write(os.path.join(folder, 'ic_launcher.png'), render(round(48 * scale), 'legacy'))
        write(os.path.join(folder, 'ic_launcher_foreground.png'), render(round(108 * scale), 'foreground'))
        write(os.path.join(folder, 'ic_launcher_monochrome.png'), render(round(108 * scale), 'monochrome'))

    os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
    with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<!-- tool/make_icon.py 로 생성 -->\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background" />\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
            '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
            '</adaptive-icon>\n'
        )
    with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<resources>\n'
            '    <color name="ic_launcher_background">#E5484D</color>\n'
            '</resources>\n'
        )
    write(os.path.join(ROOT, 'assets', 'icon', 'tagme_icon_1024.png'), render(1024, 'preview'))
    print('ok')


if __name__ == '__main__':
    main()
