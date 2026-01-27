import json
import os
import hashlib
import re
import math
import time
import numpy as np
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Lock
from typing import Optional, Dict, Any, List, Union, Literal
from pydantic import BaseModel, Field, ValidationError, Extra

# ==========================================
# 1. Pydantic Models (Strict Input Validation)
# ==========================================

class HostIdentity(BaseModel):
    id: str
    os: Optional[str] = None
    ip: Optional[str] = None
    mac: Optional[str] = None

    class Config:
        extra = Extra.forbid

# --- Event Sub-Types ---

class BaseEvent(BaseModel):
    timestamp: str 
    class Config:
        extra = Extra.forbid

class ProcessStartEvent(BaseEvent):
    type: Literal["process_start"]
    process: Optional[str] = None
    path: Optional[str] = None
    sha256: Optional[str] = None
    cmdline: Optional[str] = None
    parent: Optional[str] = None
    parent_path: Optional[str] = None
    parent_sha_256: Optional[str] = None
    user: Optional[str] = None
    cpu: Optional[str] = None
    gpu: Optional[str] = None
    ram: Optional[str] = None
    disk: Optional[str] = None

class ProcessKillEvent(BaseEvent):
    type: Literal["process_kill"]
    process: Optional[str] = None
    path: Optional[str] = None
    sha256: Optional[str] = None
    term_type: Optional[str] = None
    exit_code: Optional[str] = None

class FileCreateEvent(BaseEvent):
    type: Literal["file_create"]
    file_type: Optional[str] = None
    path: Optional[str] = None
    size: Optional[str] = None
    process: Optional[str] = None
    user: Optional[str] = None
    owner: Optional[str] = None

class FileModifiedEvent(BaseEvent):
    type: Literal["file_modified"]
    path: Optional[str] = None
    process: Optional[str] = None
    size_change: Optional[str] = None
    perm_change: Optional[str] = None
    user: Optional[str] = None
    owner: Optional[str] = None

class FileDeleteEvent(BaseEvent):
    type: Literal["file_delete"]
    path: Optional[str] = None
    process: Optional[str] = None
    size: Optional[str] = None
    user: Optional[str] = None
    perm: Optional[str] = None
    owner: Optional[str] = None

class ServiceCreateEvent(BaseEvent):
    type: Literal["service_create"]
    name: Optional[str] = None
    path: Optional[str] = None
    start_type: Optional[str] = None
    account: Optional[str] = None
    creator: Optional[str] = None

class ServiceDeleteEvent(BaseEvent):
    type: Literal["service_delete"]
    name: Optional[str] = None
    path: Optional[str] = None
    account: Optional[str] = None
    deleter: Optional[str] = None

class ServiceModifiedEvent(BaseEvent):
    type: Literal["service_modified"]
    name: Optional[str] = None
    path: Optional[str] = None
    account: Optional[str] = None
    user: Optional[str] = None

class RegistryEvent(BaseEvent):
    type: Literal["registry"]
    op_type: Optional[str] = None
    reg_path: Optional[str] = None
    reg_val: Optional[str] = None
    reg_type: Optional[str] = None
    reg_user: Optional[str] = None
    reg_owner: Optional[str] = None
    reg_perm: Optional[str] = None

class NetworkConnectionEvent(BaseEvent):
    type: Literal["network_connection"]
    process: Optional[str] = None
    protocol: Optional[str] = None
    ip_local: Optional[Union[bool, str]] = None
    dst_ip: Optional[str] = None
    src_port: Optional[str] = None
    dst_port: Optional[str] = None
    sent: Optional[str] = None
    recv: Optional[str] = None

class DnsQueryEvent(BaseEvent):
    type: Literal["dns_query"]
    q_name: Optional[str] = None
    q_type: Optional[str] = None
    q_res: Optional[str] = None
    q_port: Optional[str] = None
    q_proto: Optional[str] = None

class TrafficEvent(BaseEvent):
    type: Literal["traffic"]
    # Router/Switch/Firewall fields
    src_ip: Optional[str] = None
    dst_ip: Optional[str] = None
    src_iface: Optional[str] = None
    dst_iface: Optional[str] = None
    src_port: Optional[str] = None
    dst_port: Optional[str] = None
    proto: Optional[str] = None
    action: Optional[str] = None
    src_mac: Optional[str] = None
    dst_mac: Optional[str] = None
    vlan_src: Optional[str] = None
    vlan_dst: Optional[str] = None
    sent: Optional[str] = None # Added based on example usage

