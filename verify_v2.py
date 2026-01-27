import requests
import json
import math

# Sample strictly from event_structure_example.txt
payload = {
    "role": "POST_SERV",
    "timestamp_ref": "12:00:00.000",
    "host": {
        "ID": "0x1A",
        "OS": "Linux",
        "ip": "192.168.1.10",
        "mac": "AA:BB:CC:DD:EE:01"
    },
    "event": {
        "type": "process_start",
        "timestamp": "12:00:00.000",
        "process": "svchost.exe",
        "path": "/bin/svchost",
        "cmdline": "svchost.exe -k netsvcs",
        "parent": "services.exe",
        "user": "root"
    }
}

try:
    print(" sending payload...")
    res = requests.post("http://localhost:3000", json=payload)
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        vec = data["vectors"][0]
        print(f"Vector Length: {len(vec)}")
        
        # Identity Check
        print(f"Role Hash (Slot 0): {vec[0]}")
        
        # Time Check (12:00:00 is exactly half day -> pi radians -> sin=0, cos=-1)
        print(f"Sin(t) (Slot 6): {vec[6]}")
        print(f"Cos(t) (Slot 7): {vec[7]}")
        
        # Process Check
        # svchost.exe is in TOP_K dictionary with score 0.1
        print(f"Process Score (Slot 16): {vec[16]}")
        
        # Network Check - Should be 0.0 for process event
        print(f"SrcIP (Slot 22): {vec[22]}")

        # Assertions
        assert len(vec) == 32, "Vector dimension must be 32"
        assert abs(vec[6] - 0.0) < 0.01, "Sin(12:00) should be ~0"
        assert abs(vec[7] - (-1.0)) < 0.01, "Cos(12:00) should be ~ -1"
        assert vec[16] == 0.1, "svchost.exe should match dict value 0.1"
        assert vec[22] == 0.0, "Network slot must be 0 for process event"
        
        print("\n[SUCCESS] V2 Engine Verification Passed!")
    else:
        print(f"Error: {res.text}")

except Exception as e:
    print(f"Failed: {e}")
