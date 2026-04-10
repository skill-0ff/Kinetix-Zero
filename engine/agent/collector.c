#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <bcrypt.h>

#pragma comment(lib, "ws2_32.lib")

#define BUFFER_SIZE 65535
#define INTERNAL_PORT 5001
#define LISTENING_PORT 5000
#define KEY_FILE "collector.key"

// CNG Variables for AES-GCM
BCRYPT_ALG_HANDLE hAesAlg = NULL;
BCRYPT_KEY_HANDLE hKey = NULL;
PBYTE pbKeyObject = NULL;
DWORD cbKeyObject = 0;
FILETIME lastKeyTime = {0};

// Replay Protection Cache
typedef struct {
    uint32_t ip;
    double last_seq;
} ReplayCache;
#define REPLAY_CACHE_SIZE 256
ReplayCache replay_cache[REPLAY_CACHE_SIZE] = {0};

// Hex to Bin helper
static void hex2bin(const char *hex, BYTE *bin, size_t bin_len) {
    for (size_t i = 0; i < bin_len; i++) {
        sscanf(hex + 2 * i, "%2hhx", &bin[i]);
    }
}

// Load or Reload Key from File
static void check_and_reload_key() {
    WIN32_FILE_ATTRIBUTE_DATA fileInfo;
    if (GetFileAttributesEx(KEY_FILE, GetFileExInfoStandard, &fileInfo)) {
        if (CompareFileTime(&fileInfo.ftLastWriteTime, &lastKeyTime) > 0) {
            FILE *f = fopen(KEY_FILE, "rb");
            if (f) {
                char hex_key[65] = {0};
                fread(hex_key, 1, 64, f);
                fclose(f);
                
                BYTE key[32];
                hex2bin(hex_key, key, 32);

                if (!hAesAlg) {
                    BCryptOpenAlgorithmProvider(&hAesAlg, BCRYPT_AES_ALGORITHM, NULL, 0);
                    BCryptSetProperty(hAesAlg, BCRYPT_CHAINING_MODE, (PBYTE)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0);
                    DWORD cbData = 0;
                    BCryptGetProperty(hAesAlg, BCRYPT_OBJECT_LENGTH, (PBYTE)&cbKeyObject, sizeof(DWORD), &cbData, 0);
                    pbKeyObject = (PBYTE)HeapAlloc(GetProcessHeap(), 0, cbKeyObject);
                }

                if (hKey) {
                    BCryptDestroyKey(hKey);
                    hKey = NULL;
                }

                BCryptGenerateSymmetricKey(hAesAlg, &hKey, pbKeyObject, cbKeyObject, key, 32, 0);
                lastKeyTime = fileInfo.ftLastWriteTime;
                printf("[Collector] AES-256-GCM Key dynamically loaded/rotated.\n");
            }
        }
    }
}

typedef struct {
    char value[256];
    int found;
} Extracted;

static void current_time_hms_ms(char *out, size_t out_size) {
    SYSTEMTIME st;
    GetLocalTime(&st);
    snprintf(out, out_size, "%02d:%02d:%02d.%03d", st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
}

static const char *skip_ws(const char *p) {
    while (p && *p && isspace((unsigned char)*p)) p++;
    return p;
}

static int has_json_key(const char *json, const char *key) {
    char pattern[128];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    return strstr(json, pattern) != NULL;
}

static const char *find_key_value_start(const char *json, const char *key) {
    char pattern[128];
    const char *p;
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    p = strstr(json, pattern);
    if (!p) return NULL;

    p += strlen(pattern);
    p = skip_ws(p);
    if (!p || *p != ':') return NULL;
    p++;
    return skip_ws(p);
}

static Extracted extract_json_value(const char *json, const char *key) {
    Extracted out = {{0}, 0};
    const char *p = find_key_value_start(json, key);
    size_t i = 0;

    if (!p || !*p) return out;

    if (*p == '"') {
        p++;
        while (*p && *p != '"' && i < sizeof(out.value) - 1) {
            if (*p == '\\' && *(p + 1)) {
                p++;
            }
            out.value[i++] = *p++;
        }
        out.value[i] = '\0';
        out.found = 1;
        return out;
    }

    while (*p && *p != ',' && *p != '}' && *p != '\r' && *p != '\n' && i < sizeof(out.value) - 1) {
        out.value[i++] = *p++;
    }

    while (i > 0 && isspace((unsigned char)out.value[i - 1])) i--;
    out.value[i] = '\0';

    if (i > 0) out.found = 1;
    return out;
}

static void json_escape(const char *src, char *dst, size_t dst_size) {
    size_t i = 0;
    size_t j = 0;

    if (dst_size == 0) return;

    while (src && src[i] && j < dst_size - 1) {
        char c = src[i++];
        if (c == '"' || c == '\\') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = c;
        } else if (c == '\n') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = 'n';
        } else if (c == '\r') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = 'r';
        } else if (c == '\t') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = 't';
        } else {
            dst[j++] = c;
        }
    }

    dst[j] = '\0';
}

