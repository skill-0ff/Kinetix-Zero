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
from pydantic import BaseModel, Field, ValidationError, Extra, ConfigDict

# ==========================================
# 1. Pydantic Models (Strict Input Validation)
# ==========================================

class HostIdentity(BaseModel):
    id: str
    os: Optional[str] = None
    ip: Optional[str] = None
    mac: Optional[str] = None

    class Config:
        extra = Extra.forbid

# --- Event Sub-Types ---

class BaseEvent(BaseModel):
    timestamp: str 
    class Config:
        extra = Extra.forbid

class ProcessStartEvent(BaseEvent):
    type: Literal["process_start"]
    process: Optional[str] = None
    path: Optional[str] = None
    sha256: Optional[str] = None
    cmdline: Optional[str] = None
    parent: Optional[str] = None
    parent_path: Optional[str] = None
    parent_sha_256: Optional[str] = None
    user: Optional[str] = None
    cpu: Optional[str] = None
    gpu: Optional[str] = None
    ram: Optional[str] = None
    disk: Optional[str] = None

class ProcessKillEvent(BaseEvent):
    type: Literal["process_kill"]
    process: Optional[str] = None
    path: Optional[str] = None
    sha256: Optional[str] = None
    term_type: Optional[str] = None
    exit_code: Optional[str] = None

class FileCreateEvent(BaseEvent):
    type: Literal["file_create"]
    file_type: Optional[str] = None
    path: Optional[str] = None
    hash: Optional[str] = None
    size: Optional[str] = None
    process: Optional[str] = None
    user: Optional[str] = None
    owner: Optional[str] = None

class FileModifiedEvent(BaseEvent):
    type: Literal["file_modified"]
    path: Optional[str] = None
    hash: Optional[str] = None
    process: Optional[str] = None
    size_change: Optional[str] = None
    perm_change: Optional[str] = None
    user: Optional[str] = None
    owner: Optional[str] = None

class FileDeleteEvent(BaseEvent):
    type: Literal["file_delete"]
    path: Optional[str] = None
    process: Optional[str] = None
    size: Optional[str] = None
    user: Optional[str] = None
    perm: Optional[str] = None
    owner: Optional[str] = None

class ServiceCreateEvent(BaseEvent):
    type: Literal["service_create"]
    name: Optional[str] = None
    path: Optional[str] = None
    start_type: Optional[str] = None
    account: Optional[str] = None
    creator: Optional[str] = None

class ServiceDeleteEvent(BaseEvent):
    type: Literal["service_delete"]
    name: Optional[str] = None
    path: Optional[str] = None
    account: Optional[str] = None
    deleter: Optional[str] = None

class ServiceModifiedEvent(BaseEvent):
    type: Literal["service_modified"]
    name: Optional[str] = None
    path: Optional[str] = None
    account: Optional[str] = None
    user: Optional[str] = None

class RegistryEvent(BaseEvent):
    type: Literal["registry"]
    op_type: Optional[str] = None
    reg_path: Optional[str] = None
    reg_val: Optional[str] = None
    reg_type: Optional[str] = None
    reg_user: Optional[str] = None
    reg_owner: Optional[str] = None
    reg_perm: Optional[str] = None

class NetworkConnectionEvent(BaseEvent):
    type: Literal["network_connection"]
    process: Optional[str] = None
    protocol: Optional[str] = None
    ip_local: Optional[Union[bool, str]] = None
    dst_ip: Optional[str] = None
    src_port: Optional[str] = None
    dst_port: Optional[str] = None
    sent: Optional[str] = None
    recv: Optional[str] = None

class DnsQueryEvent(BaseEvent):
    type: Literal["dns_query"]
    q_name: Optional[str] = None
    q_type: Optional[str] = None
    q_res: Optional[str] = None
    q_port: Optional[str] = None
    q_proto: Optional[str] = None

class TrafficEvent(BaseEvent):
    type: Literal["traffic"]
    # Router/Switch/Firewall fields
    src_ip: Optional[str] = None
    dst_ip: Optional[str] = None
    src_iface: Optional[str] = None
    dst_iface: Optional[str] = None
    src_port: Optional[str] = None
    dst_port: Optional[str] = None
    proto: Optional[str] = None
    action: Optional[str] = None
    src_mac: Optional[str] = None
    dst_mac: Optional[str] = None
    vlan_src: Optional[str] = None
    vlan_dst: Optional[str] = None
    sent: Optional[str] = None # Added based on example usage

# Polymorphic Event Union
class ConsoleLoginEvent(BaseEvent):
    type: Literal["console_login"]
    user: Optional[str] = None
    action: Optional[str] = None
    method: Optional[str] = None
    terminal: Optional[str] = None
    result: Optional[str] = None

