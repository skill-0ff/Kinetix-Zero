# Project Analysis Report: Kinetix-Zero Engine

## 1. Weakness Analysis

### A. Event Structure (`event_structure_example.txt`)
1.  **Ambiguous Timestamping**: 
    - The structure defines `time_of_packet` (Window), `timestamp_ref` (Host), and `timestamp` (Event).
    - **Weakness:** Redundancy invites inconsistency. If `timestamp_ref` differs significantly from `timestamp`, the correlation engine might drift. The current "Window Timestamp" header approach is a custom JSON modification (heterogeneous list) which breaks standard JSON schema validation tools.
2.  **Implicit Schema**:
    - Fields like `cpu`, `ram` are strings ("10%").
    - **Weakness:** Requires runtime regex parsing (`normalize_size` / `norm`). This is slow and fragile to variations (e.g., "10 %" vs "10%").

### B. Canonical Mapping (`engine/canonical_mapping.jsonc`)
1.  **Hash Collision Risk**:
    - The `encode_categorical` function maps infinite strings to 100,000 buckets (`hash % 100000`).
    - **Weakness:** While low (1/100k), collisions are mathematically guaranteed at scale. An attacker could theoretically craft a malicious filename that hashes to the same value as a critical system binary (e.g., `cmd.exe`), blinding the AI.
    - **Impact:** False negatives in security detection.
2.  **Cyclic Time Normalization**:
    - Slot 15 maps `seconds / 86400`.
    - **Weakness:** This is cyclic (mod 24h). An event at 23:59:59 (0.999) has a Euclidean distance of ~1.0 from 00:00:01 (0.0), despite being 2 seconds apart. This breaks temporal sequencing for boundary events.

### C. Engine Code (`engine/log_vector_normalizer.py`)
1.  **Brittle Input Handling (`do_POST`)**:
    - The server manually checks `if "time_of_packet" in input_data[0]`.
    - **Weakness:** This assumes a strict ordering. If a data pipeline shuffles the batch or drops the header, the entire batch fails or interprets the first event as a header (if validation is loose).
2.  **Performance Bottleneck**:
    - `re.search` is called on *every* size/resource field.
    - `hashlib.sha256` is computed for *every* string field.
    - **Weakness:** Python's CPU bound per-event processing limits throughput. For a high-speed SOC (10k EPS), this Python implementation will lag.

## 2. Improvement Proposals

### A. Phase 1: Robustness (Immediate)
1.  **Schema Validation**: 
    - Adopt **Pydantic** models to rigorously define the Input Schema. Reject malformed events *before* processing logic.
2.  **Cyclic Time Encoding**:
    - Instead of one scalar (0-1), use **Sin/Cos Encoding** for time.
    - `[sin(2*pi*t), cos(2*pi*t)]`. This ensures 23:59 is close to 00:01 in vector space.
    - Requires +1 Dimension (Slot 16).

### B. Phase 2: Performance (Medium Term)
1.  **Embeddings Cache**:
    - Cache the hash of frequent strings (`"explore.exe"`, `"192.168.1.1"`) to avoid re-hashing every time.
    - Use `functools.lru_cache`.
2.  **Vectorization**:
    - Move from Python Lists to **NumPy** arrays. Perform operations in C-optimized blocks.

### C. Phase 3: Architecture (Long Term)
1.  **Learnable Embeddings**:
    - Replace static SHA256 hashing with a **Trainable Embedding Layer** (e.g., PyTorch `nn.Embedding`).
    - Allows the AI to learn that `cmd.exe` and `powershell.exe` are efficiently related, rather than just random random hash distances.
2.  **gRPC / Protobuf**:
    - Replace the ad-hoc JSON over HTTP with **gRPC**.
    - Strict types, binary transport (faster), and clearly defined Window/Event messages.
