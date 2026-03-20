from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from qdrant_client import QdrantClient
from typing import List, Optional, Dict
import os
import json
import time

# Import Auth
from .auth import (
    Token, User, verify_password, create_access_token, 
    get_user, init_auth_db, ACCESS_TOKEN_EXPIRE_MINUTES
)
from datetime import timedelta

# Init User DB
init_auth_db()

START_TIME = time.time()

app = FastAPI(title="Kinetix-Zero API (V2 Skeleton)", version="2.0.0")

# CORS (Allow Vite Frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev, ideally "http://localhost:5173"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration ---
CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core/config.jsonc")

def load_config():
    try:
        with open(CONFIG_PATH, 'r') as f:
            content = f.read()
            import re
            content = re.sub(r'//.*', '', content)
            return json.loads(content)
    except:
        return {}

CONFIG = load_config()

# --- Database Connections (Read-Only Logic) ---
# MongoDB
MONGO_URI = os.getenv("MONGO_URI") or CONFIG.get("mongo_uri", "mongodb://localhost:27017/")
mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = mongo_client["kinetix_brain"]

# Qdrant
QDRANT_URL = os.getenv("QDRANT_URL") or CONFIG.get("qdrant_url")
QDRANT_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_PATH = CONFIG.get("qdrant_path", "DB/vector")

if QDRANT_URL:
    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_KEY)
else:
    qdrant = QdrantClient(path=QDRANT_PATH)

# --- Auth Dependency ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    from .auth import jwt, SECRET_KEY, ALGORITHM, TokenData
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        token_data = TokenData(username=username)
    except jwt.JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    
    user = get_user(token_data.username)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# --- Endpoints ---

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user


# TODO: New API Ideas will go here


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
