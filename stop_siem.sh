#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.runlogs/pids.txt"

if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found at $PID_FILE"
    exit 0
fi

# Function to recursively kill a process and all its children
kill_tree() {
    local pid=$1
    # Check if PID exists
    if kill -0 "$pid" 2>/dev/null; then
        # Recursively kill children
        if command -v pgrep >/dev/null 2>&1; then
            for child in $(pgrep -P "$pid" 2>/dev/null); do
                kill_tree "$child"
            done
        fi
        kill -9 "$pid" 2>/dev/null || true
        echo "Stopped PID $pid and its child processes"
    fi
}

echo "Stopping SIEM stack..."

while IFS='=' read -r name pid; do
    if [[ -n "$pid" ]] && [[ "$pid" =~ ^[0-9]+$ ]]; then
        kill_tree "$pid"
    fi
done < "$PID_FILE"

# Clean up PID file
rm -f "$PID_FILE"

echo "Done."
