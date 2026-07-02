from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_user(admin_headers, username="temp_user", role="LOGISTICO", password="temp123"):
    response = client.post(
        '/users',
        json={'username': username, 'password': password, 'role': role},
        headers=admin_headers,
    )
    assert response.status_code == 200
    return response.json()


def test_create_user_with_role_and_login(admin_headers):
    created = _create_user(admin_headers, username="qa_logistico", role="LOGISTICO", password="qa123456")
    assert created['role'] == 'LOGISTICO'

    login_response = client.post('/login', json={
        'username': 'qa_logistico',
        'password': 'qa123456',
        'role': 'LOGISTICO',
    })
    assert login_response.status_code == 200
    assert login_response.json()['role'] == 'LOGISTICO'
    assert 'access_token' in login_response.json()

    client.delete(f"/users/{created['id']}", headers=admin_headers)


def test_create_user_rejects_duplicate_username(admin_headers):
    created = _create_user(admin_headers, username="qa_duplicate", role="SCANNER", password="dup12345")

    duplicate_response = client.post(
        '/users',
        json={'username': 'qa_duplicate', 'password': 'other12345', 'role': 'SCANNER'},
        headers=admin_headers,
    )
    assert duplicate_response.status_code == 400

    client.delete(f"/users/{created['id']}", headers=admin_headers)


def test_update_user_changes_role_and_password(admin_headers):
    created = _create_user(admin_headers, username="qa_editable", role="SCANNER", password="old12345")

    update_response = client.put(
        f"/users/{created['id']}",
        json={'role': 'LOGISTICO', 'password': 'new12345'},
        headers=admin_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()['role'] == 'LOGISTICO'

    old_login = client.post('/login', json={'username': 'qa_editable', 'password': 'old12345'})
    assert old_login.status_code == 401

    new_login = client.post('/login', json={'username': 'qa_editable', 'password': 'new12345', 'role': 'LOGISTICO'})
    assert new_login.status_code == 200

    client.delete(f"/users/{created['id']}", headers=admin_headers)


def test_update_user_missing_returns_404(admin_headers):
    response = client.put('/users/does-not-exist', json={'role': 'ADMIN'}, headers=admin_headers)
    assert response.status_code == 404


def test_delete_user_removes_it(admin_headers):
    created = _create_user(admin_headers, username="qa_delete_me", role="SCANNER", password="del123456")

    delete_response = client.delete(f"/users/{created['id']}", headers=admin_headers)
    assert delete_response.status_code == 200
    assert delete_response.json()['deleted'] is True

    login_after_delete = client.post('/login', json={'username': 'qa_delete_me', 'password': 'del123456'})
    assert login_after_delete.status_code == 401


def test_users_endpoints_require_admin_role(logistico_headers, scanner_headers):
    for headers in (logistico_headers, scanner_headers):
        assert client.get('/users', headers=headers).status_code == 403
        assert client.post(
            '/users',
            json={'username': 'nope', 'password': 'x1234567', 'role': 'SCANNER'},
            headers=headers,
        ).status_code == 403


def test_users_endpoints_require_authentication():
    assert client.get('/users').status_code == 401
    assert client.post('/users', json={'username': 'nope', 'password': 'x1234567', 'role': 'SCANNER'}).status_code == 401
