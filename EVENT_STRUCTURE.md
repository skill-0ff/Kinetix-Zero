# Kinetix-Zero: Event Structure Documentation (v2.2)

This document describes the current event structure expected by the **Brain** (specifically the `LogNormalizer` in `engine/core/vectorizer.py`). 

> [!IMPORTANT]
> All events MUST be sent as a valid JSON object.

---

## 1. Top-Level Mandatory Fields

Every event payload sent to the Brain must contain these base fields:

- **role**: (`string`) Required. The role of the source device (e.g., `POST_SERV`, `EDGE_FW`).
- **timestamp_ref**: (`string`) Required. Reference timestamp for the packet.
- **host**: (`object`) Required. Identity of the source host.
    - **id**: (`string`) Required. Unique identifier for the host (HEX or UUID).
    - **os**: (`string`) Optional. Operating system type.
    - **ip**: (`string`) Optional. Host IP address.
    - **mac**: (`string`) Optional. Host MAC address.
- **status**: (`object`) Optional. System performance metrics (`cpu`, `ram`, `disk`).
- **event**: (`object`) Required. The actual activity payload. Must contain its own `type` and `timestamp`.

---

## 2. Event Types & Specific Fields

The `event` object must contain a `type` discriminator. Below are the supported types and their specific fields.

- **Endpoint**: `process_start`, `process_kill`, `file_create`, `file_modified`, `file_delete`, `module_load`.
- **Network**: `network_connection`, `dns_query`, `traffic`.
- **Identity**: `console_login`, `session`, `auth_login`.
- **System**: `registry`, `service_create`, `scheduled_task`, `account_management`, `pipe_event`, `wmi_event`, `logging`.

---

## 3. Post-Processing Enrichment (Brain vs AI)

Before an event is saved to the Database, it is enriched by two different components.

### 3.1. Added by the "Brain" (Reception Layer)
*Logic located in `engine/core/brain.py`*

- **`_server_ts`**: (Float) The exact Unix timestamp when the Brain first received the packet. This is the **Server Authority Time**.

### 3.2. Added by the "AI" (Processing Layer)
*Logic located in `engine/ai/inference.py`*

The AI worker adds the following fields during inference and database insertion:

| Field | Source | Description |
| :--- | :--- | :--- |
| **`uuid`** / **`ai_uuid`** | **AI** | A unique HEX identifier generated for the event. |
| **`verdict`** / **`ai_verdict`** | **AI** | Classification result (e.g., `NEW ANOMALY`, `Safe`). |
| **`score`** / **`ai_score`** | **AI** | The raw anomaly score (0.0 to 1.0) from the VAE model. |
| **`timestamp`** | **AI** | The Unix timestamp when the entry was **saved** to the database. |
| **`host_id`** | **AI** | Promoted copy of `host.id` for fast database indexing. |
| **`event_type`** | **AI** | Promoted copy of `event.type` for fast database indexing. |

---

## 4. JSON Example: Data Evolution

### Step 1: Original Event (What you send)
```json
{
    "role": "POST_SERV",
    "timestamp_ref": "14:20:00",
    "host": { "id": "WKS-01" },
    "event": { "type": "process_start", "timestamp": "14:20:00", ... }
}
```

### Step 2: After Brain Reception
```json
{
    "role": "POST_SERV",
    "timestamp_ref": "14:20:00",
    "host": { "id": "WKS-01" },
    "event": { "type": "process_start", ... },
    "_server_ts": 1711817999.5
}
```

### Step 3: Final Database Entry (After AI Processing)
```json
{
    "uuid": "a1b2c3d4e5f6...",
    "timestamp": 1711818000.0,
    "verdict": "NEW ANOMALY",
    "score": 0.8521,
    "host_id": "WKS-01",
    "full_log": {
        "role": "POST_SERV",
        "timestamp_ref": "14:20:00",
        "_server_ts": 1711817999.5,
        "ai_verdict": "NEW ANOMALY",
        "ai_score": 0.8521,
        "ai_uuid": "a1b2c3d4e5f6...",
        "host": { "id": "WKS-01" },
        "event": { "type": "process_start", ... }
    }
}
```

---
> [!NOTE]
> All fields with the `ai_` prefix are nested inside `full_log`, while the top-level versions are used for quick indexing and dashboard displays.
