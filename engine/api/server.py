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
    
    print(f"DEBUG: Login failed for {req.username}")
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/v1/data/{collection}")

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

import psutil
import shutil
import subprocess as _subprocess

# --- Initialise psutil CPU tracking (first call always returns 0) ---
psutil.cpu_percent(interval=None)

@app.get("/api/v1/system-metrics")
async def system_metrics():
    """Live host resource usage — no auth required."""
    stats = {
        "system_cpu_percent": psutil.cpu_percent(interval=None),
    }

    mem = psutil.virtual_memory()
    stats["system_ram_percent"] = mem.percent
    stats["system_ram_used_gb"] = round(mem.used / (1024**3), 2)
    stats["system_ram_total_gb"] = round(mem.total / (1024**3), 2)

    # GPU (nvidia-smi)
    if shutil.which("nvidia-smi"):
        try:
            result = _subprocess.run(
                ["nvidia-smi",
                 "--query-gpu=utilization.gpu,utilization.memory,memory.total,memory.used",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=1,
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                total_mem = used_mem = avg_util = 0
                for line in lines:
                    parts = [float(x.strip()) for x in line.split(",")]
                    avg_util += parts[0]
                    total_mem += parts[2]
                    used_mem += parts[3]
                if lines:
                    stats["system_gpu_percent"] = round(avg_util / len(lines), 1)
                    stats["system_gpu_mem_percent"] = round((used_mem / total_mem) * 100, 1) if total_mem > 0 else 0
                    stats["system_gpu_mem_used_mb"] = int(used_mem)
        except Exception:
            pass

    stats.setdefault("system_gpu_percent", 0)
    stats.setdefault("system_gpu_mem_percent", 0)

    return stats


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
