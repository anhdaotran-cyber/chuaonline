"""Generate lightweight placeholder WebP images and a short knock sound."""

from __future__ import annotations

import math
import shutil
import struct
import subprocess
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PUBLIC.mkdir(parents=True, exist_ok=True)


def _font(size: int):
    for name in ("arial.ttf", "segoeui.ttf", "NotoSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_bodhisattva() -> None:
    w, h = 512, 640
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((146, 40, 366, 260), fill=(255, 220, 140, 70), outline=(255, 210, 120, 160), width=3)
    d.ellipse((210, 110, 302, 210), fill=(245, 228, 200, 255), outline=(180, 140, 90, 255), width=2)
    d.polygon([(256, 200), (140, 520), (372, 520)], fill=(196, 64, 64, 230))
    d.polygon([(256, 240), (200, 520), (312, 520)], fill=(220, 100, 90, 200))
    d.ellipse((232, 300, 256, 340), fill=(245, 228, 200, 255))
    d.ellipse((256, 300, 280, 340), fill=(245, 228, 200, 255))
    d.text((256, 560), "Bo Tat", fill=(255, 236, 190, 220), font=_font(28), anchor="mm")
    out = PUBLIC / "bodhisattva.webp"
    img.save(out, "WEBP", quality=80, method=6)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


def make_devotee() -> None:
    dw, dh = 160, 200
    img = Image.new("RGBA", (dw, dh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((55, 20, 105, 70), fill=(240, 220, 195, 255))
    d.polygon([(80, 65), (35, 130), (125, 130)], fill=(55, 90, 70, 240))
    d.ellipse((40, 125, 120, 175), fill=(45, 75, 60, 240))
    d.ellipse((68, 95, 92, 120), fill=(240, 220, 195, 255))
    d.text((80, 188), "Phat tu", fill=(255, 245, 220, 210), font=_font(14), anchor="mm")
    out = PUBLIC / "devotee.webp"
    img.save(out, "WEBP", quality=80, method=6)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


def make_knock_wav() -> Path:
    sr = 22050
    duration = 0.18
    n = int(sr * duration)
    path = PUBLIC / "mo.wav"
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = bytearray()
        for i in range(n):
            t = i / sr
            env = math.exp(-t * 28)
            tone = math.sin(2 * math.pi * 680 * t) * 0.35 + math.sin(2 * math.pi * 980 * t) * 0.2
            noise = (((i * 57) % 100) / 50 - 1) * 0.25 * math.exp(-t * 60)
            sample = max(-1.0, min(1.0, (tone + noise) * env))
            frames += struct.pack("<h", int(sample * 30000))
        wf.writeframes(frames)
    print(f"wrote {path} ({path.stat().st_size} bytes)")
    return path


def make_mp3(wav_path: Path) -> None:
    out = PUBLIC / "mo.mp3"
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        subprocess.check_call(
            [
                ffmpeg,
                "-y",
                "-i",
                str(wav_path),
                "-codec:a",
                "libmp3lame",
                "-qscale:a",
                "6",
                str(out),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"wrote {out} ({out.stat().st_size} bytes)")
        return

    # No ffmpeg: keep playable WAV; App.jsx falls back to /mo.wav.
    print("ffmpeg not found; keeping mo.wav for App fallback")


if __name__ == "__main__":
    make_bodhisattva()
    make_devotee()
    wav = make_knock_wav()
    make_mp3(wav)
