from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3
from datetime import date as date_type, datetime

app = FastAPI(title="Calorie Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "calories.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            food_name TEXT NOT NULL,
            calories INTEGER NOT NULL,
            quantity REAL DEFAULT 1.0,
            date TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_goal', '2000')")
    conn.commit()
    conn.close()

init_db()

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

class FoodEntry(BaseModel):
    food_name: str
    calories: int
    quantity: float = 1.0
    date: Optional[str] = None

class GoalUpdate(BaseModel):
    daily_goal: int

@app.get("/api/entries")
def get_entries(date: Optional[str] = None):
    target = date or str(date_type.today())
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM entries WHERE date = ? ORDER BY created_at ASC", (target,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/entries", status_code=201)
def add_entry(entry: FoodEntry):
    target = entry.date or str(date_type.today())
    now = datetime.now().isoformat(timespec="seconds")
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO entries (food_name, calories, quantity, date, created_at) VALUES (?, ?, ?, ?, ?)",
        (entry.food_name, entry.calories, entry.quantity, target, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)

@app.delete("/api/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int):
    conn = get_conn()
    res = conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not found")

@app.get("/api/summary")
def get_summary(date: Optional[str] = None):
    target = date or str(date_type.today())
    conn = get_conn()
    row = conn.execute(
        "SELECT COALESCE(SUM(CAST(calories AS REAL) * quantity), 0) as total, COUNT(*) as count FROM entries WHERE date = ?",
        (target,),
    ).fetchone()
    goal_row = conn.execute("SELECT value FROM settings WHERE key = 'daily_goal'").fetchone()
    conn.close()
    return {
        "date": target,
        "total_calories": int(row["total"]),
        "entry_count": row["count"],
        "daily_goal": int(goal_row["value"]),
    }

@app.get("/api/history")
def get_history():
    conn = get_conn()
    rows = conn.execute(
        "SELECT date, CAST(SUM(CAST(calories AS REAL) * quantity) AS INTEGER) as total FROM entries GROUP BY date ORDER BY date DESC LIMIT 14"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.put("/api/settings/goal")
def update_goal(body: GoalUpdate):
    conn = get_conn()
    conn.execute("UPDATE settings SET value = ? WHERE key = 'daily_goal'", (str(body.daily_goal),))
    conn.commit()
    conn.close()
    return {"daily_goal": body.daily_goal}

app.mount("/", StaticFiles(directory="static", html=True), name="static")
