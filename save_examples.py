import json
import os
import time
from pymongo import MongoClient

def save_to_db():
    try:
        # Load the examples
        file_path = os.path.join(os.getcwd(), 'anomaly_example.json')
        with open(file_path, 'r') as f:
            events = json.load(f)
        
        # Connect to MongoDB (Standard URI from config)
        client = MongoClient("mongodb://localhost:27017/")
        
        # USE THE CORRECT DB NAME FROM server.py
        db = client['kinetix_brain']
        collection = db['events']
        
        # Clean existing test entries to avoid duplicates
        test_hosts = ["SRV-WEB-PROD", "0xABC123", "0xDEADBEEF", "0xABCDEF", "SRV-APPS-02", "CORE-SW-01"]
        collection.delete_many({"host_id": {"$in": test_hosts}})
        
        # Inject required API metadata
        now = time.time()
        for i, ev in enumerate(events):
            # 1. API uses top-level 'timestamp' (float) for sorting and streaming
            ev["timestamp"] = now - (len(events) - i) * 60
            
            # 2. Frontend (Threat.jsx) REQUIRES status: "active" to display
            ev["status"] = "active"
            
        # Insert
        result = collection.insert_many(events)
        print(f"Successfully inserted {len(result.inserted_ids)} events into 'kinetix_brain.events'.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    save_to_db()