# Polymorphic Event Union
EventUnion = Union[
    ProcessStartEvent, ProcessKillEvent, 
    FileCreateEvent, FileModifiedEvent, FileDeleteEvent,
    ServiceCreateEvent, ServiceDeleteEvent, ServiceModifiedEvent,
    RegistryEvent, NetworkConnectionEvent, DnsQueryEvent,
    TrafficEvent
]

class LogEntry(BaseModel):
    role: str
    timestamp_ref: str
    host: HostIdentity
    status: Optional[Dict[str, str]] = None
    event: EventUnion = Field(..., discriminator='type')

    class Config:
        extra = Extra.ignore

# ==========================================
# 2. Vector Library (Advanced Feature Eng.)
# ==========================================

class VectorLibrary:
    
    TOP_K_PROCESSES = {
        "svchost.exe": 0.1, "explorer.exe": 0.2, "chrome.exe": 0.3,
        "powershell.exe": 0.9, "cmd.exe": 0.95, "nmap": 0.99
    }

    @staticmethod
    def encode_time_cyclic(t_str):
        if not t_str: return [0.0, 0.0]
        try:
            parts = t_str.split(":")
            h = int(parts[0])
            m = int(parts[1])
            s = float(parts[2])
            seconds_in_day = h * 3600 + m * 60 + s
            angle = (2 * math.pi * seconds_in_day) / 86400.0
            return [math.sin(angle), math.cos(angle)]
        except:
            return [0.0, 0.0]

    @staticmethod
    def calculate_entropy(text):
        if not text: return 0.0
        prob = [float(text.count(c)) / len(text) for c in dict.fromkeys(list(text))]
        entropy = -sum([p * math.log(p) / math.log(2.0) for p in prob])
        return min(entropy / 8.0, 1.0)

    @staticmethod
    def get_top_k_score(text):
        if not text: return 0.0
        return VectorLibrary.TOP_K_PROCESSES.get(text.lower(), VectorLibrary.hash_string(text))

    @staticmethod
    def hash_string(s):
        if not s: return 0.0
        return int(hashlib.sha256(s.encode()).hexdigest(), 16) % 100000 / 100000.0

    @staticmethod
    def normalize_ip(ip):
        return VectorLibrary.hash_string(ip)

    @staticmethod
    def normalize_port(p):
        if not p: return 0.0
        try:
            val = int(p)
            return math.log10(val + 1) / 5.0
        except:
            return 0.0
    
    @staticmethod
    def normalize_size(s):
        if not s: return 0.0
        try:
            num = float(re.findall(r"[\d\.]+", str(s))[0])
            if "MB" in str(s): num *= 1024
            if "GB" in str(s): num *= 1024 * 1024
            return min(math.log10(num + 1) / 10.0, 1.0)
        except:
            return 0.0

# ==========================================
# 3. Log Normalizer (32-Dim Sparse Map)
# ==========================================

