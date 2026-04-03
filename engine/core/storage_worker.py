import time
import os
import sys
import signal
import json
import redis
from pymongo import MongoClient
from google.protobuf.json_format import MessageToDict

# Add parent directory to path to find kinetix_pb2
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import kinetix_pb2

class StorageWorker:
    def __init__(self, config_path="engine/core/config.jsonc"):
        self.config_path = config_path
        self.config = self._load_config()
        self.running = True
        
        # Redis Setup
        r_cfg = self.config.get("redis", {})
        self.redis_host = r_cfg.get("host", "localhost")
        self.redis_port = r_cfg.get("port", 6379)
        self.storage_queue = r_cfg.get("storage_queue", "kinetix_storage")
        
        # Mongo Setup
        mongo_uri = self.config.get("mongo_uri", "mongodb://localhost:27017/")
        self.mongo_client = MongoClient(mongo_uri)
        self.db = self.mongo_client["kinetix_brain"]
        self.collection = self.db["events"]
        
        self.redis = None
        self.batch_size = r_cfg.get("batch_size", 50)
        self.buffer = []
        self.last_flush = time.time()
        self.flush_interval = 2.0 # seconds
        
        # Signal handling
        signal.signal(signal.SIGINT, self._stop)
        signal.signal(signal.SIGTERM, self._stop)

    def _load_config(self):
        try:
            with open(self.config_path, "r") as f:
                content = f.read()
                # Simple comment removal for JSONC
                lines = [line for line in content.splitlines() if not line.strip().startswith("//")]
                return json.loads(" ".join(lines))
        except Exception as e:
            print(f"[Storage] Config Load Error: {e}")
            return {}

    def _stop(self, signum, frame):
        print(f"[Storage] Shutdown signal received ({signum}). Flushing and exiting...")
        self.running = False

    def connect(self):
        try:
            self.redis = redis.Redis(host=self.redis_host, port=self.redis_port, decode_responses=False)
            self.redis.ping()
            print(f"[Storage] Connected to Redis at {self.redis_host}:{self.redis_port}")
            print(f"[Storage] Listening on queue: {self.storage_queue}")
        except Exception as e:
            print(f"[Storage] Redis Connection Failed: {e}")
            sys.exit(1)

    def flush(self):
        if not self.buffer:
            return
        
        try:
            count = len(self.buffer)
            self.collection.insert_many(self.buffer)
            self.buffer = []
            self.last_flush = time.time()
            print(f"[Storage] Persisted {count} logs to MongoDB.")
        except Exception as e:
            print(f"[Storage] Bulk Insert Failed: {e}")

    def run(self):
        self.connect()
        print("[Storage] Worker Started. Press Ctrl+C to stop.")
        
        while self.running:
            try:
                # BRPOP returns (queue_name, data)
                res = self.redis.brpop(self.storage_queue, timeout=1)
                
                if res:
                    _, binary_data = res
                    
                    # 1. Translate Binary to Protobuf
                    pkt = kinetix_pb2.KinetixPacket()
                    pkt.ParseFromString(binary_data)
                    
                    # 2. Convert to Dict for Mongo
                    # preserving_proto_field_name=True ensures we get 'server_ts' etc.
                    doc = MessageToDict(pkt, preserving_proto_field_name=True, always_print_fields_with_no_presence=True)
                    
                    # 3. Add to buffer
                    self.buffer.append(doc)
                
                # Check for flush
                if len(self.buffer) >= self.batch_size or (time.time() - self.last_flush > self.flush_interval):
                    self.flush()
                    
            except Exception as e:
                print(f"[Storage] Process Error: {e}")
                time.sleep(1)

        # Final flush on exit
        self.flush()
        print("[Storage] Worker Stopped.")

if __name__ == "__main__":
    # Adjust config path if running directly
    path = "engine/core/config.jsonc"
    if not os.path.exists(path):
        path = "config.jsonc"
        
    worker = StorageWorker(path)
    worker.run()
