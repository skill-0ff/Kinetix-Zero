import requests
import json
import math

FILENAME = "detailed_events.json"
URL = "http://localhost:3000"

def run_verification():
    try:
        with open(FILENAME, 'r') as f:
            data = json.load(f)
            
        print(f"Loaded {len(data)} realistic events from {FILENAME}")
        
        # Send to Engine
        res = requests.post(URL, json=data)
        
        if res.status_code == 200:
            resp = res.json()
            vectors = resp["vectors"]
            print(f"Successfully vectorized {len(vectors)} events.\n")
            
            for i, vec in enumerate(vectors):
                raw = data[i]
                etype = raw['event']['type']
                role = raw['role']
                
                print(f"[{i+1}] {role} :: {etype}")
                
                # Check Sparsity
                proc_val = vec[16] # Process Name
                net_val = vec[22]  # SrcIP
                
                if "process" in etype or "file" in etype or "registry" in etype:
                    print(f"    Sparsity: Process_Slot={proc_val:.4f} (OK) | Network_Slot={net_val:.4f} (Should be 0)")
                    if net_val != 0: print("    ERROR: Network slot polluted!")
                elif "traffic" in etype or "connection" in etype:
                    # network_connection has process, so process slot > 0 is OK
                    if "connection" in etype and proc_val > 0:
                        print(f"    Sparsity: Process_Slot={proc_val:.4f} (OK - Hybrid) | Network_Slot={net_val:.4f} (OK)")
                    elif "traffic" in etype:
                        print(f"    Sparsity: Process_Slot={proc_val:.4f} (Should be 0) | Network_Slot={net_val:.4f} (OK)")
                        if proc_val != 0: print("    ERROR: Process slot polluted!")
                
                # Check Features
                if vec[19] > 0: print(f"    Entropy: {vec[19]:.4f} (Obfuscation detected)")
                if vec[15] == 1.0: print(f"    Direction: External/Inbound")
                if vec[26] > 0: print(f"    Registry: Path Hash {vec[26]:.4f}")
                
                print("")
                
        else:
            print(f"FAILED: {res.status_code} - {res.text}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_verification()
