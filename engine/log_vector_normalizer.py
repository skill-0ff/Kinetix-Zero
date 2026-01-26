import json
import os
import hashlib
import re
import math
import time
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Lock

# Constants for Vector Dimensions
# 15 Optimized Slots per atomic event

class ConfigLoader:
    @staticmethod
    def load(path):
        if not os.path.exists(path):
             return {"listening_port": 3000, "single_image_dist_s": 1, "ai_window_dist_s": 1.0}
        with open(path, 'r') as f:
            lines = f.readlines()
            clean_lines = [line for line in lines if not line.strip().startswith("//")]
            return json.loads("".join(clean_lines))

class VectorLibrary:
    """Helper for normalization and encoding."""
    
    @staticmethod
    def normalize_size(value):
        """Log-scaled normalization: log10(bytes+1) / 10.0"""
        if not isinstance(value, str): return 0.0
        value = value.upper()
        multipliers = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3}
        match = re.search(r"([\d\.]+)\s*([A-Z]*)", value)
        if match:
            try:
                num = float(match.group(1))
                unit = match.group(2)
                bytes_val = num * multipliers.get(unit, 1)
                # compress millions to small range (e.g. 1MB=6.0, 1GB=9.0) -> /10 -> 0.6, 0.9
                return math.log10(bytes_val + 1) / 10.0
            except: pass
        return 0.0

    @staticmethod
    def encode_categorical(value):
        """Hashes a string to a normalized float between -1 and 1."""
        if not isinstance(value, str): return 0.0
        hash_val = int(hashlib.sha256(value.encode('utf-8')).hexdigest(), 16)
        return (hash_val % 100000) / 50000.0 - 1.0

    @staticmethod
    def parse_time(time_str):
        """Normalized time of day: seconds / 86400.0 (0.0 to 1.0)"""
        if isinstance(time_str, (int, float)): 
            # Assume raw float is seconds, normalize it
            return float(time_str) / 86400.0
            
        if not isinstance(time_str, str): return 0.0
        
        seconds = 0.0
        try:
            if ":" in time_str:
                parts = time_str.split(":")
                if len(parts) >= 3:
                    h = int(parts[0])
                    m = int(parts[1])
                    s_parts = parts[2].split(".")
                    s = int(s_parts[0])
                    ms = int(s_parts[1]) if len(s_parts) > 1 else 0
                    seconds = h * 3600 + m * 60 + s + (ms / 1000.0)
            elif time_str.endswith("s"):
                seconds = float(time_str.replace("s", ""))
            else:
                seconds = float(time_str)
        except:
            pass
            
        return seconds / 86400.0

