#define _WIN32_WINNT 0x0501
#define UNICODE
#define _UNICODE

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <wininet.h>
#include <shellapi.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <wchar.h>
#include <time.h>
#include <sys/stat.h>

#define SERVER_PORT 3000
#define DISCOVERY_UDP_PORT 3001
#define REQ_INITIAL_BUF 131072
#define REQ_MAX_BUF 2097152
#define CLOUD_RESPONSE_MAX 1048576
#define MAX_SSE_CLIENTS 48
#define MAX_LAN_PEERS 32
#define MAX_LOCAL_IPS 8

/* ============================================================================
 * GLOBAL STATE & FILE PATHS
 * ============================================================================ */
static wchar_t g_app_dir_w[MAX_PATH] = {0};
static wchar_t g_web_root_w[MAX_PATH] = {0};
static wchar_t g_data_dir_w[MAX_PATH] = {0};
static wchar_t g_log_file_w[MAX_PATH] = {0};
static wchar_t g_cache_file_w[MAX_PATH] = {0};
static wchar_t g_ledger_file_w[MAX_PATH] = {0};
static wchar_t g_config_file_w[MAX_PATH] = {0};
static wchar_t g_users_file_w[MAX_PATH] = {0};

static char g_app_dir_utf8[MAX_PATH * 3] = {0};
static char g_web_root_utf8[MAX_PATH * 3] = {0};

static CRITICAL_SECTION g_log_cs;
static CRITICAL_SECTION g_cache_cs;
static CRITICAL_SECTION g_sse_cs;
static CRITICAL_SECTION g_ledger_cs;
static CRITICAL_SECTION g_net_cs;

static SOCKET g_sse_clients[MAX_SSE_CLIENTS] = {0};
static int g_sse_client_count = 0;

/* Intranet Configuration & Discovery State */
static char g_node_id[64] = {0};
static char g_hostname[128] = {0};
static char g_cfg_role[16] = "AUTO";        /* HUB | CLIENT | AUTO */
static char g_manual_hub_ip[64] = {0};
static int  g_manual_hub_port = SERVER_PORT;

static char g_local_ips[MAX_LOCAL_IPS][32];
static int  g_local_ip_count = 0;

typedef struct {
    char node_id[64];
    char hostname[128];
    char ip[64];
    int  port;
    char role[16];
    long sequence;
    int  has_cloud;
    DWORD last_seen_tick;
} LanPeer;

static LanPeer g_peers[MAX_LAN_PEERS];
static int g_peer_count = 0;

static volatile LONG g_cloud_online = 0;
static char g_last_cloud_check[64] = {0};
static char g_active_hub_ip[64] = {0};
static int  g_active_hub_port = SERVER_PORT;
static char g_active_hub_hostname[128] = {0};
static long g_hub_pull_seq = 0;
static long g_cloud_pull_seq = 0;

/* Authoritative Local / LAN Event Ledger */
typedef struct {
    char event_id[128];
    char entity_type[48];
    char client_created_at[64];
    long server_sequence;
    int  cloud_synced;
    int  hub_synced;
    char* json;
} LedgerEvent;

static LedgerEvent* g_ledger = NULL;
static int g_ledger_count = 0;
static int g_ledger_cap = 0;
static long g_ledger_max_seq = 1000;
static volatile LONG g_ledger_version = 1;
static volatile LONG g_last_known_sequence = 1000;
static char g_last_purged_at[64] = {0};

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */
static void wchar_to_utf8(const wchar_t* wstr, char* utf8_buf, size_t buf_size) {
    if (!wstr || !utf8_buf || buf_size == 0) return;
    WideCharToMultiByte(CP_UTF8, 0, wstr, -1, utf8_buf, (int)buf_size, NULL, NULL);
}

static void utf8_to_wchar(const char* utf8_str, wchar_t* wbuf, size_t wbuf_count) {
    if (!utf8_str || !wbuf || wbuf_count == 0) return;
    MultiByteToWideChar(CP_UTF8, 0, utf8_str, -1, wbuf, (int)wbuf_count);
}

static void show_alert_utf8(HWND hwnd, const char* utf8_text, const char* utf8_title, UINT uType) {
    int text_len = MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, NULL, 0);
    int title_len = MultiByteToWideChar(CP_UTF8, 0, utf8_title, -1, NULL, 0);
    wchar_t* w_text = (wchar_t*)malloc((text_len + 1) * sizeof(wchar_t));
    wchar_t* w_title = (wchar_t*)malloc((title_len + 1) * sizeof(wchar_t));
    if (w_text && w_title) {
        MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, w_text, text_len + 1);
        MultiByteToWideChar(CP_UTF8, 0, utf8_title, -1, w_title, title_len + 1);
        MessageBoxW(hwnd, w_text, w_title, uType);
    }
    if (w_text) free(w_text);
    if (w_title) free(w_title);
}

static void get_timestamp(char* buf, size_t size) {
    time_t rawtime;
    struct tm* timeinfo;
    time(&rawtime);
    timeinfo = localtime(&rawtime);
    if (timeinfo) {
        strftime(buf, size, "%Y-%m-%d %H:%M:%S", timeinfo);
    } else {
        snprintf(buf, size, "UNKNOWN_TIME");
    }
}

static void get_utc_iso_timestamp(char* buf, size_t size) {
    SYSTEMTIME st;
    GetSystemTime(&st);
    snprintf(buf, size, "%04u-%02u-%02uT%02u:%02u:%02u.%03uZ",
        (unsigned)st.wYear, (unsigned)st.wMonth, (unsigned)st.wDay,
        (unsigned)st.wHour, (unsigned)st.wMinute, (unsigned)st.wSecond, (unsigned)st.wMilliseconds);
}

static void log_write(const char* level, const char* format, ...) {
    if (!g_log_file_w[0]) return;
    EnterCriticalSection(&g_log_cs);

    int write_bom = 0;
    DWORD attr = GetFileAttributesW(g_log_file_w);
    if (attr == INVALID_FILE_ATTRIBUTES) {
        write_bom = 1;
    }

    FILE* f = _wfopen(g_log_file_w, L"ab");
    if (f) {
        if (write_bom) {
            unsigned char bom[] = {0xEF, 0xBB, 0xBF};
            fwrite(bom, 1, 3, f);
        }

        char ts[64];
        get_timestamp(ts, sizeof(ts));
        fprintf(f, "[%s] [%-7s] ", ts, level);

        va_list args;
        va_start(args, format);
        vfprintf(f, format, args);
        va_end(args);

        fprintf(f, "\r\n");
        fflush(f);
        fclose(f);
    }
    LeaveCriticalSection(&g_log_cs);
}

static int file_exists_w(const wchar_t* path) {
    DWORD attr = GetFileAttributesW(path);
    return (attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY));
}

static int send_all(SOCKET s, const char* buf, int len) {
    int total = 0;
    while (total < len) {
        int n = send(s, buf + total, len - total, 0);
        if (n <= 0) return -1;
        total += n;
    }
    return total;
}

static int is_port_active(int port) {
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return 0;

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    u_long mode = 1;
    ioctlsocket(s, FIONBIO, &mode);

    int res = connect(s, (struct sockaddr*)&addr, sizeof(addr));
    int active = 0;
    if (res == 0) {
        active = 1;
    } else {
        fd_set write_fds;
        FD_ZERO(&write_fds);
        FD_SET(s, &write_fds);
        struct timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 350000;
        if (select(0, NULL, &write_fds, NULL, &tv) > 0) {
            active = 1;
        }
    }
    closesocket(s);
    return active;
}

/* ============================================================================
 * JSON HELPERS (UTF-8 & NESTED-OBJECT SAFE)
 * ============================================================================ */
static void json_escape_str(const char* src, char* dst, size_t dst_max) {
    if (!dst || dst_max == 0) return;
    size_t d = 0;
    if (!src) { dst[0] = '\0'; return; }
    while (*src && d + 2 < dst_max) {
        unsigned char c = (unsigned char)*src++;
        if (c == '"' || c == '\\') {
            dst[d++] = '\\';
            dst[d++] = (char)c;
        } else if (c == '\n') {
            dst[d++] = '\\'; dst[d++] = 'n';
        } else if (c == '\r') {
            dst[d++] = '\\'; dst[d++] = 'r';
        } else if (c == '\t') {
            dst[d++] = '\\'; dst[d++] = 't';
        } else if (c >= 0x20) {
            dst[d++] = (char)c;
        }
    }
    dst[d] = '\0';
}

static int extract_json_int_field(const char* json, const char* key, int default_val) {
    if (!json || !key) return default_val;
    const char* pos = strstr(json, key);
    if (!pos) return default_val;
    pos += strlen(key);
    while (*pos && (*pos == ' ' || *pos == '\t' || *pos == ':' || *pos == '\r' || *pos == '\n')) {
        pos++;
    }
    if (*pos == '-' || (*pos >= '0' && *pos <= '9')) {
        return atoi(pos);
    }
    return default_val;
}

static int extract_json_string_field(const char* json, const char* key, char* out_buf, size_t out_max) {
    if (!out_buf || out_max == 0) return 0;
    out_buf[0] = '\0';
    if (!json || !key) return 0;
    const char* pos = strstr(json, key);
    if (!pos) return 0;
    pos += strlen(key);
    while (*pos && (*pos == ' ' || *pos == '\t' || *pos == ':' || *pos == '\r' || *pos == '\n')) {
        pos++;
    }
    if (*pos != '"') return 0;
    pos++;
    size_t i = 0;
    while (*pos && *pos != '"' && i < out_max - 1) {
        if (*pos == '\\' && pos[1]) {
            pos++;
        }
        out_buf[i++] = *pos++;
    }
    out_buf[i] = '\0';
    return (i > 0) ? 1 : 0;
}

/* Extract top-level JSON string field (depth == 1 inside a JSON object) */
static int extract_top_level_json_string(const char* obj, const char* quoted_key, char* out_buf, size_t out_max) {
    if (!out_buf || out_max == 0) return 0;
    out_buf[0] = '\0';
    if (!obj || !quoted_key) return 0;
    size_t klen = strlen(quoted_key);
    int depth = 0;
    int in_str = 0;
    int esc = 0;
    const char* p = obj;
    while (*p) {
        char c = *p;
        if (in_str) {
            if (esc) { esc = 0; }
            else if (c == '\\') { esc = 1; }
            else if (c == '"') { in_str = 0; }
            p++;
            continue;
        }
        if (c == '"') {
            if (depth == 1 && strncmp(p, quoted_key, klen) == 0) {
                const char* q = p + klen;
                while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
                if (*q == ':') {
                    q++;
                    while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
                    if (*q == '"') {
                        q++;
                        size_t i = 0;
                        while (*q && *q != '"' && i < out_max - 1) {
                            if (*q == '\\' && q[1]) q++;
                            out_buf[i++] = *q++;
                        }
                        out_buf[i] = '\0';
                        return (i > 0) ? 1 : 0;
                    }
                    return 0;
                }
            }
            in_str = 1;
        } else if (c == '{' || c == '[') {
            depth++;
        } else if (c == '}' || c == ']') {
            depth--;
            if (depth <= 0 && c == '}') break;
        }
        p++;
    }
    return 0;
}

static long extract_top_level_json_long(const char* obj, const char* quoted_key, long default_val) {
    if (!obj || !quoted_key) return default_val;
    size_t klen = strlen(quoted_key);
    int depth = 0;
    int in_str = 0;
    int esc = 0;
    const char* p = obj;
    while (*p) {
        char c = *p;
        if (in_str) {
            if (esc) { esc = 0; }
            else if (c == '\\') { esc = 1; }
            else if (c == '"') { in_str = 0; }
            p++;
            continue;
        }
        if (c == '"') {
            if (depth == 1 && strncmp(p, quoted_key, klen) == 0) {
                const char* q = p + klen;
                while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
                if (*q == ':') {
                    q++;
                    while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
                    if (*q == '-' || (*q >= '0' && *q <= '9')) {
                        return atol(q);
                    }
                    return default_val;
                }
            }
            in_str = 1;
        } else if (c == '{' || c == '[') {
            depth++;
        } else if (c == '}' || c == ']') {
            depth--;
            if (depth <= 0 && c == '}') break;
        }
        p++;
    }
    return default_val;
}

static int extract_sequence_from_json(const char* json, int fallback_val) {
    int s1 = extract_json_int_field(json, "\"server_sequence\"", -1);
    int s2 = extract_json_int_field(json, "\"current_server_sequence\"", -1);
    int best = fallback_val;
    if (s1 > best) best = s1;
    if (s2 > best) best = s2;
    return best;
}

static int count_events_in_json(const char* json) {
    if (!json) return 0;
    int count = 0;
    const char* p = json;
    while ((p = strstr(p, "\"event_id\"")) != NULL) {
        count++;
        p += 10;
    }
    return count;
}

