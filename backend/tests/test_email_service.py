from unittest.mock import MagicMock, patch

from app import email_service


def test_is_smtp_configured_false_without_env(monkeypatch):
    monkeypatch.delenv('EMAIL_SMTP_HOST', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_USER', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_PASSWORD', raising=False)
    assert email_service.is_smtp_configured() is False


def test_is_smtp_configured_true_with_env(monkeypatch):
    monkeypatch.setenv('EMAIL_SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('EMAIL_SMTP_USER', 'eventospolitecnicointernacional@pi.edu.co')
    monkeypatch.setenv('EMAIL_SMTP_PASSWORD', 'secret')
    assert email_service.is_smtp_configured() is True


def test_send_invitation_email_without_recipient_fails_fast():
    result = email_service.send_invitation_email(
        to_address='',
        subject='Invitación',
        body_text='Hola',
        qr_images=[],
    )
    assert result['sent'] is False
    assert 'destinatario' in result['reason']


def test_send_invitation_email_without_smtp_configured(monkeypatch):
    monkeypatch.delenv('EMAIL_SMTP_HOST', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_USER', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_PASSWORD', raising=False)

    result = email_service.send_invitation_email(
        to_address='invitado@example.com',
        subject='Invitación',
        body_text='Hola',
        qr_images=[],
    )
    assert result['sent'] is False
    assert 'SMTP no configurado' in result['reason']


def test_send_invitation_email_success_uses_smtp(monkeypatch):
    monkeypatch.setenv('EMAIL_SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('EMAIL_SMTP_USER', 'eventospolitecnicointernacional@pi.edu.co')
    monkeypatch.setenv('EMAIL_SMTP_PASSWORD', 'secret')

    mock_server = MagicMock()
    mock_smtp_cm = MagicMock()
    mock_smtp_cm.__enter__.return_value = mock_server
    mock_smtp_cm.__exit__.return_value = False

    with patch('smtplib.SMTP', return_value=mock_smtp_cm) as mock_smtp:
        result = email_service.send_invitation_email(
            to_address='invitado@example.com',
            subject='Invitación al grado',
            body_text='Hola, este es tu QR.',
            qr_images=[],
        )

    assert result['sent'] is True
    mock_smtp.assert_called_once()
    mock_server.starttls.assert_called_once()
    mock_server.login.assert_called_once_with('eventospolitecnicointernacional@pi.edu.co', 'secret')
    mock_server.send_message.assert_called_once()


def test_send_bulk_invitation_emails_reports_not_configured(monkeypatch):
    monkeypatch.delenv('EMAIL_SMTP_HOST', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_USER', raising=False)
    monkeypatch.delenv('EMAIL_SMTP_PASSWORD', raising=False)

    result = email_service.send_bulk_invitation_emails(recipients=[
        {'participant_id': '1', 'to_address': 'a@example.com', 'subject': 'x', 'body_text': 'y', 'qr_images': []},
        {'participant_id': '2', 'to_address': 'b@example.com', 'subject': 'x', 'body_text': 'y', 'qr_images': []},
    ])

    assert result['configured'] is False
    assert result['sent'] == 0
    assert result['errors'] == 2
