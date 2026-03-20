import socket
import json
import time
import os
import random
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def send_encrypted_logs(count=10):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server_address = ('127.0.0.1', 5000)
    
    # 32-byte Hex PSK loaded from collector.key
    # We use a fixed key for the demo matching the generated collector.key
    hex_key_string = "5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b"
    psk = bytes.fromhex(hex_key_string)
    
    protos = ["TCP", "UDP", "ICMP"]
    ips = ["192.168.1.10", "10.0.0.5", "172.16.0.20", "8.8.8.8"]
    
    print(f"Sending {count} AES-256-GCM Encrypted logs to 127.0.0.1:5000...")
    
    for i in range(count):
        # The timestamp acts as our sequence/replay protection
        packet_ts = time.time()
        
        log = {
            "timestamp": packet_ts, 
            "event": {
                "proto": random.choice(protos),
                "src_ip": random.choice(ips),
                "dest_ip": "192.168.1.1",
                "dest_port": random.randint(20, 1000),
                "action": "allowed",
                "_dev_note": "AES-256-GCM Encrypted Pipeline with Anti-Replay"
            }
        }
        
        # Serialize to bytes (No PKCS7 padding required for GCM!)
        json_data = json.dumps(log).encode('utf-8')
        
        # Generate 12-byte random IV/Nonce for GCM
        iv = os.urandom(12)
        
        # Encrypt AES-256-GCM
        cipher = Cipher(algorithms.AES(psk), modes.GCM(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        
        ciphertext = encryptor.update(json_data) + encryptor.finalize()
        tag = encryptor.tag # 16-byte Authentication Tag
        
        # Payload format: [12B IV] + [16B TAG] + [CIPHERTEXT]
        payload = iv + tag + ciphertext
        
        # Send
        sock.sendto(payload, server_address)
        print(f"[{i+1}/{count}] Sent AES-GCM Log ({len(payload)} bytes)")
        time.sleep(0.1)

if __name__ == "__main__":
    send_encrypted_logs(20)
