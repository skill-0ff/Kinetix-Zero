import socket
import kinetix_pb2
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
import sys

def run_test():
    host = "127.0.0.1"
    port = 5001
    
    print(f"--- Handshake Test: Connecting to {host}:{port} ---")
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))
        
        # 1. Send HandshakeRequest
        req = kinetix_pb2.HandshakeRequest()
        req.host_id = "test_agent_001"
        s.sendall(req.SerializeToString())
        print("-> Sent HandshakeRequest")
        
        # 2. Receive HandshakeResponse (Server Public Key)
        data = s.recv(2048)
        resp = kinetix_pb2.HandshakeResponse()
        resp.ParseFromString(data)
        
        if resp.status != "OK":
            print(f"❌ Handshake failed: {resp.status}")
            return
        
        server_pub_bytes = resp.server_public_key
        server_public = x25519.X25519PublicKey.from_public_bytes(server_pub_bytes)
        print("<- Received Server Public Key")
        
        # 3. Generate Ephemeral Key and Derive Shared Secret (ECDH)
        ephemeral_private = x25519.X25519PrivateKey.generate()
        ephemeral_public = ephemeral_private.public_key()
        shared_secret = ephemeral_private.exchange(server_public)
        print("-> Derived Shared Secret")
        
        # 4. Prepare Payload
        payload = kinetix_pb2.HandshakePayload()
        payload.host_id = "test_agent_001"
        payload.token = "secret_token_123"
        payload.agent_public_key = b"A" * 32 # Dummy agent pub key
        
        payload_bytes = payload.SerializeToString()
        
        # 5. Encrypt Payload (ChaCha20-Poly1305)
        nonce = os.urandom(12)
        chacha = ChaCha20Poly1305(shared_secret)
        encrypted_payload = chacha.encrypt(nonce, payload_bytes, None)
        print("-> Encrypted Auth Payload")
        
        # 6. Send AgentAuthRequest
        auth_req = kinetix_pb2.AgentAuthRequest()
        auth_req.ephemeral_public_key = ephemeral_public.public_bytes_raw()
        auth_req.nonce = nonce
        auth_req.encrypted_payload = encrypted_payload
        s.sendall(auth_req.SerializeToString())
        print("-> Sent AgentAuthRequest")
        
        # 7. Receive Final Status
        final_status = s.recv(1024)
        print(f"<- Response: {final_status.decode()}")
        
        if final_status == b"AUTH_SUCCESS":
            print("✅ TEST PASSED")
        else:
            print("❌ TEST FAILED")
            
        s.close()
        
    except Exception as e:
        print(f"❌ Socket Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import os
    run_test()