static int has_nonempty_events(const char* json) {
    if (!json) return 0;
    const char* p = strstr(json, "\"events\"");
    if (!p) return 0;
    p += 8;
    while (*p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n' || *p == ':')) p++;
    if (*p != '[') return 0;
    p++;
    while (*p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n')) p++;
    return (*p == '{') ? 1 : 0;
}

/* ============================================================================
 * NETWORK INTERFACE DETECTION & LOCAL IP HELPERS
 * ============================================================================ */
static void refresh_local_network_info(void) {
    char host[128] = "MGAS-PC";
    if (gethostname(host, sizeof(host) - 1) == 0 && host[0]) {
        snprintf(g_hostname, sizeof(g_hostname), "%s", host);
    } else {
        snprintf(g_hostname, sizeof(g_hostname), "MGAS-PC");
    }

    int count = 0;
    struct hostent* he = gethostbyname(g_hostname);
    if (he && he->h_addr_list) {
        for (int i = 0; he->h_addr_list[i] != NULL && count < MAX_LOCAL_IPS; i++) {
            struct in_addr addr;
            memcpy(&addr, he->h_addr_list[i], sizeof(struct in_addr));
            const char* ip_str = inet_ntoa(addr);
            if (ip_str && strcmp(ip_str, "127.0.0.1") != 0 && strcmp(ip_str, "0.0.0.0") != 0) {
                snprintf(g_local_ips[count++], 32, "%s", ip_str);
            }
        }
    }
    g_local_ip_count = count;
}

static int is_local_ip(const char* ip) {
    if (!ip || !ip[0]) return 0;
    if (strcmp(ip, "127.0.0.1") == 0 || strcmp(ip, "0.0.0.0") == 0) return 1;
    for (int i = 0; i < g_local_ip_count; i++) {
        if (strcmp(ip, g_local_ips[i]) == 0) return 1;
    }
    return 0;
}

/* ============================================================================
 * ATOMIC FILE READ / WRITE HELPERS
 * ============================================================================ */
static void write_file_atomic_w(const wchar_t* target_path, const char* data, size_t len) {
    if (!target_path || !target_path[0] || !data) return;
    wchar_t tmp_path[MAX_PATH + 16];
    _snwprintf(tmp_path, MAX_PATH + 16, L"%s.tmp", target_path);
    FILE* f = _wfopen(tmp_path, L"wb");
    if (f) {
        fwrite(data, 1, len, f);
        fflush(f);
        fclose(f);
        MoveFileExW(tmp_path, target_path, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH);
    }
}

static char* read_entire_file_w(const wchar_t* path, size_t* out_len) {
    if (out_len) *out_len = 0;
    if (!path || !path[0]) return NULL;
    FILE* f = _wfopen(path, L"rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0 || sz > 32 * 1024 * 1024) {
        fclose(f);
        return NULL;
    }
    char* buf = (char*)malloc((size_t)sz + 1);
    if (!buf) {
        fclose(f);
        return NULL;
    }
    size_t n = fread(buf, 1, (size_t)sz, f);
    buf[n] = '\0';
    fclose(f);
    if (out_len) *out_len = n;
    return buf;
}

static void save_sync_cache(const char* json_data, int len) {
    if (!g_cache_file_w[0] || !json_data || len <= 2) return;
    EnterCriticalSection(&g_cache_cs);
    write_file_atomic_w(g_cache_file_w, json_data, (size_t)len);
    LeaveCriticalSection(&g_cache_cs);
}

static int load_sync_cache(char* out_buf, int out_buf_max) {
    if (!g_cache_file_w[0] || !out_buf || out_buf_max <= 0) return 0;
    int loaded = 0;
    EnterCriticalSection(&g_cache_cs);
    FILE* f = _wfopen(g_cache_file_w, L"rb");
    if (f) {
        size_t n = fread(out_buf, 1, (size_t)(out_buf_max - 1), f);
        out_buf[n] = '\0';
        fclose(f);
        loaded = (n > 2) ? 1 : 0;
    }
    LeaveCriticalSection(&g_cache_cs);
    return loaded;
}

/* ============================================================================
 * INTRANET CONFIGURATION PERSISTENCE
 * ============================================================================ */
static void save_intranet_config(void) {
    EnterCriticalSection(&g_net_cs);
    char buf[512];
    int len = snprintf(buf, sizeof(buf),
        "{\n"
        "  \"node_id\": \"%s\",\n"
        "  \"role\": \"%s\",\n"
        "  \"manual_hub_ip\": \"%s\",\n"
        "  \"manual_hub_port\": %d\n"
        "}\n",
        g_node_id, g_cfg_role, g_manual_hub_ip, g_manual_hub_port);
    write_file_atomic_w(g_config_file_w, buf, (size_t)len);
    LeaveCriticalSection(&g_net_cs);
}

static void load_intranet_config(void) {
    /* Generate stable node_id fallback from hostname + tick/serial */
    refresh_local_network_info();
    DWORD serial = 0;
    GetVolumeInformationW(L"C:\\", NULL, 0, &serial, NULL, NULL, NULL, 0);
    snprintf(g_node_id, sizeof(g_node_id), "NODE-%s-%08lX", g_hostname[0] ? g_hostname : "MGAS", (unsigned long)serial);

    /* Check installer-provided default role ($INSTDIR\intranet_role.txt) */
    wchar_t role_hint_path[MAX_PATH * 2];
    _snwprintf(role_hint_path, MAX_PATH * 2, L"%s\\intranet_role.txt", g_app_dir_w);
    char* role_hint = read_entire_file_w(role_hint_path, NULL);
    if (role_hint) {
        if (strstr(role_hint, "HUB")) snprintf(g_cfg_role, sizeof(g_cfg_role), "HUB");
        else if (strstr(role_hint, "CLIENT")) snprintf(g_cfg_role, sizeof(g_cfg_role), "CLIENT");
        else snprintf(g_cfg_role, sizeof(g_cfg_role), "AUTO");
        free(role_hint);
    }

    char* cfg = read_entire_file_w(g_config_file_w, NULL);
    if (cfg) {
        char val[128];
        if (extract_json_string_field(cfg, "\"node_id\"", val, sizeof(val))) {
            snprintf(g_node_id, sizeof(g_node_id), "%s", val);
        }
        if (extract_json_string_field(cfg, "\"role\"", val, sizeof(val))) {
            if (strcmp(val, "HUB") == 0 || strcmp(val, "CLIENT") == 0 || strcmp(val, "AUTO") == 0) {
                snprintf(g_cfg_role, sizeof(g_cfg_role), "%s", val);
            }
        }
        if (extract_json_string_field(cfg, "\"manual_hub_ip\"", val, sizeof(val))) {
            snprintf(g_manual_hub_ip, sizeof(g_manual_hub_ip), "%s", val);
        }
        int p = extract_json_int_field(cfg, "\"manual_hub_port\"", SERVER_PORT);
        if (p > 0 && p < 65535) g_manual_hub_port = p;
        free(cfg);
    } else {
        save_intranet_config();
    }
}

static void get_effective_role(char* out_role, size_t max_len) {
    if (strcmp(g_cfg_role, "HUB") == 0) {
        snprintf(out_role, max_len, "HUB");
    } else if (strcmp(g_cfg_role, "CLIENT") == 0) {
        snprintf(out_role, max_len, "CLIENT");
    } else {
        /* AUTO: act as CLIENT when an external Hub is active, else HUB */
        if (g_active_hub_ip[0] && !is_local_ip(g_active_hub_ip)) {
            snprintf(out_role, max_len, "CLIENT");
        } else {
            snprintf(out_role, max_len, "HUB");
        }
    }
}

/* ============================================================================
 * AUTHORITATIVE LOCAL / LAN EVENT LEDGER ENGINE
 * ============================================================================ */
static char* build_event_with_sequence(const char* raw_obj, long seq) {
    if (!raw_obj) return NULL;
    const char* open_brace = strchr(raw_obj, '{');
    if (!open_brace) return NULL;

    /* Strip any existing top-level "server_sequence":123, to avoid duplicates */
    size_t raw_len = strlen(open_brace);
    char* cleaned = (char*)malloc(raw_len + 64);
    if (!cleaned) return NULL;

    size_t out_i = 0;
    const char* p = open_brace + 1;
    int depth = 1;
    int in_str = 0;
    int esc = 0;
    int wrote_seq = 0;

    out_i += (size_t)sprintf(cleaned, "{\"server_sequence\":%ld", seq);
    wrote_seq = 1;
    (void)wrote_seq;

    /* Skip leading whitespace after '{' */
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    if (*p != '}' && *p != '\0') {
        cleaned[out_i++] = ',';
    }

    while (*p) {
        char c = *p;
        if (!in_str && depth == 1 && c == '"' && strncmp(p, "\"server_sequence\"", 17) == 0) {
            const char* q = p + 17;
            while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
            if (*q == ':') {
                q++;
                while (*q && *q != ',' && *q != '}') q++;
                if (*q == ',') {
                    q++;
                    while (*q == ' ' || *q == '\t' || *q == '\r' || *q == '\n') q++;
                }
                p = q;
                /* If we left a trailing comma right before '}' trim it */
                if (*p == '}' && out_i > 0 && cleaned[out_i - 1] == ',') {
                    out_i--;
                }
                continue;
            }
        }
        if (in_str) {
            if (esc) esc = 0;
            else if (c == '\\') esc = 1;
            else if (c == '"') in_str = 0;
        } else {
            if (c == '"') in_str = 1;
            else if (c == '{' || c == '[') depth++;
            else if (c == '}' || c == ']') depth--;
        }
        cleaned[out_i++] = c;
        p++;
    }
    cleaned[out_i] = '\0';
    return cleaned;
}

static void ledger_save_locked(void) {
    if (!g_ledger_file_w[0]) return;
    size_t est = 256;
    for (int i = 0; i < g_ledger_count; i++) {
        est += strlen(g_ledger[i].json) + 48;
    }
    char* buf = (char*)malloc(est);
    if (!buf) return;

    size_t pos = 0;
    pos += (size_t)sprintf(buf + pos,
        "{\"max_sequence\":%ld,\"last_purged_at\":\"%s\",\"events\":[",
        g_ledger_max_seq, g_last_purged_at);

    for (int i = 0; i < g_ledger_count; i++) {
        if (i > 0) buf[pos++] = ',';
        pos += (size_t)sprintf(buf + pos, "{\"cloud_synced\":%d,\"hub_synced\":%d,\"event\":%s}",
            g_ledger[i].cloud_synced ? 1 : 0,
            g_ledger[i].hub_synced ? 1 : 0,
            g_ledger[i].json);
    }
    pos += (size_t)sprintf(buf + pos, "]}\n");
    write_file_atomic_w(g_ledger_file_w, buf, pos);
    free(buf);
}

static int ledger_find_index_locked(const char* event_id) {
    if (!event_id || !event_id[0]) return -1;
    for (int i = 0; i < g_ledger_count; i++) {
        if (strcmp(g_ledger[i].event_id, event_id) == 0) return i;
    }
    return -1;
}

/* Add or update single event JSON object in authoritative ledger. Returns assigned sequence, sets out_dup=1 if already existed */
static long ledger_upsert_single_locked(const char* raw_obj, long preferred_seq, int cloud_synced, int hub_synced, int* out_dup, int* out_ignored) {
    if (out_dup) *out_dup = 0;
    if (out_ignored) *out_ignored = 0;
    if (!raw_obj) return g_ledger_max_seq;

    char ev_id[128] = {0};
    char ent_type[48] = {0};
    char created_at[64] = {0};
    if (!extract_top_level_json_string(raw_obj, "\"event_id\"", ev_id, sizeof(ev_id))) {
        return g_ledger_max_seq;
    }
    extract_top_level_json_string(raw_obj, "\"entity_type\"", ent_type, sizeof(ent_type));
    if (!extract_top_level_json_string(raw_obj, "\"client_created_at\"", created_at, sizeof(created_at))) {
        extract_top_level_json_string(raw_obj, "\"timestamp\"", created_at, sizeof(created_at));
    }

    /* Purge guard: ignore stale pre-purge non-USER/SYSTEM events */
    if (g_last_purged_at[0] &&
        strcmp(ent_type, "USER") != 0 &&
        strcmp(ent_type, "SYSTEM") != 0 &&
        created_at[0] && strcmp(created_at, g_last_purged_at) <= 0) {
        if (out_ignored) *out_ignored = 1;
        return g_ledger_max_seq;
    }

    int existing_idx = ledger_find_index_locked(ev_id);
    if (existing_idx >= 0) {
        if (out_dup) *out_dup = 1;
        if (cloud_synced && !g_ledger[existing_idx].cloud_synced) {
            g_ledger[existing_idx].cloud_synced = 1;
        }
        if ((hub_synced || cloud_synced) && !g_ledger[existing_idx].hub_synced) {
            g_ledger[existing_idx].hub_synced = 1;
        }
        return g_ledger[existing_idx].server_sequence;
    }

    long seq = preferred_seq;
    if (seq <= 0) {
        g_ledger_max_seq++;
        seq = g_ledger_max_seq;
    } else if (seq > g_ledger_max_seq) {
        g_ledger_max_seq = seq;
    } else {
        /* If preferred_seq came from another node/cloud that used a lower number, keep it >= 1001 if conflict? Actually monotonic per hub */
        if (seq <= 1000) {
            g_ledger_max_seq++;
            seq = g_ledger_max_seq;
        }
    }

    char* stored_json = build_event_with_sequence(raw_obj, seq);
    if (!stored_json) return g_ledger_max_seq;

    if (g_ledger_count >= g_ledger_cap) {
        int new_cap = (g_ledger_cap == 0) ? 256 : (g_ledger_cap * 2);
        LedgerEvent* next_arr = (LedgerEvent*)realloc(g_ledger, (size_t)new_cap * sizeof(LedgerEvent));
        if (!next_arr) {
            free(stored_json);
            return g_ledger_max_seq;
        }
        g_ledger = next_arr;
        g_ledger_cap = new_cap;
    }

    LedgerEvent* item = &g_ledger[g_ledger_count++];
    memset(item, 0, sizeof(LedgerEvent));
    snprintf(item->event_id, sizeof(item->event_id), "%s", ev_id);
    snprintf(item->entity_type, sizeof(item->entity_type), "%s", ent_type[0] ? ent_type : "UNKNOWN");
    snprintf(item->client_created_at, sizeof(item->client_created_at), "%s", created_at);
    item->server_sequence = seq;
    item->cloud_synced = cloud_synced ? 1 : 0;
    item->hub_synced = (hub_synced || cloud_synced) ? 1 : 0;
    item->json = stored_json;

    if (seq > g_last_known_sequence) g_last_known_sequence = seq;
    return seq;
}

static void ledger_load_from_disk(void) {
    char* raw = read_entire_file_w(g_ledger_file_w, NULL);
    if (!raw) return;

    EnterCriticalSection(&g_ledger_cs);
    long max_s = (long)extract_json_int_field(raw, "\"max_sequence\"", 1000);
    if (max_s > g_ledger_max_seq) g_ledger_max_seq = max_s;
    extract_json_string_field(raw, "\"last_purged_at\"", g_last_purged_at, sizeof(g_last_purged_at));

    const char* arr = strstr(raw, "\"events\"");
    if (arr) {
        arr += 8;
        while (*arr && *arr != '[') arr++;
        if (*arr == '[') {
            arr++;
            const char* p = arr;
            while (*p) {
                while (*p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n' || *p == ',')) p++;
                if (*p == ']' || *p == '\0') break;
                if (*p == '{') {
                    const char* start = p;
                    int depth = 0, in_str = 0, esc = 0;
                    while (*p) {
                        char c = *p;
                        if (in_str) {
                            if (esc) esc = 0;
                            else if (c == '\\') esc = 1;
                            else if (c == '"') in_str = 0;
                        } else {
                            if (c == '"') in_str = 1;
                            else if (c == '{' || c == '[') depth++;
                            else if (c == '}' || c == ']') {
                                depth--;
                                if (depth == 0) { p++; break; }
                            }
                        }
                        p++;
                    }
                    size_t len = (size_t)(p - start);
                    char* wrapper = (char*)malloc(len + 1);
                    if (wrapper) {
                        memcpy(wrapper, start, len);
                        wrapper[len] = '\0';
                        int cs = extract_json_int_field(wrapper, "\"cloud_synced\"", 0);
                        int hs = extract_json_int_field(wrapper, "\"hub_synced\"", cs);
                        /* Check if wrapper has "event":{...} or is direct event */
                        const char* ev_key = strstr(wrapper, "\"event\"");
                        const char* ev_obj = NULL;
                        if (ev_key) {
                            ev_obj = strchr(ev_key + 7, '{');
                        }
                        if (ev_obj) {
                            long seq = extract_top_level_json_long(ev_obj, "\"server_sequence\"", 0);
                            int d = 0, ig = 0;
                            ledger_upsert_single_locked(ev_obj, seq, cs, hs, &d, &ig);
                        } else {
                            long seq = extract_top_level_json_long(wrapper, "\"server_sequence\"", 0);
                            int d = 0, ig = 0;
                            ledger_upsert_single_locked(wrapper, seq, cs, hs, &d, &ig);
                        }
                        free(wrapper);
                    }
                } else {
                    p++;
                }
            }
        }
    }

    if (g_ledger_max_seq > g_last_known_sequence) g_last_known_sequence = g_ledger_max_seq;
    LeaveCriticalSection(&g_ledger_cs);
    free(raw);
}

/* Ingest events array from a /api/sync response or /api/sync/events POST payload.
 * Returns number of newly added events. Optionally builds accepted_events JSON. */
static int ledger_ingest_payload_ex(const char* payload_json, int default_cloud_synced, int default_hub_synced, int assign_new_seq_if_missing, char* accepted_out, size_t accepted_max) {
    if (!payload_json) return 0;
    const char* ev_key = strstr(payload_json, "\"events\"");
    if (!ev_key) return 0;
    const char* p = strchr(ev_key + 8, '[');
    if (!p) return 0;
    p++;

    int newly_added = 0;
    size_t acc_pos = 0;
    if (accepted_out && accepted_max > 4) {
        acc_pos += (size_t)snprintf(accepted_out, accepted_max, "[");
    }
    int acc_count = 0;

    EnterCriticalSection(&g_ledger_cs);
    while (*p) {
        while (*p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n' || *p == ',')) p++;
        if (*p == ']' || *p == '\0') break;
        if (*p == '{') {
            const char* start = p;
            int depth = 0, in_str = 0, esc = 0;
            while (*p) {
                char c = *p;
                if (in_str) {
                    if (esc) esc = 0;
                    else if (c == '\\') esc = 1;
                    else if (c == '"') in_str = 0;
                } else {
                    if (c == '"') in_str = 1;
                    else if (c == '{' || c == '[') depth++;
                    else if (c == '}' || c == ']') {
                        depth--;
                        if (depth == 0) { p++; break; }
                    }
                }
                p++;
            }
            size_t len = (size_t)(p - start);
            char* obj = (char*)malloc(len + 1);
            if (obj) {
                memcpy(obj, start, len);
                obj[len] = '\0';

                long pref_seq = extract_top_level_json_long(obj, "\"server_sequence\"", 0);
                if (assign_new_seq_if_missing && pref_seq <= 0) pref_seq = 0;

                int is_dup = 0, is_ign = 0;
                long assigned_seq = ledger_upsert_single_locked(obj, pref_seq, default_cloud_synced, default_hub_synced, &is_dup, &is_ign);
                if (!is_dup && !is_ign) newly_added++;

                char ev_id[128] = {0};
                if (accepted_out && accepted_max > 64 &&
                    extract_top_level_json_string(obj, "\"event_id\"", ev_id, sizeof(ev_id))) {
                    char tmp_item[256];
                    int tlen;
                    if (is_ign) {
                        tlen = snprintf(tmp_item, sizeof(tmp_item),
                            "{\"event_id\":\"%s\",\"server_sequence\":%ld,\"ignored_pre_purge\":true}",
                            ev_id, assigned_seq);
                    } else {
                        tlen = snprintf(tmp_item, sizeof(tmp_item),
                            "{\"event_id\":\"%s\",\"server_sequence\":%ld,\"duplicate\":%s}",
                            ev_id, assigned_seq, is_dup ? "true" : "false");
                    }
                    if (acc_pos + (size_t)tlen + 4 < accepted_max) {
                        if (acc_count > 0) accepted_out[acc_pos++] = ',';
                        memcpy(accepted_out + acc_pos, tmp_item, (size_t)tlen);
                        acc_pos += (size_t)tlen;
                        accepted_out[acc_pos] = '\0';
                        acc_count++;
                    }
                }
                free(obj);
            }
        } else {
            p++;
        }
    }

    if (newly_added > 0 || default_cloud_synced) {
        ledger_save_locked();
        if (newly_added > 0) {
            InterlockedIncrement(&g_ledger_version);
        }
    }
    LeaveCriticalSection(&g_ledger_cs);

    if (accepted_out && accepted_max > acc_pos + 2) {
        accepted_out[acc_pos++] = ']';
        accepted_out[acc_pos] = '\0';
    }
    return newly_added;
}

static int ledger_ingest_payload(const char* payload_json, int default_cloud_synced, int assign_new_seq_if_missing, char* accepted_out, size_t accepted_max) {
    return ledger_ingest_payload_ex(payload_json, default_cloud_synced, default_cloud_synced, assign_new_seq_if_missing, accepted_out, accepted_max);
}

/* Mark events in ledger as cloud_synced=1 when accepted by Cloudflare */
static void ledger_mark_cloud_synced(const char* payload_json, long cloud_seq) {
    if (!payload_json) return;
    EnterCriticalSection(&g_ledger_cs);
    int changed = 0;
    for (int i = 0; i < g_ledger_count; i++) {
        if ((!g_ledger[i].cloud_synced || !g_ledger[i].hub_synced) && strstr(payload_json, g_ledger[i].event_id) != NULL) {
            g_ledger[i].cloud_synced = 1;
            g_ledger[i].hub_synced = 1;
            changed = 1;
        }
    }
    if (cloud_seq > g_ledger_max_seq) {
        g_ledger_max_seq = cloud_seq;
        g_last_known_sequence = cloud_seq;
        changed = 1;
    }
    if (changed) {
        ledger_save_locked();
    }
    LeaveCriticalSection(&g_ledger_cs);
}

/* Mark events in ledger as hub_synced=1 when accepted by LAN Hub */
static void ledger_mark_hub_synced(const char* payload_json, long hub_seq) {
    if (!payload_json) return;
    EnterCriticalSection(&g_ledger_cs);
    int changed = 0;
    for (int i = 0; i < g_ledger_count; i++) {
        if (!g_ledger[i].hub_synced && strstr(payload_json, g_ledger[i].event_id) != NULL) {
            g_ledger[i].hub_synced = 1;
            changed = 1;
        }
    }
    if (hub_seq > g_ledger_max_seq) {
        g_ledger_max_seq = hub_seq;
        g_last_known_sequence = hub_seq;
        changed = 1;
    }
    if (changed) {
        ledger_save_locked();
    }
    LeaveCriticalSection(&g_ledger_cs);
}

/* Apply purge timestamp to authoritative LAN ledger */
static void ledger_apply_purge(const char* purged_at, long next_seq_hint) {
    if (!purged_at || !purged_at[0]) return;
    EnterCriticalSection(&g_ledger_cs);
    int is_newer = (!g_last_purged_at[0] || strcmp(purged_at, g_last_purged_at) > 0);
    if (is_newer) {
        snprintf(g_last_purged_at, sizeof(g_last_purged_at), "%s", purged_at);
    }

    /* Filter out non-USER / non-SYSTEM events created at or before g_last_purged_at */
    int write_i = 0;
    for (int i = 0; i < g_ledger_count; i++) {
        LedgerEvent* e = &g_ledger[i];
        int keep = 1;
        if (strcmp(e->entity_type, "USER") != 0 && strcmp(e->entity_type, "SYSTEM") != 0) {
            if (!e->client_created_at[0] || strcmp(e->client_created_at, g_last_purged_at) <= 0) {
                keep = 0;
            }
        }
        if (keep) {
            if (write_i != i) g_ledger[write_i] = g_ledger[i];
            write_i++;
        } else {
            if (e->json) free(e->json);
        }
    }
    g_ledger_count = write_i;

    if (next_seq_hint > g_ledger_max_seq) {
        g_ledger_max_seq = next_seq_hint;
    } else if (is_newer) {
        g_ledger_max_seq++;
    }
    g_last_known_sequence = g_ledger_max_seq;
    ledger_save_locked();
    if (is_newer) {
        InterlockedIncrement(&g_ledger_version);
    }
    LeaveCriticalSection(&g_ledger_cs);
}

/* Build paginated /api/sync response JSON directly from local/LAN authoritative ledger */
static char* ledger_build_sync_response(long since_seq, int max_batch, int* out_events_returned, long* out_max_seq) {
    EnterCriticalSection(&g_ledger_cs);
    long max_seq = g_ledger_max_seq;
    long effective_since = (since_seq > max_seq || since_seq < 0) ? 0 : since_seq;

    /* Collect matching indices */
    int* idxs = (int*)malloc((size_t)(g_ledger_count + 1) * sizeof(int));
    int match_count = 0;
    if (idxs) {
        for (int i = 0; i < g_ledger_count; i++) {
            if (g_ledger[i].server_sequence > effective_since) {
                idxs[match_count++] = i;
            }
        }
    }

    int emit_count = match_count > max_batch ? max_batch : match_count;
    int has_more = (match_count > max_batch) ? 1 : 0;
    long last_batch_seq = max_seq;
    if (emit_count > 0 && idxs) {
        last_batch_seq = g_ledger[idxs[emit_count - 1]].server_sequence;
    }
    long next_since_seq = has_more ? last_batch_seq : max_seq;
    long resp_seq = has_more ? next_since_seq : max_seq;

    size_t est = 512;
    for (int i = 0; i < emit_count; i++) {
        est += strlen(g_ledger[idxs[i]].json) + 4;
    }
    char* out = (char*)malloc(est);
    if (out) {
        char ts[64];
        get_utc_iso_timestamp(ts, sizeof(ts));
        size_t pos = 0;
        pos += (size_t)sprintf(out + pos, "{\"success\":true,\"events\":[");
        for (int i = 0; i < emit_count; i++) {
            if (i > 0) out[pos++] = ',';
            const char* ej = g_ledger[idxs[i]].json;
            size_t elen = strlen(ej);
            memcpy(out + pos, ej, elen);
            pos += elen;
        }
        pos += (size_t)sprintf(out + pos,
            "],\"server_sequence\":%ld,\"max_server_sequence\":%ld,\"has_more\":%s,"
            "\"next_since_sequence\":%ld,\"last_purged_at\":\"%s\","
            "\"purge_preserve_products\":true,\"source\":\"INTRANET_LAN\",\"timestamp\":\"%s\"}\n",
            resp_seq, max_seq, has_more ? "true" : "false", next_since_seq, g_last_purged_at, ts);
    }

    if (idxs) free(idxs);
    if (out_events_returned) *out_events_returned = emit_count;
    if (out_max_seq) *out_max_seq = max_seq;
    LeaveCriticalSection(&g_ledger_cs);
    return out;
}

static int ledger_count_unsynced_cloud(void) {
    int cnt = 0;
    EnterCriticalSection(&g_ledger_cs);
    for (int i = 0; i < g_ledger_count; i++) {
        if (!g_ledger[i].cloud_synced) cnt++;
    }
    LeaveCriticalSection(&g_ledger_cs);
    return cnt;
}

static int ledger_count_unsynced_hub(void) {
    int cnt = 0;
    EnterCriticalSection(&g_ledger_cs);
    for (int i = 0; i < g_ledger_count; i++) {
        if (!g_ledger[i].hub_synced) cnt++;
    }
    LeaveCriticalSection(&g_ledger_cs);
    return cnt;
}

/* ============================================================================
 * CLOUDFLARE WORKER RELAY (HTTPS VIA WININET) & LAN PEER HTTP (WINSOCK)
 * ============================================================================ */
static int relay_to_central_cloud_ex(const char* method, const char* full_url_path, const char* post_body, int post_body_len, char* out_buf, int out_buf_max, DWORD* out_status_code) {
    if (out_status_code) *out_status_code = 0;
    HINTERNET hInternet = InternetOpenA("MGas-Windows-Sync-Relay/2.1", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) {
        InterlockedExchange(&g_cloud_online, 0);
        return 0;
    }

    DWORD timeout_ms = 3200;
    InternetSetOptionA(hInternet, INTERNET_OPTION_CONNECT_TIMEOUT, &timeout_ms, sizeof(timeout_ms));
    InternetSetOptionA(hInternet, INTERNET_OPTION_SEND_TIMEOUT, &timeout_ms, sizeof(timeout_ms));
    InternetSetOptionA(hInternet, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeout_ms, sizeof(timeout_ms));

    HINTERNET hConnect = InternetConnectA(hInternet, "anbar.mgas.ir", INTERNET_DEFAULT_HTTPS_PORT, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
    if (!hConnect) {
        InternetCloseHandle(hInternet);
        InterlockedExchange(&g_cloud_online, 0);
        return 0;
    }

    DWORD flags = INTERNET_FLAG_SECURE | INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE |
                  INTERNET_FLAG_IGNORE_CERT_CN_INVALID | INTERNET_FLAG_IGNORE_CERT_DATE_INVALID;
    HINTERNET hRequest = HttpOpenRequestA(hConnect, method, full_url_path, NULL, NULL, NULL, flags, 0);
    if (!hRequest) {
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
        InterlockedExchange(&g_cloud_online, 0);
        return 0;
    }

    DWORD secFlags = 0;
    DWORD secFlagsLen = sizeof(secFlags);
    if (InternetQueryOptionA(hRequest, INTERNET_OPTION_SECURITY_FLAGS, &secFlags, &secFlagsLen)) {
        secFlags |= SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_REVOCATION |
                    SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID;
        InternetSetOptionA(hRequest, INTERNET_OPTION_SECURITY_FLAGS, &secFlags, sizeof(secFlags));
    }

    const char* reqHeaders = "Content-Type: application/json\r\nAccept: application/json\r\n";
    BOOL sent = HttpSendRequestA(hRequest, reqHeaders, (DWORD)strlen(reqHeaders), (LPVOID)post_body, (DWORD)post_body_len);
    if (!sent) {
        InternetCloseHandle(hRequest);
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
        InterlockedExchange(&g_cloud_online, 0);
        return 0;
    }

    DWORD statusCode = 0;
    DWORD statusLen = sizeof(statusCode);
    HttpQueryInfoA(hRequest, HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER, &statusCode, &statusLen, NULL);
    if (out_status_code) *out_status_code = statusCode;

    int total_read = 0;
    DWORD bytes_read = 0;
    while (total_read < out_buf_max - 1) {
        if (!InternetReadFile(hRequest, out_buf + total_read, (DWORD)(out_buf_max - 1 - total_read), &bytes_read) || bytes_read == 0) {
            break;
        }
        total_read += (int)bytes_read;
    }
    out_buf[total_read] = '\0';

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hInternet);

    if (statusCode >= 200 && statusCode < 500) {
        InterlockedExchange(&g_cloud_online, 1);
        get_utc_iso_timestamp(g_last_cloud_check, sizeof(g_last_cloud_check));
    }
    return (statusCode >= 200 && statusCode < 300 && total_read > 0) ? 1 : 0;
}

static int relay_to_central_cloud(const char* method, const char* full_url_path, const char* post_body, int post_body_len, char* out_buf, int out_buf_max) {
    return relay_to_central_cloud_ex(method, full_url_path, post_body, post_body_len, out_buf, out_buf_max, NULL);
}

/* Raw WinSock TCP HTTP client for LAN peer/hub communication (immune to IE proxy settings on Win7/11) */
static int lan_http_request(
    const char* ip,
    int port,
    const char* method,
    const char* path,
    const char* extra_headers,
    const char* body,
    int body_len,
    char* out_buf,
    int out_max,
    int* out_status,
    int timeout_ms
) {
    if (out_status) *out_status = 0;
    if (out_buf && out_max > 0) out_buf[0] = '\0';
    if (!ip || !ip[0] || is_local_ip(ip)) return 0;

    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return 0;

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    addr.sin_addr.s_addr = inet_addr(ip);
    if (addr.sin_addr.s_addr == INADDR_NONE) {
        closesocket(s);
        return 0;
    }

    /* Non-blocking connect with short LAN timeout */
    u_long nb = 1;
    ioctlsocket(s, FIONBIO, &nb);
    int cr = connect(s, (struct sockaddr*)&addr, sizeof(addr));
    if (cr == SOCKET_ERROR) {
        if (WSAGetLastError() != WSAEWOULDBLOCK) {
            closesocket(s);
            return 0;
        }
        fd_set wfds, efds;
        FD_ZERO(&wfds); FD_SET(s, &wfds);
        FD_ZERO(&efds); FD_SET(s, &efds);
        struct timeval tv;
        tv.tv_sec = timeout_ms / 1000;
        tv.tv_usec = (timeout_ms % 1000) * 1000;
        if (select(0, NULL, &wfds, &efds, &tv) <= 0 || FD_ISSET(s, &efds) || !FD_ISSET(s, &wfds)) {
            closesocket(s);
            return 0;
        }
    }

    /* Switch back to blocking mode with RCV/SND timeouts */
    nb = 0;
    ioctlsocket(s, FIONBIO, &nb);
    DWORD rto = (DWORD)timeout_ms;
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char*)&rto, sizeof(rto));
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char*)&rto, sizeof(rto));

    char hdr[1024];
    int hlen = snprintf(hdr, sizeof(hdr),
        "%s %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Content-Type: application/json\r\n"
        "Accept: application/json\r\n"
        "%s"
        "Content-Length: %d\r\n"
        "Connection: close\r\n\r\n",
        method, path, ip, port, extra_headers ? extra_headers : "", body ? body_len : 0);

    if (send_all(s, hdr, hlen) < 0) {
        closesocket(s);
        return 0;
    }
    if (body && body_len > 0 && send_all(s, body, body_len) < 0) {
        closesocket(s);
        return 0;
    }

    int resp_cap = 262144;
    if (out_max > 0 && out_max + 4096 > resp_cap) resp_cap = out_max + 4096;
    char* raw = (char*)malloc((size_t)resp_cap);
    if (!raw) {
        closesocket(s);
        return 0;
    }

    int total = 0;
    while (total < resp_cap - 1) {
        int n = recv(s, raw + total, resp_cap - 1 - total, 0);
        if (n <= 0) break;
        total += n;
    }
    raw[total] = '\0';
    closesocket(s);

    if (total <= 0) {
        free(raw);
        return 0;
    }

    int status = 0;
    if (sscanf(raw, "HTTP/%*d.%*d %d", &status) == 1 && out_status) {
        *out_status = status;
    }

    char* body_start = strstr(raw, "\r\n\r\n");
    if (!body_start) {
        free(raw);
        return 0;
    }
    body_start += 4;
    int blen = total - (int)(body_start - raw);
    if (out_buf && out_max > 0) {
        int copy_len = (blen < out_max - 1) ? blen : (out_max - 1);
        if (copy_len > 0) memcpy(out_buf, body_start, (size_t)copy_len);
        out_buf[copy_len] = '\0';
    }
    free(raw);
    return (status >= 200 && status < 300) ? 1 : 0;
}

