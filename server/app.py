"""InvestAI read-only API bridge with SQLite-backed accounts and admin controls."""
import hashlib, hmac, json, os, secrets, sqlite3, time
from pathlib import Path
from typing import Any
from fastapi import Depends, FastAPI, HTTPException
from dotenv import load_dotenv
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

load_dotenv(Path(__file__).with_name(".env"))
app = FastAPI(title="InvestAI API", version="0.2.0")
bearer = HTTPBearer(auto_error=False)
SNAPSHOT_PATH = Path(os.environ.get("INVESTAI_SNAPSHOT_PATH", "./snapshot.json")).resolve()
API_TOKEN = os.environ.get("INVESTAI_API_TOKEN", "")
DB_PATH = Path(os.environ.get("INVESTAI_DATABASE_PATH", str(Path(__file__).with_name("investai.sqlite3"))))
SESSION_SECONDS = 60 * 60 * 24 * 30

def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000)
    return salt.hex() + "$" + digest.hex()

def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        actual = hash_password(password, bytes.fromhex(salt_hex)).split("$", 1)[1]
        return hmac.compare_digest(actual, digest_hex)
    except Exception:
        return False

def init_db():
    with db() as c:
        c.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        c.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))")
        c.execute("CREATE TABLE IF NOT EXISTS user_settings (user_id INTEGER PRIMARY KEY, connection_url TEXT NOT NULL DEFAULT '', connection_token TEXT NOT NULL DEFAULT '', FOREIGN KEY(user_id) REFERENCES users(id))")
        admin_name = os.environ.get("INVESTAI_ADMIN_USERNAME", "admin").strip() or "admin"
        # First-run seed. Override this environment variable before exposing the service.
        admin_password = os.environ.get("INVESTAI_ADMIN_PASSWORD", "password")
        row = c.execute("SELECT id FROM users WHERE username=?", (admin_name,)).fetchone()
        if not row:
            c.execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)", (admin_name, hash_password(admin_password), "admin"))

init_db()

def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    supplied = credentials.credentials if credentials else ""
    if API_TOKEN and hmac.compare_digest(supplied, API_TOKEN):
        return {"id": 0, "username": "service-token", "role": "admin"}
    if not supplied:
        raise HTTPException(status_code=401, detail="Login required")
    token_hash = hashlib.sha256(supplied.encode()).hexdigest()
    with db() as c:
        row = c.execute("SELECT u.id,u.username,u.role,u.active,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?", (token_hash,)).fetchone()
    if not row or not row["active"] or row["expires_at"] < int(time.time()):
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please sign in again.")
    return {"id": row["id"], "username": row["username"], "role": row["role"]}

def require_admin(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user

def load_snapshot() -> dict[str, Any]:
    try:
        with SNAPSHOT_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict): raise ValueError("Snapshot root must be a JSON object")
        return payload
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Snapshot file is not available yet")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=f"Snapshot JSON is invalid: {exc}")

@app.post("/api/v1/auth/login")
def login(payload: dict[str, Any]):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if not username or not password: raise HTTPException(status_code=400, detail="Username and password are required")
    with db() as c:
        row = c.execute("SELECT id,username,password_hash,role,active FROM users WHERE username=?", (username,)).fetchone()
        if not row or not row["active"] or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token = secrets.token_urlsafe(40)
        c.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), row["id"], int(time.time())+SESSION_SECONDS))
        c.execute("INSERT OR IGNORE INTO user_settings(user_id) VALUES(?)", (row["id"],))
    return {"access_token": token, "token_type": "bearer", "expires_in": SESSION_SECONDS, "user": {"username": row["username"], "role": row["role"]}}

@app.post("/api/v1/auth/logout")
def logout(user=Depends(current_user), credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials and user["id"] != 0:
        with db() as c: c.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(credentials.credentials.encode()).hexdigest(),))
    return {"status":"ok"}

@app.get("/api/v1/account/connection")
def get_connection(user=Depends(current_user)):
    if user["id"] == 0: return {"url":"","token":""}
    with db() as c:
        row = c.execute("SELECT connection_url,connection_token FROM user_settings WHERE user_id=?", (user["id"],)).fetchone()
    return {"url": row["connection_url"] if row else "", "token": row["connection_token"] if row else ""}

@app.put("/api/v1/account/connection")
def put_connection(payload: dict[str, Any], user=Depends(current_user)):
    if user["id"] == 0: raise HTTPException(status_code=400, detail="Sign in with an account to save personal connection settings")
    url = str(payload.get("url", "")).strip().rstrip("/")
    token = str(payload.get("token", "")).strip()
    if url and not (url.startswith("https://") or url.startswith("http://localhost") or url.startswith("http://127.0.0.1")):
        raise HTTPException(status_code=400, detail="Remote server URLs must use HTTPS")
    with db() as c:
        c.execute("INSERT INTO user_settings(user_id,connection_url,connection_token) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET connection_url=excluded.connection_url,connection_token=excluded.connection_token", (user["id"],url,token))
    return {"status":"ok"}

@app.get("/api/v1/admin/users")
def list_users(_: dict = Depends(require_admin)):
    with db() as c:
        rows = c.execute("SELECT id,username,role,active,created_at FROM users ORDER BY username").fetchall()
    return {"users":[dict(r) for r in rows]}

@app.post("/api/v1/admin/users")
def create_user(payload: dict[str, Any], _: dict = Depends(require_admin)):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    role = str(payload.get("role", "user"))
    if len(username) < 3 or len(password) < 10: raise HTTPException(status_code=400, detail="Username must be at least 3 characters and password at least 10 characters")
    if role not in ("user","admin"): raise HTTPException(status_code=400, detail="Invalid role")
    try:
        with db() as c: c.execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)", (username,hash_password(password),role))
    except sqlite3.IntegrityError: raise HTTPException(status_code=409, detail="Username already exists")
    return {"status":"created","username":username,"role":role}

@app.patch("/api/v1/admin/users/{user_id}")
def update_user(user_id: int, payload: dict[str, Any], actor=Depends(require_admin)):
    with db() as c:
        row = c.execute("SELECT id,username,role,active FROM users WHERE id=?", (user_id,)).fetchone()
        if not row: raise HTTPException(status_code=404, detail="User not found")
        if row["role"] == "admin" and user_id == actor["id"] and payload.get("active") is False:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")
        if "active" in payload: c.execute("UPDATE users SET active=? WHERE id=?", (1 if payload["active"] else 0,user_id))
        if payload.get("password"):
            password = str(payload["password"])
            if len(password) < 10: raise HTTPException(status_code=400, detail="Password must be at least 10 characters")
            c.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(password),user_id))
        if payload.get("role") in ("user","admin"): c.execute("UPDATE users SET role=? WHERE id=?", (payload["role"],user_id))
        if payload.get("active") is False: c.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    return {"status":"ok"}

@app.get("/api/v1/health")
def health(_: dict = Depends(current_user)): return {"status":"ok","source":"investai"}

@app.get("/api/v1/portfolio")
def portfolio(_: dict = Depends(current_user)): return load_snapshot().get("portfolio", {})
@app.get("/api/v1/positions")
def positions(_: dict = Depends(current_user)): return {"positions":load_snapshot().get("positions",[])}
@app.get("/api/v1/trades")
def trades(_: dict = Depends(current_user)): return {"trades":load_snapshot().get("trades",[])}
@app.get("/api/v1/analytics")
def analytics(_: dict = Depends(current_user)): return load_snapshot().get("analytics",{})
