import torch
import torch.optim as optim
import numpy as np
import os
import sys
import json
import threading
import queue
import time
import signal
import glob
import re
import torch.nn as nn
import uuid
import psutil
import shutil
import subprocess
from torch.cuda.amp import GradScaler
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, SearchRequest
import pymongo
from pymongo import MongoClient, ASCENDING, DESCENDING
from dotenv import load_dotenv

# Load Environment Variables from .env (if present)
load_dotenv()

# Relative import fix for direct usage vs module usage
try:
    from .model import VAETransformer, VAELoss
except ImportError:
    from model import VAETransformer, VAELoss

class UnsupervisedAI(threading.Thread):
    def __init__(self, config_path="../core/config.jsonc"):
        super().__init__()
        self.config_path = config_path
        self.config = {}
        self.load_config()
        
        # Async IO
        self.input_queue = queue.Queue() # Receives List[Vectors]
        self.running = True
        self.daemon = True
        
        # Persistence Settings
        # Persistence Settings
        self.checkpoint_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "checkpoints")
        if not os.path.exists(self.checkpoint_dir):
            os.makedirs(self.checkpoint_dir)
            
        self.last_save_time = time.time()
        self.last_config_check = time.time()
        
        # Uptime Tracking
        self.start_time = time.time()

        self.config_mtime = 0
        try:
            self.config_mtime = os.path.getmtime(self.config_path)
        except: pass
        
        # Model Parameters
        # Fixed at 34 (32 Original + 2 Server Time) to match Vectorizer
        self.input_dim = 34
        self.d_model = 64
        self.latent_dim = 64
        self.beta = 0.1
        
        # Context Management
        self.context_epochs = self.config.get("ai_context_epochs", 5)
        self.context_epochs = self.config.get("ai_context_epochs", 5)
        self.window_queue = [] # List of Tensors
        self.log_queue = [] # List of Raw Log Dicts (Parallel to window_queue)
        
        # AI Components
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = VAETransformer(
            input_dim=self.input_dim,
            d_model=self.d_model,
            latent_dim=self.latent_dim
        ).to(self.device)
        
        # Optimization: PyTorch 2.0 Compilation (Graph Optimization)
        # "reduce-overhead" mode is best for small batches/sequences like ours
        if hasattr(torch, "compile"):
            try:
                print("[AI] Compiling model... (This may take a minute on first run)")
                self.model = torch.compile(self.model, mode="reduce-overhead")
            except Exception as e:
                print(f"[AI] Compile failed (safe fallback): {e}")

        self.loss_fn = VAELoss(beta=self.beta)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        
        # Optimization: Mixed Precision
        self.scaler = torch.cuda.amp.GradScaler()
        
        # Optimization: Batch Buffer
        self.batch_buffer = []
        self.log_buffer = []
        self.batch_size = 64
        self.last_batch_time = time.time()

        # Log Store & Memory (Init)
        self._init_databases()
        self._init_metrics()

        print(f"[AI] Async Worker Initialized on {self.device} (AMP Enabled). Context={self.context_epochs}")
        
        # Initial Load
        self._load_initial_checkpoint()
        
        # Signal Handlers for "Airbag" Safety
        signal.signal(signal.SIGINT, self.handle_exit)
        signal.signal(signal.SIGTERM, self.handle_exit)
        
        # Start Self
        self.start()

    def handle_exit(self, signum, frame):
        print(f"[AI] Caught Signal {signum}. Saving Emergency Checkpoint...")
        self.save_checkpoint(name="model_crash_backup.pth", is_emergency=True)
        self.running = False
        sys.exit(0)

    def load_config(self):
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    lines = [l for l in f.readlines() if not l.strip().startswith("//")]
                    new_config = json.loads("".join(lines))
                    
                    old_config = self.config
                    self.config = new_config
                    
                    # Runtime FIFO update
                    new_ctx = self.config.get("ai_context_epochs", 5)
                    if hasattr(self, 'context_epochs') and new_ctx != self.context_epochs:
                        print(f"[AI] Resizing FIFO: {self.context_epochs} -> {new_ctx}")
                        self.context_epochs = new_ctx
                        
                    # Runtime DB Hot-Swap Check
                    if hasattr(self, 'memory'):
                        db_keys = ["qdrant_path", "qdrant_url", "mongo_uri"]
                        changed = any(old_config.get(k) != new_config.get(k) for k in db_keys)
                        if changed:
                            print("[AI] Database Config Changed. Reconnecting...")
                            self._init_databases()
                        else:
                            # Refresh Thresholds only (if DB didn't change)
                            self.dedup_dist = self.config.get("memory_dedup_dist", 0.05)
                            self.query_dist = self.config.get("memory_query_dist", 0.10)
                            
        except Exception as e:
             if not self.config: self.config = {}
             # print(f"[AI] Config Load Error: {e}")

    def _init_databases(self):
        """Initializes or Re-initializes Memory and Log Stores"""
        
        # 1. Qdrant (Memory)
        try:
            # Check Priority: Env Var > Config
            q_url = os.getenv("QDRANT_URL") or self.config.get("qdrant_url")
            q_key = os.getenv("QDRANT_API_KEY") 
            q_path = self.config.get("qdrant_path", "DB/vector")
            
            if q_url:
                print(f"[AI] Connecting to Remote Qdrant: {q_url}")
                # Security Check
                if not q_url.startswith("https://") and "localhost" not in q_url and "127.0.0.1" not in q_url:
                    print(f"  [WARNING] Remote Qdrant using insecure HTTP. Recommend HTTPS for sensitive data.")
                
                self.memory = QdrantClient(url=q_url, api_key=q_key)
            else:
                print(f"[AI] Connecting to Local Qdrant: {q_path}")
                self.memory = QdrantClient(path=q_path)

            self.mem_collection = "brain_memory"
            
            # Ensure Collection Exists (Idempotent usually, but recreate wipes data!)
            # FIX: Don't recreate if exists, unless forced. QdrantClient.recreate_collection DELETES existing.
            # We should probably check first or use Create if not exists.
            # Local Qdrant (path) is persistent on disk. Recreate wipes it?
            # client.recreate_collection() -> "Operations on collections: create, delete, ... This method DELETES collection if exists."
            # WAIT. We have been wiping memory on every restart?!
            # FIX: Use `collection_exists` check.
            
            collections = self.memory.get_collections()
            exists = any(c.name == self.mem_collection for c in collections.collections)
            
            if not exists:
                self.memory.create_collection(
                    collection_name=self.mem_collection,
                    vectors_config=VectorParams(size=34, distance=Distance.COSINE)
                )
                print(f"[AI] Created New Memory Collection: {self.mem_collection}")
            else:
                print(f"[AI] Attached to Existing Memory Collection: {self.mem_collection}")

        except Exception as e:
            print(f"[AI] Memory Init Failed: {e}")
            self.memory = None

        # 2. Thresholds (Reload from config)
        self.dedup_dist = self.config.get("memory_dedup_dist", 0.05)
        self.query_dist = self.config.get("memory_query_dist", 0.10)

        # 3. MongoDB (Log Store)
        try:
            # Close old if exists
            if hasattr(self, 'mongo_client') and self.mongo_client:
                self.mongo_client.close()
                
            self.mongo_uri = os.getenv("MONGO_URI") or self.config.get("mongo_uri", "mongodb://localhost:27017/")
            
            # Security: Auto-Enforce TLS for Remote (non-local) if not in URI
            is_remote = "localhost" not in self.mongo_uri and "127.0.0.1" not in self.mongo_uri
            mongo_kwargs = {"serverSelectionTimeoutMS": 2000}
            
            if is_remote and "ssl=true" not in self.mongo_uri and "tls=true" not in self.mongo_uri:
                 # Implicitly enable TLS for remote unless explicitly disabled (not supported here to force safety)
                 # But standard pymongo[srv] does this for +srv URIs.
                 # If plain mongodb://remote, we force it.
                 print("[AI] Enforcing TLS for Remote Mongo Connection")
                 mongo_kwargs["tls"] = True
                 mongo_kwargs["tlsAllowInvalidCertificates"] = False # Strict
            
            self.mongo_client = MongoClient(self.mongo_uri, **mongo_kwargs)
            self.mongo_db = self.mongo_client["kinetix_brain"]
            self.mongo_events = self.mongo_db["events"]
            self.mongo_metrics = self.mongo_db["metrics"]
            self.mongo_ddos = self.mongo_db["ddos"]
            
            # Check Connection
            self.mongo_client.server_info()
            print(f"[AI] MongoDB Connected: {self.mongo_uri}")
            
            # Ensure Indexes (Background)
            self.mongo_events.create_index([("verdict", ASCENDING)], background=True)
            self.mongo_events.create_index([("host_id", ASCENDING)], background=True)
            self.mongo_events.create_index([("event_type", ASCENDING)], background=True)
            self.mongo_events.create_index([("timestamp", DESCENDING)], background=True)
            self.mongo_events.create_index([("uuid", ASCENDING)], unique=True, background=True) 
            
            # Metrics Index (auto-expire not implemented yet per user req, but helpful)
            self.mongo_metrics.create_index([("timestamp", DESCENDING)], background=True) 
            
            # DDoS Index (TTL?)
            self.mongo_ddos.create_index([("timestamp", DESCENDING)], background=True)
            
        except Exception as e:
            print(f"[AI] MongoDB Init Failed: {e}")
            self.mongo_client = None
            self.mongo_events = None
            self.mongo_metrics = None
            self.mongo_ddos = None

    def _init_metrics(self):
        """Reset the per-second accumulator"""
        self.metrics_accum = {
            "processed_count": 0,
            "processed_bytes": 0,
            "verdict_safe": 0,
            "verdict_threat": 0, 
            "verdict_new": 0,
            "verdict_fp": 0,
            "mem_saved": 0,
            "mem_dropped": 0,
        }
        self.last_metric_time = time.time()

    def _load_initial_checkpoint(self):
        target = self.config.get("ai_checkpoint_file", "auto")
        
        if target == "auto":
            # Find latest model_*.pth
            files = glob.glob(os.path.join(self.checkpoint_dir, "model_*.pth"))
            if not files:
                print("[AI] No checkpoints found. Starting fresh.")
                return
            
            # Sort by modification time
            latest_file = max(files, key=os.path.getmtime)
            self._load_file(latest_file)
        elif target and os.path.exists(target):
             self._load_file(target)
        else:
            print(f"[AI] Configured checkpoint '{target}' not found. Starting fresh.")

    def _load_file(self, path):
        try:
            print(f"[AI] Loading Checkpoint: {path}")
            checkpoint = torch.load(path, map_location=self.device)
            
            # Load Model Weights
            # Handle compiled model prefix if needed (though state_dict usually handles it)
            self.model.load_state_dict(checkpoint['model_state_dict'])
            self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
            
            # Load Context
            if 'window_queue' in checkpoint:
                self.window_queue = [t.to(self.device) for t in checkpoint['window_queue']]
                
            print("[AI] Load Complete.")
        except Exception as e:
            print(f"[AI] Load Failed: {e}")

    def save_checkpoint(self, name=None, is_emergency=False):
        try:
            if not name:
                timestamp = time.strftime("%Y%m%d_%H%M%S")
                name = f"model_{timestamp}.pth"
            
            path = os.path.join(self.checkpoint_dir, name)
            
            # Normalize queue for saving (list of lists or tensors)
            # We save them as tensors
            save_queue = [t.cpu() for t in self.window_queue]
            
            torch.save({
                'model_state_dict': self.model.state_dict(),
                'optimizer_state_dict': self.optimizer.state_dict(),
                'window_queue': save_queue,
                'config': self.config
            }, path)
            
            print(f"[AI] Saved Checkpoint: {path}")
            
            if not is_emergency:
                self._rotate_checkpoints()
                
        except Exception as e:
            print(f"[AI] Save Failed: {e}")

    def _rotate_checkpoints(self):
        # Keep only N files
        limit = self.config.get("max_checkpoints_history", 10)
        files = glob.glob(os.path.join(self.checkpoint_dir, "model_*.pth"))
        
        # Exclude crash backup from rotation logic? Maybe keep it safe.
        files = [f for f in files if "crash_backup" not in f]
        
        if len(files) > limit:
            # Sort old -> new
            files.sort(key=os.path.getmtime)
            to_delete = files[:len(files)-limit]
            
            for f in to_delete:
                try:
                    os.remove(f)
                    print(f"[AI] Rotated (Deleted): {f}")
                except:
                    pass

    def push_batch(self, vectors, logs=None):
        """Non-blocking push from Brain"""
        self.input_queue.put((vectors, logs))

    def push_evidence(self, evidence_logs):
        """Store DDoS/drop evidence directly in MongoDB."""
        if not evidence_logs or not self.mongo_ddos:
            return

        docs = []
        now = time.time()
        for log in evidence_logs:
            docs.append({
                "uuid": log.get("uuid", uuid.uuid4().hex),
                "timestamp": log.get("timestamp", now),
                "verdict": log.get("verdict", "DDoS"),
                "type": log.get("_evidence_type", "drop_evidence"),
                "full_log": log
            })

        try:
            self.mongo_ddos.insert_many(docs, ordered=False)
        except Exception as e:
            print(f"[AI] Evidence Save Failed: {e}")

    def run(self):
        print("[AI] Worker Loop Started.")
        while self.running:
            try:
                # Poll frequently to check buffer timeout even if empty
                try:
                    vectors, logs = self.input_queue.get(timeout=0.1) 
                    self.batch_buffer.extend(vectors)
                    if logs:
                        self.log_buffer.extend(logs)
                except queue.Empty:
                    pass
                
                # Check Batch Conditions
                now = time.time()
                is_full = len(self.batch_buffer) >= self.batch_size
                is_timeout = (len(self.batch_buffer) > 0) and (now - self.last_batch_time > 1.0)
                
                if is_full or is_timeout:
                    # Process Accumulated Batch
                    to_process = self.batch_buffer[:self.batch_size]
                    to_process_logs = self.log_buffer[:self.batch_size]
                    
                    self.batch_buffer = self.batch_buffer[self.batch_size:] # Keep remainder
                    self.log_buffer = self.log_buffer[self.batch_size:]
                    
                    self.last_batch_time = now
                    
                    self.process_batch(to_process, to_process_logs)
                
                # Check Persistence Schedule
                interval = self.config.get("checkpoint_interval_seconds", 3600)
                if now - self.last_save_time > interval:
                    self.save_checkpoint()
                    self.last_save_time = now
                    
                # Runtime Hot-Reload
                # Check every 1.0 seconds if config changed (for anomaly_threshold)
                # Runtime Hot-Reload
                # Check every 1.0 seconds if config changed
                if now - self.last_config_check > 1.0:
                    self.last_config_check = now
                    self._check_config_reload()
                    
                # Metrics Flush (Every 1s)
                if now - self.last_metric_time >= 1.0:
                    self._flush_metrics(now)


            except Exception as e:
                print(f"[AI Worker Error] {e}")
    
    def _check_config_reload(self):
        try:
            mtime = os.path.getmtime(self.config_path)
            if mtime > self.config_mtime:
                self.config_mtime = mtime
                print("[AI] Config Change Detected. Reloading...")
                self.load_config()
        except:
            pass
            
    def _flush_metrics(self, timestamp):
        """Flushes 1s of accumulated stats to MongoDB"""
        if not hasattr(self, "metrics_accum"):
            return
        
        # Calculate rates
        # If interval > 1.0s, counts are total over interval.
        # eps = processed_count / interval
        
        # Snapshot
        data = self.metrics_accum.copy()
        
        # Build Document
        doc = {
            "timestamp": timestamp,
            "datetime": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp)),
            "uptime_seconds": int(timestamp - self.start_time),
            
            # Traffic
            "eps": data["processed_count"], # Assuming ~1s flush
            "throughput_bytes": data["processed_bytes"],
            "queue_size": self.input_queue.qsize(),
            "batch_queue": len(self.batch_buffer),
            
            # Decisions
            "verdict_safe": data["verdict_safe"],
            "verdict_threat": data["verdict_threat"],
            "verdict_new": data["verdict_new"],
            "verdict_fp": data["verdict_fp"],
            
            # Memory Details
            "memory_saved": data["mem_saved"],
            "memory_dropped": data["mem_dropped"],
            
            # Config Snapshot
            "config": {
                "threshold": self.config.get("ai_anomaly_threshold", 0.5),
                "dedup": self.dedup_dist,
                "query": self.query_dist,
            }
        }
        
        # System Stats (psutil removed, so only AI internal)
        # However, we can track GPU utilization if available
        if torch.cuda.is_available():
            try:
               doc["gpu_mem_reserved"] = torch.cuda.memory_reserved(self.device)
               doc["gpu_mem_allocated"] = torch.cuda.memory_allocated(self.device)
            except: pass

        # --- NEW SYSTEM METRICS ---
        try:
            sys_metrics = self._get_system_metrics()
            doc.update(sys_metrics)
        except Exception as e:
            print(f"[AI] Metrics Error: {e}")
            
        # Write to Mongo
        if self.mongo_metrics:
            try:
                self.mongo_metrics.insert_one(doc)
            except Exception as e:
                print(f"Error saving to db {e}")

        # Reset accumulator after each flush cycle
        for k in self.metrics_accum:
            self.metrics_accum[k] = 0
        self.last_metric_time = timestamp

    def _get_system_metrics(self):
        """Captures System and Process Resource Usage"""
        stats = {}
        
        # 1. System Level (Host)
        stats["system_cpu_percent"] = psutil.cpu_percent(interval=None) # Non-blocking
        
        mem = psutil.virtual_memory()
        stats["system_ram_percent"] = mem.percent
        stats["system_ram_used_gb"] = round(mem.used / (1024**3), 2)
        stats["system_ram_total_gb"] = round(mem.total / (1024**3), 2)
        
        # 2. Process Level (AI Worker)
        proc = psutil.Process(os.getpid())
        with proc.oneshot():
            stats["process_cpu_percent"] = proc.cpu_percent(interval=None)
            stats["process_ram_rss_mb"] = round(proc.memory_info().rss / (1024**2), 2)
            stats["process_ram_percent"] = round(proc.memory_percent(), 2)

        # 3. GPU Stats (Nvidia/AMD)
        # We try to use simple command-line tools to avoid heavy python bindings
        gpu_stats = self._get_gpu_stats()
        if gpu_stats:
            stats.update(gpu_stats)
            
        return stats

    def _get_gpu_stats(self):
        """Heuristic GPU Stats fetching without heavy libraries"""
        gpus = {}
        
        # Check NVIDIA
        if shutil.which("nvidia-smi"):
            try:
                # Get Utilization and Memory in CSV format: utilization.gpu, utilization.memory, memory.total, memory.used
                result = subprocess.run(
                    ['nvidia-smi', '--query-gpu=utilization.gpu,utilization.memory,memory.total,memory.used', '--format=csv,noheader,nounits'], 
                    capture_output=True, text=True, timeout=0.5
                )
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')
                    # We only take the first GPU for "System Summary" or average them?
                    # Let's take the first one or max.
                    # User asked for "Total Used".
                    
                    # If multiple GPUs, we can average util, sum memory.
                    total_mem = 0
                    used_mem = 0
                    avg_util = 0
                    
                    for line in lines:
                        parts = [float(x.strip()) for x in line.split(',')]
                        # parts: [gpu_util, mem_util_percent, mem_total_mb, mem_used_mb]
                        avg_util += parts[0]
                        total_mem += parts[2]
                        used_mem += parts[3]
                        
                    if len(lines) > 0:
                        gpus["system_gpu_percent"] = round(avg_util / len(lines), 1)
                        gpus["system_gpu_mem_percent"] = round((used_mem / total_mem) * 100, 1) if total_mem > 0 else 0
                        gpus["system_gpu_mem_used_mb"] = int(used_mem)
                        gpus["gpu_vendor"] = "nvidia"
                        
            except Exception as e:
                # print(f"Nvidia stats failed: {e}")
                pass

        # Check AMD (ROCm)
        elif shutil.which("rocm-smi"):
            try:
                # rocm-smi --showuse --json
                # This might be complex to parse if JSON not available or format changes.
                # Simple CSV approach: rocm-smi --showuse --csv
                # Output: device, GPU use (%), GFX Clock, ...
                # Let's try JSON if supported, else skipped for stability unless user has it.
                # Fallback to simple check?
                pass
            except:
                pass
                
        # Fallback: PyTorch (Process specific, but accurate for this worker)
        if torch.cuda.is_available() and "system_gpu_percent" not in gpus:
             # We can't get SYSTEM wide load from Torch easily. 
             # But we can report Allocated as before.
             pass
             
        return gpus

    def process_batch(self, new_window, new_logs=None):
        # Optimization: Convert to tensor ONCE here
        tensor_win = torch.tensor(new_window, dtype=torch.float32)
        self.window_queue.append(tensor_win)
        
        # Maintain Log FIFO
        # new_logs matches new_window length
        if new_logs:
            self.log_queue.extend(new_logs) # Note: List of dicts, unlike tensor_win which is batched
            # But wait, self.window_queue is a list of Tensors (Batches)
            # self.log_queue should probably be a flat list of logs matching the flattened tensor sequence?
            # Actually, `full_seq` (Line 266) concatenates the window_queue.
            # So `full_seq` is [Total_Len, 34].
            # So `self.log_queue` should just be [Total_Len] list of dicts.
            # But `tensor_win` is [Batch, 34].
            # So `self.window_queue` is List[Tensor[Batch, 34]].
            # So we should store `self.log_queue` as List[List[Dict]] (Batches of logs) to mirror structure?
            # No, easier to just utilize flattened view when alerting.
            pass

        # We need to maintain parallel structures.
        # self.window_queue = [T1(64), T2(64)...]
        # self.log_batch_queue = [L1(64), L2(64)...]
        if not hasattr(self, "log_batch_queue"): self.log_batch_queue = []
        if new_logs:
            self.log_batch_queue.append(new_logs)

        # Maintain FIFO
        while len(self.window_queue) > self.context_epochs:
            self.window_queue.pop(0)
            if self.log_batch_queue: self.log_batch_queue.pop(0)

        # Optimization: Don't infer until we have at least 1 context
        if not self.window_queue: return
        
        # Stack Queue -> Input Tensor
        full_seq = torch.cat(self.window_queue, dim=0).unsqueeze(0).to(self.device)
        
        # Extract Maturity & Masks
        maturity_scores = full_seq[:, :, 5] 
        train_mask = (maturity_scores < 1.0)
        enforce_mask = (maturity_scores >= 1.0)
        
        # Hybrid Loop
        self.model.train()
        self.optimizer.zero_grad()
        
        # Optimization: AMP Autocast
        with torch.cuda.amp.autocast():
            recon_x, mu, logvar = self.model(full_seq)
            train_loss, raw_loss_map = self.loss_fn(recon_x, full_seq, mu, logvar, mask=train_mask)
        
        if train_mask.any():
            # Optimization: Scaled Backward
            self.scaler.scale(train_loss).backward()
            self.scaler.step(self.optimizer)
            self.scaler.update()
            
        # Alerting Check
        if enforce_mask.any():
            # Logic: We invert it to get the Loss Threshold
            # Config 0.9 (Sensitive) -> Threshold 0.1 (Low Bar)
            sensitivity = self.config.get("ai_anomaly_threshold", 0.5)
            # Clamp to 0.01-0.99 to avoid div by zero or infinite alerts
            sensitivity = max(0.01, min(0.99, sensitivity))
            
            # Formula: Higher Sensitivity = Lower Threshold
            threshold = 1.0 - sensitivity
            
            enforced_losses = raw_loss_map * enforce_mask.float()
        
        # --- MEMORY LOGIC START ---
        
        # Helper for Qdrant Operations
        def _check_memory(vector, check_type, max_dist):
            if not self.memory: return False, 1.0
            hits = self.memory.search(
                collection_name=self.mem_collection,
                query_vector=vector,
                query_filter=None, # In future, could filter by type
                limit=1
            )
            if not hits: return False, 1.0
            
            top = hits[0]
            # Verify Type match
            # Note: We need to filter by 'type' in payload if we want strict type checking
            # But the plan says: Search nearest, THEN differentiate action based on Type.
            # So let's return the HIT details.
            return top.payload.get("type") == check_type, top.score  # score for cosine is usually similarity (1.0=same), but distance logic varies.
            # Qdrant with Distance.COSINE: Score is Cosine Similarity (1.0 = identical, 0.0 = orthogonal, -1.0 = opposite)
            # Distance = 1.0 - Similarity.
            
            # Wait, user specified "distance".
            # Qdrant Default Cosine Search returns "Score" (Similarity).
            # To get Distance, we do 1 - score.
        
        def _search_nearest(vector):
            if not self.memory: return None, 1.0
            hits = self.memory.search(
                collection_name=self.mem_collection,
                query_vector=vector,
                limit=1
            )
            if not hits: return None, 1.0
            sim = hits[0].score # Cosine Similarity
            dist = 1.0 - sim
            return hits[0].payload.get("type"), dist

        # Path A: Peace Time (Non-Anomalous)
        # Iterate over Valid items (Masked IN, but Loss BELOW Threshold)
        # Actually, simpler: Iterate ALL enforceable items.
        # If Loss < Threshold -> Path A
        # If Loss > Threshold -> Path B
        
        # Access log batch flat
        full_logs = []
        if hasattr(self, "log_batch_queue"):
            full_logs = [item for sublist in self.log_batch_queue for item in sublist]

        # Optimization: We only check Memory for "Notable" events or Random sampling to build "Normalcy"?
        # User said "path A: Auto-Learn". This implies learning EVERYTHING that is "Safe".
        # This loop could be heavy. Limiting to Enforce Mask.
        
        # It is faster to process indices on CPU
        cpu_losses = enforced_losses.detach().cpu().numpy()
        cpu_threshold = threshold
        
        BATCH_SIZE = len(new_window) # Not strictly batch_size buffer, but the window size (accumulated)
        # Wait, process_batch receives `new_window`.
        # `full_seq` is the Context + New Window.
        # We only want to alert/learn on the NEWEST window (the one just added).
        # We shouldn't re-alert on old context.
        # `process_batch` calculates loss for `full_seq`?
        
        # Looking at Line 280: `recon_x, mu, logvar = self.model(full_seq)`
        # `train_loss` is scalar. `raw_loss_map` is [Batch, Seq].
        # We only care about the last elements?
        # Actually `inference.py` logic so far seemed to check EVERYTHING in the window_queue.
        # This might be redundant (checking same packet 5 times).
        # FIX: Only check the LAST slice of the sequence (Size of new_window).
        
        # But `enforce_mask` handles "Maturity".
        # If we stick to existing logic for now, we iterate all `enforced_losses`.
        
        # To make this right for Memory:
        # We should iterate through the indices of `enforced_losses`.
        
        # --- MEMORY LOGIC START (BATCH OPTIMIZED) ---
        
        # 1. Identify Valid Indices (Those with Maturity >= 1.0)
        valid_indices = torch.nonzero(enforce_mask).cpu().numpy().flatten()
        # Note: nonzero returns [N, 2] (Batch, Seq) or [N] if 1D. 
        # But enforce_mask is [1, Seq]. So indices are [[0, 0], [0, 1]...].
        # We need the 2nd dim.
        if len(valid_indices) == 0: return

        # Access log batch flat
        full_logs = []
        if hasattr(self, "log_batch_queue"):
             full_logs = [item for sublist in self.log_batch_queue for item in sublist]
             
        # 2. Extract Data for Valid Items
        batch_eval = [] # List of (index, vector, log, score, is_anomaly)
        
        # Pre-calculation
        cpu_losses = enforced_losses[0].detach().cpu().numpy()
        cpu_threshold = threshold
        
        # Metrics: Count Batch
        if hasattr(self, "metrics_accum"):
            self.metrics_accum["processed_count"] += len(full_logs) # Roughly
            # Actually we only process 'new_window' items effectively? 
            # No, 'valid_indices' are the enforceable ones.
            # Let's count 'processed' as Input EPS.
            # self.metrics_accum["processed_count"] += len(new_window) # Passed in arg
            pass

        # Lists for Batch Query
        query_vectors = []
        query_indices = [] # Map query_idx -> batch_eval_idx
        
        for idx in valid_indices:
             # Depending on shape of nonzero:
             # If enforce_mask is [1, Seq], valid_indices is [0, 1, 0, 5...] 
             # Actually nonzero returns [ [0,1], [0,5] ].
             pass
             
        # Let's do it safely:
        valid_coords = torch.nonzero(enforce_mask).cpu().numpy() # [[0, 1], [0, 5]]
        
        for coord in valid_coords:
            idx = coord[1] # Seq index
            if idx >= len(full_logs): continue
            
            loss_val = cpu_losses[idx]
            vec = full_seq[0, idx, :].detach().cpu().tolist()
            log = full_logs[idx]
            is_anom = (loss_val > cpu_threshold)
            
            # Store context
            batch_eval.append({
                "vector": vec,
                "log": log,
                "score": loss_val,
                "is_anomaly": is_anom,
                "id": idx
            })
            
            # Prepare Query
            query_vectors.append(vec)

        # 3. Batch Query (One Network Call)
        if not self.memory or not query_vectors:
            return # Cannot process without memory
            
        try:
            # Send all (Safe + Anomalies) in one batch
            # We filter/decide later based on is_anomaly
            search_results = self.memory.search_batch(
                collection_name=self.mem_collection,
                requests=[SearchRequest(vector=v, limit=1) for v in query_vectors]
            )
        except Exception as e:
            print(f"[AI] Memory Batch Error: {e}")
            return

        # 4. Process Results
        points_to_upsert = []
        mongo_docs = []
        
        for i, result in enumerate(search_results):
            ctx = batch_eval[i]
            top_match = result[0] if result else None
            
            mem_type = top_match.payload.get("type") if top_match else None
            mem_type_norm = (mem_type or "").strip().lower()
            mem_dist = (1.0 - top_match.score) if top_match else 1.0
            
            # Shared ID for Mongo + Qdrant
            event_uuid = uuid.uuid4().hex
            storage_cfg = self.config.get("storage_policy", {})
            verdict = "SAFE"
            should_persist_log = False
            
            if not ctx["is_anomaly"]:
                # If it's safe but "New" (Far from existing memory), learn it!
                if mem_dist > self.dedup_dist:
                    verdict = "NEW SAFE PATTERN"
                    should_persist_log = storage_cfg.get("save_logs", {}).get("ai_safe", True)
                    
                    # 1. Qdrant: Vector + Metadata (NO LOG)
                    if storage_cfg.get("save_vectors", {}).get("ai_safe", True):
                        points_to_upsert.append(PointStruct(
                            id=event_uuid,
                            vector=ctx["vector"],
                            payload={"type": "ai_safe", "timestamp": time.time(), "score": ctx["score"]} 
                        ))
                # Else: It's just normal safe traffic (matches existing). Ignore.
            
            # PATH B: ANOMALY (Low Flow)
            else:
                verdict = "NEW ANOMALY"
                should_persist_log = storage_cfg.get("save_logs", {}).get("anomaly", True)
                
                # Scenario 1: False Positive
                if mem_type_norm == "ai_safe" and mem_dist < self.query_dist:
                    verdict = "FALSE POSITIVE"
                    # Optimization: Maybe log FP occurrence in metrics?
                    
                # Scenario 2: Known Threat
                elif mem_type_norm == "threat" and mem_dist < self.query_dist:
                    verdict = "KNOWN THREAT"
                    
                # Scenario 3: New Threat/Anomaly
                else:
                    # 1. Qdrant: Vector + Metadata (NO LOG)
                    if storage_cfg.get("save_vectors", {}).get("anomaly", True):
                        points_to_upsert.append(PointStruct(
                            id=event_uuid, 
                            vector=ctx["vector"], 
                            payload={"type": "new", "timestamp": time.time(), "score": ctx["score"]}
                        ))
                
                # REPORT & ALERT
                evt = ctx["log"].get("event", {})
                ts_val = ctx["log"].get("timestamp_ref") or evt.get("timestamp") or ctx["log"].get("_server_ts") or "?"
                
                # Map Verdict to Config Key
                alert_key = "new_anomaly"
                if verdict == "FALSE POSITIVE": alert_key = "false_positive"
                elif verdict == "KNOWN THREAT": alert_key = "known_threat"
                
                # check alert policy
                alert_cfg = self.config.get("alert_policy", {}).get("console_alerts", {})
                
                # Support old boolean config or new dict
                should_alert = True
                if isinstance(alert_cfg, bool): should_alert = alert_cfg
                elif isinstance(alert_cfg, dict): 
                    should_alert = alert_cfg.get(alert_key, True)
                
                if should_alert:
                    print(f"[AI ALERT] Score: {ctx['score']:.4f}")
                    print(f"  >> [VERDICT] {verdict} (Type: {mem_type or 'None'}, Dist: {mem_dist:.4f})")
                    print(f"  >> [DETAILS] Time: {ts_val}")
                print(json.dumps(ctx["log"], indent=2))

            # Update Metric Counters
            if hasattr(self, "metrics_accum"):
                if verdict in ("SAFE", "NEW SAFE PATTERN"): self.metrics_accum["verdict_safe"] += 1
                elif verdict == "NEW ANOMALY": self.metrics_accum["verdict_new"] += 1
                elif verdict == "KNOWN THREAT": self.metrics_accum["verdict_threat"] += 1
                elif verdict == "FALSE POSITIVE": self.metrics_accum["verdict_fp"] += 1
                
                # Estimate Bytes
                try:
                    self.metrics_accum["processed_bytes"] += len(json.dumps(ctx["log"]))
                except: pass
            
            # --- MONGO STORE (Save Everything) ---
            if self.mongo_events and should_persist_log:
                # Prepare Relational Doc
                # Enrich Log
                enriched_log = ctx["log"].copy()
                enriched_log["ai_verdict"] = verdict
                enriched_log["ai_score"] = float(ctx["score"])
                enriched_log["ai_uuid"] = event_uuid
                
                doc = {
                    "_id": event_uuid,
                    "uuid": event_uuid,
                    "timestamp": time.time(),
                    "verdict": verdict,
                    "score": float(ctx["score"]),
                    # Promoted Index Keys
                    "host_id": ctx["log"].get("host", {}).get("id"),
                    "group_id": ctx["log"].get("role"), # Assuming role is group-like
                    "event_type": ctx["log"].get("event", {}).get("type"),
                    
                    "full_log": enriched_log
                }
                mongo_docs.append(doc)

        # 5. Execute Writes
        # A. Qdrant (Vectors)
        if points_to_upsert:
             try:
                 self.memory.upsert(
                     collection_name=self.mem_collection,
                     points=points_to_upsert
                 )
                 # Update metric
                 if hasattr(self, "metrics_accum"):
                     self.metrics_accum["mem_saved"] += len(points_to_upsert)
             except Exception as e:
                 print(f"[AI] Memory Save Failed: {e}")
                 
        # B. Mongo (Logs)
        if mongo_docs and self.mongo_events:
            try:
                self.mongo_events.insert_many(mongo_docs, ordered=False)
            except Exception as e:
                print(f"[AI] Mongo Save Failed: {e}")
        
        # End of memory logic replacement
        return # Skip old logic