static void notify_all_lan_peers_async_hint(void) {
    /* Quickly ping active LAN peers' /api/intranet/notify so their SSE streams wake immediately */
    LanPeer snapshot[MAX_LAN_PEERS];
    int cnt = 0;
    EnterCriticalSection(&g_net_cs);
    cnt = g_peer_count;
    if (cnt > MAX_LAN_PEERS) cnt = MAX_LAN_PEERS;
    if (cnt > 0) memcpy(snapshot, g_peers, (size_t)cnt * sizeof(LanPeer));
    LeaveCriticalSection(&g_net_cs);

    char dummy[64];
    char body[160];
    int blen = snprintf(body, sizeof(body), "{\"node_id\":\"%s\",\"sequence\":%ld}", g_node_id, g_ledger_max_seq);
    for (int i = 0; i < cnt; i++) {
        if (!is_local_ip(snapshot[i].ip)) {
            lan_http_request(snapshot[i].ip, snapshot[i].port, "POST", "/api/intranet/notify",
                "X-MGas-LAN-Hop: 1\r\n", body, blen, dummy, sizeof(dummy), NULL, 400);
        }
    }
}

/* ============================================================================
 * HTTP SERVER & SSE STREAM HANDLERS
 * ============================================================================ */
static const char* get_mime_type(const wchar_t* path_w) {
    const wchar_t* ext = wcsrchr(path_w, L'.');
    if (!ext) return "application/octet-stream";
    if (wcsicmp(ext, L".html") == 0 || wcsicmp(ext, L".htm") == 0) return "text/html; charset=utf-8";
    if (wcsicmp(ext, L".js") == 0 || wcsicmp(ext, L".mjs") == 0) return "application/javascript; charset=utf-8";
    if (wcsicmp(ext, L".css") == 0) return "text/css; charset=utf-8";
    if (wcsicmp(ext, L".wasm") == 0) return "application/wasm";
    if (wcsicmp(ext, L".json") == 0) return "application/json; charset=utf-8";
    if (wcsicmp(ext, L".svg") == 0) return "image/svg+xml";
    if (wcsicmp(ext, L".png") == 0) return "image/png";
    if (wcsicmp(ext, L".jpg") == 0 || wcsicmp(ext, L".jpeg") == 0) return "image/jpeg";
    if (wcsicmp(ext, L".webp") == 0) return "image/webp";
    if (wcsicmp(ext, L".gif") == 0) return "image/gif";
    if (wcsicmp(ext, L".ico") == 0) return "image/x-icon";
    if (wcsicmp(ext, L".ttf") == 0) return "font/ttf";
    if (wcsicmp(ext, L".otf") == 0) return "font/otf";
    if (wcsicmp(ext, L".woff") == 0) return "font/woff";
    if (wcsicmp(ext, L".woff2") == 0) return "font/woff2";
    if (wcsicmp(ext, L".xlsx") == 0) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (wcsicmp(ext, L".txt") == 0) return "text/plain; charset=utf-8";
    return "application/octet-stream";
}

