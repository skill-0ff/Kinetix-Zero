#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_DIR=".runlogs"
mkdir -p "$LOG_DIR"

echo "Starting SIEM stack from $SCRIPT_DIR"

start_component() {
    local name="$1"
    local cmd="$2"
    local dir="${3:-$SCRIPT_DIR}"
    
    local out_log="$LOG_DIR/${name}.out.log"
    local err_log="$LOG_DIR/${name}.err.log"
    
    (cd "$dir" && eval "$cmd") > "$out_log" 2> "$err_log" &
    local pid=$!
    echo "$pid"
}

# 1. MongoDB
MONGO_PID=""
if command -v mongod >/dev/null 2>&1; then
    mkdir -p "$SCRIPT_DIR/DB/mongo-data"
    mongod --dbpath "$SCRIPT_DIR/DB/mongo-data" --bind_ip 127.0.0.1 --port 27017 > "$LOG_DIR/mongo.out.log" 2> "$LOG_DIR/mongo.err.log" &
    MONGO_PID=$!
    echo "MongoDB started (PID $MONGO_PID)"
else
    echo "Warning: mongod not found in PATH. Dashboard data will not update without MongoDB."
fi

# 2. API Server
API_PID=$(start_component "api" "python -m uvicorn engine.api.server:app --host 0.0.0.0 --port 8000")
echo "API started (PID $API_PID)"

# 3. Collector
COLLECTOR_PID=$(start_component "collector" "python engine/collector/collector.py")
echo "Collector started (PID $COLLECTOR_PID)"

# 4. AI Brain
BRAIN_PID=$(start_component "brain" "TORCH_COMPILE_DISABLE=1 PYTHONUNBUFFERED=1 PYTHONPATH=. python engine/core/brain.py")
echo "Brain started (PID $BRAIN_PID)"

# 5. Frontend
FRONTEND_PID=$(start_component "frontend" "npm run dev" "$SCRIPT_DIR/frontend")
echo "Frontend started (PID $FRONTEND_PID)"

# Save PIDs
cat <<EOF > "$LOG_DIR/pids.txt"
api=$API_PID
collector=$COLLECTOR_PID
brain=$BRAIN_PID
frontend=$FRONTEND_PID
EOF

if [ -n "$MONGO_PID" ]; then
    echo "mongo=$MONGO_PID" >> "$LOG_DIR/pids.txt"
fi

echo ""
echo "Done."
echo "Dashboard: http://localhost:5173"
echo "API docs:  http://localhost:8000/docs"
echo "Logs:      $SCRIPT_DIR/$LOG_DIR"
