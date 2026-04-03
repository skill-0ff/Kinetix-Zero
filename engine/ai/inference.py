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
import redis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, SearchRequest
from dotenv import load_dotenv

# Import Protobuf definitions
try:
    from . import kinetix_pb2
except ImportError:
    import kinetix_pb2

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
        self.input_queue = queue.Queue() # Receives Tuple[np.ndarray, kinetix_pb2.KinetixPacket]
        self.running = True
        self.daemon = True
        
        # Batching Configuration
        self.batch_size = self.config.get("batch_size", 50)
        self.batch_buffer = []
        self.log_buffer = []
        self.last_batch_time = time.time()
        
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
        self.window_queue = [] # List of Tensors
        self.log_batch_queue = [] # List of KinetixPacket objects
        
        # AI Components
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = VAETransformer(
            input_dim=self.input_dim,
            d_model=self.d_model,
            latent_dim=self.latent_dim
        ).to(self.device)
        
        # Optimization: PyTorch 2.0 Compilation (Graph Optimization)
        if hasattr(torch, "compile"):
            try:
                print("[AI] Compiling model... (This may take a minute on first run)")
                self.model = torch.compile(self.model, mode="reduce-overhead")
            except Exception as e:
                print(f"[AI] Compile failed (safe fallback): {e}")

        # Optimization: Feature Weights for Anomaly Detection (Role-Based Judgment)
        weights = torch.ones(self.input_dim, device=self.device)
        weights[1:5] = 0.0 # Indices 1, 2, 3, 4
        
        self.loss_fn = VAELoss(beta=self.beta, feature_weights=weights)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        
        # Optimization: Mixed Precision
        self.scaler = torch.cuda.amp.GradScaler()
        
        # Start Redis Storage Link
        self._init_storage()
        
        # Log Store & Memory (Init)
        self._init_memory()
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
                        db_keys = ["qdrant_path", "qdrant_url"]
                        changed = any(old_config.get(k) != new_config.get(k) for k in db_keys)
                        if changed:
                            print("[AI] Database Config Changed. Reconnecting...")
                            self._init_memory()
                        else:
                            self.dedup_dist = self.config.get("memory_dedup_dist", 0.05)
                            self.query_dist = self.config.get("memory_query_dist", 0.10)
                            
        except Exception as e:
             if not self.config: self.config = {}

    def _init_storage(self):
        """Initialize Redis connection for Storage Worker decoupled queue."""
        try:
            r_cfg = self.config.get("redis", {})
            self.redis_storage = r_cfg.get("storage_queue", "kinetix_storage")
            self.redis_out = redis.Redis(
                host=r_cfg.get("host", "localhost"),
                port=r_cfg.get("port", 6379),
                decode_responses=False # KEEP BINARY
            )
            self.redis_out.ping()
            print(f"[AI] Binary Storage Queue Connected: {self.redis_storage}")
        except Exception as e:
            print(f"[AI Error] Redis Output Failed: {e}")
            self.redis_out = None

    def _init_memory(self):
        """Initializes Memory Store (Qdrant)"""
        
        # 1. Qdrant (Memory)
        try:
            # Check Priority: Env Var > Config
            q_url = os.getenv("QDRANT_URL") or self.config.get("qdrant_url")
            q_key = os.getenv("QDRANT_API_KEY") 
            q_path = self.config.get("qdrant_path", "DB/vector")
            
            if q_url:
                print(f"[AI] Connecting to Remote Qdrant: {q_url}")
                self.memory = QdrantClient(url=q_url, api_key=q_key)
            else:
                print(f"[AI] Connecting to Local Qdrant: {q_path}")
                self.memory = QdrantClient(path=q_path)

            self.mem_collection = "brain_memory"
            
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

    def run(self):
        print("[AI] Worker Loop Started.")
        """Monitor input_queue and handle batching"""
        while self.running:
            try:
                try:
                    # Expecting Tuple[np.ndarray, kinetix_pb2.KinetixPacket]
                    data = self.input_queue.get(timeout=1.0)
                    if data:
                        vector, pkt = data
                        self.batch_buffer.append(vector)
                        self.log_buffer.append(pkt)
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
                if now - self.last_config_check > 1.0:
                    self.last_config_check = now
                    self._check_config_reload()
                    

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
            
    def push_evidence(self, evidence):
        """
        Pushes to Redis 'kinetix_storage' for Worker handling.
        """
        if not self.redis_out: return
        try:
             # Logic for pushing evidence (future use)
             pass
        except: pass

    def process_batch(self, new_window, new_logs=None):
        # Optimization: Convert to tensor ONCE here
        tensor_win = torch.tensor(new_window, dtype=torch.float32)
        self.window_queue.append(tensor_win)
        
        # Maintain Log FIFO
        # new_logs matches new_window length
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
            sensitivity = self.config.get("ai_anomaly_threshold", 0.5)
            sensitivity = max(0.01, min(0.99, sensitivity))
            threshold = 1.0 - sensitivity
            enforced_losses = raw_loss_map * enforce_mask.float()
        
        # --- MEMORY LOGIC START (BATCH OPTIMIZED) ---
        
        # 1. Identify Valid Indices (Those with Maturity >= 1.0)
        valid_coords = torch.nonzero(enforce_mask).cpu().numpy()
        if len(valid_coords) == 0: return

        # Access log batch flat
        full_logs = [item for sublist in self.log_batch_queue for item in sublist]
             
        # 2. Extract Data for Valid Items
        batch_eval = [] # List of (index, vector, pkt, score, is_anomaly)
        cpu_losses = enforced_losses[0].detach().cpu().numpy()
        query_vectors = []
        
        for coord in valid_coords:
            idx = coord[1] # Seq index
            if idx >= len(full_logs): continue
            
            loss_val = cpu_losses[idx]
            vec = full_seq[0, idx, :].detach().cpu().tolist()
            pkt = full_logs[idx]
            is_anom = (loss_val > threshold)
            
            batch_eval.append({
                "vector": vec,
                "pkt": pkt,
                "score": float(loss_val),
                "is_anomaly": is_anom
            })
            query_vectors.append(vec)

        # 3. Batch Query (One Network Call)
        if not self.memory or not query_vectors:
            return
            
        try:
            search_results = self.memory.search_batch(
                collection_name=self.mem_collection,
                requests=[SearchRequest(vector=v, limit=1) for v in query_vectors]
            )
        except Exception as e:
            print(f"[AI] Memory Batch Error: {e}")
            return

        # 4. Process Results
        points_to_upsert = []
        
        for i, result in enumerate(search_results):
            ctx = batch_eval[i]
            pkt = ctx["pkt"]
            top_match = result[0] if result else None
            
            mem_type = top_match.payload.get("type") if top_match else None
            mem_dist = (1.0 - top_match.score) if top_match else 1.0
            
            # Shared ID for Qdrant + Protobuf
            event_uuid = uuid.uuid4().hex
            
            # Logic for Verdict
            verdict = "Safe"
            if not ctx["is_anomaly"]:
                if mem_dist > self.dedup_dist:
                    verdict = "NEW SAFE PATTERN"
                    points_to_upsert.append(PointStruct(
                        id=event_uuid,
                        vector=ctx["vector"],
                        payload={"type": "Safe", "timestamp": time.time(), "score": ctx["score"]} 
                    ))
            else:
                verdict = "NEW ANOMALY"
                if mem_type == "Safe" and mem_dist < self.query_dist:
                    verdict = "FALSE POSITIVE"
                elif mem_type == "Threat" and mem_dist < self.query_dist:
                    verdict = "KNOWN THREAT"
                else:
                    points_to_upsert.append(PointStruct(
                        id=event_uuid, 
                        vector=ctx["vector"], 
                        payload={"type": "Threat", "timestamp": time.time(), "score": ctx["score"]}
                    ))
                
                # Console Alert
                alert_cfg = self.config.get("alert_policy", {}).get("console_alerts", {})
                should_alert = True
                if isinstance(alert_cfg, dict):
                    alert_key = verdict.lower().replace(" ", "_")
                    should_alert = alert_cfg.get(alert_key, True)
                
                if should_alert:
                    print(f"[AI ALERT] Score: {ctx['score']:.4f} | Verdict: {verdict}")
                    print(f"  >> [UUID] {event_uuid} (Dist: {mem_dist:.4f})")

            # --- PROTOBUF DECORATION & REDIS PUSH ---
            try:
                pkt.uuid = event_uuid
                pkt.ai_verdict = verdict
                pkt.ai_anomaly_score = ctx["score"]
                
                # Push binary to storage queue
                if self.redis_out:
                    binary_pkt = pkt.SerializeToString()
                    self.redis_out.rpush(self.redis_storage, binary_pkt)
            except Exception as e:
                print(f"[AI] Serial/Push Failed: {e}")

        # 5. Execute Writes (Qdrant)
        if points_to_upsert and self.memory:
             try:
                 self.memory.upsert(
                     collection_name=self.mem_collection,
                     points=points_to_upsert
                 )
             except Exception as e:
                 print(f"[AI] Memory Save Failed: {e}")
                 
        return
