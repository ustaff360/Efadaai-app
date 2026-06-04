
import json
from urllib.request import Request, urlopen

# Login
req = Request('http://localhost:8000/api/v1/auth/login/', 
              data=json.dumps({"username": "admin", "password": "admin123"}).encode(),
              headers={"Content-Type": "application/json"})
resp = urlopen(req)
data = json.loads(resp.read())
token = data['access_token']
print(f"Token: {token[:50]}...")

# Test users list
req = Request('http://localhost:8000/api/v1/users/', 
              headers={"Authorization": f"Bearer {token}"})
try:
    resp = urlopen(req)
    print(f"Users: {resp.read().decode()[:200]}")
except Exception as e:
    print(f"Error: {e}")
