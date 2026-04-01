from pymongo import MongoClient, ASCENDING

def populate_enterprise_roles():
    client = MongoClient('mongodb://localhost:27017/')
    db = client['kinetix_brain']
    roles_col = db['roles']
    
    # 1. Clear existing roles
    roles_col.delete_many({})
    
    # 2. Ensure Unique Index on Name
    roles_col.create_index([("name", ASCENDING)], unique=True)
    
    # 3. Define Standard Enterprise Roles
    # Fields: name, ip, mask, strategic_factor, hardware_constraints (sw, rt, serv, firew, pcs)
    default_roles = [
        {
            "name": "WEB_SERVER",
            "ip": "192.168.10.0",
            "mask": "255.255.255.0",
            "strategic_factor": 0.8,
            "hardware_constraints": {
                "sw": 2, "rt": 1, "serv": 10, "firew": 1, "pcs": 0
            }
        },
        {
            "name": "DATABASE_SERVER",
            "ip": "192.168.20.0",
            "mask": "255.255.255.0",
            "strategic_factor": 1.0, # High Importance
            "hardware_constraints": {
                "sw": 2, "rt": 1, "serv": 5, "firew": 1, "pcs": 0
            }
        },
        {
            "name": "INTERNAL_APP",
            "ip": "192.168.30.0",
            "mask": "255.255.255.0",
            "strategic_factor": 0.7,
            "hardware_constraints": {
                "sw": 4, "rt": 2, "serv": 20, "firew": 2, "pcs": 0
            }
        },
        {
            "name": "OFFICE_LAN",
            "ip": "10.0.0.0",
            "mask": "255.255.0.0",
            "strategic_factor": 0.3, # Medium-Low Importance
            "hardware_constraints": {
                "sw": 10, "rt": 5, "serv": 2, "firew": 5, "pcs": 500
            }
        },
        {
            "name": "ADMIN_BASTION",
            "ip": "172.16.0.0",
            "mask": "255.255.255.0",
            "strategic_factor": 0.95, # Critical Admin Access
            "hardware_constraints": {
                "sw": 1, "rt": 1, "serv": 1, "firew": 1, "pcs": 0
            }
        }
    ]
    
    # 4. Insert Roles
    try:
        roles_col.insert_many(default_roles, ordered=False)
        print(f"[DB] Successfully populated {len(default_roles)} enterprise roles.")
    except Exception as e:
        print(f"[DB Error] Role Population Failed: {e}")

    # 5. Verification listing
    print("\n[VERIFICATION] Current Roles & Networks:")
    for role in roles_col.find({}, {"_id": 0}):
        print(f" - {role['name']:<16} Network: {role['ip']:<12} Mask: {role['mask']:<12} Factor: {role['strategic_factor']}")

if __name__ == "__main__":
    populate_enterprise_roles()
