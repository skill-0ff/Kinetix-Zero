import socket
import json
import time
import random
import argparse
import sys

# Simulation Data
ROLES = ["Workstation", "Server", "Database", "Firewall"]
OS_TYPES = ["Windows", "Linux", "MacOS"]
ACTIONS_NORMAL = ["Read", "Write", "Execute", "Connect"]
ACTIONS_ATTACK = ["Inject", "Overflow", "Scan", "Shell"]

class TrafficGenerator:
    def __init__(self, host="127.0.0.1", port=5001, protocol="udp"):
        self.host = host
        self.port = port
        self.protocol = protocol
        
        try:
            if protocol == "udp":
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            else:
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.connect((host, port))
            print(f"[Generator] Connected to {host}:{port}/{protocol}")
        except Exception as e:
            print(f"[Error] Connection failed: {e}")
            sys.exit(1)

    def generate_log(self, role="Workstation", mode="normal"):
        # Base Identity (Maturity Check: If normal, send maturity < 1.0 for training?)
        # User requested AI trains on good traffic.
        # Let's say Maturity 0.5 = Learning, 1.0 = Enforcing.
        
        maturity = 0.5 if mode == "normal" else 1.0
        
        # Identity
        identity = {
            "role": role,
            "id": f"device_{random.randint(1000, 9999)}",
            "os": random.choice(OS_TYPES),
            "ip": f"192.168.1.{random.randint(2, 254)}",
            "mac": "00:00:00:00:00:00",
            "maturity": maturity
        }
        
        # Activity
        if mode == "normal":
            action = random.choice(ACTIONS_NORMAL)
            file_entropy = random.uniform(3.0, 5.0)
            net_port = random.choice([80, 443, 53, 22])
        else: # Attack
            action = random.choice(ACTIONS_ATTACK)
            file_entropy = random.uniform(7.0, 9.0) # High entropy = malware
            net_port = random.choice([4444, 6667, 1337])
            
        return {
            "identity": identity,
            "timestamp": time.time(),
            "event": {
                "user": "admin" if mode == "attack" else "user",
                "action": action,
                "direction": "outbound",
                "process": "svchost.exe" if mode == "normal" else "powershell.exe",
                "file_path": "/bin/bash" if mode == "normal" else "/tmp/.script.sh",
                "file_entropy": file_entropy
            },
            "network": {
                "protocol": "TCP",
                "src_ip": identity["ip"],
                "dst_ip": "10.0.0.1",
                "port": net_port,
                "bytes": random.randint(100, 100000)
            }
        }

    def send(self, count=100, delay=0.01, role="Workstation", mode="normal"):
        print(f"[Sending] {count} logs (Role={role}, Mode={mode})...")
        for i in range(count):
            log = self.generate_log(role, mode)
            data = json.dumps(log).encode('utf-8')
            
            if self.protocol == "udp":
                self.sock.sendto(data, (self.host, self.port))
            else:
                self.sock.sendall(data + b"\n") # Newline for stream
            
            if delay > 0:
                time.sleep(delay)
                
        print("[Done]")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--delay", type=float, default=0.00)
    parser.add_argument("--role", type=str, default="Workstation")
    parser.add_argument("--mode", type=str, default="normal", choices=["normal", "attack"])
    parser.add_argument("--port", type=int, default=5001)
    
    args = parser.parse_args()
    
    gen = TrafficGenerator(port=args.port)
    gen.send(args.count, args.delay, args.role, args.mode)
