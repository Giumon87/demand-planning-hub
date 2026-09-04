"""Demand Planning Hub — account + file per azienda.
Avvio: dalla cartella server  →  python -m uvicorn app:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from forecast_engine import auto_forecast

ROOT = Path(__file__).resolve().parent.parent
OLD_DATA = Path(__file__).resolve().parent / "data"
DATA = Path(os.environ.get("DPH_DATA_DIR") or (Path.home() / "DemandPlanningHub-data"))
DB = DATA / "dph.sqlite"
FILES = DATA / "files"
MAX_BYTES = 15 * 1024 * 1024
ALLOWED_EXT = {".xlsx", ".xls", ".csv"}

DATA.mkdir(parents=True, exist_ok=True)
FILES.mkdir(parents=True, exist_ok=True)
if not DB.exists() and (OLD_DATA / "dph.sqlite").exists():
    import shutil
    shutil.copy2(OLD_DATA / "dph.sqlite", DB)
    old_files = OLD_DATA / "files"
    if old_files.exists():
        shutil.copytree(old_files, FILES, dirs_exist_ok=True)


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init_db() -> None:
    con = db()
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS companies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          piano TEXT NOT NULL DEFAULT 'pilot',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id),
          email TEXT NOT NULL UNIQUE,
          nome TEXT NOT NULL,
          cognome TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          original_name TEXT NOT NULL,
          stored_name TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS forecasts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          title TEXT NOT NULL,
          payload TEXT NOT NULL,
          mape REAL,
          mape_n INTEGER,
          created_at INTEGER NOT NULL
        );
        """
    )
    con.commit()
    con.close()


