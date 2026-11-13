#!/usr/bin/env python3
# Builds every app icon from the shared RUNNERS plates (1024 canvas, 824 plate, glyph 55% of the plate),
# the same way Prompt does (resources/icon-source/generate.sh and config/scripts/trim-windows-icon-source.mjs there):
#   resources/build/Assets.car  macOS 26: white plate, black plate for the dark appearance (icon.icon)
#   resources/build/icon.icns   older macOS, keeps the 100 px margin around the plate like other Mac apps
#   resources/build/icon.png    Linux, the white source as is
#   resources/build/icon.ico    Windows, margin trimmed so the plate fills the frame
# Needs Pillow and numpy, and Xcode 26 for actool. Run: python3 resources/icon-source/generate.py
import io
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(__file__).resolve().parent
BUILD = SRC.parent / 'build'
WHITE = SRC / 'split-white.png'
BLACK = SRC / 'split-black.png'
ICON = SRC / 'icon.icon'


def full_canvas(path):
    # Why: macOS 26 draws its own rounded shape over the whole Icon Composer canvas, so the plate is cropped to fill
    # it; left at 824 px inside 1024 the system would draw a second plate around it.
    im = Image.open(path).convert('RGBA')
    ys, xs = np.where(np.asarray(im)[..., 3] > 0)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((1024, 1024), Image.LANCZOS)


def box_resize(a, size):
    # Premultiplied box filter, so transparent edges do not darken (same as Prompt's resizeImage).
    h, w = a.shape[:2]
    out = np.zeros((size, size, 4), np.uint8)
    sx, sy = w / size, h / size
    alpha = a[..., 3] / 255.0
    for ty in range(size):
        y0, y1 = ty * sy, (ty + 1) * sy
        ys = np.arange(int(np.floor(y0)), min(h, int(np.ceil(y1))))
        wy = np.minimum(y1, ys + 1) - np.maximum(y0, ys)
        for tx in range(size):
            x0, x1 = tx * sx, (tx + 1) * sx
            xs = np.arange(int(np.floor(x0)), min(w, int(np.ceil(x1))))
            wx = np.minimum(x1, xs + 1) - np.maximum(x0, xs)
            wgt = np.outer(wy, wx)
            px = a[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1].astype(float)
            al = alpha[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
            asum = (px[..., 3] * wgt).sum()
            if wgt.sum() == 0 or asum == 0:
                continue
            avg = asum / wgt.sum()
            pre = al * wgt
            for c in range(3):
                out[ty, tx, c] = min(255, round((px[..., c] * pre).sum() / wgt.sum() / (avg / 255)))
            out[ty, tx, 3] = round(avg)
    return out


def windows_ico(path, dest):
    # Why: Windows has no Apple-style safe margin, so the Mac 1024 file shows small in the taskbar. Trim to the
    # opaque plate (alpha above 16), square it with a 2% margin and store PNG frames (Prompt #5357).
    a = np.asarray(Image.open(path).convert('RGBA'))
    ys, xs = np.where(a[..., 3] > 16)
    t = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    long_side = max(t.shape[:2])
    side = round(long_side / (1 - 2 * 0.02))
    sq = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - t.shape[0]) // 2, (side - t.shape[1]) // 2
    sq[oy:oy + t.shape[0], ox:ox + t.shape[1]] = t
    frames = []
    for size in (256, 128, 64, 48, 32, 16):
        buf = io.BytesIO()
        Image.fromarray(box_resize(sq, size), 'RGBA').save(buf, 'PNG')
        frames.append((size, buf.getvalue()))
    head = struct.pack('<HHH', 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries = b''
    for size, png in frames:
        entries += struct.pack('<BBBBHHII', 0 if size >= 256 else size, 0 if size >= 256 else size, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
    dest.write_bytes(head + entries + b''.join(p for _, p in frames))


def main():
    (ICON / 'Assets').mkdir(parents=True, exist_ok=True)
    full_canvas(WHITE).save(ICON / 'Assets' / 'white.png')
    full_canvas(BLACK).save(ICON / 'Assets' / 'black.png')
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(['xcrun', 'actool', '--compile', tmp, '--platform', 'macosx', '--minimum-deployment-target', '10.12',
                        '--app-icon', 'icon', '--output-partial-info-plist', tmp / 'partial.plist', ICON],
                       check=True, stdout=subprocess.DEVNULL)
        shutil.copy(tmp / 'Assets.car', BUILD / 'Assets.car')
        iconset = tmp / 'icon.iconset'
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for px, name in ((size, f'icon_{size}x{size}.png'), (size * 2, f'icon_{size}x{size}@2x.png')):
                subprocess.run(['sips', '-z', str(px), str(px), WHITE, '--out', iconset / name], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', BUILD / 'icon.icns'], check=True)
    shutil.copy(WHITE, BUILD / 'icon.png')
    windows_ico(BUILD / 'icon.png', BUILD / 'icon.ico')
    print('Assets.car, icon.icns, icon.png and icon.ico written to', BUILD)


if __name__ == '__main__':
    main()
