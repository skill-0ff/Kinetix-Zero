import os
import secrets
import string
import subprocess
import sys
import shutil

# --- helper functions ---

def install_deps():
    print("[Setup] Checking dependencies...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirement.txt"])
    print("[Setup] Dependencies installed.")

def generate_pwd(length=32):
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for i in range(length))

def run_mongo_cmd(cmd):
    # Runs a command via mongo shell, assuming 'mongo' or 'mongosh' is in path
    # But new Mongo versions use mongosh.
    # We will try to execute js using pymongo instead? 
    # Actually, we need to START the DB first to configure it.
    pass

def setup_local_mongo(pwd):
    print("\n[Setup] Configuring LOCAL MongoDB with Auth...")
    db_path = os.path.join(os.getcwd(), "DB", "event")
    os.makedirs(db_path, exist_ok=True)
    
    # 1. Start Mongo without Auth
    print("  > Starting temporary MongoDB instance...")
    proc = subprocess.Popen(
        ["mongod", "--dbpath", db_path, "--port", "27017", "--bind_ip", "127.0.0.1", "--noauth"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    
    try:
        # Give it a second to start
        import time
        from pymongo import MongoClient
        time.sleep(3)
        
        # 2. Connect and Create User
        client = MongoClient("mongodb://localhost:27017/")
        print("  > Creating User 'brain_admin'...")
        admin_db = client["admin"]
        admin_db.command("createUser", "brain_admin", pwd=pwd, roles=["root"])
        print("  > User Created.")
        client.close()
        
    except Exception as e:
        print(f"  [!] Error configuring Mongo: {e}")
    finally:
        # 3. Stop Mongo
        print("  > Stopping temporary MongoDB...")
        proc.terminate()
        proc.wait()
    
    return f"mongodb://brain_admin:{pwd}@localhost:27017/"

# --- Main Logic ---

def main():
    print("=== Kinetix Brain Setup ===")
    
    # 1. Install Deps
    try:
        install_deps()
    except:
        print("[!] Failed to install dependencies. Please run 'pip install -r requirement.txt' manually.")
        return

    # 2. Local or Remote?
    print("\nEnvironment Configuration")
    mode = input("Are you using a Local database (Auto-Config) or Remote (Manual)? [L/r]: ").lower()
    
    env_content = ""
    
    if mode == 'r':
        # REMOTE
        print("\n--- Remote Database Setup ---")
        q_url = input("Enter Qdrant URL (e.g. http://node1:6333): ").strip()
        q_key = input("Enter Qdrant API Key (optional): ").strip()
        m_uri = input("Enter Mongo Connection URI: ").strip()
        
        env_content += f"QDRANT_URL={q_url}\n"
        if q_key: env_content += f"QDRANT_API_KEY={q_key}\n"
        env_content += f"MONGO_URI={m_uri}\n"
        
    else:
        # LOCAL
        print("\n--- Local Database Setup ---")
        mon_pwd = generate_pwd()
        
        # Configure Mongo User
        full_mongo_uri = setup_local_mongo(mon_pwd)
        
        env_content += f"# Local Auto-Generated Config\n"
        env_content += f"MONGO_URI={full_mongo_uri}\n"
        
        # Local Qdrant doesn't strictly need API key if embedded, 
        # but if user runs Qdrant Server separately later, they might want one.
        # For embedded, we don't set QDRANT_URL.
        env_content += f"# QDRANT_PATH is used (Default: DB/vector)\n"

    # 3. Write .env
    with open(".env", "w") as f:
        f.write(env_content)
    
    print("\n[Setup] Security Configuration Saved to .env")
    print("-" * 50)
    print(env_content)
    print("-" * 50)
    
    # 4. Instructions
    print("\n[Done] Setup Complete.")
    if mode != 'r':
        print("IMPORTANT: You must now start the Local DB with Auth enabled.")
        print("We need to update 'start_brain_db.sh' to enforce --auth.")
        
        # Auto-patch start script?
        update_script = input("Update start_brain_db.sh to enable --auth? [Y/n]: ").lower()
        if update_script != 'n':
            with open("start_brain_db.sh", "r") as f:
                script = f.read()
            if "--auth" not in script:
                script = script.replace("mongod --dbpath", "mongod --auth --dbpath")
                with open("start_brain_db.sh", "w") as f:
                    f.write(script)
                print("  > Script Updated.")
    
    print("\nRun './start_brain_db.sh' then 'python3 engine/core/orchestrator.py' to begin.")

if __name__ == "__main__":
    main()
