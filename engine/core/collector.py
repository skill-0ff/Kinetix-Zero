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
import re
import ipaddress
import secrets
import redis
from pymongo import MongoClient, UpdateMany, ASCENDING

# --- PROTOBUF BINARY CORE ---
import kinetix_pb2
from google.protobuf.json_format import MessageToDict

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
        
        # Authentication & Verification
        self.known_devices = {} # { "ip": { "host_id": "key" } }
        self.known_roles = {}   # { "role_name": IPv4Network }
        self.unauthorized_count = 0
        self.last_sync = 0
        
        # Binary Verification: No regex needed for Protobuf
        
        # Status Tracking (RAM-cache)
        self.active_ids = set()
        self.active_lock = threading.Lock()
        
        self._init_db()
        self._init_redis()
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
            
            # Ensure Database Optimization
            db = self.mongo_client["kinetix_brain"]
            db.agents.create_index([("last_seen", ASCENDING)])
            
            print(f"[Collector] MongoDB connected: {uri.split('@')[-1] if '@' in uri else uri}")
            self.needs_db_reconnect = False
        except Exception as e:
            print(f"[Collector Error] MongoDB Connection Failed: {e}")

    def _init_redis(self):
        """Initialize Redis connection for high-speed decoupling."""
        r_cfg = self.config.get("redis", {})
        if not r_cfg.get("enabled", False):
            self.redis = None
            return

        try:
            self.redis = redis.Redis(
                host=r_cfg.get("host", "localhost"),
                port=r_cfg.get("port", 6379),
                decode_responses=False # We send RAW binary
            )
            # Test connection
            self.redis.ping()
            print(f"[Collector] Redis Connected: {r_cfg.get('host')}:{r_cfg.get('port')} (Queue: {r_cfg.get('queue')})")
        except Exception as e:
            print(f"[Collector Error] Redis Connection Failed: {e}")
            self.redis = None

    def sync_known_devices(self):
        """Syncs authorized agents and role-networks from DB to in-memory cache every 10s."""
        if not self.mongo_client: return
        try:
            db = self.mongo_client["kinetix_brain"]
            
            # 1. Sync Agents
            agents = list(db.agents.find({}, {"host_id": 1, "ip": 1, "key": 1}))
            new_cache = {}
            for agent in agents:
                ip = agent.get("ip")
                host_id = agent.get("host_id")
                key = agent.get("key")
                if ip and host_id and key:
                    if ip not in new_cache: new_cache[ip] = {}
                    new_cache[ip][host_id] = key
            self.known_devices = new_cache
            
            # 2. Sync Roles (Subnets)
            roles = list(db.roles.find({}, {"name": 1, "ip": 1, "mask": 1}))
            new_roles = {}
            for role in roles:
                name = role.get("name")
                net = role.get("ip")
                mask = role.get("mask")
                if name and net and mask:
                    try:
                        new_roles[name] = ipaddress.ip_network(f"{net}/{mask}", strict=False)
                    except: pass
            self.known_roles = new_roles
            
            self.last_sync = time.time()
            # print(f"[Collector] Sync complete: {len(self.known_devices)} IPs, {len(self.known_roles)} Roles")
        except Exception as e:
            print(f"[Collector Error] Device Sync Failed: {e}")

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

    def _sync_agent_status_task(self):
        """Background loop to flush in-memory activity to DB once a minute."""
        while self.running:
            time.sleep(60)
            if not self.mongo_client: continue
            
            # 1. Snapshot and Clear RAM
            with self.active_lock:
                to_sync = list(self.active_ids)
                self.active_ids.clear()
            
            try:
                db = self.mongo_client["kinetix_brain"]
                now_ts = time.time()
                
                # ATOMIC-LIKE BULK UPDATE
                ops = [
                    # Reset: Everyone currently online becomes offline
                    UpdateMany({"status": "online"}, {"$set": {"status": "offline"}}),
                ]
                
                # Restore: Only the IDs that spoke in the last 60s
                if to_sync:
                    ops.append(
                        UpdateMany(
                            {"host_id": {"$in": to_sync}}, 
                            {"$set": {"status": "online", "last_seen": now_ts}}
                        )
                    )
                
                db.agents.bulk_write(ops, ordered=True)
                # print(f"[StatusManager] Sync'd {len(to_sync)} active agents.")
                
            except Exception as e:
                print(f"[Collector Error] Status Sync Failed: {e}")

    def run(self):
        # Start Background Status Manager
        status_thread = threading.Thread(target=self._sync_agent_status_task, daemon=True)
        status_thread.start()

        _sock = self.sock
        _select = select.select
        
        # DDoS Tracking
        pps_count = 0
        last_pps_check = time.time()
        
        while self.running:
            # CHECK HOT-SWAP & SYNC FLAGS
            now = time.time()
            if self.needs_rebind:
                self.setup_socket()
            if self.needs_db_reconnect:
                self._init_db()
            if now - self.last_sync > 10.0:
                self.sync_known_devices()
                
            try:
                # Per-second packet count check
                if now - last_pps_check >= 1.0:
                    max_seq = int(self.config.get("max_sequence", 100))
                    ddos_thresh = int(self.config.get("ddos_threshold", 50))
                    limit = max_seq + ddos_thresh
                    
                    if pps_count > limit:
                        print(f"[Collector ALERT] DDoS DETECTED! PPS={pps_count} > Limit={limit}")
                    
                    pps_count = 0
                    last_pps_check = now

                ready = _select([_sock], [], [], 0.02)
                if ready[0]:
                    for _ in range(100):
                        try:
                            # 1. RECEIVE BINARY BYTES
                            data, addr = _sock.recvfrom(65535)
                            source_ip = addr[0]
                            pps_count += 1
                            
                            # 2. DECODE PROTOBUF PACKET
                            pkt = kinetix_pb2.KinetixPacket()
                            try:
                                pkt.ParseFromString(data)
                            except:
                                self.metrics.dropped_packets += 1
                                continue

                            # 3. MANAGEMENT HANDLER (Registration Flow)
                            if pkt.HasField("reg_req"):
                                self._handle_registration(pkt.reg_req, addr)
                                continue

                            # 4. KNOWN DEVICE VERIFICATION
                            valid_hosts = self.known_devices.get(source_ip)
                            if not valid_hosts or not pkt.auth.host_id or not pkt.auth.key:
                                self.metrics.dropped_packets += 1
                                self.unauthorized_count += 1
                                continue
                                
                            h_id = pkt.auth.host_id
                            h_key = pkt.auth.key
                            
                            if h_id not in valid_hosts or valid_hosts[h_id] != h_key:
                                self.metrics.dropped_packets += 1
                                self.unauthorized_count += 1
                                continue

                            # 5. TRACK STATUS
                            with self.active_lock:
                                self.active_ids.add(h_id)

                            # 6. DDoS Capacity Check
                            max_seq = int(self.config.get("max_sequence", 100))
                            ddos_thresh = int(self.config.get("ddos_threshold", 50))
                            if pps_count > (max_seq + ddos_thresh):
                                self.metrics.dropped_packets += 1
                                continue
                            
                            self.metrics._accum_count += 1
                            self.metrics._accum_bytes += len(data)
                            
                            # Log Forwarding (Redis or Flow)
                            if self.redis:
                                batch_to_process.append(data)
                            else:
                                # Normalization Placeholder (If Redis is off)
                                try:
                                    normalized_dict = MessageToDict(
                                        pkt, 
                                        preserving_proto_field_name=True,
                                        always_print_fields_with_no_presence=True
                                    )
                                    self.forward_to_brain(normalized_dict)
                                except: pass
                            
                        except BlockingIOError:
                            break
                        except Exception:
                            break
                    
                    # HOOK: Batch Redis Push (Pipelining)
                    if self.redis and batch_to_process:
                        try:
                            r_cfg = self.config.get("redis", {})
                            q_name = r_cfg.get("queue", "kinetix_ingest")
                            
                            # Push entire batch once per UDP cycle
                            self.redis.lpush(q_name, *batch_to_process)
                            batch_to_process.clear()
                        except Exception as e:
                            print(f"[Collector Error] Redis Batch Push Failed: {e}")
            except Exception:
                pass

    def _handle_registration(self, reg_req, addr):
        """Handles automatic enrollment of new agents using Protobuf messages."""
        host_id = reg_req.host_id
        ip_addr = reg_req.ip if reg_req.ip else addr[0]
        
        if not host_id: return

        # 1. Find a matching Role Network
        assigned_role = None
        try:
            target_ip = ipaddress.ip_address(ip_addr)
            for role_name, network in self.known_roles.items():
                if target_ip in network:
                    assigned_role = role_name
                    break
        except: return

        if not assigned_role:
            return

        # 2. Check Database
        db = self.mongo_client["kinetix_brain"]
        existing = db.agents.find_one({"host_id": host_id})
        
        # 3. Generate Key
        new_key = f"kx-{secrets.token_hex(32)}"
        
        # 4. Save
        agent_doc = {
            "host_id": host_id,
            "ip": ip_addr,
            "role": assigned_role,
            "key": new_key,
            "created_at": datetime.datetime.now().isoformat(),
            "status": "active"
        }
        
        if existing:
            db.agents.update_one({"host_id": host_id}, {"$set": agent_doc})
        else:
            db.agents.insert_one(agent_doc)
            
        self.sync_known_devices()
        
        # 5. Success Response (Binary Protobuf)
        try:
            resp = kinetix_pb2.KinetixPacket()
            resp.reg_res.host_id = host_id
            resp.reg_res.key = new_key
            resp.reg_res.role = assigned_role
            
            self.sock.sendto(resp.SerializeToString(), addr)
            print(f"[Provisioning] Registered '{host_id}' as {assigned_role} ({ip_addr}).")
        except: pass

    def forward_to_brain(self, data_dict):
        """Push decoded dictionary to the Brain layer."""
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
                    "dropped": metrics.dropped_packets,
                    "unauthorized": receiver.unauthorized_count
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
