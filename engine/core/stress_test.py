import socket
import kinetix_pb2
import threading
import time
import os

# Configuration
HOST = "127.0.0.1"
PORT = 5001
CONCURRENT_AGENTS = 50
DURATION = 30 # seconds

def simulate_agent(agent_id):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((HOST, PORT))
        
        # 1. Simple Handshake (Optimized for speed)
        req = kinetix_pb2.HandshakeRequest(host_id=agent_id)
        s.sendall(req.SerializeToString())
        resp_data = s.recv(2048) # Response contains public key (ignored for stress)
        
        # In a real test we'd do the full ECIES, but for EPS stress we 
        # assume the collector allows the connection or we bypass auth check if needed.
        # Since the collector we wrote REQUIRES auth, we must do it once.
        # But we'll use a pre-calculated auth packet to save client CPU.
        
        # For simplicity, we'll do the handshake once then spam events.
        # (Using the same logic as verify_lifecycle but loops)
        # ⚠️ NOTE: This requires the collector to be in MOCK mode or have valid tokens.
        
        # Send AUTH (Mock token: secret_token_123)
        # (Simplified for the test script)
        # Just sending the "AUTH_SUCCESS" trigger if we were in mock mode, 
        # but our collector has a real state machine.
        
        # 2. Spam Events
        packet = kinetix_pb2.KinetixPacket()
        packet.event.type = "stress_test"
        packet_bytes = packet.SerializeToString()
        
        # Wait for potential AUTH_SUCCESS if we sent valid data
        # To keep it simple, we'll just spam and let the collector drops if unauth
        # BUT we want to measure SUCCESSFUL events (EPS counts successful decodes).
        
        # Let's perform a minimal valid handshake first.
        # ... (Handshake omitted for brevity, assuming mock mode or pre-auth)
        # Wait, if we don't auth, handle_session_packet won't be called.
        # So we MUST auth.
        
        # Let's use a simplified valid handshake sequence
        from cryptography.hazmat.primitives.asymmetric import x25519
        from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
        
        resp = kinetix_pb2.HandshakeResponse()
        resp.ParseFromString(resp_data)
        server_pub = x25519.X25519PublicKey.from_public_bytes(resp.server_public_key)
        ephemeral_private = x25519.X25519PrivateKey.generate()
        shared_secret = ephemeral_private.exchange(server_pub)
        
        payload = kinetix_pb2.HandshakePayload(host_id=agent_id, token="secret_token_123", agent_public_key=b"A"*32)
        nonce = os.urandom(12)
        encrypted_payload = ChaCha20Poly1305(shared_secret).encrypt(nonce, payload.SerializeToString(), None)
        
        auth_req = kinetix_pb2.AgentAuthRequest(
            ephemeral_public_key=ephemeral_private.public_key().public_bytes_raw(),
            nonce=nonce,
            encrypted_payload=encrypted_payload
        )
        s.sendall(auth_req.SerializeToString())
        
        if s.recv(1024) == b"AUTH_SUCCESS":
            start_time = time.time()
            count = 0
            while time.time() - start_time < DURATION:
                packet.uuid = f"stress-{agent_id}-{count}"
                s.sendall(packet.SerializeToString())
                count += 1
                # No sleep - absolute max speed
    except Exception:
        pass

def run_stress_test():
    print(f"🚀 Starting Stress Test: {CONCURRENT_AGENTS} agents for {DURATION}s...")
    threads = []
    for i in range(CONCURRENT_AGENTS):
        t = threading.Thread(target=simulate_agent, args=(f"stress_agent_{i:03}",))
        t.start()
        threads.append(t)
    
    for t in threads:
        t.join()
    print("🏁 Stress Test Finished.")

if __name__ == "__main__":
    run_stress_test()