static int is_static_asset_path(const char* url) {
    if (!url) return 0;
    if (strncmp(url, "/assets/", 8) == 0 ||
        strncmp(url, "/webfonts/", 10) == 0 ||
        strncmp(url, "/fonts/", 7) == 0 ||
        strncmp(url, "/downloads/", 11) == 0) {
        return 1;
    }
    const char* last_slash = strrchr(url, '/');
    const char* filename = last_slash ? last_slash + 1 : url;
    const char* dot = strrchr(filename, '.');
    if (dot && dot[1] != '\0') return 1;
    return 0;
}

static void send_json_status_response(SOCKET client, int status_code, const char* status_text, const char* json_body) {
    char header[512];
    int body_len = (int)strlen(json_body);
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Private-Network: true\r\n"
        "Access-Control-Allow-Headers: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: close\r\n\r\n", status_code, status_text, body_len);
    send_all(client, header, header_len);
    send_all(client, json_body, body_len);
    closesocket(client);
}

static void send_json_response(SOCKET client, const char* json_body) {
    send_json_status_response(client, 200, "OK", json_body);
}

static void url_decode(char* dst, const char* src, size_t dst_max) {
    if (!dst || !src || dst_max == 0) return;
    size_t d = 0;
    while (*src && d < dst_max - 1) {
        if (*src == '%' && src[1] && src[2]) {
            int h1 = src[1], h2 = src[2];
            int val1 = (h1 >= '0' && h1 <= '9') ? (h1 - '0') :
                       (h1 >= 'a' && h1 <= 'f') ? (h1 - 'a' + 10) :
                       (h1 >= 'A' && h1 <= 'F') ? (h1 - 'A' + 10) : -1;
            int val2 = (h2 >= '0' && h2 <= '9') ? (h2 - '0') :
                       (h2 >= 'a' && h2 <= 'f') ? (h2 - 'a' + 10) :
                       (h2 >= 'A' && h2 <= 'F') ? (h2 - 'A' + 10) : -1;
            if (val1 >= 0 && val2 >= 0) {
                dst[d++] = (char)((val1 << 4) | val2);
                src += 3;
                continue;
            }
        }
        dst[d++] = *src++;
    }
    dst[d] = '\0';
}

static int parse_since_sequence_param(const char* full_url) {
    if (!full_url) return 0;
    const char* p = strstr(full_url, "since_sequence=");
    if (!p) return 0;
    return atoi(p + 15);
}

static void parse_query_string_param(const char* full_url, const char* key, char* out, size_t out_max) {
    if (!out || out_max == 0) return;
    out[0] = '\0';
    if (!full_url || !key) return;
    const char* p = strstr(full_url, key);
    if (!p) return;
    p += strlen(key);
    if (*p != '=') return;
    p++;
    char encoded[256];
    size_t i = 0;
    while (*p && *p != '&' && *p != ' ' && i < sizeof(encoded) - 1) {
        encoded[i++] = *p++;
    }
    encoded[i] = '\0';
    url_decode(out, encoded, out_max);
}

static void update_local_purge_marker_and_cache(const char* purged_at, int seq) {
    if (!purged_at || !purged_at[0]) return;
    ledger_apply_purge(purged_at, (long)seq);

    char clean_cache[512];
    int len = snprintf(clean_cache, sizeof(clean_cache),
        "{\"success\":true,\"events\":[],\"server_sequence\":%ld,\"last_purged_at\":\"%s\",\"purge_preserve_products\":true}\n",
        g_ledger_max_seq,
        g_last_purged_at);
    save_sync_cache(clean_cache, len);
}

/* Build full /api/intranet/status JSON */
static void build_intranet_status_json(char* out, size_t out_max) {
    refresh_local_network_info();
    char eff_role[16];
    char hub_ip[64] = {0};
    char hub_host[128] = {0};
    int hub_port = SERVER_PORT;

    EnterCriticalSection(&g_net_cs);
    get_effective_role(eff_role, sizeof(eff_role));
    snprintf(hub_ip, sizeof(hub_ip), "%s", g_active_hub_ip);
    snprintf(hub_host, sizeof(hub_host), "%s", g_active_hub_hostname);
    hub_port = g_active_hub_port;

    char ips_json[512] = "[";
    size_t ip_pos = 1;
    for (int i = 0; i < g_local_ip_count && ip_pos + 32 < sizeof(ips_json); i++) {
        if (i > 0) ips_json[ip_pos++] = ',';
        ip_pos += (size_t)snprintf(ips_json + ip_pos, sizeof(ips_json) - ip_pos, "\"%s\"", g_local_ips[i]);
    }
    ips_json[ip_pos++] = ']';
    ips_json[ip_pos] = '\0';

    char primary_url[128] = "";
    if (g_local_ip_count > 0) {
        snprintf(primary_url, sizeof(primary_url), "http://%s:%d", g_local_ips[0], SERVER_PORT);
    } else {
        snprintf(primary_url, sizeof(primary_url), "http://localhost:%d", SERVER_PORT);
    }

    char active_hub_url[128] = "";
    if (hub_ip[0] && !is_local_ip(hub_ip)) {
        snprintf(active_hub_url, sizeof(active_hub_url), "http://%s:%d", hub_ip, hub_port);
    }

    char peers_json[4096] = "[";
    size_t p_pos = 1;
    DWORD now_tick = GetTickCount();
    for (int i = 0; i < g_peer_count && p_pos + 256 < sizeof(peers_json); i++) {
        char esc_host[160];
        json_escape_str(g_peers[i].hostname, esc_host, sizeof(esc_host));
        if (i > 0) peers_json[p_pos++] = ',';
        p_pos += (size_t)snprintf(peers_json + p_pos, sizeof(peers_json) - p_pos,
            "{\"node_id\":\"%s\",\"hostname\":\"%s\",\"ip\":\"%s\",\"port\":%d,"
            "\"role\":\"%s\",\"sequence\":%ld,\"has_cloud\":%s,\"last_seen_ms_ago\":%lu}",
            g_peers[i].node_id, esc_host, g_peers[i].ip, g_peers[i].port,
            g_peers[i].role, g_peers[i].sequence,
            g_peers[i].has_cloud ? "true" : "false",
            (unsigned long)(now_tick - g_peers[i].last_seen_tick));
    }
    peers_json[p_pos++] = ']';
    peers_json[p_pos] = '\0';
    LeaveCriticalSection(&g_net_cs);

    int ledger_cnt = g_ledger_count;
    int unsynced_cnt = ledger_count_unsynced_cloud();
    char esc_self_host[160], esc_hub_host[160];
    json_escape_str(g_hostname, esc_self_host, sizeof(esc_self_host));
    json_escape_str(hub_host, esc_hub_host, sizeof(esc_hub_host));

    snprintf(out, out_max,
        "{"
        "\"success\":true,"
        "\"is_desktop_server\":true,"
        "\"version\":\"2.1.0\","
        "\"role\":\"%s\","
        "\"effective_role\":\"%s\","
        "\"hostname\":\"%s\","
        "\"node_id\":\"%s\","
        "\"tcp_port\":%d,"
        "\"udp_port\":%d,"
        "\"local_ips\":%s,"
        "\"primary_url\":\"%s\","
        "\"manual_hub_ip\":\"%s\","
        "\"manual_hub_port\":%d,"
        "\"discovered_hub_url\":\"%s\","
        "\"discovered_hub_hostname\":\"%s\","
        "\"active_hub_url\":\"%s\","
        "\"cloud_online\":%s,"
        "\"last_cloud_check\":\"%s\","
        "\"ledger_events_count\":%d,"
        "\"unsynced_to_cloud_count\":%d,"
        "\"server_sequence\":%ld,"
        "\"sse_clients_count\":%d,"
        "\"last_purged_at\":\"%s\","
        "\"peers\":%s"
        "}\n",
        g_cfg_role, eff_role, esc_self_host, g_node_id,
        SERVER_PORT, DISCOVERY_UDP_PORT, ips_json, primary_url,
        g_manual_hub_ip, g_manual_hub_port,
        active_hub_url, esc_hub_host, active_hub_url,
        g_cloud_online ? "true" : "false", g_last_cloud_check,
        ledger_cnt, unsynced_cnt, g_ledger_max_seq,
        g_sse_client_count, g_last_purged_at, peers_json);
}

