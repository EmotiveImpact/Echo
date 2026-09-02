#!/usr/bin/env python3
"""Write the Echo macOS app icon set (dark tile + amber waveform)."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "Echo" / "Assets.xcassets" / "AppIcon.appiconset"

SIZES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}


def png_rgba(width: int, height: int, pixels: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b""
    stride = width * 4
    for y in range(height):
        raw += b"\x00" + pixels[y * stride : (y + 1) * stride]
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(raw, 9)),
            chunk(b"IEND", b""),
        ]
    )


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def rounded_rect_alpha(x: float, y: float, size: int, radius: float) -> float:
    cx = min(max(x, radius), size - 1 - radius)
    cy = min(max(y, radius), size - 1 - radius)
    if (radius <= x <= size - 1 - radius) or (radius <= y <= size - 1 - radius):
        return 1.0
    dx = x - cx
    dy = y - cy
    dist = (dx * dx + dy * dy) ** 0.5
    edge = radius - dist
    if edge >= 1:
        return 1.0
    if edge <= 0:
        return 0.0
    return edge


def paint(size: int) -> bytes:
    radius = size * 0.22
    bars = [0.28, 0.52, 0.86, 0.64, 0.38]
    bar_w = size * 0.07
    gap = size * 0.055
    total_w = len(bars) * bar_w + (len(bars) - 1) * gap
    start_x = (size - total_w) / 2
    mid_y = size * 0.52
    pixels = bytearray(size * size * 4)

    for y in range(size):
        for x in range(size):
            alpha = rounded_rect_alpha(x + 0.5, y + 0.5, size, radius)
            i = (y * size + x) * 4
            if alpha <= 0:
                continue
            gy = y / max(size - 1, 1)
            r = int(lerp(18, 36, gy))
            g = int(lerp(14, 24, gy))
            b = int(lerp(8, 14, gy))
            pixels[i : i + 4] = bytes((r, g, b, int(255 * alpha)))

    for index, height_frac in enumerate(bars):
        bx0 = start_x + index * (bar_w + gap)
        bx1 = bx0 + bar_w
        half = size * height_frac * 0.5
        y0 = mid_y - half
        y1 = mid_y + half
        br = bar_w * 0.45
        for y in range(size):
            for x in range(size):
                if not (bx0 - 1 <= x <= bx1 + 1 and y0 - 1 <= y <= y1 + 1):
                    continue
                # rounded bar
                px, py = x + 0.5, y + 0.5
                cx = min(max(px, bx0 + br), bx1 - br)
                cy = min(max(py, y0 + br), y1 - br)
                if (bx0 + br <= px <= bx1 - br) or (y0 + br <= py <= y1 - br):
                    cover = 1.0
                else:
                    dist = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
                    cover = max(0.0, min(1.0, br - dist + 0.5))
                if cover <= 0:
                    continue
                i = (y * size + x) * 4
                base_a = pixels[i + 3] / 255
                if base_a <= 0:
                    continue
                amber = (255, 191, 36)
                mix = 0.92 * cover
                pixels[i] = int(lerp(pixels[i], amber[0], mix))
                pixels[i + 1] = int(lerp(pixels[i + 1], amber[1], mix))
                pixels[i + 2] = int(lerp(pixels[i + 2], amber[2], mix))
    return bytes(pixels)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in SIZES.items():
        (OUT / name).write_bytes(png_rgba(size, size, paint(size)))
    print(f"wrote {len(SIZES)} icons to {OUT}")


if __name__ == "__main__":
    main()