def hash_pw(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return salt + "$" + dk.hex()


def check_pw(password: str, stored: str) -> bool:
    try:
        salt, _hex = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(hash_pw(password, salt), stored)


def now() -> int:
    return int(time.time())


def user_from_token(authorization: Optional[str]) -> sqlite3.Row:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Accedi prima.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "Accedi prima.")
    con = db()
    row = con.execute(
        """
        SELECT u.*, c.name AS company_name, c.piano
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        JOIN companies c ON c.id = u.company_id
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    con.close()
    if not row:
        raise HTTPException(401, "Sessione scaduta. Accedi di nuovo.")
    return row


init_db()
app = FastAPI(title="Demand Planning Hub", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/register")
def register(
    email: str = Form(...),
    password: str = Form(...),
    nome: str = Form(...),
    cognome: str = Form(...),
    azienda: str = Form(...),
):
    email = email.strip().lower()
    nome, cognome, azienda = nome.strip(), cognome.strip(), azienda.strip()
    if len(password) < 8:
        raise HTTPException(400, "La password deve avere almeno 8 caratteri.")
    if not email or "@" not in email or not nome or not azienda:
        raise HTTPException(400, "Compila email, nome e azienda.")
    con = db()
    if con.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        con.close()
        raise HTTPException(409, "Questa email è già registrata.")
    cur = con.execute(
        "INSERT INTO companies(name, piano, created_at) VALUES (?,?,?)",
        (azienda, "pilot", now()),
    )
    cid = cur.lastrowid
    con.execute(
        "INSERT INTO users(company_id, email, nome, cognome, password_hash, created_at) VALUES (?,?,?,?,?,?)",
        (cid, email, nome, cognome, hash_pw(password), now()),
    )
    uid = con.execute("SELECT last_insert_rowid()").fetchone()[0]
    token = secrets.token_urlsafe(32)
    con.execute("INSERT INTO sessions(token, user_id, created_at) VALUES (?,?,?)", (token, uid, now()))
    con.commit()
    con.close()
    return {
        "token": token,
        "email": email,
        "nome": nome,
        "cognome": cognome,
        "azienda": azienda,
        "piano": "pilot",
    }


@app.post("/api/login")
def login(email: str = Form(...), password: str = Form(...)):
    email = email.strip().lower()
    password = password.strip()
    con = db()
    row = con.execute(
        """
        SELECT u.*, c.name AS company_name, c.piano
        FROM users u JOIN companies c ON c.id = u.company_id
        WHERE u.email = ?
        """,
        (email,),
    ).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "Nessun account con questa email su questo PC. Se hai sostituito la cartella, il database è vuoto: registrati di nuovo.")
    if not check_pw(password, row["password_hash"]):
        con.close()
        raise HTTPException(401, "Password non corretta per questa email.")
    token = secrets.token_urlsafe(32)
    con.execute("INSERT INTO sessions(token, user_id, created_at) VALUES (?,?,?)", (token, row["id"], now()))
    con.commit()
    con.close()
    return {
        "token": token,
        "email": row["email"],
        "nome": row["nome"],
        "cognome": row["cognome"],
        "azienda": row["company_name"],
        "piano": row["piano"],
    }


@app.post("/api/reset-password")
def reset_password(email: str = Form(...), password: str = Form(...), code: str = Form(...)):
    if code.strip().upper() != "DPH-RESET-2026":
        raise HTTPException(403, "Codice reset non valido.")
    if len(password.strip()) < 8:
        raise HTTPException(400, "La nuova password deve avere almeno 8 caratteri.")
    email = email.strip().lower()
    con = db()
    row = con.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "Nessun account con questa email.")
    con.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_pw(password.strip()), row["id"]))
    con.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
    con.commit()
    con.close()
    return {"ok": True}


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        con = db()
        con.execute("DELETE FROM sessions WHERE token = ?", (token,))
        con.commit()
        con.close()
    return {"ok": True}


@app.get("/api/me")
def me(authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    return {
        "email": u["email"],
        "nome": u["nome"],
        "cognome": u["cognome"],
        "azienda": u["company_name"],
        "piano": u["piano"],
    }


@app.get("/api/files")
def list_files(authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    con = db()
    rows = con.execute(
        "SELECT id, original_name, size_bytes, created_at FROM files WHERE company_id = ? ORDER BY created_at DESC",
        (u["company_id"],),
    ).fetchall()
    con.close()
    return {
        "files": [
            {
                "id": r["id"],
                "name": r["original_name"],
                "size": r["size_bytes"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    }


@app.post("/api/files")
async def upload_file(authorization: Optional[str] = Header(None), file: UploadFile = File(...)):
    u = user_from_token(authorization)
    name = Path(file.filename or "file").name
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "Sono ammessi solo file .xlsx, .xls o .csv.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "File troppo grande (massimo 15 MB).")
    stored = secrets.token_hex(16) + ext
    folder = FILES / str(u["company_id"])
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / stored
    dest.write_bytes(data)
    con = db()
    cur = con.execute(
        "INSERT INTO files(company_id, user_id, original_name, stored_name, size_bytes, created_at) VALUES (?,?,?,?,?,?)",
        (u["company_id"], u["id"], name, stored, len(data), now()),
    )
    fid = cur.lastrowid
    con.commit()
    con.close()
    return {"id": fid, "name": name, "size": len(data)}


@app.get("/api/files/{file_id}")
def download_file(file_id: int, authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    con = db()
    row = con.execute(
        "SELECT * FROM files WHERE id = ? AND company_id = ?",
        (file_id, u["company_id"]),
    ).fetchone()
    con.close()
    if not row:
        raise HTTPException(404, "File non trovato.")
    path = FILES / str(u["company_id"]) / row["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File non trovato sul disco.")
    return FileResponse(path, filename=row["original_name"])


@app.delete("/api/files/{file_id}")
def delete_file(file_id: int, authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    con = db()
    row = con.execute(
        "SELECT * FROM files WHERE id = ? AND company_id = ?",
        (file_id, u["company_id"]),
    ).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "File non trovato.")
    path = FILES / str(u["company_id"]) / row["stored_name"]
    con.execute("DELETE FROM files WHERE id = ? AND company_id = ?", (file_id, u["company_id"]))
    con.commit()
    con.close()
    if path.exists():
        path.unlink()
    return {"ok": True}


def _mape(prev_payload: str, new_payload: str):
    try:
        old = json.loads(prev_payload)
        new = json.loads(new_payload)
    except Exception:
        return None, 0
    hist = {}
    for s in new.get("series") or []:
        for p in s.get("history") or []:
            hist[(s.get("name"), str(p.get("date")))] = float(p.get("value") or 0)
    errs, n = 0.0, 0
    for s in old.get("series") or []:
        for p in s.get("forecast") or []:
            key = (s.get("name"), str(p.get("date")))
            if key not in hist:
                continue
            a = hist[key]
            if a == 0:
                continue
            errs += abs(a - float(p.get("value") or 0)) / abs(a)
            n += 1
    if not n:
        return None, 0
    return round(100.0 * errs / n, 1), n


@app.post("/api/forecasts")
def save_forecast(authorization: Optional[str] = Header(None), title: str = Form("Previsione"), payload: str = Form(...)):
    u = user_from_token(authorization)
    try:
        json.loads(payload)
    except Exception:
        raise HTTPException(400, "Payload previsione non valido.")
    if len(payload) > 4_000_000:
        raise HTTPException(400, "Previsione troppo grande.")
    con = db()
    prev = con.execute(
        "SELECT id, payload FROM forecasts WHERE company_id = ? ORDER BY created_at DESC LIMIT 1",
        (u["company_id"],),
    ).fetchone()
    mape = mape_n = None
    if prev:
        mape, mape_n = _mape(prev["payload"], payload)
        if mape_n:
            con.execute(
                "UPDATE forecasts SET mape = ?, mape_n = ? WHERE id = ?",
                (mape, mape_n, prev["id"]),
            )
    cur = con.execute(
        "INSERT INTO forecasts(company_id, user_id, title, payload, created_at) VALUES (?,?,?,?,?)",
        (u["company_id"], u["id"], (title or "Previsione")[:120], payload, now()),
    )
    fid = cur.lastrowid
    con.commit()
    con.close()
    return {"id": fid, "mape_previous": mape, "mape_n": mape_n}


@app.get("/api/forecasts")
def list_forecasts(authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    con = db()
    rows = con.execute(
        "SELECT id, title, mape, mape_n, created_at FROM forecasts WHERE company_id = ? ORDER BY created_at DESC",
        (u["company_id"],),
    ).fetchall()
    con.close()
    return {
        "forecasts": [
            {
                "id": r["id"],
                "title": r["title"],
                "mape": r["mape"],
                "mape_n": r["mape_n"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    }


@app.get("/api/forecasts/{forecast_id}")
def get_forecast(forecast_id: int, authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    con = db()
    row = con.execute(
        "SELECT id, title, payload, mape, mape_n, created_at FROM forecasts WHERE id = ? AND company_id = ?",
        (forecast_id, u["company_id"]),
    ).fetchone()
    con.close()
    if not row:
        raise HTTPException(404, "Previsione non trovata.")
    return {
        "id": row["id"],
        "title": row["title"],
        "mape": row["mape"],
        "mape_n": row["mape_n"],
        "created_at": row["created_at"],
        "payload": json.loads(row["payload"]),
    }


@app.delete("/api/forecasts/{forecast_id}")
def delete_forecast(forecast_id: int, authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    con = db()
    cur = con.execute(
        "DELETE FROM forecasts WHERE id = ? AND company_id = ?",
        (forecast_id, u["company_id"]),
    )
    con.commit()
    n = cur.rowcount
    con.close()
    if not n:
        raise HTTPException(404, "Previsione non trovata.")
    return {"ok": True}


@app.get("/api/dashboard")
def dashboard(authorization: Optional[str] = Header(None)):
    u = user_from_token(authorization)
    con = db()
    rows = con.execute(
        "SELECT id, title, mape, mape_n, created_at, payload FROM forecasts WHERE company_id = ? ORDER BY created_at DESC",
        (u["company_id"],),
    ).fetchall()
    con.close()
    history = []
    last_compare = []
    for r in rows:
        history.append(
            {
                "id": r["id"],
                "title": r["title"],
                "mape": r["mape"],
                "mape_n": r["mape_n"],
                "created_at": r["created_at"],
            }
        )
    mapes = [r["mape"] for r in rows if r["mape"] is not None]
    if len(rows) >= 2:
        older, newer = rows[1], rows[0]
        try:
            old = json.loads(older["payload"] or "{}")
            new = json.loads(newer["payload"] or "{}")
        except Exception:
            old, new = {}, {}
        hist = {}
        for s in new.get("series") or []:
            for p in s.get("history") or []:
                hist[(s.get("name"), str(p.get("date"))[:10])] = float(p.get("value") or 0)
        by_series = {}
        for s in old.get("series") or []:
            name = s.get("name") or "Serie"
            pts = []
            for p in s.get("forecast") or []:
                d = str(p.get("date"))[:10]
                a = hist.get((name, d))
                if a is None:
                    continue
                f = float(p.get("value") or 0)
                mape_i = None if a == 0 else round(100.0 * abs(a - f) / abs(a), 1)
                pts.append({"date": d, "forecast": f, "actual": a, "mape": mape_i})
            if pts:
                by_series[name] = pts
        last_compare = [{"name": k, "points": v} for k, v in list(by_series.items())[:12]]
    return {
        "azienda": u["azienda"],
        "n_forecasts": len(rows),
        "avg_mape": round(sum(mapes) / len(mapes), 1) if mapes else None,
        "history": history,
        "last_compare": last_compare,
        "hint": "Salva una previsione, poi al ciclo dopo carica lo storico aggiornato e salva di nuovo: il MAPE si calcola da solo.",
    }


class SmartIn(BaseModel):
    values: list[float] = Field(default_factory=list)
    season: int = 12
    periods: int = 12


@app.post("/api/smart-forecast")
def smart_forecast(body: SmartIn, authorization: Optional[str] = Header(None)):
    user_from_token(authorization)
    if len(body.values) > 400:
        raise HTTPException(400, "Serie troppo lunga.")
    return auto_forecast(body.values, body.season, body.periods)


@app.get("/api/health")
def health():
    extras = {}
    try:
        from advanced_models import installed
        extras = installed()
    except Exception:
        extras = {"statsforecast": False, "prophet": False}
    return {"ok": True, "service": "dph-account", "models": extras}


if (ROOT / "style.css").exists():
    app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="site")