/* Single-writer SSE live stream driven by g_ledger + g_ledger_version (fast LAN + Cloud) */
static void handle_sse_live_stream(SOCKET client, const char* full_url) {
    int last_seq = parse_since_sequence_param(full_url);
    long initial_seq = g_ledger_max_seq;
    if ((long)last_seq > initial_seq) last_seq = 0;

    char client_purged_at[64] = {0};
    parse_query_string_param(full_url, "since_purged_at", client_purged_at, sizeof(client_purged_at));

    log_write("SSE", "Live stream connected (since_sequence=%d, since_purged_at=%s)", last_seq, client_purged_at);

    char sse_hdr[768];
    int hdr_len = snprintf(sse_hdr, sizeof(sse_hdr),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/event-stream; charset=utf-8\r\n"
        "Cache-Control: no-cache, no-transform\r\n"
        "Connection: keep-alive\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Private-Network: true\r\n\r\n"
        "data: {\"type\":\"CONNECTED\",\"current_server_sequence\":%ld,\"last_purged_at\":\"%s\",\"intranet_lan\":true}\n\n",
        initial_seq,
        g_last_purged_at);

    if (send_all(client, sse_hdr, hdr_len) < 0) {
        closesocket(client);
        return;
    }

    EnterCriticalSection(&g_sse_cs);
    if (g_sse_client_count < MAX_SSE_CLIENTS) {
        g_sse_clients[g_sse_client_count++] = client;
    }
    LeaveCriticalSection(&g_sse_cs);

    long client_seq = (long)last_seq;
    LONG seen_version = -1;
    int idle_ticks = 0;

    while (1) {
        /* Push purge marker if remote/LAN purge is newer than client's purge timestamp */
        if (g_last_purged_at[0] && strcmp(g_last_purged_at, client_purged_at) > 0) {
            char purge_frame[512];
            int plen = snprintf(purge_frame, sizeof(purge_frame),
                "data: {\"type\":\"DATABASE_PURGED\",\"preserve_products\":true,\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%ld}\n\n",
                g_last_purged_at, g_last_purged_at, g_ledger_max_seq);
            if (send_all(client, purge_frame, plen) < 0) break;
            snprintf(client_purged_at, sizeof(client_purged_at), "%s", g_last_purged_at);
            idle_ticks = 0;
        }

        LONG cur_ver = g_ledger_version;
        if (cur_ver != seen_version || client_seq < g_ledger_max_seq) {
            seen_version = cur_ver;
            int returned = 0;
            long max_s = g_ledger_max_seq;
            char* delta_json = ledger_build_sync_response(client_seq, 250, &returned, &max_s);
            if (delta_json) {
                if (returned > 0 && has_nonempty_events(delta_json)) {
                    char* json_start = strchr(delta_json, '{');
                    if (json_start) {
                        size_t dlen = strlen(json_start);
                        char* frame = (char*)malloc(dlen + 64);
                        if (frame) {
                            int flen = snprintf(frame, dlen + 64, "data: {\"type\":\"SYNC_EVENTS\",%s\n\n", json_start + 1);
                            int sres = send_all(client, frame, flen);
                            free(frame);
                            if (sres < 0) {
                                free(delta_json);
                                break;
                            }
                        }
                    }
                    long batch_seq = (long)extract_sequence_from_json(delta_json, (int)client_seq);
                    if (batch_seq > client_seq) client_seq = batch_seq;
                    idle_ticks = 0;
                } else {
                    client_seq = max_s;
                }
                free(delta_json);
            }
        }

        idle_ticks++;
        if (idle_ticks >= 60) {
            const char* hb = ": heartbeat\n\n";
            if (send_all(client, hb, (int)strlen(hb)) < 0) break;
            idle_ticks = 0;
        }
        Sleep(150);
    }

    EnterCriticalSection(&g_sse_cs);
    for (int i = 0; i < g_sse_client_count; i++) {
        if (g_sse_clients[i] == client) {
            g_sse_clients[i] = g_sse_clients[g_sse_client_count - 1];
            g_sse_client_count--;
            break;
        }
    }
    LeaveCriticalSection(&g_sse_cs);

    closesocket(client);
}

/* ============================================================================
 * HTTP REQUEST DISPATCHER
 * ============================================================================ */
