import socket
import json
import time

def test_registration_flow():
    # 1. Configuration
    COLLECTOR_IP = "127.0.0.1"
    COLLECTOR_PORT = 5001
    
    # Simulation agent details
    # We use a 127.0.0.1 address, but for testing, we'll assume there is a role 
    # that covers localhost or we will use a real-world IP if the DB has it.
    # Note: Our DB has 192.168.10.0/24 for WEB_SERVER.
    # To test this locally, we'll send a request with an IP field.
    
    reg_request = {
        "type": "registration_request",
        "host_id": "TEST-AGENT-X1",
        "ip": "192.168.10.55" # Should match WEB_SERVER role
    }
    
    print(f"[Test] Sending registration request for {reg_request['host_id']}...")
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(5.0)
    
    try:
        # SEND
        sock.sendto(json.dumps(reg_request).encode(), (COLLECTOR_IP, COLLECTOR_PORT))
        
        # RECEIVE RESPONSE
        data, addr = sock.recvfrom(4096)
        response = json.loads(data)
        
        if response.get("type") == "registration_success":
            print("\n[SUCCESS] Agent Registered!")
            print(f" - Host ID: {response.get('host_id')}")
            print(f" - Role:    {response.get('role')}")
            print(f" - Key:     {response.get('key')}")
            print("\n[Info] You can now use this key in the 'auth' block of your logs.")
        else:
            print(f"\n[FAILED] Registration rejected: {response}")
            
    except socket.timeout:
        print("\n[ERROR] Request timed out. Is the collector running?")
    except Exception as e:
        print(f"\n[ERROR] {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    test_registration_flow()
