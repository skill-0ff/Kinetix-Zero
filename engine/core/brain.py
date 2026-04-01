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

# Add engine path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
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
    def __init__(self, config_path="engine/core/config.jsonc", role_map_path="engine/core/role_mapping.json"):
        self.config_path = config_path
        self.role_map_path = role_map_path
        self.config = {}
        self.running = True
        
        self.load_config()
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
        self.last_role_mtime = 0
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
        self._accum_count = 0
        self._accum_bytes = 0
        
        self.misp = None
        if MispClient:
            try:
                self.misp = MispClient(self.config)
                if self.misp.enabled:
                    print(f"[Brain] MISP Integration Enabled: {self.misp.url}")
            except Exception as e:
                print(f"[Error] MISP Init Failed: {e}")
        
        self.janitor = None
        if Janitor:
            try:
                self.janitor = Janitor(self.config)
            except Exception as e:
                print(f"[Error] Janitor Init Failed: {e}")
        
        # Receiver is now standalone in collector.py
        self._update_local_config()

    def _update_local_config(self):
        self.time_window = float(self.config.get("time_window", 5.0))
        self.max_sequence = int(self.config.get("max_sequence", 100))
        self.ddos_threshold = int(self.config.get("ddos_threshold", 50))
        self.limit = self.max_sequence + self.ddos_threshold

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
            VectorLibrary.reload_role_mapping()
        except Exception as e:
            print(f"[Error] Role Load Failed: {e}")
    
    def check_hot_reload(self):
        try:
            mtime = os.path.getmtime(self.config_path)
            if mtime > self.last_config_mtime:
                self.last_config_mtime = mtime
                print("[System] Config Change Detected. Reloading...")
                self.load_config()
        except:
            pass

    def process_queue(self):
        # HOOK: Ingress Data from Collector
        # This is where we would receive from a separate IPC channel.
        # For now, we continue to check the local packet_queue which the IPC hook would populate.
        
        count = 0
        buffer_batch = []
        limit = self.limit
        
        while not self.packet_queue.empty():
            try:
                buffer_batch.append(self.packet_queue.get_nowait())
                count += 1
                if count > limit + 10: break 
            except queue.Empty:
                break
        
        if count == 0: return

        self._accum_count += count
        try:
            self._accum_bytes += sum(len(x) if isinstance(x, (bytes, str)) else 0 for x in buffer_batch)
        except: pass

        if count >= limit:
            print(f"[ALERT] DDoS DETECTED! Count={count} > Limit={limit}. DROPPING BATCH.")
            buffer_batch.clear()
            return

        json_loads = json.loads
        decoded_logs = []
        for data in buffer_batch:
            try:
                obj = json_loads(data)
                obj['server_ts'] = datetime.datetime.now().isoformat()
                decoded_logs.append(obj)
            except: continue
        
        if self.misp and self.misp.enabled and decoded_logs:
             try: self.misp.check_batch(decoded_logs)
             except Exception as e: print(f"[Error] MISP Check Failed: {e}")

        if decoded_logs:
            vectors, aligned_logs = self.vectorizer.vectorize_batch(decoded_logs)
            if vectors and self.ai:
                try: self.ai.push_batch(vectors, aligned_logs)
                except Exception as e: print(f"[AI Error] {e}")

    def run(self):
        print("[Brain] Processor Started.")
        if self.janitor:
            try: self.janitor.start()
            except Exception as e: print(f"[Brain] Janitor Start Failed: {e}")
            
        try:
            self.last_config_mtime = os.path.getmtime(self.config_path)
            self.last_role_mtime = os.path.getmtime(self.role_map_path)
        except: pass
        
        next_flush = time.time() + self.time_window
        
        while self.running:
            if self.packet_queue.empty():
                time.sleep(0.01)
            
            now = time.time()
            if now >= next_flush:
                self.process_queue()
                self.check_hot_reload()
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
                
                # AGGREGATE COLLECTOR STATS
                try:
                    stats_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "collector_stats.json")
                    if os.path.exists(stats_path):
                        with open(stats_path, "r") as f:
                            c_stats = json.load(f)
                            self.system_metrics["cpu"] = round(self.system_metrics["cpu"] + c_stats.get("cpu", 0.0), 1)
                            self.system_metrics["ram"] = round(self.system_metrics["ram"] + c_stats.get("ram", 0.0), 1)
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
