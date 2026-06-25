#!/usr/bin/env python3
"""
CLI tool to manage the API key for the Smart Agent Routing system.
Usage:
  python scripts/manage_api_key.py show         # Show current API key (masked)
  python scripts/manage_api_key.py show --raw   # Show current API key (full)
  python scripts/manage_api_key.py generate     # Generate and save new key
  python scripts/manage_api_key.py set <key>    # Set a specific key
"""
import sys
import secrets
import os

API_ENV_FILE = os.path.join(os.path.dirname(__file__), '..', 'backend', 'app', '.env')
API_ENV_PROD_FILE = os.path.join(os.path.dirname(__file__), '..', '.env.production')


def read_env_key(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('API_KEY='):
                val = line.split('=', 1)[1].strip().strip('"').strip("'")
                return val if val else None
    return None


def write_env_key(path, key):
    lines = []
    found = False
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                if line.startswith('API_KEY='):
                    lines.append(f'API_KEY={key}\n')
                    found = True
                else:
                    lines.append(line)
    if not found:
        lines.append(f'\n# API Key for external service auth\nAPI_KEY={key}\n')
    with open(path, 'w') as f:
        f.writelines(lines)


def show_key(raw=False):
    key = read_env_key(API_ENV_FILE)
    if not key:
        print("No API key configured.")
        return
    if raw:
        print(key)
    else:
        masked = key[:4] + '*' * (len(key) - 8) + key[-4:] if len(key) > 8 else '*' * len(key)
        print(f"Current API key: {masked}")
        print(f"Length: {len(key)} characters")
        print(f"Source: backend/app/.env")


def generate_key():
    new_key = secrets.token_hex(32)
    write_env_key(API_ENV_FILE, new_key)
    write_env_key(API_ENV_PROD_FILE, new_key)
    print(f"New API key generated and saved:")
    print(f"  {new_key}")
    print()
    print("Files updated:")
    print(f"  - backend/app/.env")
    print(f"  - .env.production")
    print()
    print("Restart the backend for the change to take effect:")
    print("  docker restart routing-backend")


def set_key(key):
    if len(key) < 16:
        print("Error: API key must be at least 16 characters.")
        sys.exit(1)
    write_env_key(API_ENV_FILE, key)
    write_env_key(API_ENV_PROD_FILE, key)
    print(f"API key set.")
    print("Restart the backend: docker restart routing-backend")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == 'show':
        show_key('--raw' in sys.argv)
    elif cmd == 'generate':
        generate_key()
    elif cmd == 'set':
        if len(sys.argv) < 3:
            print("Usage: python scripts/manage_api_key.py set <key>")
            sys.exit(1)
        set_key(sys.argv[2])
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)
