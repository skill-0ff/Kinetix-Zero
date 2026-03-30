import socket
import json
import os
import time
import logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

# Setup minimal fast logging
logging.basicConfig(level=logging.INFO, format="[Collector] %(message)s")

# Configuration
LISTEN_PORT = 5000
FORWARD_PORT = 5001
HOST = '127.0.0.1'
KEY_FILE = "engine/collector/collector.key"

# State
current_key = None
last_key_time = 0
aesgcm = None
replay_cache = {}

def load_key_if_changed():
    global current_key, last_key_time, aesgcm
    try:
        mtime = os.path.getmtime(KEY_FILE)
        if mtime > last_key_time:
            with open(KEY_FILE, "r") as f:
                hex_key = f.read().strip()
            if len(hex_key) == 64:
                current_key = bytes.fromhex(hex_key)
                aesgcm = AESGCM(current_key)
                last_key_time = mtime
                logging.info("AES-256-GCM Key dynamically loaded/rotated.")
    except Exception as e:
        pass

def normalize_payload(raw_json):
    """Fallback simple normalizer if payload is missing strict schema"""
    try:
        data = json.loads(raw_json.decode('utf-8'))
    except:
        return None

    if "role" in data and "host" in data and "event" in data:
        return raw_json  # Already canonical

    # Build canonical format matching the old C logic simply
    now = time.strftime("%H:%M:%S.000")
    canon = {
        "role": data.get("role", "POST_SERV"),
        "timestamp_ref": data.get("timestamp", now),
        "host": {"id": data.get("host_id", data.get("id", "unknown-host"))},
        "event": {"type": "logging"}
    }
    
    # Inject all keys
    for k, v in data.items():
        if k not in ["role", "host", "event", "timestamp"]:
            canon["event"][k] = v
            
    return json.dumps(canon).encode('utf-8')

def start_collector():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    # Give it a 4MB buffer specifically for extreme microbursts (requires admin on some OS, but python attempts best effort)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
    sock.bind(('0.0.0.0', LISTEN_PORT))
    
    forward_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    logging.info(f"Listening on UDP {LISTEN_PORT}. Forwarding canonical events to UDP {FORWARD_PORT}")

    load_key_if_changed()

    while True:
        try:
            data, addr = sock.recvfrom(65535)
            
            # Ultra-fast polling cache (~ns speeds)
            load_key_if_changed()

            if not aesgcm:
                continue

            # Payload: 12 bytes IV + 16 bytes Tag + Ciphertext
            if len(data) < 30:
                continue
                
            iv = data[:12]
            tag = data[12:28]
            ciphertext = data[28:]
            
            # The cryptography AESGCM class expects ciphertext to include the tag at the end!
            # We shipped the auth tag immediately after the IV in our sender script, so we append the tag to ciphertext.
            cryptography_payload = ciphertext + tag

            try:
                plaintext = aesgcm.decrypt(iv, cryptography_payload, None)
            except InvalidTag:
                # Tampered packet, malicious actor, or wrong key
                continue

            # Replay Protection tracking
            # Expected plaintext format must be json
            if not plaintext.startswith(b'{'):
                continue
                
            try:
                log_data = json.loads(plaintext.decode('utf-8'))
            except:
                continue
                
            # strict timestamp check
            packet_ts = log_data.get("timestamp")
            if packet_ts is None:
                continue
                
            sender_ip = addr[0]
            if sender_ip in replay_cache:
                if packet_ts <= replay_cache[sender_ip]:
                    # Dropped: Replay Attack
                    continue
            
            replay_cache[sender_ip] = packet_ts
            
            # Send immediately to brain
            normalized = normalize_payload(plaintext)
            if normalized:
                forward_sock.sendto(normalized, (HOST, FORWARD_PORT))

        except Exception as e:
            pass

if __name__ == "__main__":
    start_collector()
