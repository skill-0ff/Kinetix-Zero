import socket
import json
import time
import os
import sys
import threading
import datetime
import select
import random

# Add engine path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from vectorizer import LogNormalizer, VectorLibrary
# Try Importing AI (Optional Dependency)
try:
    sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ai"))
    from inference import UnsupervisedAI
    AI_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] AI Module not found: {e}")
    AI_AVAILABLE = False

class Brain:
    def __init__(self, config_path="engine/core/config.jsonc", role_map_path="engine/core/role_mapping.json"):
        self.config_path = config_path
        self.role_map_path = role_map_path
        self.config = {}
        self.running = True
        self.buffer = []
        self.last_flush = time.time()
        
        # Load initial config
        self.load_config()
        self.load_roles()
        
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
        
import queue

class PacketReceiver(threading.Thread):
    def __init__(self, port, protocol, buffer_queue, sample_rate=100, sample_mode="random"):
        super().__init__()
        self.port = port
        self.protocol = protocol
        self.queue = buffer_queue
        self.sample_rate = sample_rate
        self.sample_mode = sample_mode
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
                                # Advanced Forensic Sampling
                                should_save = False
                                if self.sample_rate >= 100:
                                    should_save = True
                                elif self.sample_rate > 0:
                                    if self.sample_mode == "sequence":
                                        # Deterministic Stride (e.g. Rate 10% -> 100/10 = 10. Every 10th packet)
                                        # Max(1) to avoid div/0
                                        stride = int(100 / max(1, self.sample_rate))
                                        if dropped_packets % stride == 0:
                                            should_save = True
                                    else:
                                        # Random (Probabilistic)
                                        if random.randint(1, 100) <= self.sample_rate:
                                            should_save = True

                                if should_save:
                                    try:
                                        # Non-blocking append (OS handles buffering mostly)
                                        # Ensure dir exists
                                        if not os.path.exists("logs"): os.makedirs("logs")
                                        with open("logs/forensic_drops.log", "ab") as f:
                                            # Format: Timestamp | Hex/Bytes
                                            ts = str(time.time()).encode()
                                            f.write(ts + b"|" + data + b"\n")
                                    except: pass
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
                print("[System] Config Change Detected. Reloading...")
                self.load_config()
                
                # Note: Changing max_queue_size requires restart, we don't hot-swap queue instance
                
                if self.config.get("port") != old_port:
                    # Restart Receiver
                    self.receiver.running = False
                    self.receiver.join()
                    self.receiver = PacketReceiver(
                        self.config.get("port"), 
                        self.config.get("protocol"), 
                        self.packet_queue,
                        self.config.get("forensic_sample_rate", 100),
                        self.config.get("forensic_sample_mode", "random")
                    )
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
                
        # Optimization: Bulk Vectorization
        if decoded_logs:
            vectors = self.vectorizer.vectorize_batch(decoded_logs)
            
            if vectors:
                if self.ai:
                    try:
                        # Async Push (Fire and Forget)
                        self.ai.push_batch(vectors)
                    except Exception as e:
                        print(f"[AI Error] {e}")

    def run(self):
        print("[Brain] Processor Started.")
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


