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

# Test delete user (id=2 - ahsan)
req = Request('http://localhost:8000/api/v1/users/2/', 
              headers={"Authorization": f"Bearer {token}"},
              method='DELETE')
try:
    resp = urlopen(req)
    print(f"Delete status: {resp.status}")
    print(f"Delete response: {resp.read().decode()[:100]}")
except Exception as e:
    print(f"Delete error: {e}")

# Test reset password for user (if any remaining)
req = Request('http://localhost:8000/api/v1/users/3/reset-password/', 
              data=b'',
              headers={"Authorization": f"Bearer {token}"},
              method='POST')
try:
    resp = urlopen(req)
    print(f"Reset status: {resp.status}")
    print(f"Reset response: {resp.read().decode()[:200]}")
except Exception as e:
    print(f"Reset error: {e}")

# List remaining users
req = Request('http://localhost:8000/api/v1/users/', 
              headers={"Authorization": f"Bearer {token}"})
try:
    resp = urlopen(req)
    users = json.loads(resp.read())
    print(f"Remaining users: {len(users)}")
    for u in users:
        print(f"  - {u['username']} (id={u['id']})")
except Exception as e:
    print(f"List error: {e}")
