import os
import sys
import time
import threading
import subprocess
import json

def check_requirements():
    """Check and auto-install all required packages for Core and AI"""
    print("[Control] Checking system requirements for Core & AI...")
    
    # Core requirements
    reqs = [
        "psutil", 
        "gputil", 
        "torch", 
        "pymongo", 
        "numpy", 
        "flask", 
        "flask_cors", 
        "sentence_transformers", 
        "qdrant_client",
        "scikit-learn"
    ]
    
    missing = []
    for req in reqs:
        try:
            # Map package names to import names if necessary
            import_name = req
            if req == "scikit-learn": import_name = "sklearn"
            __import__(import_name)
        except ImportError:
            missing.append(req)
    
    if missing:
        print(f"[Control] Missing requirements found: {', '.join(missing)}")
        print(f"[Control] Installing missing packages now via pip...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing)
            print("[Control] Requirements installed successfully.")
        except Exception as e:
            print(f"[Control] Failed to install requirements: {e}")
            print("[Control] Please install manually or check permissions.")
            sys.exit(1)
    else:
        print("[Control] All core and AI requirements are met. ✅")

# Run dependency check before importing 3rd party modules
check_requirements()

import psutil
try:
    import GPUtil
except ImportError:
    GPUtil = None

# In-Memory Variable for Metrics (replaces DB writing)
engine_metrics = {
    "uptime_seconds": 0,
    "cpu_percent": 0.0,
    "ram_percent": 0.0,
    "gpu_percent": 0.0,
    "status": "Starting..."
}

# Global tracking variables
engine_proc = None
engine_start_time = 0

def start_engine_process():
    global engine_proc, engine_start_time
    if engine_proc is not None and engine_proc.poll() is None:
        return False, "Engine is already running"
        
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    core_path = os.path.join(script_dir, "core", "brain.py")
    
    if not os.path.exists(core_path):
        return False, "brain.py not found"
        
    engine_proc = subprocess.Popen([sys.executable, core_path])
    engine_start_time = time.time()
    print(f"[Control] Core process started [PID: {engine_proc.pid}]")
    return True, "Engine started"

def stop_engine_process():
    global engine_proc
    if engine_proc is None or engine_proc.poll() is not None:
        return False, "Engine is not running"
        
    print(f"[Control] Terminating Core process [PID: {engine_proc.pid}]")
    engine_proc.terminate()
    try:
        engine_proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        engine_proc.kill()
    
    engine_proc = None
    
    # Reset metrics
    engine_metrics["status"] = "Offline"
    engine_metrics["cpu_percent"] = 0.0
    engine_metrics["ram_percent"] = 0.0
    engine_metrics["uptime_seconds"] = 0
    return True, "Engine stopped"

def monitor_resources():
    """Background thread to poll psutil/GPUtil and save to variable"""
    global engine_proc, engine_start_time
    
    while True:
        try:
            if engine_proc is None or engine_proc.poll() is not None:
                engine_metrics["status"] = "Offline"
                engine_metrics["cpu_percent"] = 0.0
                engine_metrics["ram_percent"] = 0.0
                time.sleep(1)
                continue
                
            # Engine is running
            engine_metrics["uptime_seconds"] = int(time.time() - engine_start_time)
            
            try:
                p = psutil.Process(engine_proc.pid)
                # Use a small interval for non-blocking CPU check
                cpu = p.cpu_percent(interval=None) 
                ram = p.memory_percent()
                
                engine_metrics["status"] = "Online"
                engine_metrics["cpu_percent"] = round(cpu, 1)
                engine_metrics["ram_percent"] = round(ram, 1)
            except psutil.NoSuchProcess:
                engine_proc = None # Mark as dead
                continue

            # GPU Metrics (If NVIDIA GPU is present)
            if GPUtil:
                gpus = GPUtil.getGPUs()
                if gpus:
                    engine_metrics["gpu_percent"] = round(gpus[0].load * 100, 1)
            
            time.sleep(1) # Refresh rate: 1 second
            
        except Exception as e:
            print(f"[Monitor Error] {e}")
            time.sleep(2)

def start_metrics_api():
    """Runs a tiny localized Flask server purely to serve the in-memory variables to the Frontend"""
    from flask import Flask, jsonify
    from flask_cors import CORS
    import logging
    
    app = Flask(__name__)
    CORS(app)
    
    # Suppress normal flask request logging so console stays clean
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    @app.route('/api/control/metrics', methods=['GET'])
    def get_metrics():
        return jsonify(engine_metrics)
        
    @app.route('/api/control/start', methods=['POST'])
    def start_engine():
        success, msg = start_engine_process()
        return jsonify({"success": success, "message": msg})

    @app.route('/api/control/stop', methods=['POST'])
    def stop_engine():
        success, msg = stop_engine_process()
        return jsonify({"success": success, "message": msg})
        
    print("[Control] In-Memory Metrics API running on :5002")
    # Run on 5002 since main API is on 5000/5001
    app.run(host="0.0.0.0", port=5002, threaded=True, use_reloader=False)

def run_manager():
    print("="*60)
    print(" KINETIX-ZERO CONTROL MANAGER ".center(60, " "))
    print("="*60)
    
    # Start engine on boot
    start_engine_process()
    
    # Start the monitoring background thread
    monitor_thread = threading.Thread(
        target=monitor_resources, 
        daemon=True
    )
    monitor_thread.start()
    
    # Start the local metrics API to serve the variables and endpoints
    try:
        start_metrics_api()
    except KeyboardInterrupt:
        print("\n[Control] Shutting down...")
        stop_engine_process()
        print("[Control] Manager terminated cleanly.")

if __name__ == "__main__":
    run_manager()