static void append_text(char *dst, size_t dst_size, size_t *off, const char *text) {
    int n;
    if (*off >= dst_size) return;
    n = snprintf(dst + *off, dst_size - *off, "%s", text);
    if (n > 0) *off += (size_t)n;
}

static void append_kv_string(char *dst, size_t dst_size, size_t *off, int *first, const char *key, const char *val) {
    char esc[512];
    if (!val || !*val) return;

    json_escape(val, esc, sizeof(esc));
    if (!*first) append_text(dst, dst_size, off, ",");
    *first = 0;

    append_text(dst, dst_size, off, "\"");
    append_text(dst, dst_size, off, key);
    append_text(dst, dst_size, off, "\":\"");
    append_text(dst, dst_size, off, esc);
    append_text(dst, dst_size, off, "\"");
}

static Extracted extract_first(const char *json, const char *keys[], size_t key_count) {
    size_t i;
    for (i = 0; i < key_count; i++) {
        Extracted x = extract_json_value(json, keys[i]);
        if (x.found && x.value[0]) return x;
    }
    {
        Extracted none = {{0}, 0};
        return none;
    }
}

static void choose_role(const char *json, char *role, size_t role_size) {
    Extracted explicit_role = extract_json_value(json, "role");
    if (explicit_role.found && explicit_role.value[0]) {
        snprintf(role, role_size, "%s", explicit_role.value);
        return;
    }

    if (has_json_key(json, "src_mac") || has_json_key(json, "dst_mac") || has_json_key(json, "vlan_src") || has_json_key(json, "vlan_dst")) {
        snprintf(role, role_size, "POST_SWITCH");
    } else if (has_json_key(json, "action") && (has_json_key(json, "src_ip") || has_json_key(json, "dst_ip")) && (has_json_key(json, "src_port") || has_json_key(json, "dst_port"))) {
        snprintf(role, role_size, "EDGE_FW");
    } else if (has_json_key(json, "src_iface") || has_json_key(json, "dst_iface")) {
        snprintf(role, role_size, "POST_ROUTER");
    } else {
        snprintf(role, role_size, "POST_SERV");
    }
}

static int is_network_role(const char *role) {
    return strcmp(role, "POST_ROUTER") == 0 || strcmp(role, "POST_SWITCH") == 0 || strcmp(role, "EDGE_FW") == 0;
}

