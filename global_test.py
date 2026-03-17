import socket
import json
import time
import uuid
import pymongo
from pymongo import MongoClient

# Configuration
COLLECTOR_ADDR = ('127.0.0.1', 5000)
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "kinetix_brain"
COLLECTION_NAME = "events"

def send_log(log_type="safe"):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    event_uuid = uuid.uuid4().hex
    
    if log_type == "safe":
        # Normal lookign process
        log = {
            "host_id": "test-node-01",
            "event_type": "process_start",
            "process": "svchost.exe",
            "path": "C:\\Windows\\System32\\svchost.exe",
            "cmdline": "svchost.exe -k netsvcs",
            "user": "SYSTEM",
            "test_id": event_uuid
        }
    else:
        # Anomaly: Strange process and high entropy cmdline
        log = {
            "host_id": "test-node-01",
            "event_type": "process_start",
            "process": "malware_test.exe",
            "path": "C:\\Temp\\unknown\\x86_64_payload.exe",
            "cmdline": "powershell.exe -e " + "A"*500, # Long base64-like string
            "user": "Administrator",
            "test_id": event_uuid
        }

    message = json.dumps(log).encode()
    sock.sendto(message, COLLECTOR_ADDR)
    print(f"[Test] Sent {log_type} log with test_id: {event_uuid}")
    return event_uuid

def verify_db(test_ids):
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    print("[Test] Waiting for logs to be processed (10s)...")
    time.sleep(10) # Wait for brain flush (5s) + AI processing
    
    found_count = 0
    for tid in test_ids:
        # The collector/brain might nest the original log in 'full_log'
        # or flatten it. Based on inference.py, it's in 'full_log'.
        result = collection.find_one({"full_log.test_id": tid})
        
        if result:
            print(f"[OK] Found log {tid} in DB.")
            print(f"     Verdict: {result.get('verdict')}")
            print(f"     Score: {result.get('score')}")
            found_count += 1
        else:
            print(f"[FAIL] Could not find log {tid} in DB.")
            
    return found_count == len(test_ids)

if __name__ == "__main__":
    print("=== SIEM GLOBAL INTEGRATION TEST ===")
    
    # 1. Ensure services are running (Manual check or we could try to ping API)
    # This test assumes the SIEM pipeline is active.
    
    ids = []
    ids.append(send_log("safe"))
    ids.append(send_log("anomaly"))
    
    success = verify_db(ids)
    
    if success:
        print("\n[SUCCESS] Global Test Passed!")
    else:
        print("\n[FAILURE] Global Test Failed!")
        exit(1)
