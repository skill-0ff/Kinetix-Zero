import os
import json
import time
import requests
import ipaddress
import uuid
import warnings
from urllib3.exceptions import InsecureRequestWarning

# Suppress SSL warnings if verifying is disabled
warnings.simplefilter('ignore', InsecureRequestWarning)

class MispClient:
    def __init__(self, config):
        self.config = config
        self.enabled = config.get("misp_enabled", False)
        self.url = config.get("misp_url", "").rstrip("/")
        self.key = os.getenv("MISP_API_KEY") 
        self.verify = config.get("misp_verify_ssl", True)
        self.report_dir = "reports"
        
        # Ensure report dir exists
        if self.enabled and not os.path.exists(self.report_dir):
            os.makedirs(self.report_dir, exist_ok=True)
            
        if self.enabled and not self.key:
             print("[MISP] Warning: Enabled but no MISP_API_KEY found in environment.")
             self.enabled = False

    def check_batch(self, logs):
        """
        Extracts observables from a batch of logs, queries MISP, 
        and tags/reports any hits.
        """
        if not self.enabled or not logs:
            return

        # 1. Extraction Phase
        observables = set() # Unique values to query
        ip_map = {}   # Value -> List of Log References
        hash_map = {} # Value -> List of Log References
        
        for log in logs:
            try:
                # Load JSON if string
                data = log if isinstance(log, dict) else json.loads(log)
                event = data.get("event", {})
                
                # A. Extract IPs (Public Only)
                ips = []
                for field in ["src_ip", "dst_ip", "source_network_address"]:
                    val = event.get(field)
                    if val and self._is_public_ip(val):
                        ips.append(val)
                
                for ip in ips:
                    observables.add(ip)
                    if ip not in ip_map: ip_map[ip] = []
                    ip_map[ip].append(data)

                # B. Extract Hashes
                hashes = []
                # Check New 'hash' field (File Events)
                if event.get("hash"): hashes.append(event["hash"])
                # Check Legacy/Specific fields
                if event.get("file_hash"): hashes.append(event["file_hash"])
                if event.get("process_hash"): hashes.append(event["process_hash"])
                if event.get("parent_hash"): hashes.append(event["parent_hash"])
                if event.get("sha256"): hashes.append(event["sha256"])
                
                for h in hashes:
                    if h:
                        observables.add(h)
                        if h not in hash_map: hash_map[h] = []
                        hash_map[h].append(data)
                        
            except:
                continue
                
        if not observables:
            return

        # 2. Query Phase (Batch)
        try:
            hits = self._query_misp(list(observables))
            
            # 3. Match & Report Phase
            for hit in hits:
                val = hit.get("value")
                info = hit.get("Event", {}).get("info", "Unknown Threat")
                event_id = hit.get("event_id")
                
                # Find all logs that matched this value
                affected_logs = []
                if val in ip_map: affected_logs.extend(ip_map[val])
                if val in hash_map: affected_logs.extend(hash_map[val])
                
                for log_entry in affected_logs:
                    # A. Tag In-Memory (For Brain/AI)
                    log_entry["verdict"] = "Known Threat (MISP)"
                    log_entry["misp_hit"] = val
                    
                    # B. Generate Report
                    self._generate_report(log_entry, val, event_id, info)
                    
        except Exception as e:
            print(f"[MISP] Check Failed: {e}")

    def _is_public_ip(self, ip_str):
        try:
            ip = ipaddress.ip_address(ip_str)
            return ip.is_global and not ip.is_loopback and not ip.is_link_local
        except:
            return False

    def _query_misp(self, values):
        """
        Sends a batch search request to MISP.
        Returns list of Attribute objects found.
        """
        url = f"{self.url}/attributes/restSearch"
        headers = {
            "Authorization": self.key,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        payload = {
            "returnFormat": "json",
            "value": values,
            # "type": ["ip-src", "ip-dst", "md5", "sha1", "sha256"] # Optional: Let MISP match any
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload, verify=self.verify, timeout=2.0)
            if response.status_code == 200:
                result = response.json()
                return result.get("response", {}).get("Attribute", [])
            elif response.status_code == 404:
                return []
            else:
                # print(f"[MISP] Error {response.status_code}: {response.text}")
                return []
        except Exception as e:
            # print(f"[MISP] Connection Error: {e}")
            return []

    def _generate_report(self, log, hit_value, event_id, info):
        # CHECK TOGGLE: Generate Report File?
        if not self.config.get("alert_policy", {}).get("misp_report", True):
            return

        try:
            report_id = str(uuid.uuid4())
            filename = f"misp_alert_{int(time.time())}_{report_id}.json"
            path = os.path.join(self.report_dir, filename)
            
            report = {
                "timestamp": int(time.time()),
                "misp_event_id": event_id,
                "misp_info": info,
                "hit_value": hit_value,
                "suspect_event": log # Full context as requested
            }
            
            with open(path, 'w') as f:
                json.dump(report, f, indent=4)
                
            print(f"[ALERT] MISP Hit! Report saved: {path}")
        except:
            pass
