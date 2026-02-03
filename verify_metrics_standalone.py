import os
import sys
import psutil
import torch
import shutil
import subprocess
import time

def _get_gpu_stats():
    """Heuristic GPU Stats fetching without heavy libraries"""
    gpus = {}
    
    # Check NVIDIA
    if shutil.which("nvidia-smi"):
        print("Found nvidia-smi")
        try:
            # Get Utilization and Memory in CSV format: utilization.gpu, utilization.memory, memory.total, memory.used
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=utilization.gpu,utilization.memory,memory.total,memory.used', '--format=csv,noheader,nounits'], 
                capture_output=True, text=True, timeout=0.5
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                total_mem = 0
                used_mem = 0
                avg_util = 0
                
                for line in lines:
                    parts = [float(x.strip()) for x in line.split(',')]
                    avg_util += parts[0]
                    total_mem += parts[2]
                    used_mem += parts[3]
                    
                if len(lines) > 0:
                    gpus["system_gpu_percent"] = round(avg_util / len(lines), 1)
                    gpus["system_gpu_mem_percent"] = round((used_mem / total_mem) * 100, 1) if total_mem > 0 else 0
                    gpus["system_gpu_mem_used_mb"] = int(used_mem)
                    gpus["gpu_vendor"] = "nvidia"
        except Exception as e:
            print(f"Nvidia stats failed: {e}")

    return gpus

def get_system_metrics():
    """Captures System and Process Resource Usage"""
    stats = {}
    
    # 1. System Level (Host)
    stats["system_cpu_percent"] = psutil.cpu_percent(interval=1.0) # Blocking for 1s for accurate reading
    
    mem = psutil.virtual_memory()
    stats["system_ram_percent"] = mem.percent
    stats["system_ram_used_gb"] = round(mem.used / (1024**3), 2)
    stats["system_ram_total_gb"] = round(mem.total / (1024**3), 2)
    
    # 2. Process Level (This Script)
    proc = psutil.Process(os.getpid())
    with proc.oneshot():
        stats["process_cpu_percent"] = proc.cpu_percent(interval=None)
        stats["process_ram_rss_mb"] = round(proc.memory_info().rss / (1024**2), 2)
        stats["process_ram_percent"] = round(proc.memory_percent(), 2)

    # 3. GPU Stats
    gpu_stats = _get_gpu_stats()
    if gpu_stats:
        stats.update(gpu_stats)
        
    return stats

if __name__ == "__main__":
    print("Verifying System Metrics Collection...")
    metrics = get_system_metrics()
    print("\n--- Gathered Metrics ---")
    for k, v in metrics.items():
        print(f"{k}: {v}")
    
    print("\nVerification Complete.")