class LogNormalizer:
    def __init__(self, config):
        # Atomic Mode: No buffering, no windows.
        self.lock = Lock()
        
    def process_incoming(self, raw_entry):
        """
        ATOMIC MODE: Maps events 1:1 to vectors.
        """
        # Detection
        is_legacy = True
        role = "unknown"
        data = {}
        
        if "role" in raw_entry and "host" in raw_entry:
            is_legacy = False
            role = raw_entry.get("role", "unknown")
            data = raw_entry
        else:
            role = list(raw_entry.keys())[0]
            data = raw_entry[role]
            
        if not isinstance(data, dict):
             return []
        
        # 1. Identity & Context
        identity_vector = VectorLibrary.encode_categorical(role)
        
        if is_legacy:
            raw_identity = data.get("_identity", [])
            linkage_info = raw_identity[0] if raw_identity and isinstance(raw_identity, list) else (raw_identity if isinstance(raw_identity, dict) else {})
            host_id = str(linkage_info.get("ID", "unknown"))
            linkage_vector = [
                VectorLibrary.encode_categorical(host_id),
                VectorLibrary.encode_categorical(linkage_info.get("OS", "")),
                VectorLibrary.encode_categorical(linkage_info.get("ip", "")),
                VectorLibrary.encode_categorical(linkage_info.get("mac", ""))
            ]
        else:
            host = data.get("host", {})
            host_id = str(host.get("id", "") or host.get("ID", "unknown"))
            linkage_vector = [
                VectorLibrary.encode_categorical(host_id),
                VectorLibrary.encode_categorical(host.get("os", "") or host.get("OS", "")),
                VectorLibrary.encode_categorical(host.get("ip", "")),
                VectorLibrary.encode_categorical(host.get("mac", ""))
            ]
        
        context_vector = [identity_vector] + linkage_vector

        # 2. Map Events
        output_list = []
        
        raw_events = []
        if is_legacy:
            raw_events = data.get("_event", [])
        elif "events" in data:
            raw_events = data.get("events", [])
        elif "event" in data:
            raw_events = [data.get("event", {})]
            
        for e in raw_events:
            details = {}
            event_type = "unknown"
            
            if is_legacy:
                details = e.get("event_details", {})
                if not details and "moment" in e: details = e
                event_type = e.get("event_ID", "unknown")
            else:
                details = e
                if "details" in e: details = e["details"]
                event_type = e.get("type", "") or e.get("id", "") or e.get("event_ID", "unknown")
                
                if "status" in data:
                     details = {**details, **data["status"]}

            # Extract Timestamp (for prepending)
            t_str = details.get("timestamp", "") or details.get("moment", "") or details.get("time", "0")
            if t_str == "0" and not is_legacy:
                 t_str = data.get("timestamp_ref", "0")

            # 15-Dimension Optimized Mapping
            evt_vector = self._map_canonical(event_type, details)
            
            # FLATTEN: Context (5) + Sequence (16) = 21 Dims (Pure Floats)
            flat_vector = context_vector + evt_vector
            
            # Just the raw vector
            output_list.append(flat_vector)

        return output_list

    def _map_canonical(self, type_str, d):
        """
        Maps raw details to Optimized 16 Canonical Dimensions.
        Strict adherence to canonical_mapping.jsonc.
        """
        v = [0.0] * 16
        enc = VectorLibrary.encode_categorical
        norm = VectorLibrary.normalize_size
        
        # 0. Meta
        v[0] = enc(type_str)
        
        # 1. Subject / Source
        # Fields: process, name, q_name, src_ip, src_mac
        val = d.get("process", "") or d.get("name", "") or d.get("q_name", "") or d.get("src_ip", "") or d.get("ip_local", "") or d.get("src_mac", "")
        v[1] = enc(str(val))
        
        # 2. Target / Dest
        # Fields: path, reg_path, dst_ip, dst_mac, q_type
        val = d.get("path", "") or d.get("reg_path", "") or d.get("dst_ip", "") or d.get("dst_mac", "") or d.get("q_type", "")
        v[2] = enc(str(val))
        
        # 3. Data A / Src Port
        # Fields: sha256, size, reg_val, src_port, q_res
        val = d.get("sha256", "") or d.get("size", "") or d.get("reg_val", "") or d.get("src_port", "") or d.get("q_res", "")
        if str(val).isdigit() and d.get("src_port"):
             v[3] = float(val) / 65535.0
        elif isinstance(val, (int, float)) or (isinstance(val, str) and (val.strip().isdigit() or "B" in val.upper())):
             v[3] = norm(val)
        else:
             v[3] = enc(str(val))
        
        # 4. Data B / Dst Port
        # Fields: cmdline, dst_port, term_type, start_type, reg_type, perm_change, q_port
        val = d.get("cmdline", "") or d.get("dst_port", "") or d.get("term_type", "") or d.get("start_type", "") or d.get("reg_type", "") or d.get("perm_change", "") or d.get("q_port", "")
        if str(val).isdigit() and (d.get("dst_port") or d.get("q_port")):
             v[4] = float(val) / 65535.0
        else:
             v[4] = enc(str(val))
        
        # 5. Data C / Protocol
        # Fields: parent, proto, protocol, exit_code, reg_perm, perm
        val = d.get("parent", "") or d.get("proto", "") or d.get("protocol", "") or d.get("exit_code", "") or d.get("reg_perm", "") or d.get("perm", "")
        v[5] = enc(str(val))
        
        # 6. Actor A (Primary)
        val = d.get("user", "") or d.get("account", "") or d.get("reg_user", "")
        v[6] = enc(str(val))
        
        # 7. Actor B (Secondary)
        val = d.get("owner", "") or d.get("creator", "") or d.get("deleter", "") or d.get("reg_owner", "")
        v[7] = enc(str(val))
        
        # 8. Resource A (CPU / Sent)
        val = d.get("cpu", "") or d.get("sent", "")
        v[8] = norm(val)
        if "%" in str(val):
             try: v[8] = float(str(val).replace("%",""))/100.0
             except: pass
             
        # 9. Resource B (RAM / Recv)
        val = d.get("ram", "") or d.get("recv", "")
        v[9] = norm(val)
        if "%" in str(val):
             try: v[9] = float(str(val).replace("%",""))/100.0
             except: pass
             
        # 10. Resource C (Disk)
        val = d.get("disk", "")
        v[10] = norm(val)
        if "%" in str(val):
             try: v[10] = float(str(val).replace("%",""))/100.0
             except: pass

        # 11. Resource D (GPU)
        val = d.get("gpu", "")
        v[11] = norm(val)
        if "%" in str(val):
             try: v[11] = float(str(val).replace("%",""))/100.0
             except: pass
             
        # 12. Aux A
        # Fields: parent_path, src_iface, op_type, size_change
        val = d.get("parent_path", "") or d.get("src_iface", "") or d.get("op_type", "") or d.get("size_change", "")
        v[12] = enc(str(val))
        
        # 13. Aux B
        # Fields: parent_sha256, dst_iface, vlan_src, action
        val = d.get("parent_sha256", "") or d.get("dst_iface", "") or d.get("vlan_src", "") or d.get("action", "")
        v[13] = enc(str(val))
        
        # 14. Aux C
        # Fields: file_type, vlan_dst
        val = d.get("file_type", "") or d.get("vlan_dst", "") or d.get("reg_data", "")
        v[14] = enc(str(val))

        # 15. Time (Timestamp)
        val = d.get("timestamp", "") or d.get("time", "") or d.get("moment", "")
        v[15] = VectorLibrary.parse_time(str(val))
        
        return v

