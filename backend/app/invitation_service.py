import base64
import functools
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import fitz
from PIL import Image, ImageDraw, ImageFont

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "uploads"
TEMPLATE_FILE = TEMPLATE_DIR / "invitation_template.pdf"
LAYOUT_FILE = TEMPLATE_DIR / "invitation_layout.json"

RENDER_DPI = 150

# Coordenadas normalizadas (0-1) relativas al ancho/alto de la plantilla.
# "name.y"/"qr.y" son el borde superior del elemento, no el centro.
# Calibrado para el cuadro de nombre (debajo de "CICLO 2026-2") y el cuadro
# de QR (antes de "Invitación válida para una persona.") de la plantilla actual.
DEFAULT_LAYOUT: Dict[str, Any] = {
    "name": {"x": 0.5, "y": 0.385, "font_size": 130, "max_width": 0.78, "color": "#26265f"},
    "qr": {"x": 0.5, "y": 0.665, "size": 0.48},
}

_FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def is_template_available() -> bool:
    return TEMPLATE_FILE.exists()


def load_layout() -> Dict[str, Any]:
    layout = json.loads(json.dumps(DEFAULT_LAYOUT))  # deep copy
    if LAYOUT_FILE.exists():
        try:
            saved = json.loads(LAYOUT_FILE.read_text(encoding="utf-8"))
            layout["name"].update(saved.get("name", {}))
            layout["qr"].update(saved.get("qr", {}))
        except Exception:
            pass  # layout corrupto: se usa el default
    return layout


def save_layout(changes: Dict[str, Any]) -> Dict[str, Any]:
    layout = load_layout()
    if isinstance(changes.get("name"), dict):
        layout["name"].update(changes["name"])
    if isinstance(changes.get("qr"), dict):
        layout["qr"].update(changes["qr"])
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text(json.dumps(layout, ensure_ascii=False), encoding="utf-8")
    return layout


def _load_base_image(dpi: int = RENDER_DPI) -> Image.Image:
    doc = fitz.open(TEMPLATE_FILE)
    try:
        page = doc[0]
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    finally:
        doc.close()


def _dpi_for_width(target_width_px: int) -> int:
    """DPI necesario para que la plantilla rasterice directamente al ancho deseado,
    evitando renderizar a alta resolución y luego reescalar (muy costoso con
    cientos de páginas)."""
    doc = fitz.open(TEMPLATE_FILE)
    try:
        page_width_pt = doc[0].rect.width
    finally:
        doc.close()
    return max(36, int(target_width_px / page_width_pt * 72))


@functools.lru_cache(maxsize=1)
def _resolve_font_path() -> Optional[str]:
    """Busca la fuente disponible una sola vez (evita golpear el disco por cada invitación)."""
    for path in _FONT_CANDIDATES:
        if Path(path).exists():
            return path
    return None


@functools.lru_cache(maxsize=64)
def _find_font(size: int) -> ImageFont.FreeTypeFont:
    """Fuente cacheada por tamaño: sin esto, generar un documento con cientos de
    invitaciones vuelve a parsear el .ttf desde disco en cada una y se vuelve
    inutilizable (de segundos a minutos)."""
    path = _resolve_font_path()
    if path:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            pass
    return ImageFont.load_default()


def _fit_font(draw: ImageDraw.ImageDraw, text: str, base_size: int, max_width_px: int, min_size: int = 28):
    """Reduce el tamaño de fuente hasta que el texto quepa en max_width_px (nombres largos)."""
    size = max(min_size, int(base_size))
    while size > min_size:
        font = _find_font(size)
        bbox = draw.textbbox((0, 0), text, font=font)
        if (bbox[2] - bbox[0]) <= max_width_px:
            return font, bbox
        size -= 4
    font = _find_font(min_size)
    return font, draw.textbbox((0, 0), text, font=font)


