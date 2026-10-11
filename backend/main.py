import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ["SECRET_KEY"]      # crashes at startup if missing, on purpose
ALGORITHM = "HS256"
TOKEN_HOURS = 24

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------- Database ----------

DB_PATH = BASE_DIR / "todo.db"


@contextmanager
def db():
    """Open the database, commit if all went well, roll back on error, always close."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")   # SQLite ignores foreign keys unless asked
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                text         TEXT    NOT NULL,
                date         TEXT    NOT NULL,
                done         INTEGER NOT NULL DEFAULT 0,
                created_at   TEXT    NOT NULL,
                completed_at TEXT
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks (user_id, date)"
        )


init_db()


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def row_to_task(row):
    return {
        "id": row["id"],
        "text": row["text"],
        "date": row["date"],
        "done": bool(row["done"]),
    }


# ---------- Passwords and tokens ----------

hasher = PasswordHasher()


def verify_password(password_hash, password):
    try:
        return hasher.verify(password_hash, password)
    except VerificationError:
        return False


def create_token(user_id):
    payload = {
        "sub": str(user_id),                   # "subject": who the token is about
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


bearer = HTTPBearer(auto_error=False)


def current_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    """Runs before every protected route: reads the token and returns the user's id."""
    if creds is None:
        raise HTTPException(status_code=401, detail="Not logged in")

    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------- Shapes of incoming data ----------

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str
    password: str


class TaskIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    date: str                                  # like "2026-10-11"


class TaskUpdate(BaseModel):
    done: bool


# ---------- Account routes ----------

@app.post("/api/register", status_code=201)
def register(data: RegisterIn):
    email = data.email.strip().lower()

    try:
        with db() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email, hasher.hash(data.password), now_utc()),
            )
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:             # the UNIQUE rule on email was broken
        raise HTTPException(status_code=409, detail="That email is already registered")

    return {"token": create_token(user_id)}


@app.post("/api/login")
def login(data: LoginIn):
    email = data.email.strip().lower()

    with db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()

    # Same message for "no such user" and "wrong password", so attackers learn nothing
    if user is None or not verify_password(user["password_hash"], data.password):
        raise HTTPException(status_code=401, detail="Wrong email or password")

    return {"token": create_token(user["id"])}


@app.get("/api/me")
def me(user_id: int = Depends(current_user_id)):
    with db() as conn:
        user = conn.execute(
            "SELECT id, email FROM users WHERE id = ?", (user_id,)
        ).fetchone()

    if user is None:
        raise HTTPException(status_code=401, detail="Account no longer exists")

    return {"id": user["id"], "email": user["email"]}


# ---------- Task routes (all need a login) ----------

@app.get("/api/hello")
def hello():
    return {"message": "Hello from the backend!"}


@app.get("/api/tasks")
def list_tasks(date: str, user_id: int = Depends(current_user_id)):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE user_id = ? AND date = ? ORDER BY id",
            (user_id, date),
        ).fetchall()
    return [row_to_task(r) for r in rows]


@app.get("/api/pending-dates")
def pending_dates(month: str, user_id: int = Depends(current_user_id)):
    with db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT date FROM tasks "
            "WHERE user_id = ? AND done = 0 AND substr(date, 1, 7) = ? ORDER BY date",
            (user_id, month),
        ).fetchall()
    return [r["date"] for r in rows]


@app.post("/api/tasks", status_code=201)
def create_task(task: TaskIn, user_id: int = Depends(current_user_id)):
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO tasks (user_id, text, date, created_at) VALUES (?, ?, ?, ?)",
            (user_id, task.text, task.date, now_utc()),
        )
        row = conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return row_to_task(row)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate, user_id: int = Depends(current_user_id)):
    completed_at = now_utc() if update.done else None
    with db() as conn:
        cur = conn.execute(
            "UPDATE tasks SET done = ?, completed_at = ? WHERE id = ? AND user_id = ?",
            (int(update.done), completed_at, task_id, user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        row = conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
    return row_to_task(row)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, user_id: int = Depends(current_user_id)):
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")