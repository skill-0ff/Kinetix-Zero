import sys
import os
import json
import random
sys.path.append(os.getcwd())

try:
    from engine.log_vector_normalizer import LogNormalizer, VectorLibrary
    # Ensure role mapping is loaded
    VectorLibrary.get_role_score("init") 
except ImportError:
    print("Run from root directory!")
    sys.exit(1)

OUTPUT_FILE = "ai/training_data.json"
COUNT_PER_ROLE = 1000
normalizer = LogNormalizer()

def generate_workstation_event():
    # Workstations doing normal things: Chrome, Word, DNS
    return {
        "role": "WORKSTATION",
        "timestamp_ref": "10:00:00.000",
        "host": {"id": f"WKSTN-{random.randint(1,100)}"},
        "event": {
            "type": "process_start",
            "timestamp": "10:00:00.000",
            "process": random.choice(["chrome.exe", "winword.exe", "explorer.exe"]),
            "user": "CORP\\User",
            "path": "C:\\Program Files\\..."
        }
    }

def generate_dc_event():
    # DCs doing normal things: Auth, Account Mgmt
    return {
        "role": "DC",
        "timestamp_ref": "10:00:00.000",
        "host": {"id": f"DC-{random.randint(1,10)}"},
        "event": {
            "type": "auth_login",
            "timestamp": "10:00:00.000",
            "user": "CORP\\User",
            "result": "Success",
            "logon_type": "3" # Network
        }
    }

def generate_server_event():
    # Servers: File operations
    return {
        "role": "FILE_SERVER",
        "timestamp_ref": "10:00:00.000",
        "host": {"id": f"SRV-{random.randint(1,50)}"},
        "event": {
            "type": "file_create",
            "timestamp": "10:00:00.000",
            "file_type": ".docx",
            "path": "D:\\Shares\\Docs\\file.docx",
            "size": str(random.randint(1000, 1000000))
        }
    }

def run():
    vectors = []
    print(f"Generating {COUNT_PER_ROLE*3} synthetic vectors...")
    
    for _ in range(COUNT_PER_ROLE):
        vectors.append(normalizer.input_to_vector(generate_workstation_event()))
        vectors.append(normalizer.input_to_vector(generate_dc_event()))
        vectors.append(normalizer.input_to_vector(generate_server_event()))
    
    # Filter Nones
    vectors = [v for v in vectors if v]
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(vectors, f)
        
    print(f"Saved {len(vectors)} vectors to {OUTPUT_FILE}")

if __name__ == "__main__":
    run()
