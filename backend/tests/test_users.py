from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_user(username="temp_user", role="LOGISTICO", password="temp123"):
    response = client.post('/users', json={
        'username': username,
        'password': password,
        'role': role,
    })
    assert response.status_code == 200
    return response.json()


def test_create_user_with_role_and_login():
    created = _create_user(username="qa_logistico", role="LOGISTICO", password="qa123456")
    assert created['role'] == 'LOGISTICO'

    login_response = client.post('/login', json={
        'username': 'qa_logistico',
        'password': 'qa123456',
        'role': 'LOGISTICO',
    })
    assert login_response.status_code == 200
    assert login_response.json()['role'] == 'LOGISTICO'

    client.delete(f"/users/{created['id']}")


def test_create_user_rejects_duplicate_username():
    created = _create_user(username="qa_duplicate", role="SCANNER", password="dup12345")

    duplicate_response = client.post('/users', json={
        'username': 'qa_duplicate',
        'password': 'other12345',
        'role': 'SCANNER',
    })
    assert duplicate_response.status_code == 400

    client.delete(f"/users/{created['id']}")


def test_update_user_changes_role_and_password():
    created = _create_user(username="qa_editable", role="SCANNER", password="old12345")

    update_response = client.put(f"/users/{created['id']}", json={
        'role': 'LOGISTICO',
        'password': 'new12345',
    })
    assert update_response.status_code == 200
    assert update_response.json()['role'] == 'LOGISTICO'

    old_login = client.post('/login', json={'username': 'qa_editable', 'password': 'old12345'})
    assert old_login.status_code == 401

    new_login = client.post('/login', json={'username': 'qa_editable', 'password': 'new12345', 'role': 'LOGISTICO'})
    assert new_login.status_code == 200

    client.delete(f"/users/{created['id']}")


def test_update_user_missing_returns_404():
    response = client.put('/users/does-not-exist', json={'role': 'ADMIN'})
    assert response.status_code == 404


def test_delete_user_removes_it():
    created = _create_user(username="qa_delete_me", role="SCANNER", password="del123456")

    delete_response = client.delete(f"/users/{created['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json()['deleted'] is True

    login_after_delete = client.post('/login', json={'username': 'qa_delete_me', 'password': 'del123456'})
    assert login_after_delete.status_code == 401
