import time
import os
import threading
import json
from datetime import datetime, timedelta
from pymongo import MongoClient
from qdrant_client import QdrantClient
from qdrant_client.http import models

class Janitor(threading.Thread):
    def __init__(self, config_path):
        super().__init__()
        self.config_path = config_path
        self.running = True
        self.daemon = True
        self.config = {}
        self.load_config()
        
        # Connect to DBs
        self._init_dbs()

    def load_config(self):
        try:
            with open(self.config_path, 'r') as f:
                # Remove comments manually if needed, or use a comment-supporting parser
                # Using standard json for now, assuming stripped/valid jsonc
                content = f.read()
                # fast & dirty comment stripper
                import re
                content = re.sub(r'//.*', '', content)
                self.config = json.loads(content)
        except Exception as e:
            print(f"[Janitor] Config Load Failed: {e}")

    def _init_dbs(self):
        try:
            # MongoDB
            mongo_uri = os.getenv("MONGO_URI") or self.config.get("mongo_uri", "mongodb://localhost:27017/")
            
            # Security: Auto-Enforce TLS for Remote (non-local) if not in URI
            is_remote = "localhost" not in mongo_uri and "127.0.0.1" not in mongo_uri
            mongo_kwargs = {"serverSelectionTimeoutMS": 5000}
            
            if is_remote and "ssl=true" not in mongo_uri and "tls=true" not in mongo_uri:
                 print("[Janitor] Enforcing TLS for Remote Mongo Connection")
                 mongo_kwargs["tls"] = True
                 mongo_kwargs["tlsAllowInvalidCertificates"] = False # Strict

            self.mongo = MongoClient(mongo_uri, **mongo_kwargs)
            self.db = self.mongo["kinetix_brain"]
            
            # Qdrant
            q_url = os.getenv("QDRANT_URL") or self.config.get("qdrant_url")
            q_key = os.getenv("QDRANT_API_KEY")
            q_path = self.config.get("qdrant_path", "DB/vector")
            
            if q_url:
                # Security Check
                if not q_url.startswith("https://") and "localhost" not in q_url and "127.0.0.1" not in q_url:
                    print(f"  [Janitor WARNING] Remote Qdrant using insecure HTTP. Recommend HTTPS for sensitive data.")
                self.qdrant = QdrantClient(url=q_url, api_key=q_key)
            else:
                self.qdrant = QdrantClient(path=q_path)
                
            self.collection = "brain_memory"
            print("[Janitor] Connected to DBs.")
            
        except Exception as e:
            print(f"[Janitor] DB Init Failed: {e}")
            self.mongo = None
            self.qdrant = None

    def run(self):
        print("[Janitor] Service Started.")
        while self.running:
            try:
                # Reload Config to check for policy changes
                self.load_config()
                policy = self.config.get("retention_policy", {})
                
                if policy.get("enabled", False):
                    self.prune_data(policy)
                
                # Sleep interval
                hours = policy.get("run_interval_hours", 24)
                sleep_sec = max(3600, hours * 3600) # Min 1 hour
                
                # Sleep in chunks to allow graceful stop
                for _ in range(int(sleep_sec / 10)): 
                    if not self.running: break
                    time.sleep(10)
                    
            except Exception as e:
                print(f"[Janitor] Error: {e}")
                time.sleep(300) # Retry after 5 min on error

    def prune_data(self, policy):
        keep_days = policy.get("keep_days", {})
        now = time.time()
        
        print("[Janitor] Running Prune Cycle...")
        
        for dtype, days in keep_days.items():
            cutoff = now - (days * 86400)
            
            # 1. MongoDB Prune
            if self.mongo:
                try:
                    # Specific collection logic
                    if dtype == "ddos_evidence":
                        res = self.db["ddos"].delete_many({"timestamp": {"$lt": cutoff}})
                        if res.deleted_count > 0:
                            print(f"  [Mongo] Deleted {res.deleted_count} old DDoS records (< {days} days)")
                    else:
                        # Event Log Prune
                        # Verdict mapping might differ slightly, matching string exact
                        # ai_safe -> "ai_safe", new_anomaly -> "NEW ANOMALY", etc.
                        # We need a map.
                        verdict_map = {
                            "ai_safe": "ai_safe",
                            "new_anomaly": "NEW ANOMALY",
                            "known_threat": "KNOWN THREAT",
                            "false_positive": "FALSE POSITIVE",
                            "misp_alert": "Known Threat (MISP)" # Or similar?
                        }
                        
                        v_str = verdict_map.get(dtype, dtype)
                        
                        # Handle MISP variation if regex needed? No, keep simple.
                        # If misp_alert, verdict is usually "Known Threat (MISP)"
                        
                        query = {"timestamp": {"$lt": cutoff}}
                        if dtype != "ddos_evidence":
                            query["verdict"] = v_str
                            
                        res = self.db["events"].delete_many(query)
                        if res.deleted_count > 0:
                            print(f"  [Mongo] Deleted {res.deleted_count} {dtype} records (< {days} days)")
                            
                except Exception as e:
                    print(f"  [Mongo] Prune Error ({dtype}): {e}")

            # 2. Qdrant Prune
            if self.qdrant:
                try:
                    # Qdrant Type Mapping
                    # payload.type: "ai_safe", "New", "Known??"
                    # Actually inference.py saves:
                    # Safe -> "ai_safe"
                    # Anomaly -> "New"
                    # It DOES NOT save "Known Threat" or "False Positive" to Qdrant (they are ignored/not upserted).
                    # So we only really need to prune "ai_safe" and "New".
                    
                    q_type_map = {
                        "ai_safe": "ai_safe",
                        "new_anomaly": "New"
                    }
                    
                    q_type = q_type_map.get(dtype)
                    
                    if q_type:
                        # Construct Filter
                        blob = models.Filter(
                            must=[
                                models.FieldCondition(
                                    key="timestamp",
                                    range=models.Range(lt=cutoff)
                                ),
                                models.FieldCondition(
                                    key="type",
                                    match=models.MatchValue(value=q_type)
                                )
                            ]
                        )
                        
                        # Delete
                        res = self.qdrant.delete(
                            collection_name=self.collection,
                            points_selector=models.FilterSelector(filter=blob)
                        )
                        # Qdrant delete returns UpdateResult, doesn't always show count easily without search first.
                        # But it works.
                        print(f"  [Qdrant] Pruned expired vectors for {dtype} (< {days} days)")
                        
                except Exception as e:
                    print(f"  [Qdrant] Prune Error ({dtype}): {e}")
        
        print("[Janitor] Prune Cycle Complete.")