static void normalize_packet(const char *raw, char *out, size_t out_size) {
    const char *id_keys[] = {"device_id", "host_id", "id"};
    const char *ip_keys[] = {"ip", "host_ip", "src_ip"};
    const char *mac_keys[] = {"mac", "host_mac", "src_mac"};
    const char *ts_keys[] = {"timestamp_ref", "timestamp", "time_of_packet"};
    const char *etype_keys[] = {"type", "event_type"};

    Extracted id = extract_first(raw, id_keys, 3);
    Extracted os = extract_json_value(raw, "os");
    Extracted ip = extract_first(raw, ip_keys, 3);
    Extracted mac = extract_first(raw, mac_keys, 3);
    Extracted timestamp_ref = extract_first(raw, ts_keys, 3);
    Extracted event_timestamp = extract_json_value(raw, "timestamp");
    Extracted event_type = extract_first(raw, etype_keys, 2);
    Extracted details = extract_json_value(raw, "details");
    Extracted message = extract_json_value(raw, "message");
    Extracted cpu = extract_json_value(raw, "cpu");
    Extracted ram = extract_json_value(raw, "ram");

    const char *event_server_keys[] = {
        "process", "path", "sha256", "cmdline", "parent", "parent_path", "parent_sha_256",
        "user", "gpu", "disk", "file_type", "size", "owner", "perm", "level", "action",
        "result", "protocol", "dst_ip", "src_ip", "src_port", "dst_port", "sent", "recv"
    };

    const char *event_network_keys[] = {
        "src_ip", "dst_ip", "src_iface", "dst_iface", "src_port", "dst_port", "proto", "action",
        "src_mac", "dst_mac", "vlan_src", "vlan_dst", "sent", "recv"
    };

    char role[64];
    char now[32];
    size_t off = 0;
    int first;
    size_t i;

    choose_role(raw, role, sizeof(role));
    current_time_hms_ms(now, sizeof(now));

    if (!id.found || !id.value[0]) snprintf(id.value, sizeof(id.value), "unknown-host");
    if (!timestamp_ref.found || !timestamp_ref.value[0]) snprintf(timestamp_ref.value, sizeof(timestamp_ref.value), "%s", now);
    if (!event_timestamp.found || !event_timestamp.value[0]) snprintf(event_timestamp.value, sizeof(event_timestamp.value), "%s", now);

    if (!event_type.found || !event_type.value[0]) {
        if (is_network_role(role)) snprintf(event_type.value, sizeof(event_type.value), "traffic");
        else snprintf(event_type.value, sizeof(event_type.value), "logging");
        event_type.found = 1;
    }

    if ((!details.found || !details.value[0]) && message.found && message.value[0]) {
        snprintf(details.value, sizeof(details.value), "%s", message.value);
        details.found = 1;
    }

    append_text(out, out_size, &off, "{");

    first = 1;
    append_kv_string(out, out_size, &off, &first, "role", role);
    append_kv_string(out, out_size, &off, &first, "timestamp_ref", timestamp_ref.value);

    if (!first) append_text(out, out_size, &off, ",");
    append_text(out, out_size, &off, "\"host\":{");
    {
        int host_first = 1;
        append_kv_string(out, out_size, &off, &host_first, "id", id.value);
        if (!is_network_role(role)) {
            append_kv_string(out, out_size, &off, &host_first, "os", os.found ? os.value : "unknown");
            append_kv_string(out, out_size, &off, &host_first, "ip", ip.found ? ip.value : "0.0.0.0");
            append_kv_string(out, out_size, &off, &host_first, "mac", mac.found ? mac.value : "00:00:00:00:00:00");
        }
    }
    append_text(out, out_size, &off, "}");

    if (is_network_role(role)) {
        append_text(out, out_size, &off, ",\"status\":{");
        {
            int st_first = 1;
            append_kv_string(out, out_size, &off, &st_first, "cpu", cpu.found ? cpu.value : "0%");
            append_kv_string(out, out_size, &off, &st_first, "ram", ram.found ? ram.value : "0%");
        }
        append_text(out, out_size, &off, "}");
    }

    append_text(out, out_size, &off, ",\"event\":{");
    {
        int ev_first = 1;
        append_kv_string(out, out_size, &off, &ev_first, "type", event_type.value);
        append_kv_string(out, out_size, &off, &ev_first, "timestamp", event_timestamp.value);

        if (is_network_role(role)) {
            for (i = 0; i < sizeof(event_network_keys) / sizeof(event_network_keys[0]); i++) {
                Extracted val = extract_json_value(raw, event_network_keys[i]);
                append_kv_string(out, out_size, &off, &ev_first, event_network_keys[i], val.found ? val.value : "");
            }
        } else {
            append_kv_string(out, out_size, &off, &ev_first, "details", details.found ? details.value : "");
            for (i = 0; i < sizeof(event_server_keys) / sizeof(event_server_keys[0]); i++) {
                Extracted val = extract_json_value(raw, event_server_keys[i]);
                append_kv_string(out, out_size, &off, &ev_first, event_server_keys[i], val.found ? val.value : "");
            }
        }
    }
    append_text(out, out_size, &off, "}");

    append_text(out, out_size, &off, "}");
}

