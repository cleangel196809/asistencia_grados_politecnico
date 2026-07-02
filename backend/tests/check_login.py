import json
import urllib.request

req = urllib.request.Request(
    'http://localhost:8000/login',
    data=json.dumps({'username': 'admin', 'password': 'admin123', 'role': 'ADMIN'}).encode(),
    headers={'Content-Type': 'application/json'},
)
with urllib.request.urlopen(req) as resp:
    print(resp.status)
    print(resp.read().decode())
