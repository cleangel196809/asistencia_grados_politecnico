import os

# Debe fijarse antes de importar app.main (que importa app.database), para que
# las pruebas usen una base en memoria limpia y no lean/escriban el snapshot
# real de desarrollo en backend/.data/mock_snapshot.json.
os.environ.setdefault("DISABLE_MOCK_SNAPSHOT", "1")

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

DEMO_CREDENTIALS = {
    "ADMIN": ("admin", "admin123"),
    "LOGISTICO": ("logistico", "logis123"),
    "SCANNER": ("scanner", "scanner123"),
}


def auth_headers(role: str) -> dict:
    username, password = DEMO_CREDENTIALS[role]
    response = client.post("/login", json={"username": username, "password": password, "role": role})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    return auth_headers("ADMIN")


@pytest.fixture
def logistico_headers():
    return auth_headers("LOGISTICO")


@pytest.fixture
def scanner_headers():
    return auth_headers("SCANNER")
