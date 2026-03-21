<<<<<<< HEAD
from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from typing import List, Optional, Dict
=======
>>>>>>> 09893c936dd507ce0034cf9280bb9b52eee617ea
import os
import json
import time
import asyncio
from datetime import datetime
from typing import Optional, List, Any, Dict
from fastapi import FastAPI, HTTPException, Request, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import MongoClient, DESCENDING
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

# --- CONFIG & SECRETS ---
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-change-it")
ALGORITHM = "HS256"
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Kinetix-Zero Unified API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE CONNECTION ---
class Database:
    def __init__(self):
        self.client = MongoClient(MONGO_URI)
        self.db = self.client["kinetix_brain"]
        self.events = self.db["events"]
        self.metrics = self.db["metrics"]
        self.ddos = self.db["ddos"]
        
    def get_collection(self, name: str):
        if name not in ["events", "metrics", "ddos"]:
            raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")
        return self.db[name]

db = Database()

<<<<<<< HEAD
CONFIG = load_config()

# --- Database Connections (Read-Only Logic) ---
# MongoDB
MONGO_URI = os.getenv("MONGO_URI") or CONFIG.get("mongo_uri", "mongodb://localhost:27017/")
mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = mongo_client["kinetix_brain"]

# --- Auth Dependency ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    from .auth import jwt, SECRET_KEY, ALGORITHM, TokenData
=======
# --- AUTH UTILS ---
async def get_current_user(request: Request, token: Optional[str] = Query(None)):
    auth_header = request.headers.get("Authorization")
    
    if token:
        # Allow token in query param for SSE / standard EventSource
        pass
    elif auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
>>>>>>> 09893c936dd507ce0034cf9280bb9b52eee617ea
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

# --- MODELS ---
class LoginRequest(BaseModel):
    username: str
    password: str

class QueryRequest(BaseModel):

    filter: Dict[str, Any] = {}
    limit: int = 100
    skip: int = 0
    sort_by: str = "timestamp"
    order: int = -1 # -1 for DESC, 1 for ASC

# --- ROUTES ---

@app.get("/")
async def root():
    return {"status": "online", "engine": "Kinetix-Zero", "service": "Unified API"}

@app.post("/api/v1/auth/login")
async def login(req: LoginRequest, request: Request):
    # Minimalist auth for demo/operator access
    print(f"DEBUG: Login attempt for user: {req.username}")
    print(f"DEBUG: Headers: {request.headers}")
    
    if req.username == "admin" and req.password == "password":
        token = jwt.encode({"sub": req.username, "exp": time.time() + 86400}, SECRET_KEY, algorithm=ALGORITHM)
        print(f"DEBUG: Login successful for {req.username}")
        return {"access_token": token, "token_type": "bearer"}
    
<<<<<<< HEAD
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
                status_data["uptime"] = int(latest_metric.get("uptime", 0))
            
            # Decoupled Qdrant Check
            if "qdrant_stats" in latest_metric:
                status_data["qdrant"] = True
                status_data["vectors"] = latest_metric["qdrant_stats"].get("total", 0)
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
    current_eps = sum(p["eps_in"] for p in current_points) / max(1, len(current_points))
    
    # 2. Last Hour EPS (Avg of last 3600s)
    hour_cursor = db["metrics"].find({"timestamp": {"$gt": now - 3600}})
    hour_points = list(hour_cursor)
    if not hour_points:
        hour_avg = 0
    else:
        hour_avg = sum(p["eps_in"] for p in hour_points) / len(hour_points)
        
    # Calculate Trend
    if hour_avg == 0:
        trend = 100 if current_eps > 0 else 0
    else:
        trend = ((current_eps - hour_avg) / hour_avg) * 100
    
    # 3. Vector Breakdown (Qdrant Decoupled via Mongo)
    vec_counts = {"safe": 0, "anomaly": 0, "threat": 0}
    try:
        latest_metric = db["metrics"].find_one(sort=[("timestamp", -1)])
        if latest_metric and "qdrant_stats" in latest_metric:
            q_stats = latest_metric["qdrant_stats"]
            vec_counts["safe"] = q_stats.get("safe", 0)
            vec_counts["anomaly"] = q_stats.get("anomaly", 0)
            vec_counts["threat"] = q_stats.get("threat", 0)
    except:
        pass
        
    return {
        "current_eps": round(current_eps, 1),
        "hour_avg_eps": round(hour_avg, 1),
        "trend_percent": round(trend, 1),
        "memory": vec_counts
    }
=======
    print(f"DEBUG: Login failed for {req.username}")
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/v1/data/{collection}")
>>>>>>> 09893c936dd507ce0034cf9280bb9b52eee617ea

async def query_data(
    collection: str, 
    query: QueryRequest,
    user: dict = Depends(get_current_user)
):
    """
    Universal Query Endpoint for any collection.
    """
    coll = db.get_collection(collection)
    
    try:
        cursor = coll.find(query.filter)\
                     .sort(query.sort_by, query.order)\
                     .skip(query.skip)\
                     .limit(query.limit)
        
        results = list(cursor)
        # Convert ObjectId to string for JSON serialization
        for r in results:
            if "_id" in r: r["_id"] = str(r["_id"])
            
        return {
            "collection": collection,
            "count": len(results),
            "data": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/stream")
async def stream_data(user: dict = Depends(get_current_user)):
    """
    Real-time SSE Stream that watches for new inserts in all collections.
    """
    async def event_generator():
        # Fallback to polling if not a Replica Set (Change Streams require Replica Sets)
        last_ts = time.time()
        
        while True:
            found_new = False
            try:
                for coll_name in ["events", "metrics", "ddos"]:
                    coll = db.get_collection(coll_name)
                    # Find docs newer than last_ts, limit to 20 per cycle to avoid blocking
                    new_docs = list(coll.find({"timestamp": {"$gt": last_ts}}).sort("timestamp", 1).limit(20))
                    
                    for doc in new_docs:
                        if "_id" in doc: doc["_id"] = str(doc["_id"])
                        msg = json.dumps({"type": coll_name, "doc": doc})
                        yield f"data: {msg}\n\n"
                        last_ts = max(last_ts, doc.get("timestamp", 0))
                        found_new = True
                
                if not found_new:
                    # Heartbeat to keep connection alive
                    yield ": heartbeat\n\n"
                    await asyncio.sleep(1.0)
                else:
                    await asyncio.sleep(0.1)
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                await asyncio.sleep(5.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
