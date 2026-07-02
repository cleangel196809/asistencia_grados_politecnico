from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_email_status_reports_unconfigured_by_default(monkeypatch):
    monkeypatch.delenv('EMAIL_SMTP_HOST', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_USER', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_PASSWORD', raising=False)

    response = client.get('/invitations/email/status')
    assert response.status_code == 200
    assert response.json() == {'configured': False}


def test_program_email_bulk_without_smtp_reports_not_configured(monkeypatch):
    monkeypatch.delenv('EMAIL_SMTP_HOST', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_USER', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_PASSWORD', raising=False)

    event = client.get('/events').json()[0]

    response = client.post('/invitations/email/program', json={
        'event_id': event['id'],
        'subject': 'Invitación de prueba',
        'body_text': '',
    })
    assert response.status_code == 200
    payload = response.json()
    assert payload['configured'] is False
    assert payload['sent'] == 0


def test_send_email_individual_unknown_participant_returns_404():
    event = client.get('/events').json()[0]

    response = client.post('/invitations/email/individual', json={
        'event_id': event['id'],
        'participant_id': 'does-not-exist',
        'subject': 'x',
        'body_text': 'y',
    })
    assert response.status_code == 404


def test_program_email_bulk_unknown_event_returns_404():
    response = client.post('/invitations/email/program', json={
        'event_id': 'does-not-exist',
        'subject': 'x',
        'body_text': 'y',
    })
    assert response.status_code == 404
