import time
import os
import sys
from unittest.mock import MagicMock

# ensure UPB high performance
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "upb"

import redis
from brain import Brain
import kinetix_pb2

def run_benchmark():
    r = redis.Redis(host='localhost', port=6379)
    q_name = "kinetix_ingest"
    
    # Check if redis is running
    try:
        r.ping()
    except:
        print("Redis not running on localhost:6379, please start it.")
        return

    r.delete(q_name)
    
    print("Generating 100,000 dummy packets...")
    dummy_packets = []
    
    for i in range(100):
        pkt = kinetix_pb2.KinetixPacket()
        pkt.uuid = f"test-{i}"
        pkt.auth.host_id = "agent-x"
        pkt.auth.key = "secret_key"
        
        # Traffic event
        pkt.event.type = "traffic"
        pkt.event.traffic.src_ip = "8.8.8.8"
        pkt.event.traffic.dst_ip = "192.168.1.5"
        pkt.event.traffic.dst_port = "443"
        
        dummy_packets.append(pkt.SerializeToString())
        
    print("Pushing to Redis...")
    pipe = r.pipeline()
    for i in range(100_000):
        pipe.lpush(q_name, dummy_packets[i % 100])
        if i > 0 and i % 10000 == 0:
            pipe.execute()
    pipe.execute()
    
    print(f"Redis Queue Size: {r.llen(q_name)}")
    print("Starting Brain pipeline benchmark...")
    
    b = Brain(config_path="engine/core/config.jsonc")
    # Mocking
    b.db = MagicMock()
    b.janitor = None
    b.ai = None
    b.vectorizer = MagicMock() # skip vectorizing for pure ingestion benchmark
    b.misp = MagicMock()
    b.misp.enabled = True
    b.misp._is_public_ip = lambda ip: not ip.startswith("10.") and not ip.startswith("192.168.")
    
    # We will measure the raw pulling + decoding + auth clearing + indicator extraction loop
    q_start_size = r.llen(q_name)
    start = time.time()
    
    while True:
        if r.llen(q_name) == 0:
            break
        time.sleep(0.05)
        
    duration = time.time() - start
    b.running = False
    
    eps = q_start_size / duration
    print(f"Time Taken: {duration:.2f}s")
    print(f"EPS Achieved: {eps:.2f} packets/second")

if __name__ == "__main__":
    run_benchmark()
