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

# Add engine path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from engine.core.vectorizer import LogNormalizer
try:
    from engine.core.misp_client import MispClient # Attempt relative/module import
except ImportError:
    # If running directly from core/
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
    from inference import UnsupervisedAI # If same dir
    AI_AVAILABLE = True
except ImportError:
    try:
        sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ai"))
        from inference import UnsupervisedAI
        AI_AVAILABLE = True
    except ImportError as e:
        print(f"[Warning] AI Module not found: {e}")
        AI_AVAILABLE = False

import queue

class PacketReceiver(threading.Thread):
    def __init__(self, port, protocol, buffer_queue, sample_rate=100, sample_mode="random"):
        super().__init__()
        self.port = port
        self.protocol = protocol
        self.queue = buffer_queue
        self.queue = buffer_queue
        # Sample Rate/Mode now only used for Logic Layer config, not here
        self.running = True
        self.sock = None
        self.daemon = True # Auto-kill when main dies
        self.setup_socket()

    def setup_socket(self):
        try:
            if self.sock: self.sock.close()
            
            if self.protocol == "udp":
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                # Optimization: Increase Kernel Receive Buffer to 4MB (Default usually 200KB)
                # This prevents packet loss during micro-bursts
                self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
                self.sock.bind(("0.0.0.0", self.port))
            else:
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.bind(("0.0.0.0", self.port))
                self.sock.listen(5)
            
            self.sock.setblocking(0)
            print(f"[Network] Receiver Thread Listening on {self.protocol.upper()} {self.port} (Buffer: 4MB)")
        except Exception as e:
            print(f"[Error] Receiver Socket Failed: {e}")

    def run(self):
        _sock = self.sock
        _queue_put = self.queue.put_nowait
        _select = select.select
        
        dropped_packets = 0
        last_log = time.time()
        
        while self.running:
            try:
                # Wait for data with short timeout
                ready = _select([_sock], [], [], 0.02)
                if ready[0]:
                    # Burst read loop
                    for _ in range(100): # High burst count for thread
                        try:
                            data, _ = _sock.recvfrom(65535)
                            try:
                                # Tail Drop: If queue full, drop immediately
                                _queue_put(data)
                            except queue.Full:
                                dropped_packets += 1
                                # Strict Tail Drop (No Sampling at Ingress)
                                pass
                        except BlockingIOError:
                            break
                        except:
                            break
                            
                # Log drops periodically (every 5s) to avoid IO spam
                now = time.time()
                if dropped_packets > 0 and now - last_log > 5.0:
                    print(f"[Warn] High Load: Dropped {dropped_packets} packets at ingress (Queue Full)")
                    dropped_packets = 0
                    last_log = now
                    
            except Exception:
                pass
        
        if self.sock: self.sock.close()

