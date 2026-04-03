import json
import os
import hashlib
import re
import math
import time
import numpy as np
from datetime import datetime
import zlib
from datetime import datetime
from collections import Counter
from functools import lru_cache
from typing import Optional, Dict, Any, List, Union, Literal
 
# ==========================================
# 1. Vector Library (Advanced Feature Eng.)
# ==========================================

class VectorLibrary:
    
    TOP_K_PROCESSES = {
        "svchost.exe": 0.1, "explorer.exe": 0.2, "chrome.exe": 0.3,
        "powershell.exe": 0.9, "cmd.exe": 0.95, "nmap": 0.99
    }

    ROLE_MAPPING = None
    
    # Pre-compiled regex for size extraction
    SIZE_REGEX = re.compile(r"[\d\.]+")

    @staticmethod
    def reload_role_mapping(roles_data=None):
        """
        Reloads the role-to-strategic-factor mapping.
        Accepts: 
        - dict: A direct mapping to use.
        - list: A list of MongoDB role documents with 'name' and 'strategic_factor'.
        """
        if roles_data is None:
            # STRICT MODE: No file fallback. Roles must come from MongoDB.
            VectorLibrary.ROLE_MAPPING = {}
            return

        if isinstance(roles_data, dict):
            VectorLibrary.ROLE_MAPPING = roles_data
        elif isinstance(roles_data, list):
            # Process MongoDB documents
            new_map = {}
            for doc in roles_data:
                name = doc.get("name")
                # STRICT: Must have a strategic_factor defined in DB.
                factor = doc.get("strategic_factor")
                if name and factor is not None:
                    new_map[name.upper()] = float(factor)
            VectorLibrary.ROLE_MAPPING = new_map
        
        VectorLibrary.get_role_score.cache_clear()
        # print(f"[VectorLibrary] Roles synced: {len(VectorLibrary.ROLE_MAPPING if VectorLibrary.ROLE_MAPPING else [])} roles")

    @staticmethod
    @lru_cache(maxsize=128)
    def get_role_score(role):
        if not role: return 0.0
        
        if VectorLibrary.ROLE_MAPPING is None:
            VectorLibrary.reload_role_mapping()

        role_upper = role.upper()
        
        # 1. Check Configured Mappings (Keyword Search)
        # e.g. if "WORKSTATION" is in "MY-WORKSTATION-01" -> 0.1
        for key, val in VectorLibrary.ROLE_MAPPING.items():
            if key in role_upper:
                return float(val)

        # 2. STRICT: If no match is found, return None (Blocks entry)
        return None

    @staticmethod
    def encode_time_cyclic(t_str):
        if not t_str: return [0.0, 0.0]
        try:
            # Expected format: HH:MM:SS... or ISO
            # Fast parse assumption: "HH:MM:SS" is at end or is string
            if "T" in t_str:
                t_str = t_str.split("T")[1]
            parts = t_str.split(":")
            h = int(parts[0])
            m = int(parts[1])
            s = float(parts[2][:6]) # Truncate sub-seconds for safety
            
            seconds_in_day = h * 3600 + m * 60 + s
            # 2*pi / 86400 = 7.2722e-5
            angle = seconds_in_day * 0.000072722
            return [math.sin(angle), math.cos(angle)]
        except:
            return [0.0, 0.0]

    @staticmethod
    def calculate_entropy(text):
        if not text: return 0.0
        # O(N) using Counter instead of O(N^2) count() loop
        length = len(text)
        counts = Counter(text)
        entropy = 0.0
        for count in counts.values():
            p = count / length
            entropy -= p * math.log2(p)
            
        return min(entropy * 0.125, 1.0) # / 8.0

    @staticmethod
    @lru_cache(maxsize=256)
    def get_top_k_score(text):
        if not text: return 0.0
        text_lower = text.lower()
        return VectorLibrary.TOP_K_PROCESSES.get(text_lower, VectorLibrary.hash_string(text_lower))

    @staticmethod
    def hash_string(s):
        if not s: return 0.0
        # Optimization: CRC32 is fast. 
        # Caching not effective here due to high cardinality of inputs (IPs, Hashes)
        val = zlib.crc32(s.encode()) & 0xffffffff
        return (val % 100000) * 0.00001 # / 100000.0

    @staticmethod
    def normalize_ip(ip):
        return VectorLibrary.hash_string(ip)

    @staticmethod
    def normalize_port(p):
        if not p: return 0.0
        try:
            if isinstance(p, (int, float)):
                return math.log10(p + 1) * 0.2
            val = int(p)
            return math.log10(val + 1) * 0.2 # / 5.0
        except:
            return 0.0
    
    @staticmethod
    def normalize_size(s):
        if not s: return 0.0
        if isinstance(s, (int, float)):
            return min(math.log10(s + 1) * 0.1, 1.0)
            
        try:
            s_str = str(s)
            match = VectorLibrary.SIZE_REGEX.search(s_str)
            if not match: return 0.0
            
            num = float(match.group())
            if "MB" in s_str: num *= 1048576
            elif "GB" in s_str: num *= 1073741824
            elif "KB" in s_str: num *= 1024
            
            return min(math.log10(num + 1) * 0.1, 1.0) # / 10.0
        except:
            return 0.0

    @staticmethod
    def normalize_percent(s):
        """
        Normlizes a percentage string (e.g., "85%") or a raw float string (e.g. "0.85")
        to a 0.0 to 1.0 range.
        """
        if not s: return 0.0
        try:
            s_str = str(s).strip()
            if "%" in s_str:
                # Extract digits and decimals before the %
                match = VectorLibrary.SIZE_REGEX.search(s_str)
                if not match: return 0.0
                return min(float(match.group()) / 100.0, 1.0)
            
            # Fallback: Assume it's already a float or a raw number
            val = float(s_str)
            return min(val if val <= 1.0 else val / 100.0, 1.0)
        except:
            return 0.0

