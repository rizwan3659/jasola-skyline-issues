"""Write seed.sql: issues + member lists from a claude.ai export, plus the admin password.

Usage: python3 scripts/seed.py <export_dir> <admin_password>  > seed.sql
"""
import json, glob, os, sys, hashlib, secrets, datetime

exp, password = sys.argv[1], sys.argv[2]
q = lambda s: "'" + s.replace("'", "''") + "'"
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
out = []
for coll, mode in (("issues", "rwa"), ("authorityIssues", "auth")):
    for f in sorted(glob.glob(os.path.join(exp, coll, "*.json"))):
        d = json.load(open(f)); d.pop("id", None)
        out.append(f"INSERT OR REPLACE INTO issues (id, mode, data, updated_at) VALUES ({q(os.path.basename(f)[:-5])}, '{mode}', {q(json.dumps(d, ensure_ascii=False))}, {q(now)});")
dpath = os.path.join(exp, "config", "directory.json")
if os.path.exists(dpath):
    out.append(f"INSERT OR REPLACE INTO kv (key, value) VALUES ('directory', {q(json.dumps(json.load(open(dpath)), ensure_ascii=False))});")
salt = secrets.token_hex(16)
h = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100000).hex()
out.append(f"INSERT OR REPLACE INTO kv (key, value) VALUES ('admin_password', {q(json.dumps({'salt': salt, 'iter': 100000, 'hash': h, 'v': 1}))});")
out.append(f"INSERT OR IGNORE INTO kv (key, value) VALUES ('session_secret', {q(json.dumps(secrets.token_hex(32)))});")
print("\n".join(out))
