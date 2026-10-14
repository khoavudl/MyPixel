"""Generate macOS .icns and Windows .ico app icons from Logo-fes.png."""

from pathlib import Path
import shutil
import subprocess
import sys
from PIL import Image, ImageDraw

ROOT_DIR = Path(__file__).resolve().parent.parent
LOGO_PATH = ROOT_DIR / "Logo-fes.png"


def create_app_icon_base() -> Image.Image:
    """Create a 1024x1024 icon with dark squircle background and centered logo."""
    size = 1024
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)

    # Draw rounded rectangle (Apple squircle aesthetic) with dark theme
    padding = 48
    corner_radius = 200
    rect = [padding, padding, size - padding, size - padding]
    draw.rounded_rectangle(rect, radius=corner_radius, fill=(24, 24, 27, 255))  # Zinc-900
    # Subtle border
    draw.rounded_rectangle(rect, radius=corner_radius, outline=(63, 63, 70, 200), width=6)

    # Load and scale Logo-fes.png
    if LOGO_PATH.is_file():
        logo = Image.open(LOGO_PATH).convert("RGBA")
        # Target logo width to be ~75% of squircle width
        max_logo_w = int((size - 2 * padding) * 0.75)
        max_logo_h = int((size - 2 * padding) * 0.50)

        logo_ratio = min(max_logo_w / logo.width, max_logo_h / logo.height)
        new_w = int(logo.width * logo_ratio)
        new_h = int(logo.height * logo_ratio)
        logo_resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)

        pos_x = (size - new_w) // 2
        pos_y = (size - new_h) // 2
        base.paste(logo_resized, (pos_x, pos_y), mask=logo_resized)

    return base


def make_icons() -> None:
    base = create_app_icon_base()

    # 1. Generate Windows .ico
    ico_path = ROOT_DIR / "MyPixel.ico"
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    base.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"Generated Windows icon: {ico_path}")

    # 2. Generate macOS .icns using iconutil
    if sys.platform == "darwin":
        iconset_dir = ROOT_DIR / "MyPixel.iconset"
        if iconset_dir.exists():
            shutil.rmtree(iconset_dir)
        iconset_dir.mkdir(parents=True, exist_ok=True)

        specs = [
            ("icon_16x16.png", 16),
            ("icon_16x16@2x.png", 32),
            ("icon_32x32.png", 32),
            ("icon_32x32@2x.png", 64),
            ("icon_128x128.png", 128),
            ("icon_128x128@2x.png", 256),
            ("icon_256x256.png", 256),
            ("icon_256x256@2x.png", 512),
            ("icon_512x512.png", 512),
            ("icon_512x512@2x.png", 1024),
        ]

        for fname, sz in specs:
            img = base.resize((sz, sz), Image.Resampling.LANCZOS)
            img.save(iconset_dir / fname, "PNG")

        icns_path = ROOT_DIR / "MyPixel.icns"
        res = subprocess.run(["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)])
        if res.returncode == 0:
            print(f"Generated macOS icon: {icns_path}")
            shutil.rmtree(iconset_dir)
        else:
            print("Failed to run iconutil")


if __name__ == "__main__":
    make_icons()
