import socket
import json
import time
import os
import sys
import threading
import datetime
import select
import random
import uuid
import psutil
from pymongo import MongoClient

# --- CONFIG LOADING ---
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.jsonc")

def load_config():
    try:
        with open(CONFIG_PATH, 'r') as f:
            lines = [l for l in f.readlines() if not l.strip().startswith("//")]
            return json.loads("".join(lines))
    except Exception as e:
        print(f"[Collector Error] Config Load Failed: {e}")
        return {}

# --- METRICS & BUFFER ---
class CollectorMetrics:
    def __init__(self):
        self.eps = 0.0
        self.mbps = 0.0
        self.cpu = 0.0
        self.ram = 0.0
        self.dropped_packets = 0
        self.last_update = time.time()
        self._accum_count = 0
        self._accum_bytes = 0

    def update_resource_usage(self):
        try:
            p = psutil.Process(os.getpid())
            self.cpu = round(p.cpu_percent(), 1)
            self.ram = round(p.memory_percent(), 1)
        except: pass

    def calculate_throughput(self):
        now = time.time()
        elapsed = now - self.last_update
        if elapsed >= 1.0:
            self.eps = round(self._accum_count / elapsed, 2)
            self.mbps = round((self._accum_bytes / elapsed) / (1024 * 1024), 4)
            self._accum_count = 0
            self._accum_bytes = 0
            self.last_update = now
            return True
        return False

# --- PACKET RECEIVER ---
class PacketReceiver(threading.Thread):
    def __init__(self, config, metrics):
        super().__init__()
        self.config = config
        self.metrics = metrics
        self.running = True
        self.sock = None
        self.daemon = True
        
        self.port = self.config.get("port", 5001)
        self.protocol = self.config.get("protocol", "udp")
        self.mongo_client = None
        self.mongo_ddos = None
        
        # Hot-Swap Control
        self.rebind_lock = threading.Lock()
        self.needs_rebind = False
        self.needs_db_reconnect = False
        
        self._init_db()
        self.setup_socket()

    def _init_db(self):
        try:
            # Close existing client if any
            if self.mongo_client:
                try: self.mongo_client.close()
                except: pass
                
            uri = self.config.get("mongo_uri", "mongodb://localhost:27017/")
            self.mongo_client = MongoClient(uri, serverSelectionTimeoutMS=2000)
            self.mongo_ddos = self.mongo_client["kinetix_brain"]["ddos"]
            print(f"[Collector] MongoDB connected: {uri.split('@')[-1] if '@' in uri else uri}")
            self.needs_db_reconnect = False
        except Exception as e:
            print(f"[Collector Error] MongoDB Connection Failed: {e}")

    def setup_socket(self):
        with self.rebind_lock:
            try:
                if self.sock:
                    try: self.sock.close()
                    except: pass
                
                # Fetch fresh values from config
                self.port = self.config.get("port", 5001)
                self.protocol = self.config.get("protocol", "udp")
                
                if self.protocol == "udp":
                    self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
                    self.sock.bind(("0.0.0.0", self.port))
                else:
                    self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    self.sock.bind(("0.0.0.0", self.port))
                    self.sock.listen(5)
                
                self.sock.setblocking(0)
                print(f"[Collector] RE-BOUND to {self.protocol.upper()} {self.port} (Buffer: 4MB)")
                self.needs_rebind = False
            except Exception as e:
                print(f"[Collector Error] Socket Re-bind Failed: {e}")

    def forensic_sampling(self, batch):
        """Handles saving DDoS forensic data to MongoDB and dropping packets."""
        rate = int(self.config.get("forensic_sample_rate", 10))
        save_evidence = self.config.get("storage_policy", {}).get("save_logs", {}).get("ddos_evidence", True)
        
        if not self.mongo_ddos or not batch or rate <= 0 or not save_evidence:
            return

        try:
            sample_count = max(1, int(len(batch) * (rate / 100.0)))
            indices = random.sample(range(len(batch)), min(sample_count, len(batch)))
            samples = []
            
            for i in indices:
                try:
                    data = json.loads(batch[i])
                    data["_evidence_type"] = "collector_ingress_drop"
                    data["verdict"] = "DDoS"
                    data["uuid"] = str(uuid.uuid4())
                    data["timestamp"] = time.time()
                    samples.append(data)
                except: pass
            
            if samples:
                self.mongo_ddos.insert_many(samples, ordered=False)
                print(f"[Collector] Saved {len(samples)} DDoS forensic samples.")
        except Exception as e:
            print(f"[Collector Error] Forensic Sampling Failed: {e}")

    def run(self):
        _sock = self.sock
        _select = select.select
        
        # DDoS Tracking
        pps_count = 0
        last_pps_check = time.time()
        
        while self.running:
            # CHECK HOT-SWAP FLAGS
            if self.needs_rebind:
                self.setup_socket()
            if self.needs_db_reconnect:
                self._init_db()
                
            try:
                # Per-second packet count check
                now = time.time()
                if now - last_pps_check >= 1.0:
                    max_seq = int(self.config.get("max_sequence", 100))
                    ddos_thresh = int(self.config.get("ddos_threshold", 50))
                    limit = max_seq + ddos_thresh
                    
                    if pps_count > limit:
                        print(f"[Collector ALERT] DDoS DETECTED! PPS={pps_count} > Limit={limit}")
                        # If we were collecting a burst, we would sample here.
                        # However, PacketReceiver usually forwards immediately.
                        # In Collector mode, we might want to batch briefly OR 
                        # just flag the "DDoS State" to drop everything for the next second.
                        pass
                    
                    pps_count = 0
                    last_pps_check = now

                ready = _select([_sock], [], [], 0.02)
                if ready[0]:
                    batch_to_process = []
                    for _ in range(100):
                        try:
                            data, _ = _sock.recvfrom(65535)
                            pps_count += 1
                            
                            # Check limit again for immediate drop
                            max_seq = int(self.config.get("max_sequence", 100))
                            ddos_thresh = int(self.config.get("ddos_threshold", 50))
                            if pps_count > (max_seq + ddos_thresh):
                                self.metrics.dropped_packets += 1
                                batch_to_process.append(data)
                                if len(batch_to_process) >= 10: # Batch forensics
                                    self.forensic_sampling(batch_to_process)
                                    batch_to_process = []
                                continue
                            
                            self.metrics._accum_count += 1
                            self.metrics._accum_bytes += len(data)
                            
                            # HOOK: Data Forwarding to Brain
                            self.forward_to_brain(data)
                            
                        except BlockingIOError: break
                        except: break
            except Exception: pass

    def forward_to_brain(self, raw_data):
        """Placeholder for Inter-Process Communication (IPC) to Brain."""
        # For now, this is where ZeroMQ / Redis / Shared Queue would go.
        pass

