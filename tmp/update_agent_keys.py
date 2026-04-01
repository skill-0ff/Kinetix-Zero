import secrets
from pymongo import MongoClient

def update_agent_keys():
    client = MongoClient('mongodb://localhost:27017/')
    db = client['kinetix_brain']
    agents = db['agents']
    
    # 1. Update agents that don't have a 'key'
    result = agents.find({"key": {"$exists": False}})
    count = 0
    
    for agent in result:
        # Generate a unique key for each agent
        # Format: kx-[16 random characters]
        new_key = f"kx-{secrets.token_hex(8)}"
        
        agents.update_one(
            {"_id": agent["_id"]},
            {"$set": {"key": new_key}}
        )
        print(f"[DB] Assigned key {new_key} to Agent {agent.get('host_id')}")
        count += 1
        
    print(f"\n[DONE] Successfully updated {count} agents.")

if __name__ == "__main__":
    update_agent_keys()
