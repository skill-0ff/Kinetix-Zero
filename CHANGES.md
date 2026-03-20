# Kinetix-Zero SIEM Updates

## [2026-03-20] Security & Stability Overhaul

### Phase 1: Authentication & Frontend Persistence
- **Fixed Persistent Token Theft**: Discovered that `Dashboard.jsx`, `Login.jsx`, and `App.jsx` contained misaligned token storage types. All session state was migrated strictly to `sessionStorage` to mitigate persistent XSS risks.
- **Stopped API Crash Loops**: Fixed the critical `SECRET_KEY` rotation bug in `auth.py`. If no `.env` file existed, the backend rolled a new random key on every restart, immediately invalidating all logged-in users. Added file-backed persistence for the randomly generated fallback secret.
- **Replaced Default Passwords**: Replaced `admin` / `admin` hardcoded password initialization with a randomly generated 16-character secure string printed directly to the console on first launch.
- **Upgraded Hashing Mechanism**: Replaced `passlib` context hashing with direct `bcrypt` bindings to resolve stability issues explicitly found in Python 3.14 on Windows environments.

### Phase 2: Engine Analytics & Classification Rules
- **Fixed Silent AI Statistics Drop**: Added missing initialization call `self._init_metrics()` in the `Brain` logic. Aligned the PyMongo connection contexts (`mongo_metrics` vs `db`) to prevent statistics from failing silently before reaching the UI dashboard.
- **Fixed Model Label Mismatches**: Resolved a mismatch where the classification engine saved `"ai_safe"` / `"New"` but the evaluator evaluated against `"Safe"` / `"Threat"`.
- **Deduplicated Metric Flushing**: Removed severe logic duplication in `brain.py` where `counter_out` and flush-blocks were copy-pasted three times consecutively, causing skewed EPS readings in Kibana/React.

### Phase 3 & 4: The Edge Collector Security Rewrite
The previously vulnerable Edge Collector blindly accepted plaintext UDP traffic without source validation, authentication, or replay protection. Massive architectural shifts were implemented:

1. **Shift to AES-GCM (AEAD)**
   - The edge proxy was rebuilt in Python utilizing the `cryptography` library (OpenSSL AES-NI bindings) to circumvent the lack of Windows Cryptography API (CNG) headers in legacy compiler toolchains like MinGW 6.3.
   - The Collector now enforces strict **AES-256-GCM** Authenticated Encryption with Associated Data.
   - Any UDP payload lacking a valid 16-byte Authentication Tag is instantly mathematically discarded.

2. **Zero-Downtime Key Rotation**
   - The AES Pre-Shared Key (PSK) is fully externalized into `engine/collector/collector.key`.
   - The Collector polls the filesystem metadata `getmtime` on every iteration (~10ns overhead) to verify rotation. Modifying the file instantly rotates the decryption matrix without dropping active listener sockets or restarting the proxy.

3. **Replay Attack Protection (`Anti-Replay`)**
   - Implemented a monotonic timestamp caching table based on source IP `ReplayCache`.
   - Senders inject a monotonic Unix timestamp into their encrypted JSON headers.
   - If an attacker captures an encrypted Syslog payload via Wireshark and resends it later, the Collector logs the older timestamp `packet_ts <= replay_cache[ip]` and instantly drops it, thwarting replay injection vulnerabilities completely.