# --- MAIN COLLECTOR PROCESS ---
if __name__ == "__main__":
    print("[Collector] Starting standalone process...")
    config = load_config()
    metrics = CollectorMetrics()
    
    receiver = PacketReceiver(config, metrics)
    receiver.start()
    
    last_config_check = time.time()
    last_mtime = os.path.getmtime(CONFIG_PATH)
    
    try:
        while True:
            # Hot Reload Check
            now = time.time()
            if now - last_config_check > 2.0:
                mtime = os.path.getmtime(CONFIG_PATH)
                if mtime > last_mtime:
                    print("[Collector] Config change detected. Reloading...")
                    new_config = load_config()
                    
                    # SMART DIFF: Trigger Hot-Swaps if necessary
                    if new_config.get("port") != config.get("port") or \
                       new_config.get("protocol") != config.get("protocol"):
                        print("[Collector] Triggering Socket Re-bind...")
                        receiver.needs_rebind = True
                        
                    if new_config.get("mongo_uri") != config.get("mongo_uri"):
                        print("[Collector] Triggering MongoDB Re-connection...")
                        receiver.needs_db_reconnect = True
                    
                    # Apply all changes
                    receiver.config = new_config
                    config = new_config # Update local cache for next diff
                    last_mtime = mtime
                last_config_check = now
            
            # Metrics Calculation & Resource Usage
            if metrics.calculate_throughput():
                metrics.update_resource_usage()
                
                # Write local metrics for Brain to aggregate
                metrics_data = {
                    "timestamp": time.time(),
                    "eps": metrics.eps,
                    "mbps": metrics.mbps,
                    "cpu": metrics.cpu,
                    "ram": metrics.ram,
                    "dropped": metrics.dropped_packets
                }
                # For now, write to a temp file that the Brain can read
                try:
                    with open("collector_stats.json", "w") as f:
                        json.dump(metrics_data, f)
                except: pass
            
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("[Collector] Stopping...")
        receiver.running = False
