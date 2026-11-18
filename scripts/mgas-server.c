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
#define BUFFER_SIZE 131072
#define CLOUD_RESPONSE_MAX 524288

static wchar_t g_app_dir_w[MAX_PATH] = {0};
static wchar_t g_web_root_w[MAX_PATH] = {0};
static wchar_t g_log_file_w[MAX_PATH] = {0};
static wchar_t g_cache_file_w[MAX_PATH] = {0};

static char g_app_dir_utf8[MAX_PATH * 3] = {0};
static char g_web_root_utf8[MAX_PATH * 3] = {0};

static CRITICAL_SECTION g_log_cs;
static CRITICAL_SECTION g_cache_cs;
#define MAX_SSE_CLIENTS 32
static SOCKET g_sse_clients[MAX_SSE_CLIENTS] = {0};
static int g_sse_client_count = 0;
static CRITICAL_SECTION g_sse_cs;
static volatile LONG g_last_known_sequence = 0;
static char g_last_purged_at[64] = {0};

/* Convert wide string to UTF-8 */
static void wchar_to_utf8(const wchar_t* wstr, char* utf8_buf, size_t buf_size) {
    if (!wstr || !utf8_buf || buf_size == 0) return;
    WideCharToMultiByte(CP_UTF8, 0, wstr, -1, utf8_buf, (int)buf_size, NULL, NULL);
}

/* Convert UTF-8 to wide string */
static void utf8_to_wchar(const char* utf8_str, wchar_t* wbuf, size_t wbuf_count) {
    if (!utf8_str || !wbuf || wbuf_count == 0) return;
    MultiByteToWideChar(CP_UTF8, 0, utf8_str, -1, wbuf, (int)wbuf_count);
}

/* Show MessageBox only for fatal startup issues */
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

/* Silent background file logger stored in %LOCALAPPDATA%\MGasInventory (never displayed on screen) */
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

/* Never return SPA index.html for missing JS, CSS, font, image, or asset paths (Strict MIME compliance) */
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
    if (dot && dot[1] != '\0') {
        return 1;
    }
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
        "Access-Control-Allow-Headers: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: close\r\n\r\n", status_code, status_text, body_len);
    send(client, header, header_len, 0);
    send(client, json_body, body_len, 0);
    closesocket(client);
}

static void send_json_response(SOCKET client, const char* json_body) {
    send_json_status_response(client, 200, "OK", json_body);
}

/* Extract numeric JSON field value dynamically */
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

/* Extract quoted string JSON field value dynamically (ignores null) */
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

static void get_utc_iso_timestamp(char* buf, size_t size) {
    SYSTEMTIME st;
    GetSystemTime(&st);
    snprintf(buf, size, "%04u-%02u-%02uT%02u:%02u:%02u.%03uZ",
        (unsigned)st.wYear, (unsigned)st.wMonth, (unsigned)st.wDay,
        (unsigned)st.wHour, (unsigned)st.wMinute, (unsigned)st.wSecond, (unsigned)st.wMilliseconds);
}

/* Extract highest server_sequence from either server_sequence or current_server_sequence */
static int extract_sequence_from_json(const char* json, int fallback_val) {
    int s1 = extract_json_int_field(json, "\"server_sequence\"", -1);
    int s2 = extract_json_int_field(json, "\"current_server_sequence\"", -1);
    int best = fallback_val;
    if (s1 > best) best = s1;
    if (s2 > best) best = s2;
    return best;
}

/* Count event objects accurately regardless of JSON formatting whitespace */
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

/* Detect non-empty "events": [ { ... } ] regardless of whitespace */
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

