from pymongo import MongoClient

def drop_metrics_collection():
    client = MongoClient('mongodb://localhost:27017/')
    db = client['kinetix_brain']
    if 'metrics' in db.list_collection_names():
        db['metrics'].drop()
        print("[DB] Successfully dropped the 'metrics' collection.")
    else:
        print("[DB] 'metrics' collection does not exist.")

if __name__ == "__main__":
    drop_metrics_collection()
