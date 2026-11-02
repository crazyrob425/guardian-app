#!/usr/bin/env python3
"""Deploy the guardian-sync Worker (with Durable Object) via the Cloudflare API."""
import sys, json, urllib.request, uuid

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

ACC = "6c8b8f9c0df0587ea450b284bb546c2e"
NAME = "guardian-sync"
HOST = ("api.cloudflare.com",)

code = open("worker.js", "rb").read()
metadata = {
    "main_module": "worker.js",
    "bindings": [
        {"type": "durable_object_namespace", "name": "ROOMS", "class_name": "Room"}
    ],
    
    "compatibility_date": "2025-06-01",
}

boundary = "----guardian" + uuid.uuid4().hex
parts = []
parts.append(
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="metadata"; filename="metadata.json"\r\n'
    f"Content-Type: application/json\r\n\r\n".encode()
    + json.dumps(metadata).encode()
    + b"\r\n"
)
parts.append(
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n'
    f"Content-Type: application/javascript+module\r\n\r\n".encode()
    + code
    + b"\r\n"
)
parts.append(f"--{boundary}--\r\n".encode())
body = b"".join(parts)

url = f"https://api.cloudflare.com/client/v4/accounts/{ACC}/workers/scripts/{NAME}"
req = urllib.request.Request(url, data=body, method="PUT")
req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=HOST)
try:
    with urllib.request.urlopen(req) as r:
        print("script PUT:", r.status)
except urllib.error.HTTPError as e:
    print("script PUT failed:", e.code, e.read().decode()[:600])
    sys.exit(1)

# Attach the custom domain (creates DNS + cert internally).
dom = json.dumps({
    "hostname": "guardian-sync.blacklisted.studio",
    "service": NAME,
    "environment": "production",
}).encode()
url2 = f"https://api.cloudflare.com/client/v4/accounts/{ACC}/workers/domains"
req2 = urllib.request.Request(url2, data=dom, method="PUT")
req2.add_header("Content-Type", "application/json")
add_surrogate_to_request(req2, "custom.cloudflare", allowed_hosts=HOST)
try:
    with urllib.request.urlopen(req2) as r:
        print("domain attach:", r.status)
except urllib.error.HTTPError as e:
    print("domain attach:", e.code, e.read().decode()[:400])
print("done")