def _decode_qr_bytes(qr_image_data_uri: str) -> bytes:
    if qr_image_data_uri.startswith("data:image"):
        return base64.b64decode(qr_image_data_uri.split(",", 1)[1])
    return base64.b64decode(qr_image_data_uri)


def _draw_invitation(base_image: Image.Image, *, participant_name: str, qr_image_bytes: bytes, layout: Dict[str, Any]) -> Image.Image:
    page = base_image.copy()
    width, height = page.size
    draw = ImageDraw.Draw(page)

    name_cfg = layout["name"]
    text = (participant_name or "").strip() or "Invitado"
    max_width_px = int(width * float(name_cfg.get("max_width", 0.78)))
    font, bbox = _fit_font(draw, text, int(name_cfg.get("font_size", 130)), max_width_px)
    text_width = bbox[2] - bbox[0]
    text_x = int(width * float(name_cfg.get("x", 0.5)) - text_width / 2)
    text_y = int(height * float(name_cfg.get("y", 0.385)))
    draw.text((text_x, text_y), text, font=font, fill=name_cfg.get("color", "#26265f"))

    qr_cfg = layout["qr"]
    qr_image = Image.open(io.BytesIO(qr_image_bytes)).convert("RGBA")
    qr_size = max(1, int(width * float(qr_cfg.get("size", 0.48))))
    qr_image = qr_image.resize((qr_size, qr_size))
    qr_x = int(width * float(qr_cfg.get("x", 0.5)) - qr_size / 2)
    qr_y = int(height * float(qr_cfg.get("y", 0.665)))
    page.paste(qr_image, (qr_x, qr_y), qr_image)
    return page


def compose_invitation_image(
    *,
    participant_name: str,
    qr_image_bytes: bytes,
    layout: Optional[Dict[str, Any]] = None,
) -> bytes:
    if not is_template_available():
        raise FileNotFoundError("No hay plantilla PDF cargada. Súbela primero en el panel administrador.")

    layout = layout or load_layout()
    base = _load_base_image()
    page = _draw_invitation(base, participant_name=participant_name, qr_image_bytes=qr_image_bytes, layout=layout)

    buffer = io.BytesIO()
    page.save(buffer, format="PNG")
    return buffer.getvalue()


def compose_invitation_data_uri(
    *,
    participant_name: str,
    qr_image_data_uri: str,
    layout: Optional[Dict[str, Any]] = None,
) -> str:
    qr_bytes = _decode_qr_bytes(qr_image_data_uri)
    composed = compose_invitation_image(participant_name=participant_name, qr_image_bytes=qr_bytes, layout=layout)
    return "data:image/png;base64," + base64.b64encode(composed).decode("ascii")


def build_invitations_document(
    items: List[Dict[str, Any]],
    *,
    layout: Optional[Dict[str, Any]] = None,
    max_width: int = 700,
) -> bytes:
    """Arma un PDF de varias páginas (una invitación por página) para revisión rápida.

    items: [{"participant_name": str, "qr_image_bytes": bytes}, ...]
    Reutiliza la plantilla ya renderizada una sola vez (no una vez por invitado),
    para que generar el documento con muchos invitados sea rápido.
    """
    if not is_template_available():
        raise FileNotFoundError("No hay plantilla PDF cargada. Súbela primero en el panel administrador.")
    if not items:
        raise ValueError("No hay invitaciones para incluir en el documento.")

    layout = layout or load_layout()
    # Renderiza la plantilla directamente al tamaño final del documento: evita
    # reescalar una imagen de alta resolución cientos de veces (era el 75% del
    # tiempo total con rosters grandes).
    base = _load_base_image(dpi=_dpi_for_width(max_width))

    pages = []
    for item in items:
        page = _draw_invitation(
            base,
            participant_name=item.get("participant_name", ""),
            qr_image_bytes=item["qr_image_bytes"],
            layout=layout,
        )
        pages.append(page.convert("RGB"))

    buffer = io.BytesIO()
    pages[0].save(buffer, format="PDF", save_all=True, append_images=pages[1:])
    return buffer.getvalue()
