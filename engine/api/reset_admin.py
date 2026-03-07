import sqlite3
import os
import sys

# Add project root to sys.path to import auth
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from engine.api.auth import get_password_hash, DB_PATH, DB_DIR

def reset_admin(new_password):
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR, exist_ok=True)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Ensure table exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            hashed_password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            disabled INTEGER DEFAULT 0
        )
    ''')
    
    hashed = get_password_hash(new_password)
    
    # Check if admin exists
    cursor.execute("SELECT username FROM users WHERE username = 'admin'")
    if cursor.fetchone():
        cursor.execute("UPDATE users SET hashed_password = ? WHERE username = 'admin'", (hashed,))
        print(f"Updated existing 'admin' password to: {new_password}")
    else:
        cursor.execute("INSERT INTO users (username, hashed_password, role) VALUES (?, ?, ?)", ("admin", hashed, "admin"))
        print(f"Created new 'admin' user with password: {new_password}")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    pwd = "admin"
    reset_admin(pwd)
    print(f"\nSuccess! You can now login with:\nUsername: admin\nPassword: {pwd}")