# ==========================================
# 3. Log Normalizer (32-Dim Sparse Map)
# ==========================================

class LogNormalizer:
    def __init__(self, config_path="engine/config.jsonc"):
        self.config = self._load_config(config_path)

    def _load_config(self, path):
        if not os.path.exists(path): return {}
        try:
            with open(path, 'r') as f:
                # Robust comment stripping
                lines = []
                for line in f:
                    # Strip // comments
                    if "//" in line:
                        line = line.split("//")[0]
                    line = line.strip()
                    if line:
                        lines.append(line)
                return json.loads("".join(lines))
        except Exception as e:
            print(f"[Warning] Config load error: {e}")
            return {}

    def vectorize_batch(self, packet_list):
        """
        Batch process a list of KinetixPacket objects.
        Returns a list of 34-dim vectors (lists).
        """
        vectors = []
        valid_packets = []
        # Localize for speed
        _to_vec = self.input_to_vector
        _append_v = vectors.append
        _append_p = valid_packets.append
        
        for pkt in packet_list:
            v = _to_vec(pkt)
            if v:
                _append_v(v)
                _append_p(pkt)
        return vectors, valid_packets

    def input_to_vector(self, pkt):
        """
        Processes a KinetixPacket Protobuf object into a 34-dim numeric vector.
        0% JSON, 100% Binary.
        """
        try:
            # 1. Initialize
            vector = [0.0] * 34
            
            # [00-05] Identity
            role_score = VectorLibrary.get_role_score(pkt.role)
            if role_score is None:
                # STOPOVER: Unknown role detected. Stop processing and return None.
                return None
                
            vector[0] = role_score
            vector[1] = VectorLibrary.hash_string(pkt.host.id)
            vector[2] = VectorLibrary.hash_string(pkt.host.os)
            vector[3] = VectorLibrary.normalize_ip(pkt.host.ip)
            vector[4] = VectorLibrary.hash_string(pkt.host.mac)
            vector[5] = 0.5 # Default Maturity

            # [06-07] Agent Time
            t_vec = VectorLibrary.encode_time_cyclic(pkt.timestamp_ref)
            vector[6] = t_vec[0]
            vector[7] = t_vec[1]

            # [08-09] Server Authority Time (For Delta Detection)
            s_ts = pkt.server_ts
            if s_ts:
                s_vec = VectorLibrary.encode_time_cyclic(s_ts)
                vector[8] = s_vec[0]
                vector[9] = s_vec[1]
            else:
                # Fallback if missing
                s_day = time.time() % 86400
                s_angle = s_day * 0.000072722
                vector[8] = math.sin(s_angle)
                vector[9] = math.cos(s_angle)

            # [10-12] Status 
            vector[10] = VectorLibrary.normalize_percent(pkt.status.cpu)
            vector[11] = VectorLibrary.normalize_percent(pkt.status.ram)
            vector[12] = VectorLibrary.normalize_percent(pkt.status.disk)

            # --- EVENT EXTRACTION (Fields 13-33) ---
            if not pkt.HasField("event"):
                return vector

            event = pkt.event
            vector[13] = VectorLibrary.hash_string(event.type)
            
            # Fast-path extraction of 'oneof' details
            detail_type = event.WhichOneof("details")
            if not detail_type:
                return vector
                
            details = getattr(event, detail_type)
            
            # Helper to get field safely (Protobuf attributes always exist if defined, 
            # but we use getattr to handle dynamic field names across different event types)
            def _get(obj, *fields):
                for f in fields:
                    val = getattr(obj, f, None)
                    if val is not None and val != "": return val
                return None

            # Slot 14: Actor Identity
            actor = _get(details, "user", "subject_user", "reg_user", "creator", "account")
            vector[14] = VectorLibrary.hash_string(actor)

            # Slot 15: Action
            act = _get(details, "action", "op_type", "result", "start_type")
            vector[15] = VectorLibrary.hash_string(act)

            # Slot 16: Auth/Rarity
            auth = _get(details, "logon_type", "auth_package", "signed")
            vector[16] = VectorLibrary.hash_string(auth)

            # Slot 18: Actor Process
            proc = getattr(details, "process", None)
            vector[18] = VectorLibrary.get_top_k_score(proc)

            # Slot 19: Actor Path
            path = _get(details, "path", "image_path", "pipe_name")
            vector[19] = VectorLibrary.calculate_entropy(path)

            # Slot 20: Parent/Handle
            parent = _get(details, "parent", "handle_id")
            vector[20] = VectorLibrary.hash_string(parent)

            # Slot 21: Payload/Cmd
            cmd = _get(details, "cmdline", "query", "message")
            vector[21] = VectorLibrary.calculate_entropy(cmd)

            # [22] Target Identity
            target = _get(details, "target_user", "member_user")
            vector[22] = VectorLibrary.hash_string(target)

            # [23-27] Network
            vector[23] = VectorLibrary.hash_string(_get(details, "protocol", "proto"))
            vector[24] = VectorLibrary.hash_string(_get(details, "src_ip", "source_network_address"))
            vector[25] = VectorLibrary.hash_string(getattr(details, "dst_ip", None))
            vector[26] = float(getattr(details, "src_port", 0) or 0)
            vector[27] = float(getattr(details, "dst_port", 0) or 0)

            # [28-33] Resource
            res_id = _get(details, "reg_path", "task_name", "group_name") 
            vector[28] = VectorLibrary.hash_string(res_id)
            
            res_det = _get(details, "reg_val", "q_name")
            vector[29] = VectorLibrary.hash_string(res_det)

            vector[30] = VectorLibrary.hash_string(_get(details, "name", "service_name"))

            # Size/Data
            vector[31] = VectorLibrary.normalize_size(_get(details, "size", "file_size"))
            vector[32] = VectorLibrary.normalize_size(getattr(details, "sent", None))
            vector[33] = VectorLibrary.normalize_size(getattr(details, "recv", None))

            return vector

        except Exception:
            return None

        except Exception as e:
            # print(f"Normalization Error: {e}") # Reduce print spam
            return None

# HTTP Server Removed - Use engine/orchestrator.py
# This file is now a pure library.