class Brain:
    def __init__(self, config_path="engine/core/config.jsonc", role_map_path="engine/core/role_mapping.json"):
        self.config_path = config_path
        self.role_map_path = role_map_path
        self.config = {}
        self.running = True
        
        # Load initial config first to get max_queue_size
        self.load_config()
        self.load_roles()
        
        # Thread-safe Bounded Queue
        # Enforce memory limit via maxsize
        q_size = int(self.config.get("max_queue_size", 10000))
        self.packet_queue = queue.Queue(maxsize=q_size)
        self.last_flush = time.time()
        
        # Initialize Vectorizer
        self.vectorizer = LogNormalizer(config_path)
        
        # Initialize AI
        self.ai = None
        if AI_AVAILABLE:
            try:
                self.ai = UnsupervisedAI(config_path)
            except Exception as e:
                print(f"[Error] AI Init Failed: {e}")
        
        # State monitoring
        self.last_config_mtime = 0
        self.last_role_mtime = 0
        
        # Missing variable initializations
        self.counter_in = 0
        self.counter_out = 0
        self.last_metrics_flush = time.time()
        self.metrics_interval = 1.0
        self.start_time = time.time()
        self.evidence_queue = queue.Queue()
        
        # Initialize MISP (Optional)
        self.misp = None
        if MispClient:
            try:
                self.misp = MispClient(self.config)
                if self.misp.enabled:
                    print(f"[Brain] MISP Integration Enabled: {self.misp.url}")
            except Exception as e:
                print(f"[Error] MISP Init Failed: {e}")
        
        # Initialize Janitor (Optional)
        self.janitor = None
        if Janitor:
            try:
                self.janitor = Janitor(self.config)
            except Exception as e:
                print(f"[Error] Janitor Init Failed: {e}")
        
        # Start Receiver Thread
        self.receiver = PacketReceiver(
            self.config.get("port", 5000), 
            self.config.get("protocol", "udp"), 
            self.packet_queue,
            self.config.get("forensic_sample_rate", 100),
            self.config.get("forensic_sample_mode", "random")
        )
        self.receiver.start()

        # Cache config values for hot path
        self._update_local_config()

    def _update_local_config(self):
        """Cache config values to avoid dictionary lookups in loop"""
        self.time_window = float(self.config.get("time_window", 5.0))
        self.max_sequence = int(self.config.get("max_sequence", 100))
        self.ddos_threshold = int(self.config.get("ddos_threshold", 50))
        self.limit = self.max_sequence + self.ddos_threshold

    def load_config(self):
        try:
            with open(self.config_path, 'r') as f:
                lines = []
                for line in f:
                    if "//" in line: line = line.split("//")[0]
                    line = line.strip()
                    if line: lines.append(line)
                self.config = json.loads("".join(lines))
                # Update cached values
                self._update_local_config()
                print(f"[Config] Loaded: Port={self.config.get('port')}, Window={self.time_window}s")
        except Exception as e:
            print(f"[Error] Config Load Failed: {e}")

    def load_roles(self):
        try:
            VectorLibrary.reload_role_mapping()
        except Exception as e:
            print(f"[Error] Role Load Failed: {e}")

    # Socket Setup moved to PacketReceiver class
    
    def check_hot_reload(self):
        # Check Config
        try:
            mtime = os.path.getmtime(self.config_path)
            if mtime > self.last_config_mtime:
                self.last_config_mtime = mtime
                old_port = self.config.get("port")
                old_q_size = self.packet_queue.maxsize
                
                print("[System] Config Change Detected. Reloading...")
                self.load_config()
                
                # 1. Hot Update: Forensic Params
                # (Used later in process_queue, stored in self.config which is reloaded)
                pass
                
                # 2. Heavy Update: Port or Queue Size Change (Requires Restart)
                new_q_size = int(self.config.get("max_queue_size", 10000))
                
                if self.config.get("port") != old_port or new_q_size != old_q_size:
                    print(f"[System] Restarting Receiver (Port/Queue Changed)...")
                    
                    # Stop Old
                    self.receiver.running = False
                    self.receiver.join()
                    
                    # Re-Init Queue (if size changed)
                    if new_q_size != old_q_size:
                        print(f"[System] Resizing Queue: {old_q_size} -> {new_q_size}")
                        self.packet_queue = queue.Queue(maxsize=new_q_size)
                        
                    # Start New
                    self.receiver = PacketReceiver(
                        self.config.get("port"), 
                        self.config.get("protocol"), 
                        self.packet_queue,
                        self.config.get("forensic_sample_rate", 100),
                        self.config.get("forensic_sample_mode", "random")
                    )
                    # Restore Evidence Queue Link
                    self.receiver.evidence_queue = getattr(self, "evidence_queue", None)
                    self.receiver.start()
        except:
            pass
            
        # Check Roles
        try:
            r_mtime = os.path.getmtime(self.role_map_path)
            if r_mtime > self.last_role_mtime:
                self.last_role_mtime = r_mtime
                self.load_roles()
        except:
            pass

    def process_queue(self):
        # Drain Queue
        count = 0
        buffer_batch = []
        
        # Drain up to limit + 1 to detect overflow
        limit = self.limit
        
        while not self.packet_queue.empty():
            try:
                buffer_batch.append(self.packet_queue.get_nowait())
                self.counter_in += 1
                count += 1
                # If we exceed limit significantly, we might as well stop and drop
                # But to measure true size we'd need to drain all. 
                # Optimization: Just drain up to 2x limit to check "DDoS" zone
                if count > limit + 10: 
                    break 
            except queue.Empty:
                break
        
        if count == 0: return

        # DDoS Zone Check (Logic Layer)
        if count >= limit:
            print(f"[ALERT] DDoS DETECTED! Count={count} > Limit={limit}. DROPPING BATCH.")
            
            # Logic Layer Sampling (Single Layer Protection)
            # Use 'forensic_sample_rate' from config
            rate = int(self.config.get("forensic_sample_rate", 10))
            
            # CHECK TOGGLE: Only save evidence if enabled
            save_evidence = self.config.get("storage_policy", {}).get("save_logs", {}).get("ddos_evidence", True)
            
            if self.ai and buffer_batch and rate > 0 and save_evidence:
                 try:
                     # Calculate exact sample count
                     # If rate=100, take all. If rate=10, take 10%
                     batch_len = len(buffer_batch)
                     sample_count = max(1, int(batch_len * (rate / 100.0)))
                     
                     # Random Sample
                     indices = random.sample(range(batch_len), min(sample_count, batch_len))
                     sample_data = [buffer_batch[i] for i in indices]
                     
                     decoded_sample = []
                     json_loads = json.loads
                     for s in sample_data: 
                         try: decoded_sample.append(json_loads(s))
                         except: pass
                     
                     if decoded_sample:
                         # Tag Evidence
                         for d in decoded_sample:
                             d["_evidence_type"] = "layer2_logic_drop"
                             d["verdict"] = "DDoS"
                             d["uuid"] = str(uuid.uuid4())
                             d["timestamp"] = time.time()
                             
                         # Send to Brain -> AI -> DB
                         self.ai.push_evidence(decoded_sample)
                 except Exception as e: 
                     print(f"[Error] DDoS Sampling Failed: {e}")

            buffer_batch.clear() # Strict Drop
            return
            
        # Optimization: Bulk JSON Decode
        json_loads = json.loads
        decoded_logs = []
        _append = decoded_logs.append
        
        for data in buffer_batch:
            try:
                obj = json_loads(data)
                obj['_server_ts'] = time.time() # Server Authority Timestamp
                _append(obj)
            except:
                continue
        
        # MISP Threat Check (Layer 3)
        # Check Decoded logs (Dicts) BEFORE Vectorization
        if self.misp and self.misp.enabled and decoded_logs:
             try:
                 self.misp.check_batch(decoded_logs)
             except Exception as e:
                 print(f"[Error] MISP Check Failed: {e}")

        # Process Evidence Queue (Layer 1 Drops)
        if not self.evidence_queue.empty():
            evidence_batch = []
            try:
                while not self.evidence_queue.empty():
                    ts, raw_data = self.evidence_queue.get_nowait()
                    # Try Decode
                    try:
                        obj = json_loads(raw_data)
                        obj["_evidence_type"] = "layer1_ingress_drop"
                        obj["timestamp"] = ts
                        obj["verdict"] = "DDoS"
                        evidence_batch.append(obj)
                    except: pass
                    
                    if len(evidence_batch) > 50: break # Cap flush
            except: pass
            
            if evidence_batch and self.ai:
                self.ai.push_evidence(evidence_batch)

        # Optimization: Bulk Vectorization
        if decoded_logs:
            vectors, aligned_logs = self.vectorizer.vectorize_batch(decoded_logs)
            
            if vectors:
                if self.ai:
                    try:
                        # Async Push (Fire and Forget)
                        self.ai.push_batch(vectors, aligned_logs)
                        self.counter_out += len(vectors)
                    except Exception as e:
                        print(f"[AI Error] {e}")

    def run(self):
        print("[Brain] Processor Started.")
        
        # Start Janitor Service
        if self.janitor:
            try:
                self.janitor.start()
            except Exception as e:
                print(f"[Brain] Janitor Start Failed: {e}")
            
        try:
            self.last_config_mtime = os.path.getmtime(self.config_path)
            self.last_role_mtime = os.path.getmtime(self.role_map_path)
        except:
            pass
        
        _time = time.time
        _process = self.process_queue
        
        next_flush = _time() + self.time_window
        
        while self.running:
            # Main Thread now purely CPU bound (Processing), Sleep deeply to yield if idle
            if self.packet_queue.empty():
                time.sleep(0.01)
            
            now = _time()
            if now >= next_flush:
                _process()
                self.check_hot_reload()
                next_flush = now + self.time_window
            
            # Flush Metrics (1s)
            if now >= self.last_metrics_flush + self.metrics_interval:
                try:
                    # Log to Mongo
                    if self.ai and hasattr(self.ai, 'mongo_metrics'):
                        try:
                            self.ai.mongo_metrics.insert_one({
                                "timestamp": now,
                                "eps_in": self.counter_in,
                                "eps_out": self.counter_out,
                                "uptime": now - self.start_time
                            })
                        except: pass
                    
                    # Reset
                    self.counter_in = 0
                    self.counter_out = 0
                    self.last_metrics_flush = now
                except:
                   pass
                
                # Watchdog: Single Process Control
                if not self.receiver.is_alive():
                    print("[System ALERT] Receiver Thread Died! Restarting...")
                    self.receiver = PacketReceiver(
                        self.config.get("port"), 
                        self.config.get("protocol"), 
                        self.packet_queue,
                        self.config.get("forensic_sample_rate", 100),
                        self.config.get("forensic_sample_mode", "random")
                    )
                    self.receiver.start()
                    
                if self.ai and not self.ai.is_alive():
                    print("[System ALERT] AI Thread Died! Restarting...")
                    try:
                        self.ai = UnsupervisedAI(self.config_path)
                    except Exception as e:
                        print(f"[System] AI Restart Failed: {e}")

if __name__ == "__main__":
    brain = Brain()
    try:
        brain.run()
    except KeyboardInterrupt:
        print("[Brain] Stopping...")
        brain.running = False
        brain.receiver.running = False


