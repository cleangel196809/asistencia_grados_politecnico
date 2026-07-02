import pandas as pd
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_bulk_qr_generation_returns_tickets_for_all_participants():
    event = client.get('/events').json()[0]
    participants = client.get(f"/events/{event['id']}/participants").json()

    response = client.get(f"/events/{event['id']}/qr/bulk")

    assert response.status_code == 200
    payload = response.json()
    assert payload['event']['id'] == event['id']
    assert len(payload['participants']) == len(participants)
    assert all('tickets' in participant for participant in payload['participants'])


def test_report_includes_pending_and_attended_participants():
    event = client.get('/events').json()[0]
    participant = client.get(f"/events/{event['id']}/participants").json()[0]

    qr_response = client.get(f"/events/{event['id']}/qr/{participant['id']}")
    assert qr_response.status_code == 200

    scan_response = client.post('/attendance/scan', json={
        'event_id': event['id'],
        'payload': qr_response.json()['tickets'][0]['payload'],
        'source': 'online',
    })
    assert scan_response.status_code == 200

    report_response = client.get(f"/events/{event['id']}/report")
    assert report_response.status_code == 200
    assert report_response.headers['content-type'].startswith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    buffer = pd.ExcelFile(report_response.content)
    df = pd.read_excel(buffer)
    assert 'Estado asistencia' in df.columns
    assert 'Invitaciones pendientes' in df.columns
    assert 'Fecha/Hora ingreso' in df.columns
    assert len(df) >= 1
    assert df['Estado asistencia'].isin(['Asistió', 'Pendiente']).all()
