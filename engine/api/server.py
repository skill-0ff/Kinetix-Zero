import os
import json
import time
import asyncio
from datetime import datetime
from typing import Optional, List, Any, Dict
from fastapi import FastAPI, HTTPException, Request, Depends, Query, Body
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
    if collection == "config":
        try:
            config_path = os.path.join(os.path.dirname(__file__), "..", "core", "config.jsonc")
            if not os.path.exists(config_path):
                raise HTTPException(status_code=404, detail="Config file not found")
            with open(config_path, "r") as f:
                content = f.read()
            import re
            pattern = r'(".*?"|[\'\'].*?[\'\'])|(/\*.*?\*/|//[^\r\n]*$)'
            regex = re.compile(pattern, re.MULTILINE | re.DOTALL)
            def _replacer(match): return "" if match.group(2) is not None else match.group(1)
            json_str = regex.sub(_replacer, content)
            
            cfg = json.loads(json_str)
            return {
                "collection": "config",
                "count": 1,
                "data": [cfg]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

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

@app.put("/api/v1/data/{collection}")
async def update_data(
    collection: str,
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(get_current_user)
):
    """
    Universal Update Endpoint
    """
    if collection == "config":
        try:
            print(f"DEBUG: Updating config with payload: {payload}")
            config_path = os.path.join(os.path.dirname(__file__), "..", "core", "config.jsonc")
            if not os.path.exists(config_path):
                raise HTTPException(status_code=404, detail="Config file not found")
            
            with open(config_path, "r") as f:
                content = f.read()
            
            import re
            pattern = r'(".*?"|[\'\'].*?[\'\'])|(/\*.*?\*/|//[^\r\n]*$)'
            regex = re.compile(pattern, re.MULTILINE | re.DOTALL)
            def _replacer(match): return "" if match.group(2) is not None else match.group(1)
            json_str = regex.sub(_replacer, content)
            
            current_config = json.loads(json_str)

            def deep_update(d, u):
                for k, v in u.items():
                    if isinstance(v, dict) and k in d and isinstance(d[k], dict):
                        d[k] = deep_update(d[k], v)
                    else:
                        d[k] = v
                return d
            
            updated_config = deep_update(current_config, payload)
            
            with open(config_path, "w") as f:
                json.dump(updated_config, f, indent=4)
                
            return {
                "collection": "config",
                "status": "success",
                "data": updated_config
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    # Generic DB update logic can be implemented here later
    raise HTTPException(status_code=501, detail="Update not implemented for DB collections yet")

@app.get("/api/v1/system/db-stats")
async def get_db_stats(user: dict = Depends(get_current_user)):
    """
    Returns the real-time size and object count of the kinetix_brain database
    and the Qdrant local vector database.
    """
    try:
        stats = db.db.command("dbstats")
        data_size = stats.get("dataSize", 0)
        index_size = stats.get("indexSize", 0)
        total_size = stats.get("totalSize", data_size + index_size)
        
        # Calculate Qdrant Local Size
        qdrant_size_bytes = 0
        try:
            config_path = os.path.join(os.path.dirname(__file__), "..", "core", "config.jsonc")
            q_path = "DB/vector"
            if os.path.exists(config_path):
                with open(config_path, "r") as f:
                    lines = [l for l in f.readlines() if not l.strip().startswith("//")]
                    cfg = json.loads("".join(lines))
                    q_path = cfg.get("qdrant_path", "DB/vector")
            
            # Resolve relative to project root
            full_q_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", q_path))
            if os.path.exists(full_q_path):
                for dirpath, _, filenames in os.walk(full_q_path):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        if not os.path.islink(fp):
                            qdrant_size_bytes += os.path.getsize(fp)
        except Exception as q_err:
            print(f"DEBUG: Qdrant stats error: {q_err}")

        return {
            "status": "online",
            "db_name": stats.get("db"),
            "collections": stats.get("collections", 0),
            "objects": stats.get("objects", 0),
            "data_size_bytes": data_size,
            "index_size_bytes": index_size,
            "total_size_bytes": total_size,
            "qdrant_size_bytes": qdrant_size_bytes
        }
    except Exception as e:
        print(f"DEBUG: DB connection error: {str(e)}")
        return {"status": "offline", "error": str(e)}

@app.get("/api/v1/stream")
async def stream_data(user: dict = Depends(get_current_user)):
    """
    Real-time SSE Stream that watches for new inserts in all collections.
    """
    async def event_generator():
        # Fallback to polling if not a Replica Set (Change Streams require Replica Sets)
        last_ts = time.time()
        last_metric_ts = 0
        
        while True:
            found_new = False
            try:
                for coll_name in ["events", "ddos"]:
                    coll = db.get_collection(coll_name)
                    # Find docs newer than last_ts, limit to 20 per cycle to avoid blocking
                    new_docs = list(coll.find({"timestamp": {"$gt": last_ts}}).sort("timestamp", 1).limit(20))
                    
                    for doc in new_docs:
                        if "_id" in doc: doc["_id"] = str(doc["_id"])
                        msg = json.dumps({"type": coll_name, "doc": doc})
                        yield f"data: {msg}\n\n"
                        last_ts = max(last_ts, doc.get("timestamp", 0))
                        found_new = True
                        
                # Read metrics from local JSON file to bypass MongoDB
                metrics_path = os.path.join(os.path.dirname(__file__), "..", "core", "system_metrics.json")
                if os.path.exists(metrics_path):
                    try:
                        with open(metrics_path, "r") as f:
                            metrics_data = json.load(f)
                        if metrics_data and metrics_data.get("timestamp", 0) > last_metric_ts:
                            yield f"data: {json.dumps({'type': 'metrics', 'doc': metrics_data})}\n\n"
                            last_metric_ts = metrics_data.get("timestamp", 0)
                            found_new = True
                    except: pass
                
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