int main() {
    WSADATA wsa;
    SOCKET listen_sock, forward_sock;
    struct sockaddr_in server_addr, brain_addr;
    char buffer[BUFFER_SIZE];
    char normalized[BUFFER_SIZE];
    int recv_len;
    struct sockaddr_in client_addr;
    int client_addr_len = sizeof(client_addr);

    printf("[Collector] Initializing Winsock...\n");
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        printf("Failed. Error Code : %d\n", WSAGetLastError());
        return 1;
    }

    if ((listen_sock = socket(AF_INET, SOCK_DGRAM, 0)) == INVALID_SOCKET) {
        printf("Could not create listen socket : %d\n", WSAGetLastError());
        WSACleanup();
        return 1;
    }

    {
        int rcvbuf = 4 * 1024 * 1024;
        setsockopt(listen_sock, SOL_SOCKET, SO_RCVBUF, (char*)&rcvbuf, sizeof(rcvbuf));
    }

    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(LISTENING_PORT);

    if (bind(listen_sock, (struct sockaddr *)&server_addr, sizeof(server_addr)) == SOCKET_ERROR) {
        printf("Bind failed with error code : %d\n", WSAGetLastError());
        closesocket(listen_sock);
        WSACleanup();
        return 1;
    }

    if ((forward_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)) == INVALID_SOCKET) {
        printf("Could not create forward socket: %d\n", WSAGetLastError());
        closesocket(listen_sock);
        WSACleanup();
        return 1;
    }

    brain_addr.sin_family = AF_INET;
    brain_addr.sin_port = htons(INTERNAL_PORT);
    brain_addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    printf("[Collector] Listening on UDP %d. Forwarding canonical events to UDP %d.\n", LISTENING_PORT, INTERNAL_PORT);

    check_and_reload_key();

    while (1) {
        check_and_reload_key(); // Polling modification time is extremely cheap in Windows cache
        
        const char *payload = buffer;
        int payload_len = 0;

        recv_len = recvfrom(listen_sock, buffer, BUFFER_SIZE - 1, 0, (struct sockaddr *)&client_addr, &client_addr_len);
        if (recv_len == SOCKET_ERROR) {
            printf("recvfrom() failed with error code : %d\n", WSAGetLastError());
            continue;
        }

        // AES-256-GCM Decryption
        // Require: 12 bytes IV + 16 bytes Auth Tag + >=2 bytes payload (total 30)
        // Format: [12B IV][16B TAG][CIPHERTEXT]
        if (recv_len >= 30 && hKey) {
            PUCHAR iv = (PUCHAR)buffer;
            PUCHAR tag = (PUCHAR)(buffer + 12);
            PUCHAR ciphertext = (PUCHAR)(buffer + 28);
            DWORD cipher_len = recv_len - 28;

            BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO authInfo;
            BCRYPT_INIT_AUTH_MODE_INFO(authInfo);
            authInfo.pbNonce = iv;
            authInfo.cbNonce = 12;
            authInfo.pbTag = tag;
            authInfo.cbTag = 16;
            
            // NOTE: bcrypt requires pbMacContext for GCM but authInfo covers it.
            // Wait, BCryptDecrypt using GCM works with authInfo and pbNonce doesn't need to be passed redundantly if authInfo works.
            // Actually, Windows BCryptDecrypt requires IV to be passed down in pbInput? No, authInfo nonce handles it.
            
            DWORD cbResult = 0;
            NTSTATUS status = BCryptDecrypt(hKey, ciphertext, cipher_len, &authInfo, NULL, 0, ciphertext, cipher_len, &cbResult, 0);

            if (!NT_SUCCESS(status)) {
                // printf("Dropped: GCM Auth Tag Failed or Invalid Key\n");
                continue;
            }

            // Shift decrypted JSON to the front of buffer
            memmove(buffer, ciphertext, cbResult);
            buffer[cbResult] = '\0';
            recv_len = cbResult;

            if (buffer[0] != '{') continue; // Sanity check
            
            // Replay Attack Protection
            Extracted ts_ext = extract_json_value(buffer, "timestamp");
            if (ts_ext.found) {
                double packet_ts = atof(ts_ext.value);
                uint32_t sender_ip = client_addr.sin_addr.s_addr;
                int slot = sender_ip % REPLAY_CACHE_SIZE;
                
                if (replay_cache[slot].ip == sender_ip) {
                    if (packet_ts <= replay_cache[slot].last_seq) {
                        // printf("Dropped: Replay attack detected from IP\n");
                        continue;
                    }
                }
                replay_cache[slot].ip = sender_ip;
                replay_cache[slot].last_seq = packet_ts;
            }

        } else {
            // Unencrypted / missing data
            continue;
        }

        if (has_json_key(buffer, "role") && has_json_key(buffer, "host") && has_json_key(buffer, "event")) {
            payload = buffer;
            payload_len = recv_len;
        } else {
            memset(normalized, 0, sizeof(normalized));
            normalize_packet(buffer, normalized, sizeof(normalized));
            payload = normalized;
            payload_len = (int)strlen(normalized);
        }

        if (payload_len > 0) {
            if (sendto(forward_sock, payload, payload_len, 0, (struct sockaddr *)&brain_addr, sizeof(brain_addr)) == SOCKET_ERROR) {
                /* Keep collector resilient; skip noisy logging under bursts. */
            }
        }
    }

    closesocket(listen_sock);
    closesocket(forward_sock);
    WSACleanup();

    return 0;
}