/* Save & read offline JSON fallback cache for instant offline startup */
static void save_sync_cache(const char* json_data, int len) {
    if (!g_cache_file_w[0] || !json_data || len <= 2) return;
    EnterCriticalSection(&g_cache_cs);
    FILE* f = _wfopen(g_cache_file_w, L"wb");
    if (f) {
        fwrite(json_data, 1, (size_t)len, f);
        fclose(f);
    }
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

/* Relay API request directly to Central Cloud Database (https://anbar.mgas.ir) via WinInet HTTPS */
static int relay_to_central_cloud_ex(const char* method, const char* full_url_path, const char* post_body, int post_body_len, char* out_buf, int out_buf_max, DWORD* out_status_code) {
    if (out_status_code) *out_status_code = 0;
    HINTERNET hInternet = InternetOpenA("MGas-Windows-Sync-Relay/2.0", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) return 0;

    DWORD timeout_ms = 6500;
    InternetSetOptionA(hInternet, INTERNET_OPTION_CONNECT_TIMEOUT, &timeout_ms, sizeof(timeout_ms));
    InternetSetOptionA(hInternet, INTERNET_OPTION_SEND_TIMEOUT, &timeout_ms, sizeof(timeout_ms));
    InternetSetOptionA(hInternet, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeout_ms, sizeof(timeout_ms));

    HINTERNET hConnect = InternetConnectA(hInternet, "anbar.mgas.ir", INTERNET_DEFAULT_HTTPS_PORT, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
    if (!hConnect) {
        InternetCloseHandle(hInternet);
        return 0;
    }

    DWORD flags = INTERNET_FLAG_SECURE | INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE |
                  INTERNET_FLAG_IGNORE_CERT_CN_INVALID | INTERNET_FLAG_IGNORE_CERT_DATE_INVALID;
    HINTERNET hRequest = HttpOpenRequestA(hConnect, method, full_url_path, NULL, NULL, NULL, flags, 0);
    if (!hRequest) {
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hInternet);
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

    return (statusCode >= 200 && statusCode < 300 && total_read > 0) ? 1 : 0;
}

static int relay_to_central_cloud(const char* method, const char* full_url_path, const char* post_body, int post_body_len, char* out_buf, int out_buf_max) {
    return relay_to_central_cloud_ex(method, full_url_path, post_body, post_body_len, out_buf, out_buf_max, NULL);
}

static void url_decode(char* dst, const char* src, size_t dst_max) {
    if (!dst || !src || dst_max == 0) return;
    size_t d = 0;
    while (*src && d < dst_max - 1) {
        if (*src == '%' && src[1] && src[2]) {
            int h1 = src[1];
            int h2 = src[2];
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

static void broadcast_sse_purge(const char* purged_at, const char* type_name, int preserve_products) {
    if (!purged_at || !purged_at[0]) return;
    EnterCriticalSection(&g_sse_cs);
    if (g_sse_client_count > 0) {
        char broadcast_frame[512];
        int frame_len = snprintf(broadcast_frame, sizeof(broadcast_frame),
            "data: {\"type\":\"%s\",\"preserve_products\":%s,\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%ld}\n\n",
            type_name,
            preserve_products ? "true" : "false",
            purged_at,
            purged_at,
            (long)g_last_known_sequence);
        for (int i = 0; i < g_sse_client_count; i++) {
            if (g_sse_clients[i] != INVALID_SOCKET) {
                send(g_sse_clients[i], broadcast_frame, frame_len, 0);
            }
        }
    }
    LeaveCriticalSection(&g_sse_cs);
}

static void update_local_purge_marker_and_cache(const char* purged_at, int seq) {
    if (!purged_at || !purged_at[0]) return;
    EnterCriticalSection(&g_cache_cs);
    if (!g_last_purged_at[0] || strcmp(purged_at, g_last_purged_at) > 0) {
        snprintf(g_last_purged_at, sizeof(g_last_purged_at), "%s", purged_at);
    }
    if (seq > g_last_known_sequence) g_last_known_sequence = seq;
    LeaveCriticalSection(&g_cache_cs);

    char clean_cache[512];
    int len = snprintf(clean_cache, sizeof(clean_cache),
        "{\"success\":true,\"events\":[],\"server_sequence\":%ld,\"last_purged_at\":\"%s\",\"purge_preserve_products\":true}\n",
        (long)g_last_known_sequence,
        g_last_purged_at);
    save_sync_cache(clean_cache, len);
}

static void handle_sse_live_stream(SOCKET client, const char* full_url) {
    int last_seq = parse_since_sequence_param(full_url);
    int initial_seq = (int)g_last_known_sequence;
    if (last_seq > initial_seq) initial_seq = last_seq;

    char client_purged_at[64] = {0};
    parse_query_string_param(full_url, "since_purged_at", client_purged_at, sizeof(client_purged_at));

    log_write("SSE", "Live stream connected (since_sequence=%d, since_purged_at=%s)", last_seq, client_purged_at);

    char sse_hdr[768];
    int hdr_len = snprintf(sse_hdr, sizeof(sse_hdr),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/event-stream; charset=utf-8\r\n"
        "Cache-Control: no-cache, no-transform\r\n"
        "Connection: keep-alive\r\n"
        "Access-Control-Allow-Origin: *\r\n\r\n"
        "data: {\"type\":\"CONNECTED\",\"current_server_sequence\":%d,\"last_purged_at\":\"%s\"}\n\n",
        initial_seq,
        g_last_purged_at);

    if (send(client, sse_hdr, hdr_len, 0) <= 0) {
        closesocket(client);
        return;
    }

    if (g_last_purged_at[0] && strcmp(g_last_purged_at, client_purged_at) > 0) {
        char purge_frame[512];
        int plen = snprintf(purge_frame, sizeof(purge_frame),
            "data: {\"type\":\"DATABASE_PURGED\",\"preserve_products\":true,\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%d}\n\n",
            g_last_purged_at, g_last_purged_at, initial_seq);
        if (send(client, purge_frame, plen, 0) <= 0) {
            closesocket(client);
            return;
        }
        snprintf(client_purged_at, sizeof(client_purged_at), "%s", g_last_purged_at);
    }

    EnterCriticalSection(&g_sse_cs);
    if (g_sse_client_count < MAX_SSE_CLIENTS) {
        g_sse_clients[g_sse_client_count++] = client;
    }
    LeaveCriticalSection(&g_sse_cs);

    char* cloud_buf = (char*)malloc(CLOUD_RESPONSE_MAX);
    char* sse_frame = (char*)malloc(CLOUD_RESPONSE_MAX + 512);
    int first_pass = 1;

    if (cloud_buf && sse_frame) {
        while (1) {
            if (!first_pass) {
                Sleep(1000);
            }
            first_pass = 0;

            char query_path[256];
            snprintf(query_path, sizeof(query_path), "/api/sync?since_sequence=%d", last_seq);
            cloud_buf[0] = '\0';

            if (relay_to_central_cloud("GET", query_path, NULL, 0, cloud_buf, CLOUD_RESPONSE_MAX)) {
                int new_seq = extract_sequence_from_json(cloud_buf, last_seq);
                if (new_seq > last_seq) last_seq = new_seq;
                if (new_seq > g_last_known_sequence) g_last_known_sequence = new_seq;

                char remote_purged_at[64] = {0};
                if (extract_json_string_field(cloud_buf, "\"last_purged_at\"", remote_purged_at, sizeof(remote_purged_at))) {
                    if (strcmp(remote_purged_at, g_last_purged_at) > 0) {
                        update_local_purge_marker_and_cache(remote_purged_at, last_seq);
                    }
                    if (strcmp(remote_purged_at, client_purged_at) > 0) {
                        int plen = snprintf(sse_frame, CLOUD_RESPONSE_MAX + 512,
                            "data: {\"type\":\"DATABASE_PURGED\",\"preserve_products\":true,\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%d}\n\n",
                            remote_purged_at, remote_purged_at, last_seq);
                        if (send(client, sse_frame, plen, 0) <= 0) break;
                        snprintf(client_purged_at, sizeof(client_purged_at), "%s", remote_purged_at);
                        log_write("SSE", "Pushed DATABASE_PURGED marker (%s)", remote_purged_at);
                    }
                } else if (g_last_purged_at[0] && strcmp(g_last_purged_at, client_purged_at) > 0) {
                    int plen = snprintf(sse_frame, CLOUD_RESPONSE_MAX + 512,
                        "data: {\"type\":\"DATABASE_PURGED\",\"preserve_products\":true,\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%d}\n\n",
                        g_last_purged_at, g_last_purged_at, last_seq);
                    if (send(client, sse_frame, plen, 0) <= 0) break;
                    snprintf(client_purged_at, sizeof(client_purged_at), "%s", g_last_purged_at);
                }

                if (last_seq == 0 || has_nonempty_events(cloud_buf)) {
                    if (strstr(query_path, "since_sequence=0") != NULL && strlen(cloud_buf) > 10) {
                        save_sync_cache(cloud_buf, (int)strlen(cloud_buf));
                    }
                }

                if (has_nonempty_events(cloud_buf)) {
                    char* json_start = strchr(cloud_buf, '{');
                    if (json_start) {
                        int frame_len = snprintf(sse_frame, CLOUD_RESPONSE_MAX + 512,
                            "data: {\"type\":\"SYNC_EVENTS\",%s\n\n",
                            json_start + 1);
                        if (send(client, sse_frame, frame_len, 0) <= 0) break;
                        log_write("SSE", "Pushed live cloud events (seq=%d)", last_seq);
                    }
                } else {
                    const char* hb = ": heartbeat\n\n";
                    if (send(client, hb, (int)strlen(hb), 0) <= 0) break;
                }
            } else {
                const char* hb = ": heartbeat\n\n";
                if (send(client, hb, (int)strlen(hb), 0) <= 0) break;
            }
        }
    }

    if (cloud_buf) free(cloud_buf);
    if (sse_frame) free(sse_frame);

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

static void handle_client(SOCKET client) {
    char* req_buf = (char*)malloc(BUFFER_SIZE);
    if (!req_buf) {
        closesocket(client);
        return;
    }

    int bytes_read = recv(client, req_buf, BUFFER_SIZE - 1, 0);
    if (bytes_read <= 0) {
        free(req_buf);
        closesocket(client);
        return;
    }
    req_buf[bytes_read] = '\0';

    /* Read complete POST/PUT body if Content-Length exceeds first packet */
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
            while (body_received < expected_body && bytes_read < BUFFER_SIZE - 1) {
                int to_read = expected_body - body_received;
                if (to_read > BUFFER_SIZE - 1 - bytes_read) to_read = BUFFER_SIZE - 1 - bytes_read;
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

    /* CORS preflight OPTIONS */
    if (stricmp(method, "OPTIONS") == 0) {
        const char* cors = "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: *\r\n"
            "Connection: close\r\n\r\n";
        send(client, cors, (int)strlen(cors), 0);
        free(req_buf);
        closesocket(client);
        return;
    }

    char* q = strchr(url, '?');
    if (q) *q = '\0';

    /* 1. Health endpoint */
    if (strcmp(url, "/api/health") == 0 || strcmp(url, "/health") == 0) {
        free(req_buf);
        send_json_response(client, "{\"status\":\"healthy\",\"d1_connected\":true,\"service\":\"MGas Windows Native Server\",\"mode\":\"desktop_local\",\"port\":3000}\n");
        return;
    }

    /* 2. Auth relay to central server with accurate HTTP status & graceful offline fallback */
    if (strcmp(url, "/api/auth/login") == 0 ||
        strcmp(url, "/api/auth/authenticate") == 0 ||
        strcmp(url, "/api/auth/change-password") == 0 ||
        strcmp(url, "/api/auth/user-update") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        DWORD cloud_status = 0;
        if (cloud_resp) {
            int ok = relay_to_central_cloud_ex("POST", url, post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX, &cloud_status);
            if (ok || (cloud_status >= 400 && cloud_status < 500 && strlen(cloud_resp) > 0)) {
                send_json_status_response(client, (int)(cloud_status ? cloud_status : 200), (cloud_status == 401 ? "Unauthorized" : (cloud_status == 403 ? "Forbidden" : (cloud_status >= 400 ? "Bad Request" : "OK"))), cloud_resp);
                free(cloud_resp);
                free(req_buf);
                return;
            }
            free(cloud_resp);
        }
        free(req_buf);
        send_json_status_response(client, 503, "Service Unavailable", "{\"success\":false,\"offline_fallback\":true,\"message\":\"سرور ابری در دسترس نیست - استفاده از احراز هویت محلی\"}\n");
        return;
    }

    if (strcmp(url, "/api/auth/users") == 0) {
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp && relay_to_central_cloud("GET", "/api/auth/users", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX)) {
            send_json_response(client, cloud_resp);
            free(cloud_resp);
            free(req_buf);
            return;
        }
        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        send_json_response(client, "{\"success\":true,\"users\":[],\"total_users\":0,\"offline_fallback\":true}\n");
        return;
    }

    /* 3. Sync events bidirectional relay + instant local SSE live broadcast */
    if (strcmp(url, "/api/sync/events") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        const char* json_body_start = post_body ? strchr(post_body, '{') : NULL;

        EnterCriticalSection(&g_sse_cs);
        if (g_sse_client_count > 0 && json_body_start && strlen(json_body_start) > 2) {
            char* broadcast_frame = (char*)malloc(CLOUD_RESPONSE_MAX + 512);
            if (broadcast_frame) {
                int frame_len = snprintf(broadcast_frame, CLOUD_RESPONSE_MAX + 512,
                    "data: {\"type\":\"SYNC_EVENTS\",%s\n\n",
                    json_body_start + 1);
                for (int i = 0; i < g_sse_client_count; i++) {
                    if (g_sse_clients[i] != INVALID_SOCKET) {
                        send(g_sse_clients[i], broadcast_frame, frame_len, 0);
                    }
                }
                free(broadcast_frame);
            }
        }
        LeaveCriticalSection(&g_sse_cs);

        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp && relay_to_central_cloud("POST", "/api/sync/events", post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX)) {
            int new_seq = extract_sequence_from_json(cloud_resp, (int)g_last_known_sequence);
            if (new_seq > g_last_known_sequence) g_last_known_sequence = new_seq;
            send_json_response(client, cloud_resp);
            free(cloud_resp);
            free(req_buf);
            return;
        }
        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        send_json_response(client, "{\"success\":true,\"accepted_events\":[],\"offline\":true}\n");
        return;
    }

    /* 3b. Sync pull events handler with automatic offline cache fallback */
    if (strcmp(url, "/api/sync") == 0) {
        int since_seq = parse_since_sequence_param(full_url);
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp && relay_to_central_cloud("GET", full_url, NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX)) {
            int new_seq = extract_sequence_from_json(cloud_resp, (int)g_last_known_sequence);
            if (new_seq > g_last_known_sequence) g_last_known_sequence = new_seq;
            char remote_purged_at[64] = {0};
            if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_purged_at, sizeof(remote_purged_at))) {
                if (strcmp(remote_purged_at, g_last_purged_at) > 0) {
                    update_local_purge_marker_and_cache(remote_purged_at, new_seq);
                }
            }
            if (since_seq == 0 && strlen(cloud_resp) > 10) {
                save_sync_cache(cloud_resp, (int)strlen(cloud_resp));
            }
            send_json_response(client, cloud_resp);
            free(cloud_resp);
            free(req_buf);
            return;
        }

        if (cloud_resp) {
            if (since_seq == 0 && load_sync_cache(cloud_resp, CLOUD_RESPONSE_MAX)) {
                send_json_response(client, cloud_resp);
                free(cloud_resp);
                free(req_buf);
                return;
            }
            free(cloud_resp);
        }

        char fallback_json[320];
        snprintf(fallback_json, sizeof(fallback_json),
            "{\"success\":true,\"events\":[],\"server_sequence\":%ld,\"last_purged_at\":\"%s\",\"offline_fallback\":true}\n",
            (long)g_last_known_sequence,
            g_last_purged_at);
        free(req_buf);
        send_json_response(client, fallback_json);
        return;
    }

    /* 3c. Cloud Connection Status Diagnostic (Real dynamic latency & sequence) */
    if (strcmp(url, "/api/sync/status") == 0) {
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        DWORD t0 = GetTickCount();
        int ok = (cloud_resp && relay_to_central_cloud("GET", "/api/sync?since_sequence=0", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX));
        DWORD latency = GetTickCount() - t0;

        if (ok) {
            int seq = extract_sequence_from_json(cloud_resp, (int)g_last_known_sequence);
            if (seq > g_last_known_sequence) g_last_known_sequence = seq;
            int ev_count = count_events_in_json(cloud_resp);
            save_sync_cache(cloud_resp, (int)strlen(cloud_resp));
            free(cloud_resp);
            free(req_buf);

            char resp[512];
            snprintf(resp, sizeof(resp),
                "{\"success\":true,\"cloud_url\":\"https://anbar.mgas.ir\",\"status\":\"CONNECTED\",\"error\":null,\"latency_ms\":%lu,\"remote_events_count\":%d,\"local_event_store_count\":%d,\"current_server_sequence\":%d}\n",
                (unsigned long)latency, ev_count, ev_count, seq);
            send_json_response(client, resp);
            return;
        }
        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        char offline_resp[512];
        snprintf(offline_resp, sizeof(offline_resp),
            "{\"success\":false,\"cloud_url\":\"https://anbar.mgas.ir\",\"status\":\"OFFLINE\",\"offline_fallback\":true,\"current_server_sequence\":%ld,\"error\":\"اتصال موقت اینترنت قطع است (کارکرد محلی فعال)\"}\n",
            (long)g_last_known_sequence);
        send_json_response(client, offline_resp);
        return;
    }

    /* 3d. Force Sync / Pull handler (Real cloud fetch + cache update + SSE push) */
    if (strcmp(url, "/api/sync/force-pull") == 0) {
        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp && relay_to_central_cloud("GET", "/api/sync?since_sequence=0", NULL, 0, cloud_resp, CLOUD_RESPONSE_MAX)) {
            int seq = extract_sequence_from_json(cloud_resp, (int)g_last_known_sequence);
            if (seq > g_last_known_sequence) g_last_known_sequence = seq;
            int ev_count = count_events_in_json(cloud_resp);
            save_sync_cache(cloud_resp, (int)strlen(cloud_resp));

            if (has_nonempty_events(cloud_resp)) {
                char* json_start = strchr(cloud_resp, '{');
                if (json_start) {
                    EnterCriticalSection(&g_sse_cs);
                    if (g_sse_client_count > 0) {
                        char* frame = (char*)malloc(CLOUD_RESPONSE_MAX + 512);
                        if (frame) {
                            int flen = snprintf(frame, CLOUD_RESPONSE_MAX + 512, "data: {\"type\":\"SYNC_EVENTS\",%s\n\n", json_start + 1);
                            for (int i = 0; i < g_sse_client_count; i++) {
                                if (g_sse_clients[i] != INVALID_SOCKET) {
                                    send(g_sse_clients[i], frame, flen, 0);
                                }
                            }
                            free(frame);
                        }
                    }
                    LeaveCriticalSection(&g_sse_cs);
                }
            }

            free(cloud_resp);
            free(req_buf);
            char resp[512];
            snprintf(resp, sizeof(resp),
                "{\"success\":true,\"current_sequence\":%d,\"total_events\":%d,\"message\":\"بروزرسانی داده‌ها از anbar.mgas.ir با موفقیت انجام شد\"}\n",
                seq, ev_count);
            send_json_response(client, resp);
            return;
        }
        if (cloud_resp) free(cloud_resp);
        free(req_buf);
        char resp_off[512];
        snprintf(resp_off, sizeof(resp_off),
            "{\"success\":true,\"offline_fallback\":true,\"current_sequence\":%ld,\"message\":\"حالت آفلاین فعال است (استفاده از کش محلی)\"}\n",
            (long)g_last_known_sequence);
        send_json_response(client, resp_off);
        return;
    }

    /* 3d2. Database Purge relay to central cloud */
    if (strcmp(url, "/api/database/purge") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char purged_ts[64] = {0};
        get_utc_iso_timestamp(purged_ts, sizeof(purged_ts));
        int next_seq = (int)g_last_known_sequence + 1;

        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp && relay_to_central_cloud("POST", "/api/database/purge", post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX)) {
            char remote_ts[64] = {0};
            if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_ts, sizeof(remote_ts)) ||
                extract_json_string_field(cloud_resp, "\"timestamp\"", remote_ts, sizeof(remote_ts))) {
                snprintf(purged_ts, sizeof(purged_ts), "%s", remote_ts);
            }
            next_seq = extract_sequence_from_json(cloud_resp, next_seq);
            update_local_purge_marker_and_cache(purged_ts, next_seq);
            broadcast_sse_purge(purged_ts, "DATABASE_PURGED", 1);
            send_json_response(client, cloud_resp);
            free(cloud_resp);
            free(req_buf);
            return;
        }
        if (cloud_resp) free(cloud_resp);
        update_local_purge_marker_and_cache(purged_ts, next_seq);
        broadcast_sse_purge(purged_ts, "DATABASE_PURGED", 1);
        free(req_buf);
        char local_purge_resp[384];
        snprintf(local_purge_resp, sizeof(local_purge_resp),
            "{\"success\":true,\"message\":\"پایگاه داده محلی پاک‌سازی شد\",\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%ld}\n",
            purged_ts, purged_ts, (long)g_last_known_sequence);
        send_json_response(client, local_purge_resp);
        return;
    }

    /* 3d3. Zero-All Inventory relay */
    if (strcmp(url, "/api/inventory/zero-all") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char purged_ts[64] = {0};
        get_utc_iso_timestamp(purged_ts, sizeof(purged_ts));
        int next_seq = (int)g_last_known_sequence + 1;

        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp) {
            if (relay_to_central_cloud("POST", "/api/inventory/zero-all", post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX)) {
                char remote_ts[64] = {0};
                if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_ts, sizeof(remote_ts)) ||
                    extract_json_string_field(cloud_resp, "\"timestamp\"", remote_ts, sizeof(remote_ts))) {
                    snprintf(purged_ts, sizeof(purged_ts), "%s", remote_ts);
                }
                next_seq = extract_sequence_from_json(cloud_resp, next_seq);
            }
            free(cloud_resp);
        }

        update_local_purge_marker_and_cache(purged_ts, next_seq);
        broadcast_sse_purge(purged_ts, "DATABASE_PURGED", 1);

        free(req_buf);
        char resp[384];
        snprintf(resp, sizeof(resp),
            "{\"success\":true,\"message\":\"کلیه موجودی‌های انبار در سرور محلی و ابری با موفقیت صفر شدند.\",\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%ld}\n",
            purged_ts, purged_ts, (long)g_last_known_sequence);
        send_json_response(client, resp);
        return;
    }

    /* 3d4. Purge-All Except Products relay */
    if (strcmp(url, "/api/database/purge-all-except-products") == 0 || strcmp(url, "/api/database/manager-purge") == 0) {
        const char* post_body = (header_size > 0) ? (req_buf + header_size) : "{}";
        char purged_ts[64] = {0};
        get_utc_iso_timestamp(purged_ts, sizeof(purged_ts));
        int next_seq = (int)g_last_known_sequence + 1;

        char* cloud_resp = (char*)malloc(CLOUD_RESPONSE_MAX);
        if (cloud_resp) {
            if (relay_to_central_cloud("POST", "/api/database/purge-all-except-products", post_body, body_received, cloud_resp, CLOUD_RESPONSE_MAX)) {
                char remote_ts[64] = {0};
                if (extract_json_string_field(cloud_resp, "\"last_purged_at\"", remote_ts, sizeof(remote_ts)) ||
                    extract_json_string_field(cloud_resp, "\"timestamp\"", remote_ts, sizeof(remote_ts))) {
                    snprintf(purged_ts, sizeof(purged_ts), "%s", remote_ts);
                }
                next_seq = extract_sequence_from_json(cloud_resp, next_seq);
            }
            free(cloud_resp);
        }

        update_local_purge_marker_and_cache(purged_ts, next_seq);
        broadcast_sse_purge(purged_ts, "DATABASE_PURGED", 1);

        free(req_buf);
        char resp[384];
        snprintf(resp, sizeof(resp),
            "{\"success\":true,\"message\":\"کلیه داده‌های پایگاه داده و گزارش‌ها با موفقیت پاک‌سازی شدند (نام کالاها حفظ گردید).\",\"last_purged_at\":\"%s\",\"timestamp\":\"%s\",\"server_sequence\":%ld}\n",
            purged_ts, purged_ts, (long)g_last_known_sequence);
        send_json_response(client, resp);
        return;
    }

    /* 3e. SSE live stream handler (parses ?since_sequence=) */
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
            send(client, h, hlen, 0);
            char ch[65536];
            size_t nread;
            while ((nread = fread(ch, 1, sizeof(ch), db_f)) > 0) {
                send(client, ch, (int)nread, 0);
            }
            fclose(db_f);
            free(req_buf);
            closesocket(client);
            return;
        }
    }

    /* 4. Tri-sync inspect relay */
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
        send_json_response(client, "{\"success\":false,\"cloud_status\":\"OFFLINE\",\"offline_fallback\":true}\n");
        return;
    }

    /* 5. Safety guard: NEVER serve HTML for any /api endpoint */
    if (strncmp(url, "/api/", 5) == 0) {
        free(req_buf);
        send_json_response(client, "{\"success\":true,\"status\":\"ok\",\"mode\":\"desktop_local\"}\n");
        return;
    }

    /* 6. Serve Static Assets with Strict MIME Types & 404 Protection */
    const char* rel_path = url;
    while (*rel_path == '/') rel_path++;
    if (*rel_path == '\0') rel_path = "index.html";

    char decoded_rel[MAX_PATH * 3] = {0};
    url_decode(decoded_rel, rel_path, sizeof(decoded_rel));

    /* Basic path traversal guard */
    if (strstr(decoded_rel, "..") != NULL) {
        const char* bad_req = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 9\r\nConnection: close\r\n\r\nForbidden";
        send(client, bad_req, (int)strlen(bad_req), 0);
        free(req_buf);
        closesocket(client);
        return;
    }

    wchar_t rel_path_w[MAX_PATH] = {0};
    utf8_to_wchar(decoded_rel, rel_path_w, MAX_PATH);
    for (wchar_t* p = rel_path_w; *p; p++) {
        if (*p == L'/') *p = L'\\';
    }

    wchar_t target_file_w[MAX_PATH * 2];
    _snwprintf(target_file_w, MAX_PATH * 2, L"%s\\%s", g_web_root_w, rel_path_w);

    DWORD attr = GetFileAttributesW(target_file_w);
    if (attr == INVALID_FILE_ATTRIBUTES || (attr & FILE_ATTRIBUTE_DIRECTORY)) {
        /* Strict MIME Protection: missing JS/CSS/font/asset files MUST return 404, never index.html! */
        if (is_static_asset_path(url)) {
            const char* not_found_asset =
                "HTTP/1.1 404 Not Found\r\n"
                "Content-Type: text/plain; charset=utf-8\r\n"
                "Content-Length: 15\r\n"
                "Connection: close\r\n\r\nAsset not found";
            send(client, not_found_asset, (int)strlen(not_found_asset), 0);
            free(req_buf);
            closesocket(client);
            return;
        }
        /* Only genuine extensionless SPA routes fall back to index.html */
        _snwprintf(target_file_w, MAX_PATH * 2, L"%s\\index.html", g_web_root_w);
    }

    FILE* f = _wfopen(target_file_w, L"rb");
    if (!f) {
        const char* not_found = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 9\r\nConnection: close\r\n\r\nNot Found";
        send(client, not_found, (int)strlen(not_found), 0);
        free(req_buf);
        closesocket(client);
        return;
    }

    fseek(f, 0, SEEK_END);
    long file_size = ftell(f);
    fseek(f, 0, SEEK_SET);

    const char* mime = get_mime_type(target_file_w);
    const char* cache_hdr = (strncmp(url, "/assets/", 8) == 0 || strncmp(url, "/webfonts/", 10) == 0)
        ? "public, max-age=31536000, immutable"
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
    send(client, header, header_len, 0);

    char chunk[65536];
    size_t n;
    while ((n = fread(chunk, 1, sizeof(chunk), f)) > 0) {
        send(client, chunk, (int)n, 0);
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

/* Open desktop app window cleanly at responsive 1280x820 dimensions */
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

    GetModuleFileNameW(NULL, g_app_dir_w, MAX_PATH);
    wchar_t* last_slash = wcsrchr(g_app_dir_w, L'\\');
    if (last_slash) *last_slash = L'\0';

    /* Place internal data/cache in %LOCALAPPDATA%\MGasInventory cleanly (no desktop or visible logs) */
    wchar_t local_app_data[MAX_PATH] = {0};
    if (GetEnvironmentVariableW(L"LOCALAPPDATA", local_app_data, MAX_PATH) > 0) {
        wchar_t data_dir[MAX_PATH];
        _snwprintf(data_dir, MAX_PATH, L"%s\\MGasInventory", local_app_data);
        CreateDirectoryW(data_dir, NULL);
        _snwprintf(g_cache_file_w, MAX_PATH, L"%s\\cloud_sync_cache.json", data_dir);
        _snwprintf(g_log_file_w, MAX_PATH, L"%s\\mgas_server.log", data_dir);
    } else {
        _snwprintf(g_cache_file_w, MAX_PATH, L"%s\\cloud_sync_cache.json", g_app_dir_w);
        _snwprintf(g_log_file_w, MAX_PATH, L"%s\\mgas_server.log", g_app_dir_w);
    }

    wchar_to_utf8(g_app_dir_w, g_app_dir_utf8, sizeof(g_app_dir_utf8));

    if (!find_web_root()) {
        show_alert_utf8(NULL,
            "پوشه فایل‌های برنامه (app) یافت نشد. لطفاً برنامه را مجدداً نصب نمایید.",
            "خطا در اجرای سامانه انبارداری ام گاز", MB_ICONERROR | MB_OK);
        return 1;
    }

    wchar_to_utf8(g_web_root_w, g_web_root_utf8, sizeof(g_web_root_utf8));
    ensure_desktop_anbar_databases();

    /* Initialize cached sequence number if available */
    char* init_cache = (char*)malloc(CLOUD_RESPONSE_MAX);
    if (init_cache) {
        if (load_sync_cache(init_cache, CLOUD_RESPONSE_MAX)) {
            g_last_known_sequence = extract_sequence_from_json(init_cache, 0);
        }
        free(init_cache);
    }

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        show_alert_utf8(NULL, "خطا در راه‌اندازی شبکه محلی ویندوز (WinSock).", "خطای شبکه", MB_ICONERROR | MB_OK);
        return 1;
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
                if (hThread) {
                    CloseHandle(hThread);
                }
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
