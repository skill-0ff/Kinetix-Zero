import redis
import time
import uuid
import sys
import os

# Add paths for imports
sys.path.append(os.path.join(os.getcwd(), "engine", "core"))
sys.path.append(os.path.join(os.getcwd(), "engine", "ai"))

try:
    import kinetix_pb2
except ImportError:
    print("Error: kinetix_pb2 not found. Run protoc first.")
    sys.exit(1)

def verify():
    r = redis.Redis(host='localhost', port=6379, db=0)
    
    # 1. Clear queues for clean test
    r.delete("kinetix_ingest")
    r.delete("kinetix_storage")
    
    # 2. Create Mock Packet
    pkt = kinetix_pb2.KinetixPacket()
    pkt.role = "WEB_SERVER"
    pkt.host.id = "test-host-001"
    pkt.host.os = "LINUX"
    pkt.host.ip = "192.168.1.10"
    pkt.host.mac = "00:11:22:33:44:55"
    
    # Setup a process event
    pkt.process.type = "START"
    pkt.process.pid = 1234
    pkt.process.ppid = 1
    pkt.process.name = "nginx"
    pkt.process.path = "/usr/sbin/nginx"
    pkt.process.args.append("-g")
    pkt.process.args.append("daemon off;")
    
    # Credentials (should be cleared by brain)
    pkt.auth.username = "admin"
    pkt.auth.password = "secret123"
    
    print(f"[*] Sending test packet to 'kinetix_ingest'...")
    r.rpush("kinetix_ingest", pkt.SerializeToString())
    
    print("[*] Waiting for processing (5s)...")
    time.sleep(5)
    
    # 3. Check Storage Queue
    stored = r.lpop("kinetix_storage")
    if not stored:
        print("[!] ERROR: No packet found in 'kinetix_storage'.")
        return

    res = kinetix_pb2.KinetixPacket()
    res.ParseFromString(stored)
    
    print("\n[+] VERIFICATION RESULTS:")
    print(f"    - UUID: {res.uuid}")
    print(f"    - AI Verdict: {res.ai_verdict}")
    print(f"    - AI Score: {res.ai_anomaly_score:.4f}")
    print(f"    - Server TS: {res.server_ts}")
    print(f"    - Auth Cleared: {not res.auth.password}")
    
    if res.uuid and res.ai_verdict and res.server_ts > 0 and not res.auth.password:
        print("\n[SUCCESS] Pipeline is fully functional and pure binary!")
    else:
        print("\n[FAILURE] Some fields are missing or incorrect.")

if __name__ == "__main__":
    verify()
