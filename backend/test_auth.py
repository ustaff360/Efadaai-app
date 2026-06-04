import requests
import json

# Login
resp = requests.post('http://localhost:8000/api/v1/auth/login/', json={"username": "admin", "password": "admin123"})
print(f"Login status: {resp.status_code}")
data = resp.json()
token = data['access_token']
print(f"Token: {token[:50]}...")

# Test users list
resp = requests.get('http://localhost:8000/api/v1/users/', headers={"Authorization": f"Bearer {token}"})
print(f"Users status: {resp.status_code}")
print(f"Users: {resp.text[:200]}")
