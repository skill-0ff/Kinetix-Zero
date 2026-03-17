import socket
import json
import time
import random

def send_test_logs(count=10):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server_address = ('127.0.0.1', 5000)
    
    protos = ["TCP", "UDP", "ICMP"]
    ips = ["192.168.1.10", "10.0.0.5", "172.16.0.20", "8.8.8.8"]
    
    print(f"Sending {count} test logs to 127.0.0.1:5000...")
    
    for i in range(count):
        log = {
            "timestamp": time.time(),
            "event": {
                "proto": random.choice(protos),
                "src_ip": random.choice(ips),
                "dest_ip": "192.168.1.1",
                "dest_port": random.randint(20, 1000),
                "action": "allowed"
            }
        }
        message = json.dumps(log).encode()
        sock.sendto(message, server_address)
        print(f"Sent log {i+1}/{count}")
        time.sleep(0.1)

if __name__ == "__main__":
    send_test_logs(20)
