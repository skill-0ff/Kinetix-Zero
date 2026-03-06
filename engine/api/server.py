from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from qdrant_client import QdrantClient
from qdrant_client.http.models import Filter, FieldCondition, MatchValue
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
QDRANT_COLLECTION = "brain_memory"

app = FastAPI(title="Kinetix-Zero API", version="1.0.0")

# CORS (Allow Vite Frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
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

@app.get("/metrics")
async def get_metrics(limit: int = 60, current_user: User = Depends(get_current_active_user)):
    """Get recent metrics (EPS, Verdicts)"""
    cursor = db["metrics"].find().sort("timestamp", -1).limit(limit)
    data = list(cursor)
    for d in data: d["_id"] = str(d["_id"])
    return data  # Returns oldest->newest usually needs reverse for graph

@app.get("/logs")
async def get_logs(limit: int = 100, skip: int = 0, verdict: Optional[str] = None, current_user: User = Depends(get_current_active_user)):
    """Search logs with filters"""
    query = {}
    if verdict:
        query["verdict"] = verdict
        
    cursor = db["events"].find(query).sort("timestamp", -1).skip(skip).limit(limit)
    logs = list(cursor)
    for l in logs: l["_id"] = str(l["_id"])
    return logs

@app.get("/threats")
async def get_threats(limit: int = 50, current_user: User = Depends(get_current_active_user)):
    """Get active threats (MISP + AI High Confidence)"""
    query = {"verdict": {"$in": ["KNOWN THREAT", "NEW ANOMALY", "Known Threat (MISP)"]}}
    cursor = db["events"].find(query).sort("timestamp", -1).limit(limit)
    logs = list(cursor)
    for l in logs: l["_id"] = str(l["_id"])
    return logs

@app.get("/status")
async def get_status(current_user: User = Depends(get_current_active_user)):
    """System Health Check"""
    status_data = {
        "uptime": 0, # Brain Uptime
        "core_status": False,
        "mongo": False,
        "qdrant": False,
        "vectors": 0,
        "threats_active": 0
    }
    
    # Check Mongo
    try:
        mongo_client.admin.command('ping')
        status_data["mongo"] = True
        
        # Threat Counts from MongoDB
        status_data["threats_active"] = db["events"].count_documents({"verdict": {"$in": ["KNOWN THREAT", "NEW ANOMALY", "Known Threat (MISP)"]}})
        status_data["threats_new"] = db["events"].count_documents({"verdict": "NEW ANOMALY"})
        status_data["threats_known"] = db["events"].count_documents({"verdict": {"$in": ["KNOWN THREAT", "Known Threat (MISP)"]}})
        status_data["threats_fp"] = db["events"].count_documents({"verdict": "FALSE POSITIVE"})
        
        # Check Brain/AI Liveness via Metrics
        latest_metric = db["metrics"].find_one(sort=[("timestamp", -1)])
        if latest_metric:
            lag = time.time() - latest_metric.get("timestamp", 0)
            if lag < 5: # If metrics logged within last 5s, it is ALIVE
                status_data["core_status"] = True
                status_data["uptime"] = int(latest_metric.get("uptime", latest_metric.get("uptime_seconds", 0)))
    except:
        pass
        
    # Check Qdrant
    try:
        # Check collection info
        coll = qdrant.get_collection(QDRANT_COLLECTION)
        status_data["qdrant"] = True
        status_data["vectors"] = coll.points_count
    except:
        pass
        
    return status_data

@app.get("/stats")
async def get_stats(current_user: User = Depends(get_current_active_user)):
    """Get aggregated statistics (Trend)"""
    now = time.time()
    
    # 1. Current EPS (Avg of last 10s)
    current_cursor = db["metrics"].find({"timestamp": {"$gt": now - 10}})
    current_points = list(current_cursor)
    current_eps = sum(p.get("eps_in", p.get("eps", 0)) for p in current_points) / max(1, len(current_points))
    
    # 2. Last Hour EPS (Avg of last 3600s)
    hour_cursor = db["metrics"].find({"timestamp": {"$gt": now - 3600}})
    hour_points = list(hour_cursor)
    if not hour_points:
        hour_avg = 0
    else:
        hour_avg = sum(p.get("eps_in", p.get("eps", 0)) for p in hour_points) / len(hour_points)
        
    # Calculate Trend
    if hour_avg == 0:
        trend = 100 if current_eps > 0 else 0
    else:
        trend = ((current_eps - hour_avg) / hour_avg) * 100
    
    # 3. Vector Breakdown (Qdrant)
    vec_counts = {"safe": 0, "anomaly": 0, "threat": 0}
    try:
        # Check if collection exists first to avoid error
        qdrant.get_collection(QDRANT_COLLECTION)
        
        vec_counts["safe"] = qdrant.count(
            QDRANT_COLLECTION, 
            filter=Filter(must=[FieldCondition(key="type", match=MatchValue(value="ai_safe"))])
        ).count
        
        vec_counts["anomaly"] = qdrant.count(
            QDRANT_COLLECTION, 
            filter=Filter(must=[FieldCondition(key="type", match=MatchValue(value="new"))])
        ).count
        
        vec_counts["threat"] = qdrant.count(
            QDRANT_COLLECTION, 
            filter=Filter(must=[FieldCondition(key="type", match=MatchValue(value="threat"))])
        ).count
    except:
        pass
        
    return {
        "current_eps": round(current_eps, 1),
        "hour_avg_eps": round(hour_avg, 1),
        "trend_percent": round(trend, 1),
        "memory": vec_counts
    }

@app.get("/config")
async def get_config(current_user: User = Depends(get_current_active_user)):
    """Read Config (Raw JSON)"""
    return load_config()

@app.post("/config")
async def update_config(new_config: Dict = Body(...), current_user: User = Depends(get_current_active_user)):
    """Update Config (Admin Only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        with open(CONFIG_PATH, 'w') as f:
            json.dump(new_config, f, indent=4)
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
