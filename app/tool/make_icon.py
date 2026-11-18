"""TagMe 앱 아이콘 생성 (방패 + 십자).

빨간 배경에 흰 방패, 방패 안에 빨간 십자. 안드로이드 런처 아이콘 전부를 만든다.
  - mipmap-*/ic_launcher.png            : 일반 아이콘 (둥근 사각형)
  - mipmap-*/ic_launcher_foreground.png : 적응형 아이콘 전경 (108dp, 가운데 66dp 안에 그림)
  - mipmap-*/ic_launcher_monochrome.png : Android 13 테마 아이콘
  - mipmap-anydpi-v26/ic_launcher.xml, values/ic_launcher_background.xml
  - assets/icon/tagme_icon_1024.png     : 원본 미리보기

실행: python tool/make_icon.py   (app/ 에서, Pillow 필요)
"""
import os

from PIL import Image, ImageDraw

RED = (229, 72, 77, 255)  # AppColors.red #E5484D
WHITE = (255, 255, 255, 255)
SS = 4  # 슈퍼샘플링 배율

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def cubic(p0, p1, p2, p3, steps=48):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        pts.append((
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        ))
    return pts


def shield_points():
    """가운데 (0,0), 폭 1 기준 방패 외곽선 (위는 가운데가 살짝 솟고, 아래는 뾰족)"""
    left = [(-0.44, -0.36)]
    left += cubic((-0.44, -0.36), (-0.25, -0.38), (-0.12, -0.44), (0.0, -0.52))[1:]
    right_top = cubic((0.0, -0.52), (0.12, -0.44), (0.25, -0.38), (0.44, -0.36))[1:]
    right_side = cubic((0.44, -0.36), (0.44, 0.02), (0.38, 0.36), (0.0, 0.58))[1:]
    left_side = cubic((0.0, 0.58), (-0.38, 0.36), (-0.44, 0.02), (-0.44, -0.36))[1:]
    return left + right_top + right_side + left_side


def draw_mark(draw, cx, cy, size, shield_fill, cross_fill):
    """size: 방패 폭(px). 십자는 방패 위쪽 무게중심에 둔다"""
    pts = [(cx + x * size, cy + y * size) for x, y in shield_points()]
    draw.polygon(pts, fill=shield_fill)
    arm = 0.40 * size  # 십자 전체 길이
    bar = 0.14 * size  # 십자 두께
    ccy = cy - 0.02 * size
    r = bar * 0.22
    draw.rounded_rectangle((cx - bar / 2, ccy - arm / 2, cx + bar / 2, ccy + arm / 2), r, fill=cross_fill)
    draw.rounded_rectangle((cx - arm / 2, ccy - bar / 2, cx + arm / 2, ccy + bar / 2), r, fill=cross_fill)


def render(px, kind):
    big = px * SS
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = big / 2
    if kind == 'legacy':
        # 런처가 모양을 씌우지 않는 예전 기기용: 여백 조금 둔 둥근 사각형
        m = big * 0.06
        d.rounded_rectangle((m, m, big - m, big - m), big * 0.2, fill=RED)
        draw_mark(d, c, c + big * 0.01, big * 0.52, WHITE, RED)
    elif kind == 'foreground':
        # 108dp 캔버스, 안전 영역 66dp(61%) 안에 들어가게
        draw_mark(d, c, c + big * 0.005, big * 0.48, WHITE, RED)
    elif kind == 'monochrome':
        draw_mark(d, c, c + big * 0.005, big * 0.48, WHITE, (0, 0, 0, 0))
    elif kind == 'preview':
        d.rounded_rectangle((0, 0, big, big), big * 0.22, fill=RED)
        draw_mark(d, c, c + big * 0.01, big * 0.56, WHITE, RED)
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
