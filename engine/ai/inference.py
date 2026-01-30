import torch
import torch.optim as optim
import numpy as np
import os
import sys
import json

# Relative import fix for direct usage vs module usage
try:
    from .model import VAETransformer, VAELoss
except ImportError:
    from model import VAETransformer, VAELoss

class UnsupervisedAI:
    def __init__(self, config_path="../core/config.jsonc"):
        self.config_path = config_path
        self.config = {}
        self.load_config()
        
        # Model Parameters
        self.input_dim = 32
        self.d_model = 64
        self.latent_dim = 64
        self.beta = 0.1
        
        # FIFO Queue
        self.context_epochs = self.config.get("ai_context_epochs", 5)
        self.window_queue = [] # List of Tensors
        
        # AI Components
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = VAETransformer(
            input_dim=self.input_dim,
            d_model=self.d_model,
            latent_dim=self.latent_dim
        ).to(self.device)
        
        self.loss_fn = VAELoss(beta=self.beta)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        
        print(f"[AI] Initialized on {self.device}. Context={self.context_epochs}")

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
                        # Trim if needed
                        while len(self.window_queue) > self.context_epochs:
                            self.window_queue.pop(0)
        except:
            self.config = {}

    def update_queue(self, new_window):
        # new_window: list of [1, 32] lists or [N, 32] array
        # Convert to Tensor
        tensor_win = torch.tensor(new_window, dtype=torch.float32)
        
        self.window_queue.append(tensor_win)
        
        # Maintain FIFO size
        while len(self.window_queue) > self.context_epochs:
            self.window_queue.pop(0)
            
        return len(self.window_queue)

    def process_window(self, new_window):
        # 1. Update Config (Cheap check)
        # In prod, maybe check mtime, but simple read is okay for now
        # self.load_config() # Optimization: Call explicitly from brain.py instead
        
        # 2. Update FIFO
        q_len = self.update_queue(new_window)
        
        # 3. Stack Queue -> Input Tensor
        # Each item in queue is [N, 32]. We concat them along sequence dim.
        # Input: [1, Total_Seq_Len, 32]
        full_seq = torch.cat(self.window_queue, dim=0).unsqueeze(0).to(self.device)
        
        # 4. Extract Maturity Mask (Slot 5)
        # [1, Seq_Len]
        maturity_scores = full_seq[:, :, 5] 
        
        # Train Mask (M < 1.0)
        train_mask = (maturity_scores < 1.0)
        
        # Enforce Mask (M == 1.0)
        enforce_mask = (maturity_scores >= 1.0)
        
        # 5. Hybrid Loop
        self.model.train() # Enable dropout/grads
        self.optimizer.zero_grad()
        
        recon_x, mu, logvar = self.model(full_seq)
        
        # Calculate Loss using TRAIN MASK
        # If train_mask is empty, loss is 0
        train_loss, raw_loss_map = self.loss_fn(recon_x, full_seq, mu, logvar, mask=train_mask)
        
        if train_mask.any():
            train_loss.backward()
            self.optimizer.step()
            
        # 6. Alerting Check
        # raw_loss_map is [1, Seq]. We check indices where Enforce Mask is True
        anomalies = []
        if enforce_mask.any():
            threshold = self.config.get("ai_anomaly_threshold", 0.5)
            
            # Filter loss map by enforce mask
            # We want specific events that failed
            enforced_losses = raw_loss_map * enforce_mask.float()
            
            # Find indices > threshold
            # indices: (batch_idx, seq_idx)
            bad_indices = torch.nonzero(enforced_losses > threshold)
            
            for idx in bad_indices:
                seq_idx = idx[1].item()
                score = enforced_losses[0, seq_idx].item()
                # Determine which window in queue this belongs to? 
                # For now just return relative index and score
                anomalies.append({"index": seq_idx, "score": score})
                
        return {
            "trained": train_mask.any().item(),
            "train_loss": train_loss.item() if train_mask.any() else 0.0,
            "anomalies": anomalies
        }