# Server Setup
class RequestHandler(BaseHTTPRequestHandler):
    normalizer = None
    
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            input_data = json.loads(post_data)
            if isinstance(input_data, list):
                # 1. Detect Window Timestamp Header
                window_time = "0"
                events_to_process = input_data
                
                if len(input_data) > 0 and isinstance(input_data[0], dict) and "time_of_packet" in input_data[0]:
                    window_time = input_data[0]["time_of_packet"]
                    events_to_process = input_data[1:] # Skip header
                
                results = []
                for entry in events_to_process:
                    # process_incoming returns a LIST OF VECTORS (usually one)
                    res = self.normalizer.process_incoming(entry)
                    results.extend(res)
                
                # Prepend Window Timestamp to Result List
                final_results = [window_time] + results
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(final_results).encode('utf-8'))
            else:
                # Returns list of vectors (single)
                result = self.normalizer.process_incoming(input_data)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Error: {str(e)}".encode('utf-8'))

    def log_message(self, format, *args):
        return

def run_server():
    config_path = os.path.join(os.path.dirname(__file__), "config.jsonc")
    config = ConfigLoader.load(config_path)
    port = config.get("listening_port", 3000)
    RequestHandler.normalizer = LogNormalizer(config)
    server = HTTPServer(('0.0.0.0', port), RequestHandler)
    print(f"Log Normalizer running on port {port}")
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    server.server_close()

if __name__ == "__main__":
    run_server()
