import socket
import kinetix_pb2
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
import sys
import os
import time

def run_test():
    host = "127.0.0.1"
    port = 5001
    agent_id = "test_agent_001"
    
    print(f"--- Handshake & Session Test: {host}:{port} ---")
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, port))
        
        # 1. Send HandshakeRequest
        req = kinetix_pb2.HandshakeRequest()
        req.host_id = agent_id
        s.sendall(req.SerializeToString())
        print(f"-> Sent HandshakeRequest for {agent_id}")
        
        # 2. Receive HandshakeResponse
        data = s.recv(2048)
        resp = kinetix_pb2.HandshakeResponse()
        resp.ParseFromString(data)
        
        if resp.status != "OK":
            print(f"❌ Handshake failed: {resp.status}")
            return
        
        server_pub_bytes = resp.server_public_key
        server_public = x25519.X25519PublicKey.from_public_bytes(server_pub_bytes)
        print("<- Received Server Public Key")
        
        # 3. ECDH
        ephemeral_private = x25519.X25519PrivateKey.generate()
        ephemeral_public = ephemeral_private.public_key()
        shared_secret = ephemeral_private.exchange(server_public)
        
        # 4. Encrypt Payload
        payload = kinetix_pb2.HandshakePayload()
        payload.host_id = agent_id
        payload.token = "secret_token_123"
        payload.agent_public_key = b"A" * 32
        
        nonce = os.urandom(12)
        chacha = ChaCha20Poly1305(shared_secret)
        encrypted_payload = chacha.encrypt(nonce, payload.SerializeToString(), None)
        
        # 5. Send AgentAuthRequest
        auth_req = kinetix_pb2.AgentAuthRequest()
        auth_req.ephemeral_public_key = ephemeral_public.public_bytes_raw()
        auth_req.nonce = nonce
        auth_req.encrypted_payload = encrypted_payload
        s.sendall(auth_req.SerializeToString())
        print("-> Sent AgentAuthRequest")
        
        # 6. Verify Auth Success
        final_status = s.recv(1024)
        print(f"<- Collector: {final_status.decode()}")
        
        if final_status == b"AUTH_SUCCESS":
            print("✅ Handshake Success! Session is PENDING.")
            
            # 7. Transition to ONLINE by sending an Event
            print("-> Sending Event (Triggering ONLINE transition)...")
            packet = kinetix_pb2.KinetixPacket()
            packet.uuid = "evt-001"
            packet.event.type = "process_start"
            # No Auth field needed now!
            s.sendall(packet.SerializeToString())
            
            # 8. Send Idle (Heartbeat)
            time.sleep(1)
            print("-> Sending Idle message...")
            idle_pkt = kinetix_pb2.KinetixPacket()
            idle_pkt.uuid = "idle-001"
            idle_pkt.idle.message = "System is quiet."
            s.sendall(idle_pkt.SerializeToString())
            
            print("✅ TEST COMPLETE - Session maintained.")
        else:
            print("❌ AUTH FAILED")
            
        time.sleep(2)
        s.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_test()