static void handle_client(SOCKET client) {
    int buf_cap = REQ_INITIAL_BUF;
    char* req_buf = (char*)malloc((size_t)buf_cap);
    if (!req_buf) {
        closesocket(client);
        return;
    }

    int bytes_read = recv(client, req_buf, buf_cap - 1, 0);
    if (bytes_read <= 0) {
        free(req_buf);
        closesocket(client);
        return;
    }
    req_buf[bytes_read] = '\0';

    int header_size = 0;
    int body_received = 0;
    char* body_delim = strstr(req_buf, "\r\n\r\n");
    if (body_delim) {
        header_size = (int)(body_delim + 4 - req_buf);
        body_received = bytes_read - header_size;
        char* cl_pos = strstr(req_buf, "Content-Length:");
        if (!cl_pos) cl_pos = strstr(req_buf, "content-length:");
        if (cl_pos) {
            int expected_body = atoi(cl_pos + 15);
            int target_total = header_size + expected_body;
            if (target_total >= buf_cap && target_total < REQ_MAX_BUF) {
                char* bigger = (char*)realloc(req_buf, (size_t)target_total + 16);
                if (bigger) {
                    req_buf = bigger;
                    buf_cap = target_total + 16;
                }
            }
            while (body_received < expected_body && bytes_read < buf_cap - 1) {
                int to_read = expected_body - body_received;
                if (to_read > buf_cap - 1 - bytes_read) to_read = buf_cap - 1 - bytes_read;
                int n = recv(client, req_buf + bytes_read, to_read, 0);
                if (n <= 0) break;
                bytes_read += n;
                body_received += n;
                req_buf[bytes_read] = '\0';
            }
        }
    }

    char method[16] = {0};
    char full_url[2048] = {0};
    char url[2048] = {0};
    sscanf(req_buf, "%15s %2047s", method, full_url);
    snprintf(url, sizeof(url), "%s", full_url);

    int is_lan_hop = (strstr(req_buf, "X-MGas-LAN-Hop: 1") != NULL || strstr(req_buf, "x-mgas-lan-hop: 1") != NULL);

    /* CORS preflight OPTIONS (supports Chrome Private Network Access too) */
    if (stricmp(method, "OPTIONS") == 0) {
        const char* cors = "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Private-Network: true\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: *\r\n"
            "Connection: close\r\n\r\n";
        send_all(client, cors, (int)strlen(cors));
        free(req_buf);
        closesocket(client);
        return;
    }

    char* q = strchr(url, '?');
    if (q) *q = '\0';

    /* Snapshot active Hub info */
    char hub_ip[64] = {0};
    int hub_port = SERVER_PORT;
    char eff_role[16] = {0};
    EnterCriticalSection(&g_net_cs);
    get_effective_role(eff_role, sizeof(eff_role));
    snprintf(hub_ip, sizeof(hub_ip), "%s", g_active_hub_ip);
    hub_port = g_active_hub_port;
    LeaveCriticalSection(&g_net_cs);

    /* 1. Health endpoint */
    if (strcmp(url, "/api/health") == 0 || strcmp(url, "/health") == 0) {
        free(req_buf);
        char resp[384];
        snprintf(resp, sizeof(resp),
            "{\"status\":\"healthy\",\"d1_connected\":%s,\"lan_enabled\":true,\"service\":\"MGas Windows Intranet Server\",\"mode\":\"desktop_hybrid\",\"role\":\"%s\",\"node_id\":\"%s\",\"port\":%d,\"sequence\":%ld}\n",
            g_cloud_online ? "true" : "false", eff_role, g_node_id, SERVER_PORT, g_ledger_max_seq);
        send_json_response(client, resp);
        return;
    }

    /* 1b. Intranet LAN Telemetry & Config Endpoints */
    if (strcmp(url, "/api/intranet/status") == 0) {
        free(req_buf);
        char* status_buf = (char*)malloc(8192);
        if (status_buf) {
            build_intranet_status_json(status_buf, 8192);
            send_json_response(client, status_buf);
            free(status_buf);
        } else {
            send_json_response(client, "{\"success\":false}\n");
        }
        return;
    }

    if (strcmp(url, "/api/intranet/config") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char new_role[16] = {0};
        char new_hub_ip[64] = {0};
        int new_hub_port = extract_json_int_field(post_body, "\"manual_hub_port\"", g_manual_hub_port);

        EnterCriticalSection(&g_net_cs);
        if (extract_json_string_field(post_body, "\"role\"", new_role, sizeof(new_role))) {
            if (strcmp(new_role, "HUB") == 0 || strcmp(new_role, "CLIENT") == 0 || strcmp(new_role, "AUTO") == 0) {
                snprintf(g_cfg_role, sizeof(g_cfg_role), "%s", new_role);
            }
        }
        if (strstr(post_body, "\"manual_hub_ip\"") != NULL) {
            extract_json_string_field(post_body, "\"manual_hub_ip\"", new_hub_ip, sizeof(new_hub_ip));
            snprintf(g_manual_hub_ip, sizeof(g_manual_hub_ip), "%s", new_hub_ip);
        }
        if (new_hub_port > 0 && new_hub_port < 65535) {
            g_manual_hub_port = new_hub_port;
        }
        /* Re-evaluate active hub immediately */
        if (strcmp(g_cfg_role, "HUB") == 0) {
            g_active_hub_ip[0] = '\0';
            g_active_hub_hostname[0] = '\0';
        } else if (g_manual_hub_ip[0] && !is_local_ip(g_manual_hub_ip)) {
            snprintf(g_active_hub_ip, sizeof(g_active_hub_ip), "%s", g_manual_hub_ip);
            g_active_hub_port = g_manual_hub_port;
        }
        LeaveCriticalSection(&g_net_cs);
        save_intranet_config();
        free(req_buf);

        char* status_buf = (char*)malloc(8192);
        if (status_buf) {
            build_intranet_status_json(status_buf, 8192);
            send_json_response(client, status_buf);
            free(status_buf);
        } else {
            send_json_response(client, "{\"success\":true}\n");
        }
        return;
    }

    if (strcmp(url, "/api/intranet/notify") == 0) {
        free(req_buf);
        InterlockedIncrement(&g_ledger_version);
        send_json_response(client, "{\"success\":true,\"notified\":true}\n");
        return;
    }

    if (strcmp(url, "/api/intranet/ping-peer") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char target_ip[64] = {0};
        extract_json_string_field(post_body, "\"ip\"", target_ip, sizeof(target_ip));
        int target_port = extract_json_int_field(post_body, "\"port\"", SERVER_PORT);
        if (!target_ip[0] && hub_ip[0]) {
            snprintf(target_ip, sizeof(target_ip), "%s", hub_ip);
            target_port = hub_port;
        }
        free(req_buf);

        if (!target_ip[0]) {
            send_json_response(client, "{\"success\":false,\"reachable\":false,\"error\":\"آدرس IP میزبان مشخص نشده است\"}\n");
            return;
        }
        char peer_resp[1024] = {0};
        DWORD t0 = GetTickCount();
        int pstatus = 0;
        int ok = lan_http_request(target_ip, target_port, "GET", "/api/health", "X-MGas-LAN-Hop: 1\r\n", NULL, 0, peer_resp, sizeof(peer_resp), &pstatus, 1800);
        DWORD lat = GetTickCount() - t0;
        char resp[1280];
        snprintf(resp, sizeof(resp),
            "{\"success\":%s,\"reachable\":%s,\"ip\":\"%s\",\"port\":%d,\"latency_ms\":%lu,\"http_status\":%d}\n",
            ok ? "true" : "false", ok ? "true" : "false", target_ip, target_port, (unsigned long)lat, pstatus);
        send_json_response(client, resp);
        return;
    }

    /* 2. Auth relay to central server with LAN Hub + offline user cache fallback */
    if (strcmp(url, "/api/auth/login") == 0 ||
        strcmp(url, "/api/auth/authenticate") == 0 ||
        strcmp(url, "/api/auth/change-password") == 0 ||
        strcmp(url, "/api/auth/user-update") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        DWORD cloud_status = 0;
        int handled = 0;

        if (cloud_resp) {
            int ok = relay_to_central_cloud_ex("POST", url, post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX, &cloud_status);
            if (ok || (cloud_status >= 400 && cloud_status < 500 && strlen(cloud_resp) > 0)) {
                send_json_status_response(client, (int)(cloud_status ? cloud_status : 200),
                    (cloud_status == 401 ? "Unauthorized" : (cloud_status == 403 ? "Forbidden" : (cloud_status >= 400 ? "Bad Request" : "OK"))),
                    cloud_resp);
                handled = 1;
            }
            if (!handled && !is_lan_hop && hub_ip[0] && !is_local_ip(hub_ip)) {
                int hstatus = 0;
                int hok = lan_http_request(hub_ip, hub_port, "POST", url, "X-MGas-LAN-Hop: 1\r\n", post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX, &hstatus, 1800);
                if (hok || (hstatus >= 400 && hstatus < 500 && strlen(cloud_resp) > 0)) {
                    send_json_status_response(client, (int)(hstatus ? hstatus : 200),
                        (hstatus == 401 ? "Unauthorized" : (hstatus == 403 ? "Forbidden" : (hstatus >= 400 ? "Bad Request" : "OK"))),
                        cloud_resp);
                    handled = 1;
                }
            }
            free(cloud_resp);
        }
        free(req_buf);
        if (!handled) {
            send_json_status_response(client, 503, "Service Unavailable",
                "{\"success\":false,\"offline_fallback\":true,\"message\":\"سرور ابری در دسترس نیست - استفاده از احراز هویت محلی\"}\n");
        }
        return;
    }

    if (strcmp(url, "/api/auth/users") == 0) {
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        int sent_resp = 0;
        if (cloud_resp) {
            if (relay_to_central_cloud("GET", "/api/auth/users", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX)) {
                write_file_atomic_w(g_users_file_w, cloud_resp, strlen(cloud_resp));
                send_json_response(client, cloud_resp);
                sent_resp = 1;
            } else if (!is_lan_hop && hub_ip[0] && !is_local_ip(hub_ip)) {
                int hstatus = 0;
                if (lan_http_request(hub_ip, hub_port, "GET", "/api/auth/users", "X-MGas-LAN-Hop: 1\r\n", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX, &hstatus, 1800)) {
                    write_file_atomic_w(g_users_file_w, cloud_resp, strlen(cloud_resp));
                    send_json_response(client, cloud_resp);
                    sent_resp = 1;
                }
            }
            free(cloud_resp);
        }
        free(req_buf);
        if (!sent_resp) {
            char* cached_users = read_entire_file_w(g_users_file_w, NULL);
            if (cached_users) {
                send_json_response(client, cached_users);
                free(cached_users);
            } else {
                send_json_response(client, "{\"success\":true,\"users\":[],\"total_users\":0,\"offline_fallback\":true}\n");
            }
        }
        return;
    }

    /* 3. Sync events bidirectional relay + Authoritative LAN Ledger + SSE wake */
    if (strcmp(url, "/api/sync/events") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";

        /* 3.1 Relay to Cloud OR LAN Hub if available */
        int cloud_ok = 0;
        long cloud_seq = 0;
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp) {
            if (relay_to_central_cloud("POST", "/api/sync/events", post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX)) {
                cloud_ok = 1;
                cloud_seq = (long)extract_sequence_from_json(cloud_resp, (int)g_ledger_max_seq);
            }
        }

        /* 3.2 Store into authoritative local/LAN ledger (marking cloud_synced=1 if cloud accepted) */
        int mark_hub = (cloud_ok || strcmp(eff_role, "HUB") == 0) ? 1 : 0;
        char* accepted_json = (char*)malloc(262144);
        if (accepted_json) accepted_json[0] = '\0';
        int newly_added = ledger_ingest_payload_ex(post_body, cloud_ok, mark_hub, 1, accepted_json, 262144);

        /* 3.3 If we are CLIENT connected to an active LAN Hub (and not a hop), forward to LAN Hub */
        int hub_ok = 0;
        char* hub_resp = NULL;
        if (!is_lan_hop && strcmp(eff_role, "CLIENT") == 0 && hub_ip[0] && !is_local_ip(hub_ip)) {
            hub_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
            if (hub_resp) {
                int hstatus = 0;
                if (lan_http_request(hub_ip, hub_port, "POST", "/api/sync/events", "X-MGas-LAN-Hop: 1\r\n", post_body, body_received, hub_resp, CLOUD_RESPONSE_MAX, &hstatus, 2500)) {
                    hub_ok = 1;
                    long hseq = (long)extract_sequence_from_json(hub_resp, (int)g_ledger_max_seq);
                    ledger_mark_hub_synced(post_body, hseq);
                }
            }
        }

        if (newly_added > 0) {
            notify_all_lan_peers_async_hint();
        }

        if (cloud_ok && cloud_resp) {
            if (cloud_seq > g_ledger_max_seq) {
                EnterCriticalSection(&g_ledger_cs);
                g_ledger_max_seq = cloud_seq;
                g_last_known_sequence = cloud_seq;
                LeaveCriticalSection(&g_ledger_cs);
            }
            send_json_response(client, cloud_resp);
        } else if (hub_ok && hub_resp) {
            send_json_response(client, hub_resp);
        } else {
            char ts[64];
            get_utc_iso_timestamp(ts, sizeof(ts));
            size_t acc_len = accepted_json ? strlen(accepted_json) : 2;
            char* lan_resp = (char*)malloc(acc_len + 512);
            if (lan_resp) {
                snprintf(lan_resp, acc_len + 512,
                    "{\"success\":true,\"accepted_events\":%s,\"current_server_sequence\":%ld,"
                    "\"last_purged_at\":\"%s\",\"lan_synced\":true,\"cloud_synced\":false,"
                    "\"source\":\"INTRANET_LAN\",\"timestamp\":\"%s\"}\n",
                    (accepted_json && accepted_json[0]) ? accepted_json : "[]",
                    g_ledger_max_seq, g_last_purged_at, ts);
                send_json_response(client, lan_resp);
                free(lan_resp);
            } else {
                send_json_response(client, "{\"success\":true,\"accepted_events\":[],\"source\":\"INTRANET_LAN\"}\n");
            }
        }

        if (accepted_json) free(accepted_json);
        if (cloud_resp) free(cloud_resp);
        if (hub_resp) free(hub_resp);
        free(req_buf);
        return;
    }

    /* 3b. Sync pull events handler with LAN Hub + Local Ledger Authoritative Support */
    if (strcmp(url, "/api/sync") == 0) {
        int since_seq = parse_since_sequence_param(full_url);
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        int sent_resp = 0;

        /* Priority 1 (if not an internal LAN hop AND not forced offline): try Cloud D1 */
        if (!is_lan_hop && cloud_resp && relay_to_central_cloud("GET", full_url, NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX)) {
            int new_seq = extract_sequence_from_json(cloud_resp, (int)g_ledger_max_seq);
            char remote_purged_at[64] = {0};
            if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_purged_at, sizeof(remote_purged_at))) {
                if (!g_last_purged_at[0] || strcmp(remote_purged_at, g_last_purged_at) > 0) {
                    update_local_purge_marker_and_cache(remote_purged_at, new_seq);
                }
            }
            ledger_ingest_payload(cloud_resp, 1, 0, NULL, 0);
            if (since_seq == 0 && strlen(cloud_resp) > 10) {
                save_sync_cache(cloud_resp, (int)strlen(cloud_resp));
            }
            /* If we have NO unsynced LAN-only events, return Cloud directly; otherwise serve merged ledger! */
            if (ledger_count_unsynced_cloud() == 0) {
                send_json_response(client, cloud_resp);
                sent_resp = 1;
            }
        }

        /* Priority 2: If acting as CLIENT with an active LAN Hub (and not a hop), pull from Hub */
        if (!sent_resp && !is_lan_hop && strcmp(eff_role, "CLIENT") == 0 && hub_ip[0] && !is_local_ip(hub_ip) && cloud_resp) {
            int hstatus = 0;
            if (lan_http_request(hub_ip, hub_port, "GET", full_url, "X-MGas-LAN-Hop: 1\r\n", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX, &hstatus, 2500)) {
                char remote_purged_at[64] = {0};
                if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_purged_at, sizeof(remote_purged_at))) {
                    if (!g_last_purged_at[0] || strcmp(remote_purged_at, g_last_purged_at) > 0) {
                        int hseq = extract_sequence_from_json(cloud_resp, (int)g_ledger_max_seq);
                        update_local_purge_marker_and_cache(remote_purged_at, hseq);
                    }
                }
                ledger_ingest_payload_ex(cloud_resp, 0, 1, 0, NULL, 0);
                send_json_response(client, cloud_resp);
                sent_resp = 1;
            }
        }

        /* Priority 3: Serve authoritative paginated delta directly from local/LAN ledger! */
        if (!sent_resp) {
            int ev_ret = 0;
            long max_s = g_ledger_max_seq;
            char* lan_sync = ledger_build_sync_response((long)since_seq, 500, &ev_ret, &max_s);
            if (lan_sync) {
                send_json_response(client, lan_sync);
                free(lan_sync);
                sent_resp = 1;
            }
        }

        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        if (!sent_resp) {
            char fallback_json[320];
            snprintf(fallback_json, sizeof(fallback_json),
                "{\"success\":true,\"events\":[],\"server_sequence\":%ld,\"last_purged_at\":\"%s\",\"source\":\"INTRANET_LAN\"}\n",
                g_ledger_max_seq, g_last_purged_at);
            send_json_response(client, fallback_json);
        }
        return;
    }

    /* 3c. Cloud & Intranet Connection Status Diagnostic */
    if (strcmp(url, "/api/sync/status") == 0) {
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        DWORD t0 = GetTickCount();
        int ok = (cloud_resp && relay_to_central_cloud("GET", "/api/sync?since_sequence=0", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX));
        DWORD latency = GetTickCount() - t0;

        if (ok) {
            int seq = extract_sequence_from_json(cloud_resp, (int)g_ledger_max_seq);
            int ev_count = count_events_in_json(cloud_resp);
            save_sync_cache(cloud_resp, (int)strlen(cloud_resp));
            ledger_ingest_payload(cloud_resp, 1, 0, NULL, 0);
            free(cloud_resp);
            free(req_buf);

            char resp[640];
            snprintf(resp, sizeof(resp),
                "{\"success\":true,\"cloud_url\":\"https://anbar.mgas.ir\",\"status\":\"CONNECTED\",\"lan_status\":\"ONLINE\",\"role\":\"%s\",\"peers_count\":%d,\"latency_ms\":%lu,\"remote_events_count\":%d,\"local_event_store_count\":%d,\"current_server_sequence\":%ld}\n",
                eff_role, g_peer_count, (unsigned long)latency, ev_count, g_ledger_count, g_ledger_max_seq > seq ? g_ledger_max_seq : (long)seq);
            send_json_response(client, resp);
            return;
        }
        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        char offline_resp[640];
        snprintf(offline_resp, sizeof(offline_resp),
            "{\"success\":true,\"cloud_url\":\"https://anbar.mgas.ir\",\"status\":\"OFFLINE\",\"lan_status\":\"ONLINE\",\"role\":\"%s\",\"peers_count\":%d,\"local_event_store_count\":%d,\"offline_fallback\":true,\"current_server_sequence\":%ld,\"error\":\"اینترنت قطع است — همگام‌سازی اینترانت شبکه داخلی فعال می‌باشد\"}\n",
            eff_role, g_peer_count, g_ledger_count, g_ledger_max_seq);
        send_json_response(client, offline_resp);
        return;
    }

    /* 3d. Force Sync / Pull handler */
    if (strcmp(url, "/api/sync/force-pull") == 0) {
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp && relay_to_central_cloud("GET", "/api/sync?since_sequence=0", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX)) {
            int seq = extract_sequence_from_json(cloud_resp, (int)g_ledger_max_seq);
            int ev_count = count_events_in_json(cloud_resp);
            save_sync_cache(cloud_resp, (int)strlen(cloud_resp));
            ledger_ingest_payload(cloud_resp, 1, 0, NULL, 0);
            free(cloud_resp);
            free(req_buf);
            char resp[512];
            snprintf(resp, sizeof(resp),
                "{\"success\":true,\"current_sequence\":%ld,\"total_events\":%d,\"message\":\"بروزرسانی داده‌ها از anbar.mgas.ir و شبکه اینترانت با موفقیت انجام شد\"}\n",
                g_ledger_max_seq > seq ? g_ledger_max_seq : (long)seq, ev_count);
            send_json_response(client, resp);
            return;
        }
        if (!is_lan_hop && hub_ip[0] && !is_local_ip(hub_ip) && cloud_resp) {
            int hstatus = 0;
            if (lan_http_request(hub_ip, hub_port, "GET", "/api/sync?since_sequence=0", "X-MGas-LAN-Hop: 1\r\n", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX, &hstatus, 2500)) {
                ledger_ingest_payload(cloud_resp, 0, 0, NULL, 0);
            }
        }
        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        char resp_off[512];
        snprintf(resp_off, sizeof(resp_off),
            "{\"success\":true,\"lan_synced\":true,\"current_sequence\":%ld,\"total_events\":%d,\"message\":\"بروزرسانی داده‌ها از طریق شبکه محلی اینترانت انجام شد\"}\n",
            g_ledger_max_seq, g_ledger_count);
        send_json_response(client, resp_off);
        return;
    }

    /* 3d2..3d4. Database Purge & Zero-All relay (Cloud + LAN Hub + Local Ledger) */
    if (strcmp(url, "/api/database/purge") == 0 ||
        strcmp(url, "/api/inventory/zero-all") == 0 ||
        strcmp(url, "/api/database/purge-all-except-products") == 0 ||
        strcmp(url, "/api/database/manager-purge") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char purged_ts[64] = {0};
        if (!extract_json_string_field(post_body, "\"timestamp\"", purged_ts, sizeof(purged_ts)) &&
            !extract_json_string_field(post_body, "\"purged_at\"", purged_ts, sizeof(purged_ts))) {
            get_utc_iso_timestamp(purged_ts, sizeof(purged_ts));
        }
        long next_seq = g_ledger_max_seq + 1;

        const char* relay_path = (strcmp(url, "/api/database/purge") == 0)
            ? "/api/database/purge"
            : (strcmp(url, "/api/inventory/zero-all") == 0 ? "/api/inventory/zero-all" : "/api/database/purge-all-except-products");

        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        int sent = 0;
        if (cloud_resp) {
            if (relay_to_central_cloud("POST", relay_path, post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX)) {
                char remote_ts[64] = {0};
                if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_ts, sizeof(remote_ts)) ||
                    extract_json_string_field(cloud_resp, "\"timestamp\"", remote_ts, sizeof(remote_ts))) {
                    snprintf(purged_ts, sizeof(purged_ts), "%s", remote_ts);
                }
                next_seq = (long)extract_sequence_from_json(cloud_resp, (int)next_seq);
                update_local_purge_marker_and_cache(purged_ts, (int)next_seq);
                notify_all_lan_peers_async_hint();
                send_json_response(client, cloud_resp);
                sent = 1;
            } else if (!is_lan_hop && strcmp(eff_role, "CLIENT") == 0 && hub_ip[0] && !is_local_ip(hub_ip)) {
                int hstatus = 0;
                if (lan_http_request(hub_ip, hub_port, "POST", url, "X-MGas-LAN-Hop: 1\r\n", post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX, &hstatus, 2500)) {
                    char remote_ts[64] = {0};
                    if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_ts, sizeof(remote_ts))) {
                        snprintf(purged_ts, sizeof(purged_ts), "%s", remote_ts);
                    }
                    next_seq = (long)extract_sequence_from_json(cloud_resp, (int)next_seq);
                    update_local_purge_marker_and_cache(purged_ts, (int)next_seq);
                    send_json_response(client, cloud_resp);
                    sent = 1;
                }
            }
            free(cloud_resp);
        }

        if (!sent) {
            update_local_purge_marker_and_cache(purged_ts, (int)next_seq);
            notify_all_lan_peers_async_hint();
            char resp[512];
            snprintf(resp, sizeof(resp),
                "{\"success\":true,\"message\":\"پاک‌سازی در دیتابیس محلی و شبکه اینترانت انجام شد\",\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%ld}\n",
                g_last_purged_at, g_last_purged_at, g_ledger_max_seq);
            send_json_response(client, resp);
        }
        free(req_buf);
        return;
    }

    /* 3e. SSE live stream handler */
    if (strcmp(url, "/api/sync/stream") == 0) {
        free(req_buf);
        handle_sse_live_stream(client, full_url);
        return;
    }

    /* 3f. Database file download handler */
    if (strncmp(url, "/api/download/database/", 23) == 0 || strcmp(url, "/mgas_local.db") == 0) {
        const char* db_param = (strcmp(url, "/mgas_local.db") == 0) ? "db-anbar1" : (url + 23);
        char db_filename[64] = {0};
        snprintf(db_filename, sizeof(db_filename), "%s%s", db_param, strstr(db_param, ".db") ? "" : ".db");
        wchar_t db_filename_w[64] = {0};
        utf8_to_wchar(db_filename, db_filename_w, 64);
        wchar_t full_db_path_w[MAX_PATH * 2];
        _snwprintf(full_db_path_w, MAX_PATH * 2, L"%s\\%s", g_app_dir_w, db_filename_w);
        FILE* db_f = _wfopen(full_db_path_w, L"rb");
        if (db_f) {
            fseek(db_f, 0, SEEK_END);
            long db_size = ftell(db_f);
            fseek(db_f, 0, SEEK_SET);
            char h[512];
            int hlen = snprintf(h, sizeof(h),
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/x-sqlite3\r\n"
                "Content-Disposition: attachment; filename=\"%s\"\r\n"
                "Content-Length: %ld\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n", db_filename, db_size);
            send_all(client, h, hlen);
            char ch[65536];
            size_t nread;
            while ((nread = fread(ch, 1, sizeof(ch), db_f)) > 0) {
                if (send_all(client, ch, (int)nread) < 0) break;
            }
            fclose(db_f);
            free(req_buf);
            closesocket(client);
            return;
        }
    }

    /* 4. Tri-sync inspect relay (Cloud + Real LAN Ledger fallback) */
    if (strcmp(url, "/api/tri-sync/inspect") == 0 || strcmp(url, "/api/sync/inspector") == 0) {
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp && relay_to_central_cloud("GET", "/api/tri-sync/inspect", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX)) {
            send_json_response(client, cloud_resp);
            free(cloud_resp);
            free(req_buf);
            return;
        }
        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        char resp[512];
        snprintf(resp, sizeof(resp),
            "{\"success\":true,\"cloud_status\":\"OFFLINE\",\"intranet_status\":\"ONLINE\",\"offline_fallback\":true,"
            "\"server_sequence\":%ld,\"events_count\":%d,\"role\":\"%s\",\"peers_count\":%d}\n",
            g_ledger_max_seq, g_ledger_count, eff_role, g_peer_count);
        send_json_response(client, resp);
        return;
    }

    /* 5. Safety guard: NEVER serve HTML for any /api endpoint */
    if (strncmp(url, "/api/", 5) == 0) {
        free(req_buf);
        send_json_response(client, "{\"success\":true,\"status\":\"ok\",\"mode\":\"desktop_hybrid\"}\n");
        return;
    }

    /* 6. Serve Static Assets from Embedded dist Directory */
    if (strcmp(url, "/") == 0) {
        snprintf(url, sizeof(url), "/index.html");
    }

    wchar_t rel_w[1024] = {0};
    utf8_to_wchar(url, rel_w, 1024);
    for (int i = 0; rel_w[i]; i++) {
        if (rel_w[i] == L'/') rel_w[i] = L'\\';
    }

    wchar_t file_path_w[MAX_PATH * 2];
    _snwprintf(file_path_w, MAX_PATH * 2, L"%s%s", g_web_root_w, rel_w);

    FILE* f = _wfopen(file_path_w, L"rb");
    if (!f) {
        if (is_static_asset_path(url)) {
            const char* not_found_hdr = "HTTP/1.1 404 Not Found\r\n"
                "Content-Type: text/plain; charset=utf-8\r\n"
                "Content-Length: 9\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\nNot Found";
            send_all(client, not_found_hdr, (int)strlen(not_found_hdr));
            free(req_buf);
            closesocket(client);
            return;
        }
        _snwprintf(file_path_w, MAX_PATH * 2, L"%s\\index.html", g_web_root_w);
        f = _wfopen(file_path_w, L"rb");
    }

    if (!f) {
        const char* err = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        send_all(client, err, (int)strlen(err));
        free(req_buf);
        closesocket(client);
        return;
    }

    fseek(f, 0, SEEK_END);
    long file_size = ftell(f);
    fseek(f, 0, SEEK_SET);

    const char* mime = get_mime_type(file_path_w);
    const char* cache_hdr = (strstr(url, "/assets/") || strstr(url, "/webfonts/") || strstr(url, "/fonts/"))
        ? "public, max-age=86400"
        : "no-cache";

    char header[512];
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %ld\r\n"
        "Cache-Control: %s\r\n"
        "X-Content-Type-Options: nosniff\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Connection: close\r\n\r\n", mime, file_size, cache_hdr);
    send_all(client, header, header_len);

    char chunk[65536];
    size_t n;
    while ((n = fread(chunk, 1, sizeof(chunk), f)) > 0) {
        if (send_all(client, chunk, (int)n) < 0) break;
    }
    fclose(f);
    free(req_buf);
    closesocket(client);
}

