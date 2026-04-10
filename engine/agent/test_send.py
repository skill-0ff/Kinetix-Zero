import socket
import json
import time

TARGET_IP = "127.0.0.1"
TARGET_PORT = 5000

print(f"Sending per-device test logs to {TARGET_IP}:{TARGET_PORT} (Collector Port)...")
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

samples = [
    {
        "device_id": "srv-01",
        "os": "Windows",
        "ip": "10.0.0.10",
        "mac": "AA:BB:CC:DD:EE:10",
        "type": "process_start",
        "timestamp": "12:00:01.120",
        "process": "powershell.exe",
        "cmdline": "powershell -enc ...",
        "user": "administrator",
        "message": "Suspicious process launch",
    },
    {
        "device_id": "rtr-01",
        "src_ip": "10.0.0.10",
        "dst_ip": "8.8.8.8",
        "src_iface": "ge0/0",
        "dst_iface": "ge0/1",
        "src_port": "55342",
        "dst_port": "53",
        "proto": "udp",
        "sent": "300",
        "recv": "180",
        "cpu": "35%",
        "ram": "42%",
    },
    {
        "device_id": "sw-01",
        "src_mac": "AA:BB:CC:DD:EE:10",
        "dst_mac": "AA:BB:CC:DD:EE:11",
        "src_iface": "fa0/1",
        "dst_iface": "fa0/24",
        "proto": "arp",
        "vlan_src": "10",
        "vlan_dst": "20",
        "cpu": "20%",
        "ram": "25%",
    },
    {
        "device_id": "fw-01",
        "src_ip": "172.16.1.50",
        "dst_ip": "10.0.0.10",
        "src_port": "443",
        "dst_port": "53822",
        "proto": "tcp",
        "action": "deny",
        "src_iface": "wan0",
        "dst_iface": "lan0",
        "cpu": "40%",
        "ram": "55%",
    },
]

for idx, log in enumerate(samples, start=1):
    payload = json.dumps(log).encode("utf-8")
    sock.sendto(payload, (TARGET_IP, TARGET_PORT))
    print(f"Sent sample #{idx}: {log.get('device_id')}")
    time.sleep(0.4)

print("Done.")