class SessionEvent(BaseEvent):
    type: Literal["session"]
    session_id: Optional[str] = None
    user: Optional[str] = None
    status: Optional[str] = None
    logon_type: Optional[str] = None
    source_network_address: Optional[str] = None

class AuthLoginEvent(BaseEvent):
    type: Literal["auth_login"]
    user: Optional[str] = None
    domain: Optional[str] = None
    src_ip: Optional[str] = None
    logon_type: Optional[str] = None
    auth_package: Optional[str] = None
    result: Optional[str] = None
    failure_reason: Optional[str] = None

class LoggingEvent(BaseEvent):
    type: Literal["logging"]
    level: Optional[str] = None
    source: Optional[str] = None
    event_id: Optional[str] = None
    message: Optional[str] = None
    task_category: Optional[str] = None

class ScheduledTaskEvent(BaseEvent):
    type: Literal["scheduled_task"]
    task_name: Optional[str] = None
    action: Optional[str] = None
    path: Optional[str] = None
    user: Optional[str] = None

class AccountManagementEvent(BaseEvent):
    type: Literal["account_management"]
    action: Optional[str] = None
    target_user: Optional[str] = None
    subject_user: Optional[str] = None
    domain: Optional[str] = None

class GroupManagementEvent(BaseEvent):
    type: Literal["group_management"]
    action: Optional[str] = None
    group_name: Optional[str] = None
    member_user: Optional[str] = None
    subject_user: Optional[str] = None

class ModuleLoadEvent(BaseEvent):
    type: Literal["module_load"]
    process: Optional[str] = None
    image_path: Optional[str] = None
    sha256: Optional[str] = None
    signed: Optional[str] = None

class PipeEvent(BaseEvent):
    type: Literal["pipe_event"]
    pipe_name: Optional[str] = None
    op_type: Optional[str] = None
    process: Optional[str] = None
    handle_id: Optional[str] = None

class WmiEvent(BaseEvent):
    type: Literal["wmi_event"]
    query: Optional[str] = None
    user: Optional[str] = None
    namespace: Optional[str] = None

EventUnion = Union[
    ProcessStartEvent, ProcessKillEvent, 
    FileCreateEvent, FileModifiedEvent, FileDeleteEvent,
    ServiceCreateEvent, ServiceDeleteEvent, ServiceModifiedEvent,
    RegistryEvent, NetworkConnectionEvent, DnsQueryEvent,
    TrafficEvent,
    ConsoleLoginEvent, SessionEvent, AuthLoginEvent, LoggingEvent,
    ScheduledTaskEvent, AccountManagementEvent, GroupManagementEvent,
    ModuleLoadEvent, PipeEvent, WmiEvent
]

class LogEntry(BaseModel):
    role: str
    timestamp_ref: str
    host: HostIdentity
    status: Optional[Dict[str, str]] = None
    event: EventUnion = Field(..., discriminator='type')

    class Config:
        extra = Extra.ignore

