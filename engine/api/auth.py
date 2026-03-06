import os
import sqlite3
import secrets
import string
from jose import jwt
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from pydantic import BaseModel

# Configuration
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DB_DIR = os.path.join(BASE_DIR, "DB")
DB_PATH = os.path.join(DB_DIR, "users.db")
SECRET_PATH = os.path.join(DB_DIR, ".jwt_secret")


def _load_or_create_secret():
    env_secret = os.getenv("JWT_SECRET")
    if env_secret:
        return env_secret

    os.makedirs(DB_DIR, exist_ok=True)
    if os.path.exists(SECRET_PATH):
        with open(SECRET_PATH, "r", encoding="utf-8") as f:
            secret = f.read().strip()
            if secret:
                return secret

    secret = secrets.token_urlsafe(32)
    with open(SECRET_PATH, "w", encoding="utf-8") as f:
        f.write(secret)
    return secret


SECRET_KEY = _load_or_create_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 Hours

# Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class User(BaseModel):
    username: str
    role: str = "admin"
    disabled: Optional[bool] = None

class UserInDB(User):
    hashed_password: str

def init_auth_db():
    """Ensure User DB exists and has default admin if empty"""
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR, exist_ok=True)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            hashed_password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            disabled INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    
    # Check if empty, create default admin
    cursor.execute("SELECT count(*) FROM users")
    if cursor.fetchone()[0] == 0:
        # Generate a secure random password for the first run
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        default_pass = ''.join(secrets.choice(alphabet) for i in range(16))
        hashed = get_password_hash(default_pass)
        cursor.execute("INSERT INTO users (username, hashed_password) VALUES (?, ?)", ("admin", hashed))
        conn.commit()
        print("\n" + "="*50)
        print(f"[Auth Security] Created default user 'admin'")
        print(f"[Auth Security] GENERATED PASSWORD: {default_pass}")
        print("[Auth Security] Please save this password immediately.")
        print("="*50 + "\n")
    
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(username: str):
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if user:
        return UserInDB(**dict(user))
    return None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
