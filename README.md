# SIEM (KinetixZero)

Real-time SIEM pipeline with a UDP collector, AI anomaly engine, FastAPI backend, and React dashboard.

## What This Project Does
- Receives logs over UDP.
- Normalizes logs into a canonical schema.
- Converts logs to vectors and runs unsupervised anomaly detection.
- Stores events/metrics in MongoDB and vectors in Qdrant.
- Exposes API endpoints for auth, status, metrics, threats, config.
- Displays live security telemetry in a React dashboard.

## Architecture
1. `engine/collector/collector.c`
- Listens on UDP `5000`.
- Normalizes incoming JSON when needed.
- Forwards canonical payloads to UDP `5001`.

2. `engine/core/brain.py`
- Receives forwarded packets from UDP `5001`.
- Buffers/aggregates traffic.
- Applies DDoS guard logic from config.
- Sends normalized vectors to AI worker.

3. `engine/ai/inference.py`
- Runs unsupervised model inference/training loop.
- Assigns verdicts (`NEW ANOMALY`, `KNOWN THREAT`, `FALSE POSITIVE`, safe patterns).
- Persists events/metrics to MongoDB and vectors to Qdrant.

4. `engine/api/server.py`
- FastAPI service on port `8000`.
- JWT auth + protected endpoints for dashboard/API clients.

5. `frontend/`
- Vite + React UI (default dev port `5173`).

## Project Structure
- `engine/collector/` C UDP collector (`collector.exe`, `Makefile`)
- `engine/core/` brain, vectorization, janitor, config
- `engine/ai/` model + inference worker
- `engine/api/` auth + FastAPI API
- `frontend/` React dashboard
- `DB/` local runtime data (auth DB, JWT secret, vector DB path if local)

## Requirements
- Python 3.10+ (project currently used with Python 3.14 in this environment)
- Node.js 18+
- MongoDB (local or remote)
- Qdrant (local path mode or remote URL)
- GCC/MinGW (only if rebuilding collector from C source)

## Python Dependencies
Root dependencies:
```bash
pip install -r requirement.txt
```

API dependencies:
```bash
pip install -r engine/api/requirements.txt
```

## Frontend Dependencies
```bash
cd frontend
npm install
```

## Configuration
Main config file:
- `engine/core/config.jsonc`

Important keys:
- `port`: Brain UDP input (default `5001`)
- `qdrant_path` or `qdrant_url`
- `mongo_uri`
- `ai_anomaly_threshold`
- `max_sequence`, `ddos_threshold`, `max_queue_size`
- `storage_policy`, `alert_policy`, `retention_policy`

Environment overrides supported in code:
- `MONGO_URI`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `MISP_API_KEY`
- `JWT_SECRET`

## Run the System
Open separate terminals from project root `SIEM`.

1. Start collector (Windows executable):
```powershell
.\engine\collector\collector.exe
```

If you need to build it first:
```powershell
cd engine\collector
mingw32-make
```

2. Start brain:
```powershell
python engine\core\brain.py
```

3. Start API:
```powershell
python -m uvicorn engine.api.server:app --host 0.0.0.0 --port 8000
```

4. Start frontend:
```powershell
cd frontend
npm run dev
```

Dashboard URL:
- `http://localhost:5173`

## Authentication
- Auth DB is SQLite at `DB/users.db`.
- On first run, a default `admin` user is created.
- A random admin password is printed once in API console logs.
- JWT signing secret is stored at `DB/.jwt_secret` unless `JWT_SECRET` is provided.

## API Endpoints
All except `/token` require Bearer auth.

- `POST /token` login
- `GET /users/me`
- `GET /metrics`
- `GET /logs`
- `GET /threats`
- `GET /status`
- `GET /stats`
- `GET /config`
- `POST /config` (admin role)

## Send Test Traffic
Scripts included:
- `test_sender.py`
- `engine/collector/test_send.py`

Example:
```powershell
python test_sender.py
```

## Troubleshooting
- `No module named pytest`: test framework not installed by default.
- `npm.ps1 execution policy` error on PowerShell: run npm via `cmd /c npm ...` or adjust execution policy.
- `vite`/`eslint` not found: run `npm install` in `frontend`.
- API startup error about `python-multipart`: install API deps (`pip install -r engine/api/requirements.txt`).
- If `mongo_uri`/`qdrant_url` from JSONC seem broken, ensure config is valid JSONC syntax.

## Current Testability Notes
- No formal automated test suite is configured yet.
- Existing "test" files are traffic generators/integration helpers, not unit tests.

## Security Notes
- Change the default admin password after first login.
- Use TLS for remote MongoDB/Qdrant.
- Keep `DB/.jwt_secret` private.