static DWORD WINAPI client_worker_thread(LPVOID param) {
    SOCKET client = (SOCKET)(uintptr_t)param;
    handle_client(client);
    return 0;
}

static DWORD WINAPI server_worker_thread(LPVOID param) {
    SOCKET server_socket = (SOCKET)(uintptr_t)param;
    while (1) {
        struct sockaddr_in client_addr;
        int addr_len = sizeof(client_addr);
        SOCKET client = accept(server_socket, (struct sockaddr*)&client_addr, &addr_len);
        if (client != INVALID_SOCKET) {
            HANDLE hClientThread = CreateThread(NULL, 0, client_worker_thread, (LPVOID)(uintptr_t)client, 0, NULL);
            if (hClientThread) {
                CloseHandle(hClientThread);
            } else {
                handle_client(client);
            }
        }
    }
    return 0;
}

/* ============================================================================
 * UDP BROADCAST AUTO-DISCOVERY THREAD (PORT 3001)
 * ============================================================================ */
static void send_udp_beacon(SOCKET udp_sock) {
    refresh_local_network_info();
    char eff_role[16];
    EnterCriticalSection(&g_net_cs);
    get_effective_role(eff_role, sizeof(eff_role));
    LeaveCriticalSection(&g_net_cs);

    char esc_host[160];
    json_escape_str(g_hostname, esc_host, sizeof(esc_host));
    char beacon[512];
    int blen = snprintf(beacon, sizeof(beacon),
        "{\"service\":\"MGAS_INTRANET_NODE\",\"node_id\":\"%s\",\"hostname\":\"%s\","
        "\"port\":%d,\"role\":\"%s\",\"cfg_role\":\"%s\",\"sequence\":%ld,\"has_cloud\":%s}",
        g_node_id, esc_host, SERVER_PORT, eff_role, g_cfg_role,
        g_ledger_max_seq, g_cloud_online ? "true" : "false");

    /* 1. Global broadcast */
    struct sockaddr_in bcast;
    memset(&bcast, 0, sizeof(bcast));
    bcast.sin_family = AF_INET;
    bcast.sin_port = htons(DISCOVERY_UDP_PORT);
    bcast.sin_addr.s_addr = INADDR_BROADCAST;
    sendto(udp_sock, beacon, blen, 0, (struct sockaddr*)&bcast, sizeof(bcast));

    /* 2. Subnet-directed broadcasts (a.b.c.255) for multi-homed Windows PCs */
    for (int i = 0; i < g_local_ip_count; i++) {
        char sub[32];
        snprintf(sub, sizeof(sub), "%s", g_local_ips[i]);
        char* last_dot = strrchr(sub, '.');
        if (last_dot) {
            strcpy(last_dot + 1, "255");
            bcast.sin_addr.s_addr = inet_addr(sub);
            if (bcast.sin_addr.s_addr != INADDR_NONE) {
                sendto(udp_sock, beacon, blen, 0, (struct sockaddr*)&bcast, sizeof(bcast));
            }
        }
    }
}

static void record_discovered_peer(const char* src_ip, const char* msg) {
    char p_node[64] = {0};
    char p_host[128] = {0};
    char p_role[16] = "AUTO";
    if (!extract_json_string_field(msg, "\"node_id\"", p_node, sizeof(p_node))) return;
    if (strcmp(p_node, g_node_id) == 0 || is_local_ip(src_ip)) return;

    extract_json_string_field(msg, "\"hostname\"", p_host, sizeof(p_host));
    extract_json_string_field(msg, "\"role\"", p_role, sizeof(p_role));
    int p_port = extract_json_int_field(msg, "\"port\"", SERVER_PORT);
    long p_seq = (long)extract_json_int_field(msg, "\"sequence\"", 1000);
    int p_cloud = (strstr(msg, "\"has_cloud\":true") != NULL) ? 1 : 0;

    EnterCriticalSection(&g_net_cs);
    int idx = -1;
    for (int i = 0; i < g_peer_count; i++) {
        if (strcmp(g_peers[i].node_id, p_node) == 0 || strcmp(g_peers[i].ip, src_ip) == 0) {
            idx = i;
            break;
        }
    }
    if (idx < 0 && g_peer_count < MAX_LAN_PEERS) {
        idx = g_peer_count++;
    }
    if (idx >= 0) {
        snprintf(g_peers[idx].node_id, sizeof(g_peers[idx].node_id), "%s", p_node);
        snprintf(g_peers[idx].hostname, sizeof(g_peers[idx].hostname), "%s", p_host[0] ? p_host : src_ip);
        snprintf(g_peers[idx].ip, sizeof(g_peers[idx].ip), "%s", src_ip);
        g_peers[idx].port = p_port;
        snprintf(g_peers[idx].role, sizeof(g_peers[idx].role), "%s", p_role);
        g_peers[idx].sequence = p_seq;
        g_peers[idx].has_cloud = p_cloud;
        g_peers[idx].last_seen_tick = GetTickCount();
    }
    LeaveCriticalSection(&g_net_cs);
}

