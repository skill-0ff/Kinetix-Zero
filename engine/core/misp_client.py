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
    def __init__(self, config, db=None):
        self.config = config
        self.db = db
        self.enabled = config.get("misp_enabled", False)
        self.url = config.get("misp_url", "").rstrip("/")
        self.key = os.getenv("MISP_API_KEY") 
        self.verify = config.get("misp_verify_ssl", True)
        
            
        if self.enabled and not self.key:
             print("[MISP] Warning: Enabled but no MISP_API_KEY found in environment.")
             self.enabled = False
        
        # Initialize MongoDB Indices for Alerts
        if self.enabled and self.db is not None:
             try:
                 self.db.misp_alerts.create_index("misp.hit_value")
                 self.db.misp_alerts.create_index("timestamp")
                 self.db.misp_alerts.create_index("alert_id", unique=True)
             except Exception as e:
                 print(f"[MISP] Index Init Warning: {e}")

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

    def check_batch_optimized(self, new_indicators, logs):
        """
        Receives pre-extracted values from Brain and queries them.
        Iterates full batch for tagging ONLY if there's a hit.
        """
        if not self.enabled or not new_indicators:
            return

        try:
            hits = self._query_misp(new_indicators)
            if not hits: return

            # Build a lookup for fast log tagging
            # Value -> Hit Object
            hit_lookup = {h["value"]: h for h in hits}
            
            for pkt in logs:
                # Search for any value in this log that matched a hit
                found_hit = self._match_pkt_to_hits(pkt, hit_lookup.keys())
                if found_hit:
                    hit_obj = hit_lookup[found_hit]
                    event_id = hit_obj.get("event_id")
                    info = hit_obj.get("Event", {}).get("info", "Unknown")
                    
                    # Tagging (Internal)
                    # Note: pkt is a KinetixPacket object, we might want to convert to dict or 
                    # handle differently if purely binary. But Brain uses 'decoded_logs'
                    # which are Protobuf objects.
                    
                    # Generate Report
                    self._generate_report(pkt, found_hit, event_id, info)
        except Exception as e:
            print(f"[MISP Optimized] Failed: {e}")

    def _match_pkt_to_hits(self, pkt, hit_values):
        """Helper to find if any part of the Protobuf packet matches a MISP hit."""
        # Simple string-based search for speed, or more surgical
        # For Protobuf objects, we'd check known fields
        payload_type = pkt.WhichOneof("payload")
        if payload_type != "event": return None
        
        details_type = pkt.event.WhichOneof("details")
        if not details_type: return None
        details = getattr(pkt.event, details_type)
        
        # Check IPs
        for field in ["src_ip", "dst_ip", "dst_ip_str", "source_network_address"]:
            if hasattr(details, field):
                val = getattr(details, field)
                if val in hit_values: return val
        
        # Check Hashes
        for field in ["sha256", "hash", "parent_sha256", "module_sha256"]:
            if hasattr(details, field):
                val = getattr(details, field)
                if val in hit_values: return val
                
        return None

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
        # 1. Enforcement Check
        if not self.config.get("alert_policy", {}).get("misp_report", True):
            return

        try:
            # 2. Convert to Dict
            if hasattr(log, "SerializeToString"):
                from google.protobuf.json_format import MessageToDict
                log_data = MessageToDict(log, preserving_proto_field_name=True, always_print_fields_with_no_presence=True)
            else:
                log_data = log
            
            # 3. Create Structured Report Document
            ts = int(time.time())
            report = {
                "alert_id": str(uuid.uuid4()),
                "timestamp": ts,
                "timestamp_iso": datetime.datetime.fromtimestamp(ts).isoformat(),
                "verdict": "MISP_HIT",
                "misp": {
                    "event_id": event_id,
                    "hit_value": hit_value,
                    "info": info,
                    "url": f"{self.url}/events/view/{event_id}" if self.url else None
                },
                "suspect_event": log_data
            }

            # 4. Save to MongoDB (The only path)
            if self.db is not None:
                self.db.misp_alerts.insert_one(report)
                print(f"[ALERT] MISP Hit! Alert stored in MongoDB.")
            else:
                print(f"[Warning] MISP Alert detected but MongoDB connection is missing.")

        except Exception as e:
            print(f"[MISP Alert Error] {e}")
