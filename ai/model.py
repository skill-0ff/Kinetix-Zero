import torch
import torch.nn as nn
import torch.nn.functional as F

class KinetixAutoencoder(nn.Module):
    def __init__(self, input_dim=33):
        super(KinetixAutoencoder, self).__init__()
        
        # Encoder (Compression)
        # 33 -> 24 -> 16 -> 12 (Latent)
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 24),
            nn.ReLU(),
            nn.Linear(24, 16),
            nn.ReLU(),
            nn.Linear(16, 12),
            nn.ReLU() # Latent Space
        )
        
        # Decoder (Reconstruction)
        # 12 -> 16 -> 24 -> 33
        self.decoder = nn.Sequential(
            nn.Linear(12, 16),
            nn.ReLU(),
            nn.Linear(16, 24),
            nn.ReLU(),
            nn.Linear(24, input_dim)
            # No final activation for unbounded reconstruction (or Sigmoid if normalized 0-1)
            # Since our hash values are 0-1, we can use Sigmoid or just Linear to be safe.
            # Linear allows for easier handling of unnormalized variants if any.
        )

    def forward(self, x):
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded
    
    def get_latent_vector(self, x):
        with torch.no_grad():
            return self.encoder(x)
