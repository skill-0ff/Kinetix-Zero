# Kinetix-Zero: Event Structure Documentation (v2.1)

This document describes the current event structure expected by the **Brain** (specifically the `LogNormalizer` in `engine/core/vectorizer.py`). 

> [!IMPORTANT]
> All events MUST be sent as a valid JSON object.

---

## 1. Top-Level Mandatory Fields

Every event payload sent to the Brain must contain these base fields:

- **role**: (`string`) Required. The role of the source device (e.g., `POST_SERV`, `EDGE_FW`, `POST_SWITCH`).
- **timestamp_ref**: (`string`) Required. Reference timestamp for the packet (e.g., `hh:mm:ss.ms` or ISO format).
    - > [!NOTE]
    - > This is the **primary timestamp** used by the AI Model for cyclic time encoding (determining the time of day for anomaly detection).
- **host**: (`object`) Required. Identity of the source host.
    - **id**: (`string`) Required. Unique identifier for the host (HEX or UUID).
    - **os**: (`string`) Optional. Operating system type (e.g., `Windows`, `Linux`).
    - **ip**: (`string`) Optional. Host IP address.
    - **mac**: (`string`) Optional. Host MAC address.
- **status**: (`object`) Optional. System performance metrics.
    - **cpu**: (`string`) CPU utilization.
    - **ram**: (`string`) RAM utilization.
    - **disk**: (`string`) Disk utilization.
- **event**: (`object`) Required. The actual activity payload. (See [Event Types](#2-event-types--specific-fields))

---

## 2. Event Types & Specific Fields

The `event` object must contain a `type` discriminator . Below are the supported types and their specific fields from the Brain's validation model.


### 2.1. Endpoint Activity
- **process_start**: `process`, `path`, `sha256`, `cmdline`, `parent`, `parent_path`, `parent_sha_256`, `user`, `cpu`, `gpu`, `ram`, `disk`.
- **process_kill**: `process`, `path`, `sha256`, `term_type`, `exit_code`.
- **file_create** / **file_modified** / **file_delete**: `path`, `file_type`, `hash`, `size`, `process`, `user`, `owner`.
- **module_load**: `process`, `image_path`, `sha256`, `signed`.

### 2.2. Network Activity
- **network_connection**: `process`, `protocol`, `ip_local` (bool), `dst_ip`, `src_port`, `dst_port`, `sent`, `recv`.
- **dns_query**: `q_name`, `q_type`, `q_res`, `q_port`, `q_proto`.
- **traffic** (Infrastructure): `src_ip`, `dst_ip`, `src_iface`, `dst_iface`, `src_port`, `dst_port`, `proto`, `action`, `src_mac`, `dst_mac`, `vlan_src`, `vlan_dst`, `sent`.

### 2.3. Identity & Access
- **console_login**: `user`, `action`, `method`, `terminal`, `result`.
- **session**: `session_id`, `user`, `status`, `logon_type`, `source_network_address`.
- **auth_login**: `user`, `domain`, `src_ip`, `logon_type`, `auth_package`, `result`, `failure_reason`.

### 2.4. System & Advanced Activity
- **registry**: `op_type`, `reg_path`, `reg_val`, `reg_type`, `reg_user`, `reg_owner`, `reg_perm`.
- **service_create** / **service_delete** / **service_modified**: `name`, `path`, `start_type`, `account`, `creator`, `deleter`.
- **scheduled_task**: `task_name`, `action`, `path`, `user`.
- **account_management** / **group_management**: `action`, `target_user`, `subject_user`, `domain`, `group_name`, `member_user`.
- **pipe_event**: `pipe_name`, `op_type`, `process`, `handle_id`.
- **wmi_event**: `query`, `user`, `namespace`.
- **logging**: `level`, `source`, `event_id`, `message`, `task_category`.

---

## 3. Brain-Enriched Fields (Post-Processing)

Before saving to the Database, the **Brain** enriches the event with the following internal metadata:

- **`_server_ts`**: Added at reception. Server authority float timestamp. 
    - > [!NOTE]
    - > Used for "Delta Detection" (comparing packet time vs arrival time) for anomaly detection.
- **`uuid`**: Unique HEX identifier for the database document.
- **`verdict`**: Final classification (e.g., `NEW ANOMALY`, `Safe`, `KNOWN THREAT`).
- **`score`**: Raw anomaly score from the AI model (0.0 to 1.0).
- **Indexing Fields**: `host_id`, `role`, and `event_type` are promoted to top-level for query speed.

---

## 4. JSON Example

### Original Ingress Event
```json
{
    "role": "POST_SERV",
    "timestamp_ref": "14:20:05.123",
    "host": { "id": "WKS-01", "os": "Windows" },
    "event": {
        "type": "process_start",
        "process": "powershell.exe",
        "user": "Administrator"
    }
}
```

### Resulting Enriched Database Document (Simplified)
```json
{
    "uuid": "a1b2c3d4e5f6...",
    "timestamp": 1711818000.0,
    "verdict": "NEW ANOMALY",
    "score": 0.8521,
    "host_id": "WKS-01",
    "role": "POST_SERV",
    "full_log": {
        "role": "POST_SERV",
        "timestamp_ref": "14:20:05.123",
        "host": { "id": "WKS-01", ... },
        "event": { "type": "process_start", ... },
        "_server_ts": 1711817999.0
    }
}
```

---

> [!IMPORTANT]
> The Brain automatically injects the `_server_ts` field upon reception. Collectors should **not** include this in their outbound packets.
