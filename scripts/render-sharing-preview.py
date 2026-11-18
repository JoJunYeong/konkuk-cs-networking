import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont


data = json.load(sys.stdin)
image = Image.new("RGB", (1200, 630), "#0d3328")
draw = ImageDraw.Draw(image)
regular = os.environ.get(
    "PREVIEW_FONT_REGULAR", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
)
bold = os.environ.get(
    "PREVIEW_FONT_BOLD", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
)


def draw_line(text, x, y, size, color, font_path=regular):
    font = ImageFont.truetype(font_path, size)
    while size > 24 and draw.textlength(text, font=font) > 1200 - x - 80:
        size -= 2
        font = ImageFont.truetype(font_path, size)
    if draw.textlength(text, font=font) > 1200 - x - 80:
        while draw.textlength(text + "…", font=font) > 1200 - x - 80:
            text = text[:-1]
        text += "…"
    draw.text((x, y), text, font=font, fill=color, anchor="lt")


draw.rectangle((0, 0, 1200, 12), fill="#77d8ae")
draw.rounded_rectangle((72, 64, 1128, 566), radius=34, outline="#40806a", width=2)
draw_line("KU meet", 106, 103, 32, "#a9e5cc", bold)
draw_line(data["quarter"], 106, 184, 39, "#8bdfb5", bold)
for index, title in enumerate(data["heading"]):
    draw_line(title, 106, 251 + 81 * index, 68, "#fbfffc", bold)
draw.line((106, 436, 1094, 436), fill="#40806a", width=2)
draw_line(data["schedule"], 106, 468, 31, "#e3f4eb", bold)
draw_line(data["venue"], 106, 512, 26, "#c2ded0")
image.save(sys.stdout.buffer, format="PNG")
