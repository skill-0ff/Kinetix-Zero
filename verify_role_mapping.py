import requests
import json
import zlib

URL = "http://localhost:3000"

def get_hash(s):
    return (zlib.crc32(s.encode()) & 0xffffffff) % 100000 / 100000.0

EVENTS = [
    {"role": "WORKSTATION", "expect": 0.1},
    {"role": "LAPTOP", "expect": 0.1},      # Mapped in role_mapping.json
    {"role": "DC", "expect": 0.9},
    {"role": "UNKNOWN_HOST", "expect": "HASH"}, 
    {"role": "MY-WORKSTATION-01", "expect": 0.1} # "WORKSTATION" in string
]

payload = []
for e in EVENTS:
    payload.append({
        "role": e["role"],
        "timestamp_ref": "12:00:00.000",
        "host": {"id": "test"},
        "event": {
            "type": "process_start",
            "timestamp": "12:00:00.000",
            "process": "test.exe"
        }
    })

def verify():
    print("Verifying Role Mapping...")
    try:
        res = requests.post(URL, json=payload)
        if res.status_code != 200:
            print(f"Error: {res.status_code} {res.text}")
            return

        vectors = res.json()["vectors"]
        for i, vec in enumerate(vectors):
            role = EVENTS[i]["role"]
            expected = EVENTS[i]["expect"]
            actual = vec[0]
            
            if expected == "HASH":
                # Calculate expected hash
                expected_val = get_hash(role)
                match = abs(actual - expected_val) < 0.0001
                print(f"[{'OK' if match else 'FAIL'}] Role '{role}' -> Actual: {actual:.4f} (Expected Hash: {expected_val:.4f})")
            else:
                match = abs(actual - expected) < 0.0001
                print(f"[{'OK' if match else 'FAIL'}] Role '{role}' -> Actual: {actual:.4f} (Expected Map: {expected})")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    verify()
