import torch
import torch.nn as nn
import torch.optim as optim
import json
import random
import os
from model import KinetixAutoencoder

# Config
DATA_FILE = "ai/training_data.json"
MODEL_PATH = "models/archetype_v1.pth"
EPOCHS = 20
BATCH_SIZE = 64
LR = 0.005

def apply_context_mask(vectors):
    """
    Zero out Identity slots to force Archetype Learning.
    Slot 01: Host ID
    Slot 03: Host IP
    Slot 04: Host MAC
    """
    masked = vectors.clone()
    masked[:, 1] = 0.0 # ID
    masked[:, 3] = 0.0 # IP
    masked[:, 4] = 0.0 # MAC
    return masked

def train():
    print(f"Loading data from {DATA_FILE}...")
    with open(DATA_FILE, 'r') as f:
        data = json.load(f)
    
    # Convert to Tensor
    tensor_data = torch.tensor(data, dtype=torch.float32)
    
    # Split Train/Test (Simplified)
    train_data = tensor_data
    
    # Initialize Model
    model = KinetixAutoencoder()
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)
    
    print(f"Training on {len(train_data)} samples for {EPOCHS} epochs...")
    
    for epoch in range(EPOCHS):
        model.train()
        
        # Shuffle
        permutation = torch.randperm(train_data.size()[0])
        
        epoch_loss = 0.0
        batches = 0
        
        for i in range(0, train_data.size()[0], BATCH_SIZE):
            indices = permutation[i:i+BATCH_SIZE]
            batch_raw = train_data[indices]
            
            # MASK INPUT (The model sees 'Anonymous Role')
            batch_masked = apply_context_mask(batch_raw)
            
            # Forward
            # We want the model to reconstruct the MASKED input? 
            # Or the ORIGINAL? 
            # Autoencoder usually reconstructs Input. 
            # Since we want to detect anomalies in behavior, we want it to reconstruct the masked behavior.
            # If we reconstruct original (with IDs), the model learns "ID 123 usually does X". We don't want that.
            # So Target = batch_masked too.
            
            outputs = model(batch_masked)
            loss = criterion(outputs, batch_masked)
            
            # Backward
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            epoch_loss += loss.item()
            batches += 1
            
        print(f"Epoch {epoch+1}/{EPOCHS}, Loss: {epoch_loss/batches:.6f}")

    # Save
    torch.save(model.state_dict(), MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

if __name__ == "__main__":
    train()
