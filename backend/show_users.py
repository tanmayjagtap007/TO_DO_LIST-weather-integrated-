import sqlite3
from pathlib import Path

# Find todo.db next to this file, so it works no matter which folder you run it from
DB_PATH = Path(__file__).parent / "todo.db"

conn = sqlite3.connect(DB_PATH)

rows = conn.execute("""
    SELECT users.id,
           users.email,
           users.created_at,
           COUNT(tasks.id) AS total_tasks
    FROM users
    LEFT JOIN tasks ON tasks.user_id = users.id
    GROUP BY users.id
    ORDER BY users.created_at
""").fetchall()

print(f"{len(rows)} registered user(s)\n")
print(f"{'ID':<4} {'EMAIL':<30} {'JOINED (UTC)':<27} TASKS")
for user_id, email, created_at, total in rows:
    print(f"{user_id:<4} {email:<30} {created_at:<27} {total}")

conn.close()