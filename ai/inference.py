import torch
import torch.nn as nn
import json
import sys
import os

# Add root to path
sys.path.append(os.getcwd())

try:
    from ai.model import KinetixAutoencoder
except ImportError:
    print("Run from project root")

class AnomalyDetector:
    def __init__(self, model_path="models/archetype_v1.pth"):
        self.model = KinetixAutoencoder()
        self.criterion = nn.MSELoss()
        
        # Load weights if they exist, else initialize random (Untrained Start)
        if os.path.exists(model_path):
            try:
                self.model.load_state_dict(torch.load(model_path))
                print(f"[AI] Loaded model from {model_path}")
            except:
                print(f"[AI] Model file corrupt, initializing new random weights.")
        else:
            print(f"[AI] No existing model found. Initializing untrained model.")
            
        self.model.eval()

    def get_anomaly_score(self, vector_list):
        """
        Input: List of 32-dim vectors (or 33 with Role)
        Output: List of Error Scores (Floats)
        """
        # Convert to Tensor
        inputs = torch.tensor(vector_list, dtype=torch.float32)
        
        # MASKING (Role-Based Context)
        # Apply strict masking to ID/IP slots to enforce Archetype behavior
        masked_inputs = inputs.clone()
        masked_inputs[:, 1] = 0.0 # ID
        masked_inputs[:, 3] = 0.0 # IP
        masked_inputs[:, 4] = 0.0 # MAC
        
        with torch.no_grad():
            reconstructions = self.model(masked_inputs)
            
            # Calculate MSE per sample
            # (Input - Output)^2 -> mean
            loss = torch.mean((masked_inputs - reconstructions) ** 2, dim=1)
            
        return loss.tolist()

if __name__ == "__main__":
    # Test Stub
    detector = AnomalyDetector()
    sample = [[0.0] * 33] # Zero vector
    score = detector.get_anomaly_score(sample)
    print(f"Test Anomaly Score: {score[0]}")
