import requests
import json
import math

FILENAMES = ["multi_host_events_clean.json"]
URL = "http://localhost:3000"

def analyze_vector(idx, vec, raw_event):
    role = raw_event.get("role", "UNKNOWN")
    etype = raw_event.get("event", {}).get("type", "UNKNOWN")
    print(f"\n--- Event {idx}: {role} [{etype}] ---")
    
    # 1. Identity (Slots 0-5)
    print(f"  Identity: Role={vec[0]:.4f}, ID={vec[1]:.4f}, IP={vec[3]:.4f}")

    # 2. Time (Slots 6-7)
    t_str = raw_event.get("timestamp_ref", "00:00:00")
    print(f"  Time ({t_str}): Sin={vec[6]:.4f}, Cos={vec[7]:.4f}")

    # 3. Sparsity Check (Process vs Network)
    proc_score = vec[16] # Process Name
    net_score = vec[22]  # Src IP
    
    if "process" in etype or "file" in etype:
        print(f"  [Sparsity] Process Score: {proc_score:.4f} (Expected > 0)")
        print(f"  [Sparsity] Network Score: {net_score:.4f} (Expected == 0)")
        if proc_score == 0 and "process" in raw_event['event']:
            print("  (!) WARNING: Process name present but score is 0!")
        if net_score != 0:
            print("  (!) ERROR: Network slot populated for Process event!")
            
    elif "traffic" in etype:
        print(f"  [Sparsity] Process Score: {proc_score:.4f} (Expected == 0)")
        print(f"  [Sparsity] Network Score: {net_score:.4f} (Expected > 0)")
        if proc_score != 0:
             print("  (!) ERROR: Process slot populated for Traffic event!")
        if net_score == 0 and "src_ip" in raw_event['event']:
             print("  (!) WARNING: SrcIP present but score is 0!")

    # 4. Special Features
    entropy = vec[19]
    if entropy > 0:
        print(f"  [Feature] CmdLine Entropy: {entropy:.4f}")
    
    direction = vec[15]
    if direction > 0:
        print(f"  [Feature] Flagged External/Direction: {direction}")

    sent_bytes = vec[30]
    if sent_bytes > 0:
         print(f"  [Feature] Data Sent (Log10): {sent_bytes:.4f}")

def run_test():
    try:
        # Load Data
        with open("multi_host_events_clean.json", "r") as f:
            data = json.load(f)
            # Filter dummy time entries that lack "role"
            valid_events = [d for d in data if "role" in d]
            
        print(f"Loaded {len(valid_events)} valid events. Sending to engine...")
        
        # Send Request
        res = requests.post(URL, json=valid_events)
        if res.status_code != 200:
            print(f"Request Failed: {res.text}")
            return
            
        response_data = res.json()
        vectors = response_data["vectors"]
        count = response_data["count"]
        
        print(f"Received {count} vectors.")
        
        # Analyze
        for i, vec in enumerate(vectors):
            analyze_vector(i, vec, valid_events[i])
            
    except Exception as e:
        print(f"Test Failed: {e}")

if __name__ == "__main__":
    run_test()