static DWORD WINAPI udp_discovery_thread(LPVOID param) {
    (void)param;
    SOCKET udp = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (udp == INVALID_SOCKET) return 0;

    int opt = 1;
    setsockopt(udp, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
    setsockopt(udp, SOL_SOCKET, SO_BROADCAST, (const char*)&opt, sizeof(opt));

    struct sockaddr_in bind_addr;
    memset(&bind_addr, 0, sizeof(bind_addr));
    bind_addr.sin_family = AF_INET;
    bind_addr.sin_port = htons(DISCOVERY_UDP_PORT);
    bind_addr.sin_addr.s_addr = htonl(INADDR_ANY);

    if (bind(udp, (struct sockaddr*)&bind_addr, sizeof(bind_addr)) == SOCKET_ERROR) {
        log_write("INTRANET", "UDP discovery bind failed on port %d (%d)", DISCOVERY_UDP_PORT, WSAGetLastError());
        closesocket(udp);
        return 0;
    }

    DWORD last_beacon_tick = 0;
    while (1) {
        DWORD now = GetTickCount();
        if (last_beacon_tick == 0 || (now - last_beacon_tick) >= 2000) {
            send_udp_beacon(udp);
            last_beacon_tick = now;
        }

        fd_set rfds;
        FD_ZERO(&rfds);
        FD_SET(udp, &rfds);
        struct timeval tv;
        tv.tv_sec = 1;
        tv.tv_usec = 0;
        int sel = select(0, &rfds, NULL, NULL, &tv);
        if (sel > 0 && FD_ISSET(udp, &rfds)) {
            char rx_buf[1024];
            struct sockaddr_in from_addr;
            int from_len = sizeof(from_addr);
            int n = recvfrom(udp, rx_buf, sizeof(rx_buf) - 1, 0, (struct sockaddr*)&from_addr, &from_len);
            if (n > 0) {
                rx_buf[n] = '\0';
                if (strstr(rx_buf, "MGAS_INTRANET_NODE") != NULL) {
                    const char* src_ip = inet_ntoa(from_addr.sin_addr);
                    if (src_ip) record_discovered_peer(src_ip, rx_buf);
                }
            }
        }
    }
    closesocket(udp);
    return 0;
}

/* ============================================================================
 * HYBRID LAN + CLOUD BACKGROUND RECONCILER THREAD
 * ============================================================================ */
static void update_active_hub_selection(void) {
    DWORD now = GetTickCount();
    EnterCriticalSection(&g_net_cs);

    /* Prune stale LAN peers (> 15 seconds silent) */
    int write_i = 0;
    for (int i = 0; i < g_peer_count; i++) {
        if ((now - g_peers[i].last_seen_tick) <= 15000) {
            if (write_i != i) g_peers[write_i] = g_peers[i];
            write_i++;
        }
    }
    g_peer_count = write_i;

    if (strcmp(g_cfg_role, "HUB") == 0) {
        g_active_hub_ip[0] = '\0';
        g_active_hub_hostname[0] = '\0';
        LeaveCriticalSection(&g_net_cs);
        return;
    }

    /* 1. Manual Hub IP takes top priority */
    if (g_manual_hub_ip[0] && !is_local_ip(g_manual_hub_ip)) {
        snprintf(g_active_hub_ip, sizeof(g_active_hub_ip), "%s", g_manual_hub_ip);
        g_active_hub_port = g_manual_hub_port;
        g_active_hub_hostname[0] = '\0';
        for (int i = 0; i < g_peer_count; i++) {
            if (strcmp(g_peers[i].ip, g_manual_hub_ip) == 0) {
                snprintf(g_active_hub_hostname, sizeof(g_active_hub_hostname), "%s", g_peers[i].hostname);
                break;
            }
        }
        LeaveCriticalSection(&g_net_cs);
        return;
    }

    /* 2. Prefer explicit HUB peer on LAN */
    int best_idx = -1;
    for (int i = 0; i < g_peer_count; i++) {
        if (strcmp(g_peers[i].role, "HUB") == 0) {
            best_idx = i;
            break;
        }
    }

    /* 3. If role is CLIENT and no explicit HUB, pick any active peer with highest sequence */
    if (best_idx < 0 && strcmp(g_cfg_role, "CLIENT") == 0 && g_peer_count > 0) {
        best_idx = 0;
        for (int i = 1; i < g_peer_count; i++) {
            if (g_peers[i].sequence > g_peers[best_idx].sequence) best_idx = i;
        }
    }

    if (best_idx >= 0) {
        snprintf(g_active_hub_ip, sizeof(g_active_hub_ip), "%s", g_peers[best_idx].ip);
        g_active_hub_port = g_peers[best_idx].port;
        snprintf(g_active_hub_hostname, sizeof(g_active_hub_hostname), "%s", g_peers[best_idx].hostname);
    } else {
        g_active_hub_ip[0] = '\0';
        g_active_hub_hostname[0] = '\0';
    }
    LeaveCriticalSection(&g_net_cs);
}

static DWORD WINAPI intranet_reconciler_thread(LPVOID param) {
    (void)param;
    char* io_buf = (char*)malloc(CLOUD_RESPONSE_MAX);
    if (!io_buf) return 0;

    Sleep(800);
    while (1) {
        update_active_hub_selection();

        char eff_role[16];
        char hub_ip[64] = {0};
        int hub_port = SERVER_PORT;
        EnterCriticalSection(&g_net_cs);
        get_effective_role(eff_role, sizeof(eff_role));
        snprintf(hub_ip, sizeof(hub_ip), "%s", g_active_hub_ip);
        hub_port = g_active_hub_port;
        LeaveCriticalSection(&g_net_cs);

        /* Step A: If acting as CLIENT with an external LAN Hub, push pending local LAN events & pull delta from Hub */
        if (strcmp(eff_role, "CLIENT") == 0 && hub_ip[0] && !is_local_ip(hub_ip)) {
            /* A1: Push any hub_synced==0 offline-created Client events up to the LAN Hub */
            if (ledger_count_unsynced_hub() > 0) {
                size_t hbatch_cap = 262144;
                char* hbatch_json = (char*)malloc(hbatch_cap);
                if (hbatch_json) {
                    size_t hbpos = 0;
                    int hbcnt = 0;
                    EnterCriticalSection(&g_ledger_cs);
                    hbpos += (size_t)sprintf(hbatch_json, "{\"device_id\":\"%s\",\"events\":[", g_node_id);
                    for (int i = 0; i < g_ledger_count && hbcnt < 40; i++) {
                        if (!g_ledger[i].hub_synced) {
                            size_t elen = strlen(g_ledger[i].json);
                            if (hbpos + elen + 32 >= hbatch_cap) break;
                            if (hbcnt > 0) hbatch_json[hbpos++] = ',';
                            memcpy(hbatch_json + hbpos, g_ledger[i].json, elen);
                            hbpos += elen;
                            hbcnt++;
                        }
                    }
                    hbpos += (size_t)sprintf(hbatch_json + hbpos, "]}");
                    LeaveCriticalSection(&g_ledger_cs);
                    if (hbcnt > 0) {
                        int pstatus = 0;
                        if (lan_http_request(hub_ip, hub_port, "POST", "/api/sync/events", "X-MGas-LAN-Hop: 1\r\n", hbatch_json, (int)hbpos, io_buf, CLOUD_RESPONSE_MAX, &pstatus, 2200)) {
                            long hseq = (long)extract_sequence_from_json(io_buf, (int)g_ledger_max_seq);
                            ledger_mark_hub_synced(hbatch_json, hseq);
                            log_write("INTRANET", "Uploaded %d offline-buffered Client events to LAN Hub %s", hbcnt, hub_ip);
                        }
                    }
                    free(hbatch_json);
                }
            }

            /* A2: Pull latest LAN delta from Hub */
            char qpath[128];
            snprintf(qpath, sizeof(qpath), "/api/sync?since_sequence=%ld", g_hub_pull_seq);
            int hstatus = 0;
            if (lan_http_request(hub_ip, hub_port, "GET", qpath, "X-MGas-LAN-Hop: 1\r\n", NULL, 0, io_buf, CLOUD_RESPONSE_MAX, &hstatus, 2000)) {
                char remote_purged[64] = {0};
                if (extract_json_string_field(io_buf, "\"last_purged_at\"", remote_purged, sizeof(remote_purged))) {
                    if (!g_last_purged_at[0] || strcmp(remote_purged, g_last_purged_at) > 0) {
                        int pseq = extract_sequence_from_json(io_buf, (int)g_ledger_max_seq);
                        update_local_purge_marker_and_cache(remote_purged, pseq);
                    }
                }
                ledger_ingest_payload_ex(io_buf, 0, 1, 0, NULL, 0);
                long hseq = (long)extract_sequence_from_json(io_buf, (int)g_hub_pull_seq);
                if (hseq > g_hub_pull_seq) g_hub_pull_seq = hseq;
            }
        }

        /* Step B: Push any cloud_synced==0 events to Cloud D1 when internet is available */
        int unsynced = ledger_count_unsynced_cloud();
        if (unsynced > 0) {
            size_t batch_cap = 262144;
            char* batch_json = (char*)malloc(batch_cap);
            if (batch_json) {
                size_t bpos = 0;
                int bcnt = 0;
                EnterCriticalSection(&g_ledger_cs);
                bpos += (size_t)sprintf(batch_json, "{\"device_id\":\"%s\",\"events\":[", g_node_id);
                for (int i = 0; i < g_ledger_count && bcnt < 40; i++) {
                    if (!g_ledger[i].cloud_synced) {
                        size_t elen = strlen(g_ledger[i].json);
                        if (bpos + elen + 32 >= batch_cap) break;
                        if (bcnt > 0) batch_json[bpos++] = ',';
                        memcpy(batch_json + bpos, g_ledger[i].json, elen);
                        bpos += elen;
                        bcnt++;
                    }
                }
                bpos += (size_t)sprintf(batch_json + bpos, "]}");
                LeaveCriticalSection(&g_ledger_cs);

                if (bcnt > 0) {
                    if (relay_to_central_cloud("POST", "/api/sync/events", batch_json, (int)bpos, io_buf, CLOUD_RESPONSE_MAX)) {
                        long cseq = (long)extract_sequence_from_json(io_buf, (int)g_ledger_max_seq);
                        ledger_mark_cloud_synced(batch_json, cseq);
                        log_write("HYBRID", "Reconciled %d offline LAN events to Cloud D1 (seq=%ld)", bcnt, cseq);
                    }
                }
                free(batch_json);
            }
        }

        /* Step C: Pull latest Cloud D1 events every ~4 seconds so Web & LAN stay continuously bridged */
        char cpath[128];
        snprintf(cpath, sizeof(cpath), "/api/sync?since_sequence=%ld", g_cloud_pull_seq);
        if (relay_to_central_cloud("GET", cpath, NULL, 0, io_buf, CLOUD_RESPONSE_MAX)) {
            char remote_purged[64] = {0};
            if (extract_json_string_field(io_buf, "\"last_purged_at\"", remote_purged, sizeof(remote_purged))) {
                if (!g_last_purged_at[0] || strcmp(remote_purged, g_last_purged_at) > 0) {
                    int pseq = extract_sequence_from_json(io_buf, (int)g_ledger_max_seq);
                    update_local_purge_marker_and_cache(remote_purged, pseq);
                    notify_all_lan_peers_async_hint();
                }
            }
            int added = ledger_ingest_payload(io_buf, 1, 0, NULL, 0);
            long cseq = (long)extract_sequence_from_json(io_buf, (int)g_cloud_pull_seq);
            if (cseq > g_cloud_pull_seq) g_cloud_pull_seq = cseq;
            if (added > 0) {
                notify_all_lan_peers_async_hint();
            }
        }

        Sleep(2500);
    }
    free(io_buf);
    return 0;
}

/* ============================================================================
 * DESKTOP LAUNCHER & DATABASE BOOTSTRAP
 * ============================================================================ */
static void launch_browser(const char* url) {
    const wchar_t* candidates[] = {
        L"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        L"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        L"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        L"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        NULL
    };

    int launched = 0;
    for (int i = 0; candidates[i] != NULL; i++) {
        DWORD attr = GetFileAttributesW(candidates[i]);
        if (attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY)) {
            wchar_t cmdline[MAX_PATH * 2];
            wchar_t url_w[512];
            utf8_to_wchar(url, url_w, 512);
            _snwprintf(cmdline, MAX_PATH * 2, L"\"%s\" --app=%s --window-size=1280,820", candidates[i], url_w);

            STARTUPINFOW si;
            PROCESS_INFORMATION pi;
            memset(&si, 0, sizeof(si));
            memset(&pi, 0, sizeof(pi));
            si.cb = sizeof(si);

            if (CreateProcessW(NULL, cmdline, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                launched = 1;
                break;
            }
        }
    }

    if (!launched) {
        wchar_t url_w[512];
        utf8_to_wchar(url, url_w, 512);
        HINSTANCE h = ShellExecuteW(NULL, L"open", url_w, NULL, NULL, SW_SHOWNORMAL);
        if ((intptr_t)h <= 32) {
            wchar_t rundll_cmd[512];
            _snwprintf(rundll_cmd, 512, L"rundll32.exe url.dll,FileProtocolHandler %s", url_w);
            STARTUPINFOW si2;
            PROCESS_INFORMATION pi2;
            memset(&si2, 0, sizeof(si2));
            memset(&pi2, 0, sizeof(pi2));
            si2.cb = sizeof(si2);
            if (CreateProcessW(NULL, rundll_cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si2, &pi2)) {
                CloseHandle(pi2.hProcess);
                CloseHandle(pi2.hThread);
            }
        }
    }
}

static void ensure_desktop_anbar_databases(void) {
    const wchar_t* db_names[] = { L"db-anbar1", L"db-anbar2", L"db-anbar3", NULL };

    for (int i = 0; db_names[i] != NULL; i++) {
        wchar_t target_db_w[MAX_PATH * 2];
        wchar_t target_db_ext_w[MAX_PATH * 2];
        wchar_t source_db_w[MAX_PATH * 2];

        _snwprintf(target_db_w, MAX_PATH * 2, L"%s\\%s", g_app_dir_w, db_names[i]);
        _snwprintf(target_db_ext_w, MAX_PATH * 2, L"%s\\%s.db", g_app_dir_w, db_names[i]);
        _snwprintf(source_db_w, MAX_PATH * 2, L"%s\\%s.db", g_web_root_w, db_names[i]);

        if (!file_exists_w(target_db_ext_w)) {
            if (file_exists_w(source_db_w)) {
                CopyFileW(source_db_w, target_db_ext_w, FALSE);
            } else {
                FILE* f = _wfopen(target_db_ext_w, L"wb");
                if (f) {
                    unsigned char sqlite_hdr[100] = {
                        0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66,
                        0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00,
                        0x10, 0x00, 0x01, 0x01, 0x00, 0x40, 0x20, 0x20,
                        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
                    };
                    fwrite(sqlite_hdr, 1, sizeof(sqlite_hdr), f);
                    fclose(f);
                }
            }
        }

        if (!file_exists_w(target_db_w) && file_exists_w(target_db_ext_w)) {
            CopyFileW(target_db_ext_w, target_db_w, FALSE);
        }
    }
}

static int find_web_root(void) {
    wchar_t test_path[MAX_PATH * 2];

    _snwprintf(test_path, MAX_PATH * 2, L"%s\\app\\index.html", g_app_dir_w);
    if (file_exists_w(test_path)) {
        _snwprintf(g_web_root_w, MAX_PATH, L"%s\\app", g_app_dir_w);
        return 1;
    }

    _snwprintf(test_path, MAX_PATH * 2, L"%s\\..\\dist\\index.html", g_app_dir_w);
    if (file_exists_w(test_path)) {
        _snwprintf(g_web_root_w, MAX_PATH, L"%s\\..\\dist", g_app_dir_w);
        return 1;
    }

    _snwprintf(test_path, MAX_PATH * 2, L"%s\\dist\\index.html", g_app_dir_w);
    if (file_exists_w(test_path)) {
        _snwprintf(g_web_root_w, MAX_PATH, L"%s\\dist", g_app_dir_w);
        return 1;
    }

    _snwprintf(test_path, MAX_PATH * 2, L"%s\\index.html", g_app_dir_w);
    if (file_exists_w(test_path)) {
        wcsncpy(g_web_root_w, g_app_dir_w, MAX_PATH);
        return 1;
    }

    wchar_t local_app_data[MAX_PATH] = {0};
    if (GetEnvironmentVariableW(L"LOCALAPPDATA", local_app_data, MAX_PATH) > 0) {
        _snwprintf(test_path, MAX_PATH * 2, L"%s\\Programs\\MGasInventory\\app\\index.html", local_app_data);
        if (file_exists_w(test_path)) {
            _snwprintf(g_web_root_w, MAX_PATH, L"%s\\Programs\\MGasInventory\\app", local_app_data);
            return 1;
        }
    }

    return 0;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInstance; (void)hPrevInstance; (void)lpCmdLine; (void)nCmdShow;
    InitializeCriticalSection(&g_log_cs);
    InitializeCriticalSection(&g_cache_cs);
    InitializeCriticalSection(&g_sse_cs);
    InitializeCriticalSection(&g_ledger_cs);
    InitializeCriticalSection(&g_net_cs);

    GetModuleFileNameW(NULL, g_app_dir_w, MAX_PATH);
    wchar_t* last_slash = wcsrchr(g_app_dir_w, L'\\');
    if (last_slash) *last_slash = L'\0';

    wchar_t local_app_data[MAX_PATH] = {0};
    if (GetEnvironmentVariableW(L"LOCALAPPDATA", local_app_data, MAX_PATH) > 0) {
        _snwprintf(g_data_dir_w, MAX_PATH, L"%s\\MGasInventory", local_app_data);
        CreateDirectoryW(g_data_dir_w, NULL);
    } else {
        _snwprintf(g_data_dir_w, MAX_PATH, L"%s", g_app_dir_w);
    }

    _snwprintf(g_cache_file_w, MAX_PATH, L"%s\\cloud_sync_cache.json", g_data_dir_w);
    _snwprintf(g_log_file_w, MAX_PATH, L"%s\\mgas_server.log", g_data_dir_w);
    _snwprintf(g_ledger_file_w, MAX_PATH, L"%s\\intranet_events.json", g_data_dir_w);
    _snwprintf(g_config_file_w, MAX_PATH, L"%s\\intranet_config.json", g_data_dir_w);
    _snwprintf(g_users_file_w, MAX_PATH, L"%s\\intranet_users.json", g_data_dir_w);

    wchar_to_utf8(g_app_dir_w, g_app_dir_utf8, sizeof(g_app_dir_utf8));

    if (!find_web_root()) {
        show_alert_utf8(NULL,
            "پوشه فایل‌های برنامه (app) یافت نشد. لطفاً برنامه را مجدداً نصب نمایید.",
            "خطا در اجرای سامانه انبارداری ام گاز", MB_ICONERROR | MB_OK);
        return 1;
    }

    wchar_to_utf8(g_web_root_w, g_web_root_utf8, sizeof(g_web_root_utf8));
    ensure_desktop_anbar_databases();

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        show_alert_utf8(NULL, "خطا در راه‌اندازی شبکه محلی ویندوز (WinSock).", "خطای شبکه", MB_ICONERROR | MB_OK);
        return 1;
    }

    /* Load persisted Intranet configuration & LAN Event Ledger */
    load_intranet_config();
    ledger_load_from_disk();

    char* init_cache = (char*)malloc(CLOUD_RESPONSE_MAX);
    if (init_cache) {
        if (load_sync_cache(init_cache, CLOUD_RESPONSE_MAX)) {
            int cseq = extract_sequence_from_json(init_cache, 1000);
            if ((long)cseq > g_last_known_sequence) g_last_known_sequence = cseq;
            if (g_ledger_count == 0) {
                ledger_ingest_payload(init_cache, 1, 0, NULL, 0);
            }
        }
        free(init_cache);
    }

    int port_busy = is_port_active(SERVER_PORT);
    SOCKET server_socket = INVALID_SOCKET;

    if (!port_busy) {
        server_socket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (server_socket != INVALID_SOCKET) {
            int opt = 1;
            setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));

            struct sockaddr_in server_addr;
            memset(&server_addr, 0, sizeof(server_addr));
            server_addr.sin_family = AF_INET;
            server_addr.sin_port = htons(SERVER_PORT);
            server_addr.sin_addr.s_addr = htonl(INADDR_ANY);

            if (bind(server_socket, (struct sockaddr*)&server_addr, sizeof(server_addr)) != SOCKET_ERROR &&
                listen(server_socket, 128) != SOCKET_ERROR) {
                HANDLE hThread = CreateThread(NULL, 0, server_worker_thread, (LPVOID)(uintptr_t)server_socket, 0, NULL);
                if (hThread) CloseHandle(hThread);

                HANDLE hUdp = CreateThread(NULL, 0, udp_discovery_thread, NULL, 0, NULL);
                if (hUdp) CloseHandle(hUdp);

                HANDLE hRec = CreateThread(NULL, 0, intranet_reconciler_thread, NULL, 0, NULL);
                if (hRec) CloseHandle(hRec);

                log_write("BOOT", "MGas Hybrid Intranet+Cloud Server started (role=%s, node=%s, seq=%ld)",
                    g_cfg_role, g_node_id, g_ledger_max_seq);
            } else {
                closesocket(server_socket);
                server_socket = INVALID_SOCKET;
            }
        }
    }

    Sleep(250);
    launch_browser("http://localhost:3000/");

    if (server_socket != INVALID_SOCKET) {
        while (1) {
            Sleep(100000);
        }
    }

    return 0;
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR lpCmdLine, int nCmdShow) {
    (void)lpCmdLine;
    return WinMain(hInstance, hPrevInstance, (LPSTR)"", nCmdShow);
}
