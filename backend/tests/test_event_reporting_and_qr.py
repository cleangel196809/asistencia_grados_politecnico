import pandas as pd
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_bulk_qr_generation_returns_tickets_for_all_participants(admin_headers):
    event = client.get('/events', headers=admin_headers).json()[0]
    participants = client.get(f"/events/{event['id']}/participants", headers=admin_headers).json()

    response = client.get(f"/events/{event['id']}/qr/bulk", headers=admin_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload['event']['id'] == event['id']
    assert len(payload['participants']) == len(participants)
    assert all('tickets' in participant for participant in payload['participants'])


def test_bulk_qr_generation_requires_admin(logistico_headers):
    event = client.get('/events', headers=logistico_headers).json()[0]

    response = client.get(f"/events/{event['id']}/qr/bulk", headers=logistico_headers)

    assert response.status_code == 403


def test_bulk_qr_generation_requires_auth():
    response = client.get('/events')
    assert response.status_code == 401


def test_report_includes_pending_and_attended_participants(admin_headers, scanner_headers):
    event = client.get('/events', headers=admin_headers).json()[0]
    participant = client.get(f"/events/{event['id']}/participants", headers=admin_headers).json()[0]

    qr_response = client.get(f"/events/{event['id']}/qr/{participant['id']}", headers=admin_headers)
    assert qr_response.status_code == 200

    scan_response = client.post(
        '/attendance/scan',
        json={
            'event_id': event['id'],
            'payload': qr_response.json()['tickets'][0]['payload'],
            'source': 'online',
        },
        headers=scanner_headers,
    )
    assert scan_response.status_code == 200

    report_response = client.get(f"/events/{event['id']}/report", headers=admin_headers)
    assert report_response.status_code == 200
    assert report_response.headers['content-type'].startswith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    buffer = pd.ExcelFile(report_response.content)
    df = pd.read_excel(buffer)
    assert 'Estado asistencia' in df.columns
    assert 'Invitaciones pendientes' in df.columns
    assert 'Fecha/Hora ingreso' in df.columns
    assert len(df) >= 1
    assert df['Estado asistencia'].isin(['Asistió', 'Pendiente']).all()


def test_report_requires_admin_not_logistico(logistico_headers):
    event = client.get('/events', headers=logistico_headers).json()[0]

    response = client.get(f"/events/{event['id']}/report", headers=logistico_headers)

    assert response.status_code == 403
