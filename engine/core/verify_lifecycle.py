import socket
import kinetix_pb2
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from pymongo import MongoClient
import time
import os
import sys

def get_db_status():
    client = MongoClient("mongodb://localhost:27017/")
    db = client.kinetix
    agent = db.agents.find_one({"host_id": "test_agent_001"})
    return agent.get("status") if agent else "NOT_FOUND"

def run_test():
    host = "127.0.0.1"
    port = 5001
    agent_id = "test_agent_001"
    
    print(f"--- 🚀 Session Lifecycle Test ---")
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, port))
        
        # 1. Handshake
        req = kinetix_pb2.HandshakeRequest()
        req.host_id = agent_id
        s.sendall(req.SerializeToString())
        
        data = s.recv(2048)
        resp = kinetix_pb2.HandshakeResponse()
        resp.ParseFromString(data)
        
        server_pub = x25519.X25519PublicKey.from_public_bytes(resp.server_public_key)
        ephemeral_private = x25519.X25519PrivateKey.generate()
        shared_secret = ephemeral_private.exchange(server_pub)
        
        payload = kinetix_pb2.HandshakePayload()
        payload.host_id = agent_id
        payload.token = "secret_token_123"
        payload.agent_public_key = b"B" * 32
        
        nonce = os.urandom(12)
        chacha = ChaCha20Poly1305(shared_secret)
        encrypted_payload = chacha.encrypt(nonce, payload.SerializeToString(), None)
        
        auth_req = kinetix_pb2.AgentAuthRequest()
        auth_req.ephemeral_public_key = ephemeral_private.public_key().public_bytes_raw()
        auth_req.nonce = nonce
        auth_req.encrypted_payload = encrypted_payload
        s.sendall(auth_req.SerializeToString())
        
        final_status = s.recv(1024)
        if final_status == b"AUTH_SUCCESS":
            print("✅ Handshake OK.")
            
            # State Check 1: PENDING
            time.sleep(1)
            status = get_db_status()
            print(f"   [1] Current Status: {status} (Expected: pending)")
            
            # 2. Transition to ONLINE
            print("-> Sending Event...")
            packet = kinetix_pb2.KinetixPacket()
            packet.uuid = "evt-lifecycle"
            packet.event.type = "process_start"
            s.sendall(packet.SerializeToString())
            
            # State Check 2: ONLINE
            time.sleep(1)
            status = get_db_status()
            print(f"   [2] Current Status: {status} (Expected: online)")
            
            # 3. Transition to OFFLINE (Wait for timeout)
            print("-> Closing connection and waiting 15s for timeout...")
            s.close()
            time.sleep(15)
            
            # State Check 3: OFFLINE
            status = get_db_status()
            print(f"   [3] Current Status: {status} (Expected: offline)")
            
            if status == "offline":
                print("\n✨ LIFECYCLE VERIFICATION PASSED! ✨")
            else:
                print("\n❌ LIFECYCLE VERIFICATION FAILED.")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    run_test()
