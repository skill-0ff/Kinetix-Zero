import socket
import json
import time
import os
import sys
import threading
from datetime import datetime
import select

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
        
        # Networking
        self.sock = None
        self.setup_socket()

    def load_config(self):
        try:
            with open(self.config_path, 'r') as f:
                # Robust comment stripping
                lines = []
                for line in f:
                    # Strip // comments
                    if "//" in line:
                        line = line.split("//")[0]
                    line = line.strip()
                    if line:
                        lines.append(line)
                self.config = json.loads("".join(lines))
                print(f"[Config] Loaded: Port={self.config.get('port')}, Window={self.config.get('time_window')}s")
        except Exception as e:
            print(f"[Error] Config Load Failed: {e}")

    def load_roles(self):
        try:
            # VectorLibrary now has a static reload method
            VectorLibrary.reload_role_mapping()
        except Exception as e:
            print(f"[Error] Role Load Failed: {e}")

    def setup_socket(self):
        if self.sock:
            self.sock.close()
        
        port = self.config.get("port", 5000)
        proto = self.config.get("protocol", "udp")
        
        try:
            if proto == "udp":
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                self.sock.bind(("0.0.0.0", port))
            else:
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.bind(("0.0.0.0", port))
                self.sock.listen(5)
                
            self.sock.setblocking(0) # Non-blocking
            print(f"[Network] Listening on {proto.upper()} {port}")
        except Exception as e:
            print(f"[Error] Socket Setup Failed: {e}")

    def check_hot_reload(self):
        # Check Config
        try:
            mtime = os.path.getmtime(self.config_path)
            if mtime > self.last_config_mtime:
                self.last_config_mtime = mtime
                old_port = self.config.get("port")
                print("[System] Config Change Detected. Reloading...")
                self.load_config()
                
                # Rebind socket if port changed
                if self.config.get("port") != old_port:
                    self.setup_socket()
        except:
            pass

        # Check Roles
        try:
            r_mtime = os.path.getmtime(self.role_map_path)
            if r_mtime > self.last_role_mtime:
                self.last_role_mtime = r_mtime
                print("[System] Role Mapping Change Detected. Reloading...")
                self.load_roles()
        except:
            pass

    def process_buffer(self):
        count = len(self.buffer)
        if count == 0:
            return

        max_seq = self.config.get("max_sequence", 100)
        threshold = self.config.get("ddos_threshold", 50)
        limit = max_seq + threshold

        # DDoS Zone Check
        if count >= limit:
            print(f"[ALERT] DDoS DETECTED! Dropping {count} events. (Limit: {limit})")
            self.buffer = [] # DROP
            return

        # Normal/Burst Zone
        print(f"[Batch] Processing {count} events (Window: {self.config.get('time_window')}s)")
        
        vectors = []
        for log_data in self.buffer:
            try:
                # Assuming log_data is already dict, or string bytes
                if isinstance(log_data, bytes):
                    log_data = json.loads(log_data.decode('utf-8'))
                
                vec = self.vectorizer.input_to_vector(log_data)
                if vec:
                    vectors.append(vec)
            except Exception as e:
                # Malformed log
                continue
        
        if vectors:
            # AI Processing
            if self.ai:
                try:
                    result = self.ai.process_window(vectors)
                    if result["anomalies"]:
                        print(f"[AI ALERT] {len(result['anomalies'])} Anomalies Detected! (Loss > Threshold)")
                    # Optional: Print training status
                    # if result["trained"]:
                    #    print(f"[AI] Trained on batch (Loss: {result['train_loss']:.4f})")
                except Exception as e:
                    print(f"[AI Error] {e}")
            else:
                # Simulation Mode
                # print(f"-> Tensor Shape: [{len(vectors)}, 32]")
                pass
            
        self.buffer = [] # Clear

    def run(self):
        print("[Brain] Started.")
        self.last_config_mtime = os.path.getmtime(self.config_path)
        self.last_role_mtime = os.path.getmtime(self.role_map_path)
        
        while self.running:
            self.check_hot_reload()
            
            # Non-blocking IO Loop
            ready = select.select([self.sock], [], [], 0.1)
            
            if ready[0]:
                try:
                    data, addr = self.sock.recvfrom(65535)
                    self.buffer.append(data)
                except BlockingIOError:
                    pass
                except Exception as e:
                    print(f"[Net Error] {e}")

            # Time Window Check
            now = time.time()
            if now - self.last_flush >= self.config.get("time_window", 5.0):
                self.process_buffer()
                self.last_flush = now

if __name__ == "__main__":
    brain = Brain()
    brain.run()
