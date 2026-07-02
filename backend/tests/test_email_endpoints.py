from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_email_status_reports_unconfigured_by_default(monkeypatch, admin_headers):
    monkeypatch.delenv('EMAIL_SMTP_HOST', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_USER', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_PASSWORD', raising=False)

    response = client.get('/invitations/email/status', headers=admin_headers)
    assert response.status_code == 200
    assert response.json() == {'configured': False}


def test_email_status_requires_authentication():
    response = client.get('/invitations/email/status')
    assert response.status_code == 401


def test_program_email_bulk_without_smtp_reports_not_configured(monkeypatch, admin_headers):
    monkeypatch.delenv('EMAIL_SMTP_HOST', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_USER', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_PASSWORD', raising=False)

    event = client.get('/events', headers=admin_headers).json()[0]

    response = client.post(
        '/invitations/email/program',
        json={'event_id': event['id'], 'subject': 'Invitación de prueba', 'body_text': ''},
        headers=admin_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['configured'] is False
    assert payload['sent'] == 0


def test_program_email_bulk_requires_admin(logistico_headers):
    event = client.get('/events', headers=logistico_headers).json()[0]

    response = client.post(
        '/invitations/email/program',
        json={'event_id': event['id'], 'subject': 'x', 'body_text': 'y'},
        headers=logistico_headers,
    )
    assert response.status_code == 403


def test_send_email_individual_unknown_participant_returns_404(admin_headers):
    event = client.get('/events', headers=admin_headers).json()[0]

    response = client.post(
        '/invitations/email/individual',
        json={'event_id': event['id'], 'participant_id': 'does-not-exist', 'subject': 'x', 'body_text': 'y'},
        headers=admin_headers,
    )
    assert response.status_code == 404


def test_send_email_individual_allows_logistico(logistico_headers):
    event = client.get('/events', headers=logistico_headers).json()[0]

    response = client.post(
        '/invitations/email/individual',
        json={'event_id': event['id'], 'participant_id': 'does-not-exist', 'subject': 'x', 'body_text': 'y'},
        headers=logistico_headers,
    )
    # 404 (not 403) proves the role was accepted and the lookup ran.
    assert response.status_code == 404


def test_send_email_individual_denies_scanner(scanner_headers):
    event = client.get('/events', headers=scanner_headers).json()[0]

    response = client.post(
        '/invitations/email/individual',
        json={'event_id': event['id'], 'participant_id': 'does-not-exist', 'subject': 'x', 'body_text': 'y'},
        headers=scanner_headers,
    )
    assert response.status_code == 403


def test_program_email_bulk_unknown_event_returns_404(admin_headers):
    response = client.post(
        '/invitations/email/program',
        json={'event_id': 'does-not-exist', 'subject': 'x', 'body_text': 'y'},
        headers=admin_headers,
    )
    assert response.status_code == 404
