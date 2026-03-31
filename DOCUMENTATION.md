# Kinetix-Zero - Complete Core Documentation

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Brain (Main Processor)](#brain-main-processor)
3. [PacketReceiver (Network Ingress)](#packetreceiver-network-ingress)
4. [Vectorizer (Log Normalization)](#vectorizer-log-normalization)
5. [UnsupervisedAI (ML Engine)](#unsupervisedai-ml-engine)
6. [VAETransformer Model](#vaetransformer-model)
7. [MISP Client (Threat Intelligence)](#misp-client-threat-intelligence)
8. [Janitor (Data Retention)](#janitor-data-retention)
9. [API Server](#api-server)
10. [Authentication](#authentication)
11. [Data Flow Diagrams](#data-flow-diagrams)
12. [Configuration Reference](#configuration-reference)

---

## System Architecture Overview

Kinetix-Zero is a **cybersecurity threat detection system** that uses:
- **Layer 1 (Ingress)**: Packet capture via UDP/TCP
- **Layer 2 (Logic)**: Threshold-based DDoS detection
- **Layer 3 (Threat Intel)**: MISP integration for known threats
- **Layer 4 (AI/ML)**: VAE-Transformer for unsupervised anomaly detection

```
+-------------+     +-------------+     +--------------+     +-------------+
|   Network   |---->|   Brain     |---->|  Unsupervised|---->|  Database   |
|  (Packets)  |     |  Processor  |     |     AI       |     |  (Mongo/Qdr)|
+-------------+     +-------------+     +--------------+     +-------------+
                            |
                            v
                    +---------------+
                    |     MISP     |
                    |   (Threats)  |
                    +---------------+
```

---

## Brain (Main Processor)

**File**: `engine/core/brain.py`

The Brain is the central coordinator that orchestrates all components.

### Responsibilities:
1. **Initialization**: Loads config, initializes all subsystems
2. **Packet Reception**: Spawns `PacketReceiver` thread
3. **Queue Processing**: Drains packet queue in batches
4. **DDoS Detection**: Applies threshold-based logic
5. **Hot Reloading**: Monitors config files for changes
6. **Metrics Reporting**: Logs EPS (Events Per Second) to MongoDB
7. **Watchdog**: Monitors and restarts dead threads

### Key Variables:
```python
# Queue Management
packet_queue        # Thread-safe queue for incoming packets
max_queue_size      # Memory limit (default: 10000)

# DDoS Detection
time_window         # Aggregation window (default: 5s)
max_sequence        # Normal traffic baseline (default: 100)
ddos_threshold      # Buffer above baseline (default: 50)
limit               # max_sequence + ddos_threshold (150)

# Metrics
counter_in          # Packets received this window
counter_out         # Packets processed this window
metrics_interval    # Flush interval (1 second)
start_time          # Process start timestamp
```

### Processing Loop:
```
Every time_window (5s):
1. Drain packet_queue up to 'limit' packets
2. If count >= limit:
   - Trigger DDoS ALERT
   - Apply forensic sampling (configurable rate)
   - Save evidence to AI
   - DROP all packets (strict tail drop)
3. Else:
   - Decode JSON logs
   - Check MISP (threat intel)
   - Check evidence_queue (Layer 1 drops)
   - Vectorize logs
   - Push to AI for inference
```

---

## PacketReceiver (Network Ingress)

**File**: `engine/core/brain.py` (Lines 47-120)

A background thread that listens for incoming network packets.

### Features:
- **Protocol Support**: UDP and TCP
- **Kernel Buffer Optimization**: 4MB receive buffer (vs default ~200KB)
- **Non-blocking I/O**: Uses `select()` for efficient polling
- **Burst Processing**: Reads up to 100 packets per iteration
- **Thread-safe**: Uses `queue.Queue` for communication
- **Auto-cleanup**: Daemon thread dies with main process

### Socket Configuration:
```python
# UDP Example
sock = socket.socket(AF_INET, SOCK_DGRAM)
sock.setsockopt(SOL_SOCKET, SO_RCVBUF, 4 * 1024 * 1024)  # 4MB
sock.bind(("0.0.0.0", port))

# TCP Example  
sock = socket.socket(AF_INET, SOCK_STREAM)
sock.bind(("0.0.0.0", port))
sock.listen(5)
```

---

## Vectorizer (Log Normalization)

**File**: `engine/core/vectorizer.py`

Converts raw JSON logs into 34-dimensional feature vectors for the AI.

### Input Format (LogEntry):
```json
{
  "role": "WORKSTATION-01",
  "timestamp_ref": "2024-01-15T14:30:25",
  "host": {
    "id": "PC-1234",
    "os": "Windows 11",
    "ip": "192.168.1.100",
    "mac": "00:11:22:33:44:55"
  },
  "event": {
    "type": "process_start",
    "process": "powershell.exe",
    "cmdline": "powershell -nop -w hidden -c \"...",
    "user": "admin"
  }
}
```

### Output Format (34-Dim Vector):

| Index | Feature | Encoding Method |
|-------|---------|-----------------|
| 0 | Role Score | Role mapping + hash fallback |
| 1 | Host ID Hash | CRC32 to 0-1 normalized |
| 2 | OS Hash | CRC32 to 0-1 normalized |
| 3 | IP Hash | CRC32 to 0-1 normalized |
| 4 | MAC Hash | CRC32 to 0-1 normalized |
| 5 | Maturity | Default 0.5 (learned over time) |
| 6-7 | Client Time | Cyclic sin/cos encoding |
| 8-9 | Server Time | Cyclic sin/cos encoding |
| 10-12 | Status (CPU/RAM/DISK) | Log10 normalized |
| 13 | Event Type Hash | CRC32 |
| 14 | Actor Identity | User/process hash |
| 15 | Action Hash | Operation type hash |
| 16 | Auth/Rarity | Logon type hash |
| 17 | Direction | (Reserved) |
| 18 | Actor Process | Top-K process scoring |
| 19 | Actor Path | Entropy calculation |
| 20 | Parent/Handle | Hash |
| 21 | Payload/Command | Entropy calculation |
| 22 | Target Identity | Hash |
| 23-27 | Network | Protocol, src/dst IP, ports |
| 28-30 | Resource | Registry/Task/Service names |
| 31-33 | Size/Data | Sent/Recv bytes |

### Key Encoding Functions:

1. **Cyclic Time Encoding**:
   ```python
   # Converts HH:MM:SS to sin/cos cycle
   angle = (seconds_in_day / 86400) * 2*pi
   vector[6] = sin(angle)
   vector[7] = cos(angle)
   ```

2. **Entropy Calculation**:
   ```python
   # Shannon entropy, capped at 1.0
   entropy = -Sum(p * log2(p))
   vector = min(entropy * 0.125, 1.0)
   ```

3. **Hash Normalization**:
   ```python
   # CRC32 to 0-1 range
   val = zlib.crc32(s.encode()) & 0xffffffff
   return (val % 100000) * 0.00001
   ```

### Supported Event Types:
- `process_start`, `process_kill`
- `file_create`, `file_modified`, `file_delete`
- `service_create`, `service_delete`, `service_modified`
- `registry`
- `network_connection`, `dns_query`, `traffic`
- `console_login`, `session`, `auth_login`
- `logging`, `scheduled_task`
- `account_management`, `group_management`
- `module_load`, `pipe_event`, `wmi_event`

---

## UnsupervisedAI (ML Engine)

**File**: `engine/ai/inference.py`

The AI worker thread that performs anomaly detection using a VAE-Transformer model.

### Architecture:
```
Input (34-dim vectors)
       |
       v
+---------------+
|   VAETransformer |  (Encoder -> Latent -> Decoder)
|    (PyTorch)     |
+---------------+
       |
       v
  Reconstruction
     Loss Map
       |
       v
+---------------+
|  Memory Check    |  (Qdrant Vector DB)
|  (Nearest Neighbor)|
+---------------+
       |
       v
    Verdict
```

### Processing Pipeline:

1. **Batch Accumulation**:
   - Collects vectors in buffer (batch_size=64)
   - Flushes on timeout (1s) or batch full

2. **Context Window**:
   - Maintains sliding window of last N batches
   - `ai_context_epochs` = number of windows (default: 5)
   - Oldest batch evicted when limit exceeded

3. **Model Inference**:
   ```python
   full_seq = torch.cat(window_queue, dim=0)  # [Batch*Epochs, 34]
   recon_x, mu, logvar = model(full_seq)
   loss_map = MSE(recon_x, full_seq)
   ```

4. **Maturity System**:
   - Events start with maturity=0.5
   - After N epochs (context epochs), maturity=1.0
   - Immature events -> Train model only
   - Mature events -> Alert & Memory check

5. **Verdict Logic**:

   | Scenario | Condition | Action |
   |----------|-----------|--------|
   | **Safe (New)** | Loss < Threshold AND distance > dedup_dist | Learn to Qdrant |
   | **Safe (Known)** | Loss < Threshold AND distance < dedup_dist | Ignore |
   | **Anomaly (New)** | Loss > Threshold AND distance > query_dist | Alert + Save |
   | **False Positive** | Loss > Threshold AND type=Safe AND distance < query_dist | Mark FP |
   | **Known Threat** | Loss > Threshold AND type=Threat AND distance < query_dist | Alert |

6. **Memory (Qdrant)**:
   - **Dedup Distance** (0.05): Don't save if too similar
   - **Query Distance** (0.10): Match threshold for alerts

7. **Metrics Tracked**:
   ```python
   processed_count      # Total events processed
   processed_bytes      # JSON size processed
   verdict_safe         # Safe events
   verdict_threat       # Known threats
   verdict_new          # New anomalies
   verdict_fp           # False positives
   memory_saved         # Vectors saved to Qdrant
   memory_dropped       # Duplicates rejected
   ```

### Checkpointing:
- Auto-save every 3600 seconds (configurable)
- Keeps last 10 checkpoints (configurable)
- Crash backup on SIGINT/SIGTERM

---

## VAETransformer Model

**File**: `engine/ai/model.py`

### Architecture Details:

```
Input (34 dims)
    |
    v
Embedding Layer (34 -> 64)
    |
    v
Positional Encoding
    |
    v
Transformer Encoder (2 layers, 4 heads)
    |
    v
+-------------+
|  VAE Layer  |  --> mu (64 dims)
|             |  --> logvar (64 dims)
+-------------+
    |
    v (reparameterize)
Latent Vector (64 dims)
    |
    v
Projection (64 -> 64)
    |
    v
Transformer Decoder (2 layers)
    |
    v
Output Projection (64 -> 34)
    |
    v
Reconstructed Input
```

### Loss Function:
```python
# Combined Loss = Reconstruction + beta * KL_Divergence
loss_recon = MSE(recon_x, x)
loss_kl = -0.5 * Sum(1 + log(sigma^2) - mu^2 - sigma^2)
total_loss = loss_recon + beta * loss_kl
```

### Hyperparameters:
- `input_dim`: 34
- `d_model`: 64
- `nhead`: 4
- `num_layers`: 2
- `latent_dim`: 64
- `beta`: 0.1 (KL weight)

---

## MISP Client (Threat Intelligence)

**File**: `engine/core/misp_client.py`

Integrates with Malware Information Sharing Platform (MISP).

### Workflow:

1. **Observable Extraction**:
   - Extracts IPs, hashes from logs
   - Filters private IPs (RFC 1918)
   - Deduplicates observables

2. **Batch Query**:
   ```python
   POST /attributes/restSearch
   Body: { "value": ["1.2.3.4", "hash123", ...] }
   ```

3. **Response Handling**:
   - Tags matched logs with verdict
   - Generates JSON reports
   - Logs alert to console

### Configuration:
```json
{
  "misp_enabled": false,
  "misp_url": "https://misp.local",
  "misp_verify_ssl": true,
  "alert_policy": {
    "misp_report": true
  }
}
```

---

## Janitor (Data Retention)

**File**: `engine/core/janitor.py`

Background thread for automatic data cleanup.

### Features:
- Runs every 24 hours (configurable)
- Deletes old records from MongoDB and Qdrant
- Per-verdict retention policies

### Retention Policy:
```json
{
  "ai_safe": 30,        // 30 days
  "new_anomaly": 90,    // 90 days  
  "known_threat": 365,  // 1 year
  "false_positive": 7,  // 7 days
  "misp_alert": 365,    // 1 year
  "ddos_evidence": 3    // 3 days
}
```

### Database Pruning:
- **MongoDB**: `delete_many({timestamp: {$lt: cutoff}})`
- **Qdrant**: `delete(filter=...)`

---

## API Server

**File**: `engine/api/server.py`

FastAPI-based REST API for frontend communication.

### Endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/token` | Login, returns JWT |
| GET | `/users/me` | Get current user |
| GET | `/metrics` | Recent EPS metrics |
| GET | `/logs` | Search event logs |
| GET | `/threats` | Active threats |
| GET | `/status` | System health |
| GET | `/stats` | Aggregated statistics |
| GET | `/config` | Get config |
| POST | `/config` | Update config (admin only) |

### Database Connections:
- **MongoDB**: Read events, metrics
- **Qdrant**: Read vector counts

### CORS:
- Allows all origins (dev mode)
- For production: restrict to frontend URL

---

### Authentication

**File**: `engine/api/server.py`

### Features:
- JWT-based authentication
- Hardcoded Operator credentials (for initial deployment)
- Role-based Access Control logic (token payload 'sub')

### Default Credentials:
> [!WARNING]
> These credentials are hardcoded in `server.py` and must be changed for production.

```
Username: admin
Password: password
```

### Token:
- Expiry: 24 hours
- Algorithm: HS256
- Secret: Environment variable `JWT_SECRET`

---

## Data Flow Diagrams

### Normal Traffic Flow:
```
1. Network Packet
      |
      v
2. PacketReceiver (UDP/TCP)
      |
      v
3. packet_queue
      |
      v
4. Brain.process_queue()
      |
      +--> MISP Check (if enabled)
      |
      v
5. Vectorizer.vectorize_batch()
      |
      v
6. UnsupervisedAI.push_batch()
      |
      v
7. AI Inference + Memory Check
      |
      +--> Qdrant (vectors)
      |
      +--> MongoDB (logs)
```

### DDoS Attack Flow:
```
1. High Volume Packets
      |
      v
2. Queue count >= limit (150)
      |
      v
3. DDoS ALERT triggered
      |
      v
4. Forensic Sampling (configurable %)
      |
      v
5. Evidence saved with verdict="DDoS"
      |
      v
6. Packets DROPPED (tail drop)
```

---

## Configuration Reference

**File**: `engine/core/config.jsonc`

### Complete Settings:

```json
{
  // Network
  "port": 5001,                    // UDP listen port
  "protocol": "udp",               // udp or tcp
  
  // Brain Logic
  "time_window": 5.0,              // Aggregation window (seconds)
  "max_sequence": 100,             // Normal traffic baseline
  "ddos_threshold": 50,            // Alert threshold buffer
  "max_queue_size": 10000,         // Queue memory limit
  
  // AI Engine
  "ai_context_epochs": 5,          // Memory depth
  "ai_anomaly_threshold": 0.9,     // Sensitivity (0-1)
  
  // Database
  "qdrant_path": "DB/vector",     // Local vector DB
  "qdrant_url": null,              // Remote (optional)
  "mongo_uri": "mongodb://localhost:27017/",
  
  // Memory
  "memory_dedup_dist": 0.05,      // Dedup threshold
  "memory_query_dist": 0.10,       // Match threshold
  
  // Persistence
  "ai_checkpoint_file": "auto",    // Model checkpoint
  "checkpoint_interval_seconds": 3600,
  "max_checkpoints_history": 10,
  
  // Forensics
  "forensic_sample_rate": 100,      // % evidence saved
  "forensic_sample_mode": "random",
  
  // MISP
  "misp_enabled": false,
  "misp_url": "https://misp.local",
  "misp_verify_ssl": true,
  
  // Storage Policy
  "storage_policy": {
    "save_vectors": { "ai_safe": true, "anomaly": true },
    "save_logs": { "ai_safe": true, "anomaly": true, "ddos_evidence": true }
  },
  
  // Alert Policy
  "alert_policy": {
    "misp_report": true,
    "console_alerts": {
      "new_anomaly": true,
      "known_threat": true,
      "false_positive": false
    }
  },
  
  // Retention
  "retention_policy": {
    "enabled": true,
    "run_interval_hours": 24,
    "keep_days": { ... }
  }
}
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/` |
| `QDRANT_URL` | Remote Qdrant URL | Local path |
| `QDRANT_API_KEY` | Qdrant API key | None |
| `MISP_API_KEY` | MISP API key | None |
| `JWT_SECRET` | JWT signing secret | `kinetix_secret_change_me` |

---

## Summary

Kinetix-Zero is a comprehensive threat detection platform that:

1. **Captures** network logs via UDP/TCP
2. **Detects** DDoS attacks using threshold logic
3. **Enriches** with MISP threat intelligence
4. **Analyzes** using VAE-Transformer ML model
5. **Stores** vectors in Qdrant, logs in MongoDB
6. **Serves** data via REST API with auth
7. **Maintains** data lifecycle with Janitor

The system is designed for **real-time processing** with:
- Non-blocking I/O
- Multi-threaded architecture
- GPU acceleration (CUDA)
- Checkpointing for resilience
- Hot config reloading

---

## Bug Fixes Applied

### brain.py:
1. Removed duplicate `class Brain` definition (second definition was overwriting first)
2. Added missing variable initializations: `counter_in`, `counter_out`, `last_metrics_flush`, `metrics_interval`, `start_time`, `evidence_queue`, `misp`, `janitor`
3. Fixed triple counter increment (was adding same value 3 times: `self.counter_out += len(vectors)` x3)
4. Removed duplicate metrics flush code (was repeated 3 times, causing triple MongoDB inserts)
5. Fixed wrong attribute reference: `self.ai.db["metrics"]` changed to `self.ai.mongo_metrics`
6. Fixed broken stray `except: continue` block

### inference.py:
1. Fixed indentation for `if enforce_mask.any():` block (was missing proper indentation causing syntax errors)
2. Removed stray `else:` block that had no matching if (causing syntax errors)
3. Added `verdict = "Safe"` for the case when log is safe but matches existing memory (was causing unbound variable error)

---

## Version

Document Version: 1.0
Generated: 2024
