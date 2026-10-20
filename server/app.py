"""Read-only bridge from a local Webull bot's normalized JSON snapshot to InvestAI.

Run behind an HTTPS reverse proxy or private overlay network. Never expose this
development server directly to the public internet. The bridge does not place trades.
"""
import hmac
import json
import os
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from dotenv import load_dotenv
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

load_dotenv(Path(__file__).with_name(".env"))

app = FastAPI(title="InvestAI local data bridge", version="0.1.0")
bearer = HTTPBearer(auto_error=False)
SNAPSHOT_PATH = Path(os.environ.get("INVESTAI_SNAPSHOT_PATH", "./snapshot.json")).resolve()
API_TOKEN = os.environ.get("INVESTAI_API_TOKEN", "")


def require_token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not API_TOKEN:
        raise HTTPException(status_code=503, detail="API token is not configured on server")
    supplied = credentials.credentials if credentials else ""
    if not hmac.compare_digest(supplied, API_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token")
    return True


def load_snapshot() -> dict[str, Any]:
    try:
        with SNAPSHOT_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError("Snapshot root must be a JSON object")
        return payload
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Snapshot file is not available yet")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=f"Snapshot JSON is invalid: {exc}")


@app.get("/api/v1/health")
def health(_: bool = Depends(require_token)):
    return {"status": "ok", "source": "webull-bot"}


@app.get("/api/v1/portfolio")
def portfolio(_: bool = Depends(require_token)):
    return load_snapshot().get("portfolio", {})


@app.get("/api/v1/positions")
def positions(_: bool = Depends(require_token)):
    return {"positions": load_snapshot().get("positions", [])}


@app.get("/api/v1/trades")
def trades(_: bool = Depends(require_token)):
    return {"trades": load_snapshot().get("trades", [])}


@app.get("/api/v1/analytics")
def analytics(_: bool = Depends(require_token)):
    return load_snapshot().get("analytics", {})