class LogNormalizer:
    def __init__(self, config_path="engine/config.jsonc"):
        self.config = self._load_config(config_path)

    def _load_config(self, path):
        if not os.path.exists(path): return {}
        with open(path, 'r') as f:
            lines = [l for l in f.readlines() if not l.strip().startswith("//")]
            return json.loads("".join(lines))

    def input_to_vector(self, raw_json):
        try:
            # 1. Validate (Polymorphic)
            log = LogEntry(**raw_json)
            
            # 2. Initialize
            vector = np.zeros(32)

            # --- 00-05 Identity ---
            vector[0] = VectorLibrary.hash_string(log.role)
            vector[1] = VectorLibrary.hash_string(log.host.id)
            vector[2] = VectorLibrary.hash_string(log.host.os)
            vector[3] = VectorLibrary.normalize_ip(log.host.ip)
            vector[4] = VectorLibrary.hash_string(log.host.mac)
            vector[5] = 0.5

            # --- 06-07 Time ---
            t_cyclic = VectorLibrary.encode_time_cyclic(log.timestamp_ref)
            vector[6] = t_cyclic[0]
            vector[7] = t_cyclic[1]

            # --- 08-10 Status ---
            if log.status:
                vector[8] = VectorLibrary.normalize_size(log.status.get("cpu", "0"))
                vector[9] = VectorLibrary.normalize_size(log.status.get("ram", "0"))
                vector[10] = VectorLibrary.normalize_size(log.status.get("disk", "0"))

            # --- 11-15 Event Meta ---
            ev = log.event
            vector[11] = VectorLibrary.hash_string(ev.type)
            
            # Extract common optional fields safely
            user = getattr(ev, 'user', None) or getattr(ev, 'reg_user', None)
            vector[12] = VectorLibrary.hash_string(user)
            
            action = getattr(ev, 'action', None) or getattr(ev, 'op_type', None)
            vector[13] = VectorLibrary.hash_string(action)
            
            vector[14] = 0.0
            
            # Direction Logic
            src_ip = getattr(ev, 'src_ip', None)
            is_ext = 1.0 if src_ip and not src_ip.startswith("192.168") else 0.0
            vector[15] = is_ext

            # --- 16-20 Process/File ---
            process = getattr(ev, 'process', None)
            if process:
                vector[16] = VectorLibrary.get_top_k_score(process)
                vector[17] = VectorLibrary.calculate_entropy(getattr(ev, 'path', None))
                vector[18] = VectorLibrary.hash_string(getattr(ev, 'parent', None))
                vector[19] = VectorLibrary.calculate_entropy(getattr(ev, 'cmdline', None))
            
            size = getattr(ev, 'size', None) or getattr(ev, 'sent', None)
            if size:
                vector[20] = VectorLibrary.normalize_size(size)

            # --- 21-25 Network ---
            # Handle aliasing
            protocol = getattr(ev, 'protocol', None) or getattr(ev, 'proto', None)
            dst_ip = getattr(ev, 'dst_ip', None)
            
            if src_ip or dst_ip or protocol or getattr(ev, 'src_mac', None):
                vector[21] = VectorLibrary.hash_string(protocol)
                vector[22] = VectorLibrary.normalize_ip(src_ip)
                vector[23] = VectorLibrary.normalize_ip(dst_ip)
                vector[24] = VectorLibrary.normalize_port(getattr(ev, 'src_port', None))
                vector[25] = VectorLibrary.normalize_port(getattr(ev, 'dst_port', None))

            # --- 26-31 Special ---
            vector[26] = VectorLibrary.hash_string(getattr(ev, 'reg_path', None))
            vector[27] = VectorLibrary.hash_string(getattr(ev, 'reg_val', None))
            
            name = getattr(ev, 'name', None) or getattr(ev, 'q_name', None)
            vector[28] = VectorLibrary.hash_string(name)
            
            vector[29] = VectorLibrary.hash_string(getattr(ev, 'q_name', None))
            vector[30] = VectorLibrary.normalize_size(getattr(ev, 'sent', None))
            vector[31] = VectorLibrary.normalize_size(getattr(ev, 'recv', None))

            return vector.tolist()

        except ValidationError as e:
            # print(f"Validation Error: {e}") 
            # Silent fail for production or log?
            return None
        except Exception as e:
            print(f"Normalization Error: {e}")
            return None

# ==========================================
# 4. HTTP Service
# ==========================================

class RequestHandler(BaseHTTPRequestHandler):
    normalizer = LogNormalizer()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data)
            if isinstance(data, list):
                vectors = [self.normalizer.input_to_vector(item) for item in data]
                vectors = [v for v in vectors if v is not None]
            else:
                v = self.normalizer.input_to_vector(data)
                vectors = [v] if v is not None else []
            
            response = {"vectors": vectors, "count": len(vectors)}
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

def run(server_class=HTTPServer, handler_class=RequestHandler):
    try:
        with open("engine/config.jsonc", 'r') as f:
            lines = [l for l in f.readlines() if not l.strip().startswith("//")]
            config = json.loads("".join(lines))
            port = config.get("listening_port", 3000)
    except:
        port = 3000

    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"V2 Log Normalizer (32-Dim) running on port {port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
