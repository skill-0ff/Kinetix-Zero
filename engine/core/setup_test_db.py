from pymongo import MongoClient
import sys

def setup():
    try:
        client = MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=2000)
        db = client.kinetix
        agents = db.agents
        
        # Test agent data
        test_agent = {
            "host_id": "test_agent_001",
            "token": "secret_token_123",
            "status": "pending"
        }
        
        # Upsert
        agents.update_one(
            {"host_id": "test_agent_001"},
            {"$set": test_agent},
            upsert=True
        )
        print("✅ Test agent 'test_agent_001' prepared in MongoDB.")
        
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        sys.exit(1)

if __name__ == "__main__":
    setup()
