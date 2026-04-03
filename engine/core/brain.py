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
import subprocess
import shutil
import queue
import redis
from pymongo import MongoClient

# --- PROTOBUF BINARY CORE ---
import kinetix_pb2
from google.protobuf.json_format import MessageToDict

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from engine.core.vectorizer import LogNormalizer, VectorLibrary

try:
    from engine.core.misp_client import MispClient
except ImportError:
    try:
        from misp_client import MispClient
    except:
        MispClient = None
        print("[Warning] MispClient module could not be imported.")

try:
    from engine.core.janitor import Janitor
except ImportError:
    try:
        from janitor import Janitor
    except:
        Janitor = None

try:
    from inference import UnsupervisedAI
    AI_AVAILABLE = True
except ImportError:
    try:
        sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ai"))
        from inference import UnsupervisedAI
        AI_AVAILABLE = True
    except ImportError as e:
        print(f"[Warning] AI Module not found: {e}")
        AI_AVAILABLE = False

# PacketReceiver has been moved to standalone collector.py

class Brain:
    def __init__(self, config_path="engine/core/config.jsonc"):
        self.config_path = config_path
        self.config = {}
        self.running = True
        
        self.load_config()
        
        # DB Initialization
        self.client = MongoClient(self.config.get("mongo_uri", "mongodb://localhost:27017/"))
        self.db = self.client["kinetix_brain"]
        
        self.load_roles()
        
        q_size = int(self.config.get("max_queue_size", 10000))
        self.packet_queue = queue.Queue(maxsize=q_size)
        self.last_flush = time.time()
        
        self.vectorizer = LogNormalizer(config_path)
        
        self.ai = None
        if AI_AVAILABLE:
            try:
                self.ai = UnsupervisedAI(config_path)
            except Exception as e:
                print(f"[Error] AI Init Failed: {e}")
        
        self.last_config_mtime = 0
        self.last_role_sync = 0
        self.last_watchdog_check = time.time()
        
        self.start_time = time.time()
        self.system_metrics = {
            "cpu": 0.0,
            "ram": 0.0,
            "gpu": 0.0,
            "eps_in": 0.0,
            "mbps": 0.0,
            "uptime": 0
        }
        
        # MISP Cache
        self.misp_indicator_cache = set()
        self.last_misp_cache_reset = time.time()
        
        self.misp = None
        if MispClient:
            try:
                self.misp = MispClient(self.config, db=self.db)
                if self.misp.enabled:
                    print(f"[Brain] MISP Integration Enabled: {self.misp.url}")
            except Exception as e:
                print(f"[Error] MISP Init Failed: {e}")
        
        self.janitor = None
        if Janitor:
            try:
                self.janitor = Janitor(self.config_path)
            except Exception as e:
                print(f"[Error] Janitor Init Failed: {e}")
        
        # Start Ingestion Layer
        self._init_redis()
        self._update_local_config()

    def _update_local_config(self):
        self.time_window = float(self.config.get("time_window", 5.0))
        self.max_sequence = int(self.config.get("max_sequence", 100))

    def _init_redis(self):
        """Initialize Redis connection for decoupled ingestion."""
        r_cfg = self.config.get("redis", {})
        if not r_cfg.get("enabled", False):
            self.redis = None
            return

        try:
            self.redis = redis.Redis(
                host=r_cfg.get("host", "localhost"),
                port=r_cfg.get("port", 6379),
                decode_responses=False
            )
            self.redis.ping()
            print(f"[Brain] Redis Consumer Connected: {r_cfg.get('host')}:{r_cfg.get('port')}")
            
            # Start Consumer Thread
            t = threading.Thread(target=self._redis_consumer_loop, daemon=True)
            t.start()
        except Exception as e:
            print(f"[Brain Error] Redis Connection Failed: {e}")
            self.redis = None

    def _redis_consumer_loop(self):
        """Background thread to pull binary logs from Redis and feed the pipeline."""
        r_cfg = self.config.get("redis", {})
        q_name = r_cfg.get("queue", "kinetix_ingest")
        
        while self.running:
            try:
                # Blocking POP (wait 1s)
                res = self.redis.brpop(q_name, timeout=1)
                if not res: continue
                
                # res is (queue_name, data)
                _, binary_data = res
                
                # 1. DECODE PROTOBUF
                pkt = kinetix_pb2.KinetixPacket()
                try:
                    pkt.ParseFromString(binary_data)
                except: continue

                # PRIVACY HOOK: Wipe Auth Keys before Processing
                pkt.auth.Clear()

                # 2. FEED THE QUEUE DIRECTLY (Binary First)
                self.packet_queue.put(pkt)
                
            except Exception as e:
                time.sleep(1)

    def load_config(self):
        try:
            with open(self.config_path, 'r') as f:
                lines = [l for l in f.readlines() if not l.strip().startswith("//")]
                self.config = json.loads("".join(lines))
                self._update_local_config()
                print(f"[Config] Loaded: Port={self.config.get('port')}, Window={self.time_window}s")
        except Exception as e:
            print(f"[Error] Config Load Failed: {e}")

    def load_roles(self):
        try:
            roles_data = list(self.db.roles.find({}, {"_id": 0}))
            VectorLibrary.reload_role_mapping(roles_data)
        except Exception as e:
            print(f"[Error] Role Sync Failed: {e}")
    
    def check_hot_reload(self):
        try:
            mtime = os.path.getmtime(self.config_path)
            if mtime > self.last_config_mtime:
                self.last_config_mtime = mtime
                print("[System] Config Change Detected. Reloading...")
                self.load_config()
        except:
            pass

    def _extract_indicators(self, logs):
        """Deep extract public IPs and hashes from KinetixPacket batch."""
        indicators = set()
        for pkt in logs:
            payload_type = pkt.WhichOneof("payload")
            if not payload_type or payload_type != "event": continue
            
            event_type = pkt.event.WhichOneof("details")
            if not event_type: continue
            
            # Extract based on event detail type
            details = getattr(pkt.event, event_type)
            
            # 1. IPs
            for field in ["src_ip", "dst_ip", "dst_ip_str", "source_network_address"]:
                if hasattr(details, field):
                    ip = getattr(details, field)
                    if isinstance(ip, str) and self.misp and self.misp._is_public_ip(ip):
                        indicators.add(ip)
            
            # 2. Hashes
            for field in ["sha256", "hash", "parent_sha256", "module_sha256"]:
                if hasattr(details, field):
                    h = getattr(details, field)
                    if isinstance(h, str) and len(h) in [32, 40, 64]: # md5, sha1, sha256
                        indicators.add(h)
        return indicators
        # HOOK: Ingress Data from Collector
        # This is where we would receive from a separate IPC channel.
        # For now, we continue to check the local packet_queue which the IPC hook would populate.
        
        count = 0
        buffer_batch = []
        while not self.packet_queue.empty():
            try:
                buffer_batch.append(self.packet_queue.get_nowait())
                count += 1
            except queue.Empty:
                break
        
        if count == 0: return

        # Enriched logs collection
        decoded_logs = []
        for pkt in buffer_batch:
            try:
                # Injected by the Brain (ISO-8601 Format)
                pkt.server_ts = datetime.datetime.now().isoformat()
                decoded_logs.append(pkt)
            except: continue
        
        if self.misp and self.misp.enabled and decoded_logs:
             try:
                 # 1. Check Cache Reset
                 ttl = float(self.config.get("misp_cache_ttl_sec", 3600))
                 if time.time() - self.last_misp_cache_reset > ttl:
                     self.misp_indicator_cache.clear()
                     self.last_misp_cache_reset = time.time()
                 
                 # 2. Filter & Query
                 indicators = self._extract_indicators(decoded_logs)
                 new_indicators = [ind for ind in indicators if ind not in self.misp_indicator_cache]
                 
                 if new_indicators:
                     self.misp.check_batch_optimized(new_indicators, decoded_logs)
                     self.misp_indicator_cache.update(new_indicators)
                 
             except Exception as e: 
                 print(f"[Error] MISP Optimized Check Failed: {e}")

        if decoded_logs:
            vectors = []
            aligned_logs = []
            
            for pkt in decoded_logs:
                v = self.vectorizer.input_to_vector(pkt)
                if v is not None:
                    vectors.append(v)
                    aligned_logs.append(pkt)
                else:
                    # ALERT: Unknown Role Filtered Out
                    host_id = pkt.host.id
                    ip = pkt.host.ip
                    role = pkt.role
                    print(f"[ALERT] unknown role {role} {host_id} {ip}")

            if vectors and self.ai:
                try: 
                    self.ai.push_batch(vectors, aligned_logs)
                except Exception as e: 
                    print(f"[AI Error] {e}")

    def run(self):
        print("[Brain] Processor Started.")
        if self.janitor:
            try: self.janitor.start()
            except Exception as e: print(f"[Brain] Janitor Start Failed: {e}")
            
        try:
            self.last_config_mtime = os.path.getmtime(self.config_path)
        except: pass
        
        next_flush = time.time() + self.time_window
        
        while self.running:
            if self.packet_queue.empty():
                time.sleep(0.01)
            
            now = time.time()
            if now >= next_flush:
                self.process_queue()
                self.check_hot_reload()
                
                # DB Role Sync (10s)
                if now >= self.last_role_sync + 10.0:
                    self.load_roles()
                    self.last_role_sync = now
                    
                next_flush = now + self.time_window
            
            if now >= self.last_watchdog_check + 1.0:
                elapsed = now - self.last_watchdog_check
                self.last_watchdog_check = now
                self.system_metrics["uptime"] = int(now - self.start_time)
                
                try:
                    p = psutil.Process(os.getpid())
                    self.system_metrics["cpu"] = round(p.cpu_percent(), 1)
                    self.system_metrics["ram"] = round(p.memory_percent(), 1)
                except: pass
                
                # GET COLLECTOR STATS ONLY (Reading, no counting)
                try:
                    stats_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "collector_stats.json")
                    if os.path.exists(stats_path):
                        with open(stats_path, "r") as f:
                            c_stats = json.load(f)
                            # Keep Brain's own CPU/RAM but update EPS/MBPS from collector
                            self.system_metrics["eps_in"] = c_stats.get("eps", 0.0)
                            self.system_metrics["mbps"] = c_stats.get("mbps", 0.0)
                except: pass

                metrics_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "system_metrics.json")
                try:
                    with open(metrics_path, "w") as f:
                        json.dump({"timestamp": now, **self.system_metrics}, f)
                except: pass
                    
                if self.ai and not self.ai.is_alive():
                    print("[System ALERT] AI Thread Died! Restarting...")
                    try: self.ai = UnsupervisedAI(self.config_path)
                    except Exception as e: print(f"[System] AI Restart Failed: {e}")

if __name__ == "__main__":
    brain = Brain()
    try:
        brain.run()
    except KeyboardInterrupt:
        print("[Brain] Stopping...")
        brain.running = False
