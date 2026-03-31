import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe)

    def forward(self, x):
        # x: [Batch, Seq, Feat]
        # Pytorch Transformer expects [Seq, Batch, Feat] by default, but we use batch_first=True
        return x + self.pe[:x.size(1), :]

class VAETransformer(nn.Module):
    def __init__(self, input_dim=32, d_model=64, nhead=4, num_layers=2, latent_dim=64):
        super().__init__()
        
        self.d_model = d_model
        
        # 1. Input Projection
        self.embedding = nn.Linear(input_dim, d_model)
        self.pos_encoder = PositionalEncoding(d_model)
        
        # 2. Encoder
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, batch_first=True)
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        # 3. Variational Bottleneck (Maps d_model sequence to Latent Distribution)
        # We process the sequence per-token or global? 
        # For granular anomaly detection, per-token is better to catch specific bad events.
        self.fc_mu = nn.Linear(d_model, latent_dim)
        self.fc_var = nn.Linear(d_model, latent_dim)
        
        # 4. Latent Projection back to d_model
        self.fc_decoder_input = nn.Linear(latent_dim, d_model)
        
        # 5. Decoder
        decoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, batch_first=True)
        # Using Encoder stack for Decoder in Autoencoder context is common (BERT-like)
        self.transformer_decoder = nn.TransformerEncoder(decoder_layer, num_layers=num_layers)
        
        # 6. Output Projection
        self.output_layer = nn.Linear(d_model, input_dim)

    def reparameterize(self, mu, logvar):
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def forward(self, x):
        # x: [Batch, Seq_Len, 32]
        
        # Encode
        x_emb = self.embedding(x) * math.sqrt(self.d_model)
        x_emb = self.pos_encoder(x_emb)
        enc_out = self.transformer_encoder(x_emb)
        
        # VAE Bottleneck
        mu = self.fc_mu(enc_out)
        logvar = self.fc_var(enc_out)
        
        if self.training:
            z = self.reparameterize(mu, logvar)
        else:
            z = mu # Deterministic in inference if preferred, or sample for robustness
            
        # Decode
        z_proj = self.fc_decoder_input(z)
        z_proj = self.pos_encoder(z_proj) # Add position again for decoder context
        dec_out = self.transformer_decoder(z_proj)
        
        recon_x = self.output_layer(dec_out)
        
        return recon_x, mu, logvar

class VAELoss(nn.Module):
    def __init__(self, beta=0.1, feature_weights=None):
        super().__init__()
        self.beta = beta
        self.mse = nn.MSELoss(reduction='none') 
        self.register_buffer("weights", feature_weights)

    def forward(self, recon_x, x, mu, logvar, mask=None):
        # 1. Reconstruction Loss (MSE)
        # x, recon_x: [Batch, Seq, 34]
        loss_pixel = self.mse(recon_x, x) # [Batch, Seq, 34]
        
        # Apply Feature Weights (e.g. ignore Host ID/IP/MAC for anomaly score)
        if self.weights is not None:
             # loss_pixel: [B, S, 34], weights: [34] -> Multiplies last dim
             loss_pixel = loss_pixel * self.weights
        
        loss_recon = loss_pixel.mean(dim=2) # [Batch, Seq] - Average over features
        
        # 2. KL Divergence
        loss_kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=2) # [Batch, Seq]
        
        # Combined Unmasked Loss
        total_loss_raw = loss_recon + (self.beta * loss_kl) # [Batch, Seq]
        
        # 3. Apply Mask (Maturity Logic)
        if mask is not None:
            masked_loss = total_loss_raw * mask.float()
            final_loss = masked_loss.sum() / (mask.sum() + 1e-6)
            return final_loss, total_loss_raw
        else:
            return total_loss_raw.mean(), total_loss_raw
