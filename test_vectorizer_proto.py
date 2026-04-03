import sys
import os
import numpy as np

# Add core to path
sys.path.append(os.path.join(os.getcwd(), "engine", "core"))
import kinetix_pb2
from vectorizer import LogNormalizer

def test_vectorizer_protobuf():
    print("--- Starting Vectorizer Protobuf Test ---")
    
    # 1. Initialize LogNormalizer
    # We'll use a dummy config path
    ln = LogNormalizer("engine/core/config.jsonc")
    
    # 2. Create a dummy packet
    pkt = kinetix_pb2.KinetixPacket()
    pkt.role = "WORKSTATION"
    pkt.host.id = "ABCDEF"
    pkt.host.os = "Windows 11"
    pkt.host.ip = "192.168.1.50"
    pkt.host.mac = "AA:BB:CC:DD:EE:FF"
    pkt.timestamp_ref = "2026-04-03T00:00:00.123Z"
    pkt.server_ts = "2026-04-03T00:00:01.456Z"
    pkt.status.cpu = "15%"
    pkt.status.ram = "42%"
    pkt.status.disk = "80%"
    
    # Add an event
    event = pkt.event
    event.type = "process_start"
    event.process_start.process = "notepad.exe"
    event.process_start.path = "C:\\Windows\\System32\\notepad.exe"
    event.process_start.user = "Admin"
    
    # 3. Vectorize
    print("Vectorizing packet...")
    vector = ln.input_to_vector(pkt)
    
    if vector is None:
        print("[FAILURE] Vectorization returned None!")
        return
        
    print(f"[SUCCESS] Vector length: {len(vector)}")
    print(f"[SUCCESS] Vector snapshot: {vector[:10]}...")
    
    # Verify some key indices
    # index 0: Role score
    # index 1: Host ID hash
    # index 13: Event type hash
    # index 18: Process top-k score
    
    print(f"Role score (idx 0): {vector[0]}")
    print(f"Event type hash (idx 13): {vector[13]}")
    print(f"Process score (idx 18): {vector[18]}")
    
    if vector[13] != 0.0 and vector[18] != 0.0:
        print("\n[VERIFIED] Event fields correctly processed via Protobuf.")
    else:
        print("\n[FAILURE] Event fields missing in vector!")

if __name__ == "__main__":
    try:
        test_vectorizer_protobuf()
    except Exception as e:
        print(f"Test Error: {e}")
        import traceback
        traceback.print_exc()
