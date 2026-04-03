import socket
import time
import sys
import os
import random

# Add engine path to import Protobuf
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import kinetix_pb2

def stress_test(duration=20):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server_addr = ("127.0.0.1", 5001)
    
    print(f"--- Kinetix-Zero Sustained 20s Performance Test ---")
    
    # Auth fetching
    from pymongo import MongoClient
    client = MongoClient("mongodb://localhost:27017/")
    agent = client["kinetix_brain"]["agents"].find_one({"host_id": "test-agent-001"})
    auth_key = agent["key"]
    role = agent["role"]
    
    start_time = time.time()
    end_time = start_time + duration
    sent_count = 0
    
    while time.time() < end_time:
        pkt = kinetix_pb2.KinetixPacket()
        pkt.time_of_packet = str(time.time())
        pkt.auth.host_id = "test-agent-001"
        pkt.auth.key = auth_key
        pkt.role = role
        pkt.event.type = "process_start"
        pkt.event.process_start.process = "stress.exe"
        
        sock.sendto(pkt.SerializeToString(), server_addr)
        sent_count += 1
        
        if sent_count % 5000 == 0:
            elp = time.time() - start_time
            print(f"Sent {sent_count} packets... (Current EPS: {int(sent_count/elp)})")
            
    total_time = time.time() - start_time
    avg_eps = int(sent_count / total_time)
    print(f"\n--- Sustained Test Complete ---")
    print(f"Total Sent: {sent_count}")
    print(f"Average Receive EPS: {avg_eps}")

if __name__ == "__main__":
    stress_test()

if __name__ == "__main__":
    stress_test()
