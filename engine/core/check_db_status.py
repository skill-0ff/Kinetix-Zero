from pymongo import MongoClient

def check_agent_status():
    client = MongoClient("mongodb://localhost:27017/")
    db = client.database_names = client.kinetix
    agents = db.agents
    
    agent = agents.find_one({"host_id": "test_agent_001"})
    if agent:
        print(f"Agent ID: {agent.get('host_id')}")
        print(f"Status:   {agent.get('status')}")
        print(f"Token:    {agent.get('token')}")
        print(f"Last Seen: {agent.get('last_handshake')}")
    else:
        print("Agent not found in DB.")

if __name__ == "__main__":
    check_agent_status()
