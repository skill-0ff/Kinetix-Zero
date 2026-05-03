# Kinetix-Zero - Complete Core Documentation

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [S-UDP (Secure UDP) Protocol Engine](#s-udp-secure-udp-protocol-engine) *(NEW)*
3. [Brain (Main Processor)](#brain-main-processor)
4. [PacketReceiver (Network Ingress)](#packetreceiver-network-ingress)
5. [Vectorizer (Log Normalization)](#vectorizer-log-normalization)
6. [UnsupervisedAI (ML Engine)](#unsupervisedai-ml-engine)
7. [VAETransformer Model](#vaetransformer-model)
8. [MISP Client (Threat Intelligence)](#misp-client-threat-intelligence)
9. [Janitor (Data Retention)](#janitor-data-retention)
10. [API Server & Authentication](#api-server--authentication)
11. [Data Flow Diagrams](#data-flow-diagrams)
12. [Configuration Reference](#configuration-reference)

---

## System Architecture Overview

Kinetix-Zero is a **high-performance, AI-driven cybersecurity threat detection system**. It processes massive volumes of network and system logs in real-time, executing continuous analysis over multiple processing layers. 

- **Layer 1 (Transport & Ingress)**: S-UDP Protocol Engine (Secure UDP)
- **Layer 2 (Logic)**: Threshold-based DDoS detection
- **Layer 3 (Threat Intel)**: MISP integration for known threats
- **Layer 4 (AI/ML)**: VAE-Transformer for unsupervised anomaly detection

```text
+-------------+     +-------------+     +--------------+     +-------------+
|   S-UDP     |---->|   Brain     |---->|  Unsupervised|---->|  Database   |
|  (Transport)|     |  Processor  |     |     AI       |     |  (Mongo/Qdr)|
+-------------+     +-------------+     +--------------+     +-------------+
                            |
                            v
                    +---------------+
                    |     MISP      |
                    |   (Threats)   |
                    +---------------+
```

---

## S-UDP (Secure UDP) Protocol Engine

**S-UDP** natively handles the Layer 1 capabilities of Kinetix-Zero. It is a high-performance, **2-window pipelined sliding window protocol** built completely over raw UDP. It guarantees reliable, ordered, and gap-free data delivery, prioritizing continuous, non-blocking traffic ingestion at scale.

### Key Capabilities

1. **2-Window Pipelining & Flow Control**
   The sender processes and keeps up to **two windows in-flight simultaneously** to guarantee throughput. Before transmitting a succeeding window, S-UDP enforces strict flow-control boundaries by demanding an `08 ACK` for the oldest tracked window. This ensures memory efficiency and prevents bufferbloat.

2. **Per-Window Gap-Filling & Error Recovery**
   If intermediate packets are dropped over the network, the protocol engages a transparent, per-window gap-filling mechanism. Retransmission tasks are securely scoped to their respective windows, executing precise packet recovery without blocking the ongoing stream delivery.

3. **Synthetic ACK Triggers**
   Lost end-of-window packets conventionally introduce timing lags. S-UDP circumvents this by utilizing synthetic ACK triggers; the receiver calculates bounds and automatically synthesizes ACK responses for missed bounds, inciting the sender to recover gaps rapidly prior to a timeout.

4. **Exponential RTO Backoff**
   During recovery mode, the Retransmission TimeOut (RTO) dictates timing mechanisms. S-UDP calculates base RTO limits matched with exponential collision backoff. This completely neutralizes the risks of DDoSing the network while aggressively attempting data recovery.

5. **Dynamic Handshake Calibration**
   The client executes dynamic, RTO-managed handshake calibration mapped precisely to match the target server's temporal requirements. This standardizes latencies directly upon connection initiation. 

6. **Fused Session Socket Architecture**
   To eradicate internal lookup lags, session management and network state logic are fused. The `OnlineSession` structure intrinsically embeds the `UdpSocket`, bridging connection data with instantaneous transmission limits.

### Packet Header Geometry
S-UDP achieves exceptional MTU utilization by structuring all packets against an optimized geometry layout, strictly defined across all transmission configurations:

`[ FLAG (1 byte) | SEQ (8 bytes) | PAYLOAD (Variable) ]`

- **FLAG**: Controls the packet directive state (e.g., Handshake, Stream, ACK, FIN).
- **SEQ**: A strictly monotonic 64-bit sequence identifier marking the exact byte boundary.
- **Payload Calculation**: Dynamic math assesses the exact protocol overhead, seamlessly slicing stream data so that `HEAD + PAYLOAD` aligns flawlessly with optimal MTU metrics minus IP fragmentation risks.

### Streaming Pipeline Data Flow
1. **Window Scoping**: Sender packages incoming raw data sequences into discrete sliding window intervals.
2. **Transmission**: Sender asynchronously broadcasts window frames.
3. **Recovery State**: If out-of-order packets arrive or timeout limits are eclipsed, S-UDP activates its exponential recovery timer focused heavily on missing blocks only.
4. **Reassembly**: Receiver buffers overlapping payload chunks efficiently into per-window buffers, generating unified sequences that stream up into the Data Analysis application layer effortlessly.
5. **Termination**: Utilizes synchronized teardowns for proper memory freeing and active session clearing.

---

## Brain (Main Processor)

**File**: `engine/core/brain.py`

The Brain is the central coordinator orchestrating all backend analysis components post protocol assembly.

### Responsibilities:
1. **Packet Reception Engine**: Ingests S-UDP derived unified network stream inputs.
2. **Queue Processing**: Drains robust packet queues in synchronized, batch-limited routines.
3. **DDoS Detection**: Monitors for volumetric bursts executing real-time threshold limit breaks.
4. **Hot Reloading**: Adapts JSON configurations dynamically without restarting background processes.
5. **Metrics Reporting**: Aggregates periodic EPS (Events Per Second) writes against external databases.

### Processing Loop:
```
Every time_window (5s):
1. Drain packet_queue up to 'limit' boundaries
2. If count >= limit:
   - Trigger explicit DDoS ALERT
   - Apply dynamic forensic sampling rate
   - DROP all remainder packets directly (strict tail drop)
3. Else:
   - Decode S-UDP standard JSON payload logs
   - Enrich payloads natively against the MISP Client
   - Vectorize components concurrently
   - Push Tensor data forward to active inference logic
```

---

## PacketReceiver (Network Ingress)

**File**: `engine/core/brain.py`

Operating underneath the S-UDP assembly mechanics, `PacketReceiver` handles all raw ingress cycles.
- **Kernel Buffer Optimizations**: Utilizes extended 4MB socket receive buffers directly against the host OS.
- **Non-blocking I/O**: Select-based mechanisms enabling vast, burst-friendly read polling.
- **Thread Security**: Asynchronous queue bridging prevents race conditions transferring byte arrays to the Brain logic pipeline.

---

## Vectorizer (Log Normalization)

**File**: `engine/core/vectorizer.py`

Converts diverse JSON system logs into highly structured **34-dimensional feature tensors** suitable for the VAETransformer model. 

### Encoding Methodologies:
- **Cyclic Temporal Scaling**: Sin/Cos projection applied natively to timestamp intervals.
- **Role/ID Evaluation**: Extremely optimized CRC32 mathematical bounds scaled within a zero-to-one scope.
- **Structural Entropy**: Shannon entropy calculations analyze shell commands and randomized strings.

---

## UnsupervisedAI (ML Engine)

**File**: `engine/ai/inference.py`

Performs active unsupervised inference, detecting behavior irregularities independently of rule boundaries.
- Batched sequential flows enter Transformer logic grids (`batch_size=64`).
- Assesses structural events through an active **Context Window** evaluating continuous epochs.
- A **Maturity Limit Rating** manages false initial assumptions. Only 'Mature' events interact with production alerts against the Qdrant DB logic limits.

---

## VAETransformer Model

**File**: `engine/ai/model.py`

Combines Variational Autoencoders logic with self-attending Transformers mathematically.
- Reduces `34-dims` vectors → compresses into isolated `64-dim` Latent Spaces.
- Computes comprehensive Mean Squared Error (MSE) constraints against complex KL Divergence mappings.
- Overrun thresholds instantly categorize and write outputs to explicitly defined alerts tables.

---

## MISP Client (Threat Intelligence)

**File**: `engine/core/misp_client.py`

Automatically scrapes IP addresses, Hashes, and critical system strings against active external MISP (Malware Information Sharing Platform) APIs.

---

## Janitor (Data Retention)

**File**: `engine/core/janitor.py`

Operates synchronized purges enforcing the strict system retention bounds automatically:
- Non-Threat Baseline Logs: 30 days.
- Extracted Anomalies: 90 days.
- Critical Known Threats: 1 year (365 days) retention.

---

## API Server & Authentication

**File**: `engine/api/server.py`

FastAPI microservice executing delivery protocols specifically for frontend telemetry and dashboards.
- Utilizes explicit JWT `sub` tokens dictating stringent Role-Based Access Controls (RBAC).

---

## Data Flow Diagrams

### Unified Network & AI Vector Flow
```
1. Target System Endpoint
      |
2. S-UDP Serialization & 2-Window Pipelining
      |
3. Raw Network Transfer Target Host
      |
4. PacketReceiver Raw Read -> S-UDP Byte Assembly
      |
5. Brain.process_queue() 
      |
    +-> MISP Intelligence Merge Routine
      |
6. Vectorizer.vectorize_batch() -> Generating (34-dim Tensors)
      |
7. VAETransformer Model Execution -> Loss Threshold Computation
      |
    +-> Qdrant External Vector Push
    +-> MongoDB Telemetry Storage Push
```

---

## Configuration Reference

**File**: `engine/core/config.jsonc`

```json
{
  "network": {
    "port": 5001,
    "protocol": "s-udp",
    "sudp_max_window": 2
  },
  "brain": {
    "time_window": 5.0,
    "max_sequence": 100,
    "ddos_threshold": 50
  },
  "ai_engine": {
    "ai_context_epochs": 5,
    "ai_anomaly_threshold": 0.9
  },
  "forensics": {
    "sample_rate": 100,
    "misp_enabled": true
  }
}
```

---

## Version
Document Version: 2.0 (S-UDP Integration Complete)
Generated: 2026
