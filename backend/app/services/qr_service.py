import base64
import io
import json

import qrcode
import qrcode.image.pil


def generate_qr_image_base64(qr_data: dict) -> str:
    """Generate QR code image from data dict and return as base64 string."""
    qr_json = json.dumps(qr_data, ensure_ascii=False)

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_json)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return base64.b64encode(buffer.getvalue()).decode("utf-8")


async def generate_qr_for_participant(
    participant: dict, evento_id: str, boleta_num: int, total_boletas: int
) -> dict:
    return {
        "qr_id": None,
        "evento_id": evento_id,
        "cedula": participant.get("no_documento", ""),
        "numero_boleta": boleta_num,
        "total_boletas": total_boletas,
    }
