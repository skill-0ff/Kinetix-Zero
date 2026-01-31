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
        self.checkpoint_dir = "checkpoints"
        if not os.path.exists(self.checkpoint_dir):
            os.makedirs(self.checkpoint_dir)
            
        self.last_save_time = time.time()
        self.last_config_check = time.time()
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
        self.batch_size = 64
        self.last_batch_time = time.time()
        
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
                    self.config = json.loads("".join(lines))
                    
                    # Runtime FIFO update
                    new_ctx = self.config.get("ai_context_epochs", 5)
                    if hasattr(self, 'context_epochs') and new_ctx != self.context_epochs:
                        print(f"[AI] Resizing FIFO: {self.context_epochs} -> {new_ctx}")
                        self.context_epochs = new_ctx
        except:
            self.config = {}

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

    def push_batch(self, vectors):
        """Non-blocking push from Brain"""
        self.input_queue.put(vectors)

    def run(self):
        print("[AI] Worker Loop Started.")
        while self.running:
            try:
                # Poll frequently to check buffer timeout even if empty
                try:
                    vectors = self.input_queue.get(timeout=0.1) 
                    self.batch_buffer.extend(vectors)
                except queue.Empty:
                    pass
                
                # Check Batch Conditions
                now = time.time()
                is_full = len(self.batch_buffer) >= self.batch_size
                is_timeout = (len(self.batch_buffer) > 0) and (now - self.last_batch_time > 1.0)
                
                if is_full or is_timeout:
                    # Process Accumulated Batch
                    to_process = self.batch_buffer[:self.batch_size]
                    self.batch_buffer = self.batch_buffer[self.batch_size:] # Keep remainder
                    self.last_batch_time = now
                    
                    self.process_batch(to_process)
                
                # Check Persistence Schedule
                interval = self.config.get("checkpoint_interval_seconds", 3600)
                if now - self.last_save_time > interval:
                    self.save_checkpoint()
                    self.last_save_time = now
                    
                # Runtime Hot-Reload
                # Check every 1.0 seconds if config changed (for anomaly_threshold)
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

    def process_batch(self, new_window):
        # Optimization: Convert to tensor ONCE here
        tensor_win = torch.tensor(new_window, dtype=torch.float32)
        self.window_queue.append(tensor_win)
        
        # Maintain FIFO
        while len(self.window_queue) > self.context_epochs:
            self.window_queue.pop(0)

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
            # User Definition: 1.0 = Max Sensitivity (Paranoid), 0.0 = Relaxed
            # Logic: We invert it to get the Loss Threshold
            # Config 0.9 (Sensitive) -> Threshold 0.1 (Low Bar)
            sensitivity = self.config.get("ai_anomaly_threshold", 0.5)
            # Clamp to 0.01-0.99 to avoid div by zero or infinite alerts
            sensitivity = max(0.0, min(1.0, sensitivity))
            
            # Formula: Higher Sensitivity = Lower Threshold
            threshold = 1.0 - sensitivity
            
            enforced_losses = raw_loss_map * enforce_mask.float()
            
            # Fast Check: Max loss > threshold?
            if enforced_losses.max() > threshold:
                bad_indices = torch.nonzero(enforced_losses > threshold)
                count = len(bad_indices)
                print(f"[AI ALERT] {count} Anomalies Detected! (Sensitivity={sensitivity:.2f})")
