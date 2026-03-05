import socket
import json
import time

TARGET_IP = "127.0.0.1"
TARGET_PORT = 5000

print(f"Sending test logs to {TARGET_IP}:{TARGET_PORT} (Collector Port)...")
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

for i in range(5):
    log = {
        "event_id": f"test_{i}",
        "message": "This is a test log sent to the C collector.",
        "level": "INFO",
        "timestamp": time.time()
    }
    payload = json.dumps(log).encode('utf-8')
    sock.sendto(payload, (TARGET_IP, TARGET_PORT))
    print(f"Sent: {log['event_id']}")
    time.sleep(0.5)

print("Done.")
