"""Genereert synthetische testfoto's (eigen werk, geen echte bordjes) in tests/fixtures/.

Gebruik (vanuit pipeline/):  python -m veldwerk.tests.make_fixtures
De uitvoer wordt gecommit; dit script is alleen nodig om de set opnieuw te maken.
"""
from __future__ import annotations

import random
from pathlib import Path

import piexif
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).parent / "fixtures"
FONTS = Path("C:/Windows/Fonts")
random.seed(7)


def font(name: str, size: int):
    try:
        return ImageFont.truetype(str(FONTS / name), size)
    except OSError:
        return ImageFont.load_default()


def _rat(x: float):
    return (int(round(x * 1_000_000)), 1_000_000)


def _dms(deg: float):
    deg = abs(deg)
    d = int(deg)
    m = int((deg - d) * 60)
    s = (deg - d - m / 60) * 3600
    return ((d, 1), (m, 1), (int(round(s * 10000)), 10000))


def exif_bytes(lat=None, lon=None, when=None, orientation=1, alt=None, acc=None) -> bytes:
    zeroth = {piexif.ImageIFD.Orientation: orientation, piexif.ImageIFD.Make: "Testcamera"}
    exif = {}
    if when:
        exif[piexif.ExifIFD.DateTimeOriginal] = when.encode()
        exif[piexif.ExifIFD.OffsetTimeOriginal] = b"+02:00"
    gps = {}
    if lat is not None:
        gps[piexif.GPSIFD.GPSLatitudeRef] = b"N" if lat >= 0 else b"S"
        gps[piexif.GPSIFD.GPSLatitude] = _dms(lat)
        gps[piexif.GPSIFD.GPSLongitudeRef] = b"E" if lon >= 0 else b"W"
        gps[piexif.GPSIFD.GPSLongitude] = _dms(lon)
        if alt is not None:
            gps[piexif.GPSIFD.GPSAltitudeRef] = 0
            gps[piexif.GPSIFD.GPSAltitude] = (int(alt * 10), 10)
        if acc is not None:
            gps[31] = (int(acc * 10), 10)
    return piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps, "1st": {}, "thumbnail": None})


def sign(lines, bg, fg, size=(1100, 760), noise=0.0, angle=0.0, blur=0.0) -> Image.Image:
    """Bordje: lines = [(tekst, lettertype, hoogte), ...] gecentreerd op een gekleurde plaat."""
    im = Image.new("RGB", size, (120, 140, 110))  # 'achtergrond' om het bord heen
    d = ImageDraw.Draw(im)
    board = Image.new("RGB", (size[0] - 120, size[1] - 120), bg)
    bd = ImageDraw.Draw(board)
    bd.rectangle([6, 6, board.width - 7, board.height - 7], outline=fg, width=5)
    total = sum(h + 40 for _, _, h in lines)
    y = (board.height - total) // 2
    for text, fname, h in lines:
        f = font(fname, h)
        w = bd.textlength(text, font=f)
        bd.text(((board.width - w) / 2, y), text, font=f, fill=fg)
        y += h + 40
    if angle:
        board = board.rotate(angle, expand=True, fillcolor=(120, 140, 110), resample=Image.BICUBIC)
    im.paste(board, ((size[0] - board.width) // 2, (size[1] - board.height) // 2))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        px = im.load()
        for _ in range(int(size[0] * size[1] * noise)):
            x, y = random.randrange(size[0]), random.randrange(size[1])
            v = random.randrange(256)
            px[x, y] = (v, v, v)
    return im


def enclosure_photo() -> Image.Image:
    """Verblijf zonder bordje: hek, water en 'vogel'-blobs, geen tekst."""
    im = Image.new("RGB", (1100, 760), (150, 190, 220))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 420, 1100, 760], fill=(90, 140, 80))
    d.ellipse([200, 520, 700, 700], fill=(70, 120, 170))
    for x in range(0, 1100, 40):
        d.line([x, 300, x, 480], fill=(60, 60, 60), width=4)
    d.line([0, 330, 1100, 330], fill=(60, 60, 60), width=4)
    d.line([0, 440, 1100, 440], fill=(60, 60, 60), width=4)
    d.ellipse([760, 560, 860, 640], fill=(230, 90, 120))
    return im


def save(im: Image.Image, name: str, **exif_kw) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    kw = dict(exif_kw)
    if max(im.size) > 840:  # klein houden: de set wordt gecommit
        k = 840 / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    if name.endswith(".heic"):
        import pillow_heif

        pillow_heif.register_heif_opener()
        pillow_heif.from_pillow(im).save(OUT / name, exif=exif_bytes(**kw), quality=50)
    else:
        im.save(OUT / name, "JPEG", quality=62, exif=exif_bytes(**kw))


def main() -> None:
    day = "2026:10:10"
    B, BI = "arialbd.ttf", "ariali.ttf"
    green, white, dark = (24, 100, 56), (255, 255, 255), (20, 20, 20)
    save(sign([("Humboldtpinguïn", B, 110), ("Spheniscus humboldti", BI, 80)], green, white),
         "01-pinguin.jpg", lat=52.14300, lon=4.68100, when=f"{day} 14:02:11", alt=1.2, acc=5)
    # binnen, zonder GPS, tussen twee GPS-foto's: positie wordt geschat
    save(sign([("Humboldtpinguïn", B, 110), ("Spheniscus humboldti", BI, 80)], white, dark, noise=0.01),
         "02-binnen-zonder-gps.jpg", when=f"{day} 14:06:40")
    # iPhone-achtig: staand opgeslagen met Orientation=6
    img = sign([("Helmkasuaris", B, 120), ("Casuarius casuarius", BI, 85)], white, dark, noise=0.02, angle=3)
    save(img.rotate(90, expand=True), "03-kasuaris-staand.jpg",
         lat=52.14340, lon=4.68180, when=f"{day} 14:10:03", orientation=6, alt=1.0, acc=8)
    save(sign([("Chileense flamingo", B, 100), ("Phoenicopterus chilensis", BI, 72)], green, white, noise=0.02),
         "04-flamingo.jpg", lat=52.14370, lon=4.68120, when=f"{day} 14:18:30", acc=6)
    save(sign([("Stellers zeearend", B, 100), ("Haliaeetus pelagicus", BI, 78)], white, dark, noise=0.015, angle=-4),
         "05-zeearend.heic", lat=52.14400, lon=4.68200, when=f"{day} 14:26:52", acc=4)
    save(sign([("Rode ibis", B, 85), ("Eudocimus ruber", BI, 62), ("Oehoe", B, 85), ("Bubo bubo", BI, 62)],
              green, white, size=(1100, 900), noise=0.01),
         "06-twee-soorten.jpg", lat=52.14250, lon=4.68060, when=f"{day} 14:35:20", acc=7)
    save(sign([("Onleesbaar", B, 90), ("Xxxxxx xxxxxxx", BI, 70)], white, dark, noise=0.18, blur=9),
         "07-onleesbaar.jpg", lat=52.14420, lon=4.68240, when=f"{day} 14:41:05", acc=6)
    save(enclosure_photo(), "08-verblijf-zonder-bord.jpg",
         lat=52.14450, lon=4.68260, when=f"{day} 14:44:10", acc=6)
    print("fixtures geschreven naar", OUT)


if __name__ == "__main__":
    main()
