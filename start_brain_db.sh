#!/bin/bash

# Configuration
DB_DIR="$(pwd)/DB/event"
LOG_FILE="$(pwd)/DB/mongo.log"
PORT=27017

echo "[Brain DB] Starting Local MongoDB..."
echo "  > Data: $DB_DIR"
echo "  > Port: $PORT"

# Ensure Directory
mkdir -p "$DB_DIR"

# Check if running
if pgrep -x "mongod" > /dev/null
then
    echo "[!] mongod is already running. Please stop system mongo if you want to use this local instance."
    echo "    sudo systemctl stop mongod"
    exit 1
fi

# Start Mongo
mongod --dbpath "$DB_DIR" --port $PORT --fork --logpath "$LOG_FILE" --bind_ip 127.0.0.1

echo "[Brain DB] Database Started."
echo "  > To stop: mongod --shutdown --dbpath $DB_DIR"
