import socket
import json
import time
import os
import random
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def pad_pkcs7(data: bytes, block_size=16) -> bytes:
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len] * pad_len)

def send_encrypted_logs(count=10):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server_address = ('127.0.0.1', 5000)
    
    # 16-byte PSK matching collector.c
    psk = b"KinetixZeroSuper" 
    
    protos = ["TCP", "UDP", "ICMP"]
    ips = ["192.168.1.10", "10.0.0.5", "172.16.0.20", "8.8.8.8"]
    
    print(f"Sending {count} AES-Encrypted logs to 127.0.0.1:5000...")
    
    for i in range(count):
        log = {
            "timestamp": time.time(),
            "event": {
                "proto": random.choice(protos),
                "src_ip": random.choice(ips),
                "dest_ip": "192.168.1.1",
                "dest_port": random.randint(20, 1000),
                "action": "allowed",
                "_dev_note": "AES Encrypted Pipeline"
            }
        }
        
        # Serialize to bytes
        json_data = json.dumps(log).encode('utf-8')
        
        # PKCS7 Padding
        padded_data = pad_pkcs7(json_data)
        
        # Generate 16-byte random IV
        iv = os.urandom(16)
        
        # Encrypt AES-128-CBC
        cipher = Cipher(algorithms.AES(psk), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(padded_data) + encryptor.finalize()
        
        # Payload format: [IV (16 bytes)] + [Ciphertext]
        payload = iv + ciphertext
        
        # Send
        sock.sendto(payload, server_address)
        print(f"[{i+1}/{count}] Sent Encrypted Log ({len(payload)} bytes)")
        time.sleep(0.1)

if __name__ == "__main__":
    send_encrypted_logs(20)
