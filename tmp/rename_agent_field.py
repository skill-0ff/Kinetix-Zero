from pymongo import MongoClient

def rename_agent_field():
    client = MongoClient('mongodb://localhost:27017/')
    db = client['kinetix_brain']
    result = db['agents'].update_many({}, {'$rename': {'live_time': 'created_at'}})
    print(f"[DB] Field rename complete. Matched: {result.matched_count}, Modified: {result.modified_count}")

if __name__ == "__main__":
    rename_agent_field()