# ==========================================
# 2. Vector Library (Advanced Feature Eng.)
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
    def reload_role_mapping(mapping=None):
        if mapping:
            VectorLibrary.ROLE_MAPPING = mapping
            VectorLibrary.get_role_score.cache_clear()
            return

        try:
            # Look in current directory (core/) first
            base_path = os.path.dirname(os.path.abspath(__file__))
            map_path = os.path.join(base_path, "role_mapping.json")
            
            if not os.path.exists(map_path):
                 # Fallback to parent (engine/)
                 map_path = os.path.join(os.path.dirname(base_path), "role_mapping.json")

            with open(map_path, 'r') as f:
                VectorLibrary.ROLE_MAPPING = json.load(f)
                print(f"[Info] Role Mapping loaded: {len(VectorLibrary.ROLE_MAPPING)} roles")
                VectorLibrary.get_role_score.cache_clear()
        except Exception as e:
            print(f"[Warning] Failed to load role_mapping.json: {e}")
            VectorLibrary.ROLE_MAPPING = {}

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

        # 2. Fallback to Dynamic Hashing (Auto-Learning for Unknown Roles)
        return VectorLibrary.hash_string(role)

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

    def vectorize_batch(self, raw_log_list):
        """
        Batch process a list of raw log dictionaries.
        Returns a list of 32-dim vectors (lists).
        """
        vectors = []
        valid_logs = []
        # Localize for speed
        _to_vec = self.input_to_vector
        _append_v = vectors.append
        _append_l = valid_logs.append
        
        for log in raw_log_list:
            v = _to_vec(log)
            if v:
                _append_v(v)
                _append_l(log)
        return vectors, valid_logs

    def input_to_vector(self, raw_json):
        # Optimization: Pure Python List (Faster than single-row Numpy allocation)
        try:
            # 1. Initialize
            # 1. Initialize
            # [0.0]*34 (2 new dims for Server Time)
            vector = [0.0] * 34
            
            # Helper to get nested safely
            host = raw_json.get("host", {})
            event = raw_json.get("event", {})
            status = raw_json.get("status", {})
            
            role = raw_json.get("role", "")
            
            # [00-05] Identity
            vector[0] = VectorLibrary.get_role_score(role)
            vector[1] = VectorLibrary.hash_string(host.get("id"))
            vector[2] = VectorLibrary.hash_string(host.get("os"))
            vector[3] = VectorLibrary.normalize_ip(host.get("ip"))
            vector[4] = VectorLibrary.hash_string(host.get("mac"))
            vector[5] = 0.5 # Default Maturity

            # [06-07] Time
            t_vec = VectorLibrary.encode_time_cyclic(raw_json.get("timestamp_ref"))
            vector[6] = t_vec[0]
            vector[7] = t_vec[1]

            # [New 08-09] Server Authority Time (For Delta Detection)
            # Uses injected _server_ts from Brain
            server_ts = raw_json.get("_server_ts") 
            # If missing (test script), float(time.time())
            if not server_ts: server_ts = time.time()
            # Convert float timestamp to cyclic
            # HACK: Re-use encode_time_cyclic by converting float -> HH:MM:SS string? 
            # Better: Make encode_time_cyclic accept float. But for now, let's just do math directly to save str alloc
            # 86400 seconds in day
            s_day = server_ts % 86400
            s_angle = s_day * 0.000072722
            vector[8] = math.sin(s_angle)
            vector[9] = math.cos(s_angle)

            # [10-12] Status (Shifted +2)
            if status:
                vector[10] = VectorLibrary.normalize_size(status.get("cpu", 0))
                vector[11] = VectorLibrary.normalize_size(status.get("ram", 0))
                vector[12] = VectorLibrary.normalize_size(status.get("disk", 0))

            # [11-15] Meta
            # [13-17] Meta (Shifted +2)
            vector[13] = VectorLibrary.hash_string(event.get("type"))
            
            # Slot 14: Actor Identity
            actor = event.get("user") or event.get("subject_user") or event.get("reg_user") or event.get("creator") or event.get("account")
            vector[14] = VectorLibrary.hash_string(actor)

            # Slot 15: Action
            act = event.get("action") or event.get("op_type") or event.get("result") or event.get("start_type")
            vector[15] = VectorLibrary.hash_string(act)

            # Slot 16: Auth/Rarity
            auth = event.get("logon_type") or event.get("auth_package") or event.get("signed")
            vector[16] = VectorLibrary.hash_string(auth)

            # Slot 17: Direction
            vector[17] = 0.0

            # [16-19] Actor Context
            # [18-21] Actor Context (Shifted +2)
            # Slot 18: Actor Process
            proc = event.get("process")
            vector[18] = VectorLibrary.get_top_k_score(proc)

            # Slot 19: Actor Path
            path = event.get("path") or event.get("image_path") or event.get("pipe_name")
            vector[19] = VectorLibrary.calculate_entropy(path)

            # Slot 20: Parent/Handle
            parent = event.get("parent") or event.get("handle_id")
            vector[20] = VectorLibrary.hash_string(parent)

            # Slot 21: Payload/Cmd
            cmd = event.get("cmdline") or event.get("query") or event.get("message")
            vector[21] = VectorLibrary.calculate_entropy(cmd)

            # [22] Target Identity (Shifted +2)
            target = event.get("target_user") or event.get("member_user")
            vector[22] = VectorLibrary.hash_string(target)

            # [23-27] Network (Shifted +2)
            vector[23] = VectorLibrary.hash_string(event.get("protocol") or event.get("proto"))
            vector[24] = VectorLibrary.hash_string(event.get("src_ip") or event.get("source_network_address"))
            vector[25] = VectorLibrary.hash_string(event.get("dst_ip"))
            vector[26] = float(event.get("src_port") or 0)
            vector[27] = float(event.get("dst_port") or 0)

            # [26-31] Resource
            # [28-33] Resource (Shifted +2)
            # Slot 28: Resource ID
            res_id = event.get("reg_path") or event.get("task_name") or event.get("group_name") 
            vector[28] = VectorLibrary.hash_string(res_id)

            # Slot 29: Resource Detail
            res_det = event.get("reg_val") or event.get("q_name")
            vector[29] = VectorLibrary.hash_string(res_det)

            # Slot 30: Target Service
            vector[30] = VectorLibrary.hash_string(event.get("name") or event.get("service_name"))

            # Size/Data
            vector[31] = VectorLibrary.normalize_size(event.get("size") or event.get("file_size"))
            vector[32] = VectorLibrary.normalize_size(event.get("sent"))
            vector[33] = VectorLibrary.normalize_size(event.get("recv"))

            return vector

        except Exception as e:
            # print(f"Normalization Error: {e}") # Reduce print spam
            return None

# HTTP Server Removed - Use engine/orchestrator.py
# This file is now a pure library.
