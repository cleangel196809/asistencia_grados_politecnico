from app.whatsapp_trello_service import _build_wa_link, _format_description


def test_build_wa_link_encodes_message():
    link = _build_wa_link('3001112233', 'Hola Ana, este es tu QR')
    assert link.startswith('https://wa.me/3001112233?text=')
    assert 'Hola%20Ana' in link


def test_format_description_includes_wa_link_when_phone_present():
    description = _format_description({
        'participant_name': 'Ana Pérez',
        'participant_cedula': '12345',
        'participant_phone': '3001112233',
        'whatsapp_text': 'Te invitamos al evento',
        'qr_payloads': ['{"token": "abc"}'],
    })
    assert 'https://wa.me/3001112233?text=' in description
    assert 'Ana Pérez' in description


def test_format_description_without_phone_has_no_link():
    description = _format_description({
        'participant_name': 'Ana Pérez',
        'participant_cedula': '12345',
        'participant_phone': '',
        'whatsapp_text': 'Te invitamos al evento',
        'qr_payloads': [],
    })
    assert 'Sin teléfono válido' in description
