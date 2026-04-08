from pymongo import MongoClient

def populate():
    client = MongoClient("mongodb://localhost:27017/")
    db = client.kinetix
    agents = db.agents
    for i in range(50):
        host_id = f"stress_agent_{i:03}"
        agents.update_one(
            {"host_id": host_id},
            {"$set": {"token": "secret_token_123", "status": "offline"}},
            upsert=True
        )
    print("✅ 50 Stress Agents created in DB.")

if __name__ == "__main__":
    populate()
