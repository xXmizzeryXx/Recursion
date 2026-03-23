#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

extern "C" {

const int WIDTH  = 320;
const int HEIGHT = 200;

struct EngineState {
    uint32_t* framebuffer;
    float     delta_time;
    float     accumulator;
    float     fixed_step;
    int       frame_count;
    uint8_t   keys_down[256];
    uint8_t   keys_pressed[256];
    int       mouse_x;
    int       mouse_y;
    float     mouse_dx;
    float     mouse_dy;
    uint8_t   mouse_buttons[3];
    uint8_t   pointer_locked;
};

static EngineState state;

void recursion_init() {
    memset(&state, 0, sizeof(EngineState));
    state.framebuffer = (uint32_t*)malloc(WIDTH * HEIGHT * sizeof(uint32_t));
    state.fixed_step  = 1.0f / 60.0f;
}

void recursion_set_delta(float dt) {
    state.delta_time  = dt;
    state.accumulator += dt;
}

int recursion_should_fixed_update() {
    if (state.accumulator >= state.fixed_step) {
        state.accumulator -= state.fixed_step;
        return 1;
    }
    return 0;
}

void recursion_tick(int frame) {
    state.frame_count = frame;
    memset(state.keys_pressed, 0, sizeof(state.keys_pressed));

    for (int y = 0; y < HEIGHT; y++) {
        for (int x = 0; x < WIDTH; x++) {
            uint8_t r = (x + frame) & 255;
            uint8_t g = (y + frame) & 255;
            uint8_t b = (x + y + frame) & 255;
            state.framebuffer[y * WIDTH + x] = (255 << 24) | (r << 16) | (g << 8) | b;
        }
    }
}

void recursion_key_down(int keycode) {
    if (keycode < 0 || keycode > 255) return;
    if (!state.keys_down[keycode]) state.keys_pressed[keycode] = 1;
    state.keys_down[keycode] = 1;
}

void recursion_key_up(int keycode) {
    if (keycode < 0 || keycode > 255) return;
    state.keys_down[keycode] = 0;
}

void recursion_mouse_move(int x, int y, float dx, float dy) {
    state.mouse_x  = x;
    state.mouse_y  = y;
    state.mouse_dx = dx;
    state.mouse_dy = dy;
}

void recursion_mouse_button(int button, int down) {
    if (button < 0 || button > 2) return;
    state.mouse_buttons[button] = (uint8_t)down;
}

void recursion_set_pointer_locked(int locked) {
    state.pointer_locked = (uint8_t)locked;
}

int recursion_key_is_down(int keycode)    { return state.keys_down[keycode]; }
int recursion_key_is_pressed(int keycode) { return state.keys_pressed[keycode]; }
int recursion_mouse_x()                   { return state.mouse_x; }
int recursion_mouse_y()                   { return state.mouse_y; }
float recursion_mouse_dx()                { return state.mouse_dx; }
float recursion_mouse_dy()                { return state.mouse_dy; }
int recursion_mouse_button_down(int btn)  { return state.mouse_buttons[btn]; }

uint32_t* recursion_get_framebuffer() { return state.framebuffer; }
int recursion_get_width()             { return WIDTH; }
int recursion_get_height()            { return HEIGHT; }
int recursion_get_frame_count()       { return state.frame_count; }

void fs_write(const char* path, const uint8_t* data, int length) {
    EM_ASM({
        const path = UTF8ToString($0);
        const data = Module.HEAPU8.slice($1, $1 + $2);
        RecursionFS.writeBinary(path, data.buffer);
    }, path, data, length);
}

int fs_read(const char* path, uint8_t* out, int max_len) {
    return EM_ASM_INT({
        const path = UTF8ToString($0);
        const data = RecursionFS.readBinary(path);
        if (!data) return -1;
        const bytes = new Uint8Array(data);
        const len   = Math.min(bytes.length, $2);
        Module.HEAPU8.set(bytes.subarray(0, len), $1);
        return len;
    }, path, out, max_len);
}

int fs_exists(const char* path) {
    return EM_ASM_INT({
        return RecursionFS.exists(UTF8ToString($0)) ? 1 : 0;
    }, path);
}

void fs_delete(const char* path) {
    EM_ASM({
        RecursionFS.deleteFile(UTF8ToString($0));
    }, path);
}

void net_http_get(const char* url, void (*callback)(int status, const char* body)) {
    EM_ASM({
        const url = UTF8ToString($0);
        RecursionNet.httpGet(url).then(r => {
            const enc   = new TextEncoder();
            const bytes = enc.encode(r.text);
            const ptr   = Module._malloc(bytes.length + 1);
            Module.HEAPU8.set(bytes, ptr);
            Module.HEAPU8[ptr + bytes.length] = 0;
            Module.dynCall_vii($1, r.status, ptr);
            Module._free(ptr);
        });
    }, url, callback);
}

void net_http_post(const char* url, const char* body, void (*callback)(int status, const char* response)) {
    EM_ASM({
        const url  = UTF8ToString($0);
        const body = UTF8ToString($1);
        RecursionNet.httpPost(url, body).then(r => {
            const enc   = new TextEncoder();
            const bytes = enc.encode(r.text);
            const ptr   = Module._malloc(bytes.length + 1);
            Module.HEAPU8.set(bytes, ptr);
            Module.HEAPU8[ptr + bytes.length] = 0;
            Module.dynCall_vii($2, r.status, ptr);
            Module._free(ptr);
        });
    }, url, body, callback);
}

int net_ws_connect(const char* url, void (*onMessage)(int id, const char* data), void (*onOpen)(int id), void (*onClose)(int id)) {
    return EM_ASM_INT({
        const url = UTF8ToString($0);
        return RecursionNet.wsConnect(
            url,
            (id, data) => {
                const enc   = new TextEncoder();
                const bytes = enc.encode(data);
                const ptr   = Module._malloc(bytes.length + 1);
                Module.HEAPU8.set(bytes, ptr);
                Module.HEAPU8[ptr + bytes.length] = 0;
                Module.dynCall_vii($1, id, ptr);
                Module._free(ptr);
            },
            (id) => Module.dynCall_vi($2, id),
            (id) => Module.dynCall_vi($3, id),
        );
    }, url, onMessage, onOpen, onClose);
}

void net_ws_send(int socket_id, const char* data) {
    EM_ASM({
        RecursionNet.wsSend($0, UTF8ToString($1));
    }, socket_id, data);
}

void net_ws_close(int socket_id) {
    EM_ASM({ RecursionNet.wsClose($0); }, socket_id);
}

void browser_fullscreen() {
    EM_ASM({ RecursionNet.Browser.requestFullscreen(document.getElementById("recursion")); });
}

void browser_localstorage_set(const char* key, const char* value) {
    EM_ASM({
        RecursionNet.Browser.localStorageSet(UTF8ToString($0), UTF8ToString($1));
    }, key, value);
}

int browser_localstorage_get(const char* key, char* out, int max_len) {
    return EM_ASM_INT({
        const val = RecursionNet.Browser.localStorageGet(UTF8ToString($0));
        if (val === null) return -1;
        const str   = typeof val === "string" ? val : JSON.stringify(val);
        const enc   = new TextEncoder();
        const bytes = enc.encode(str);
        const len   = Math.min(bytes.length, $2 - 1);
        Module.HEAPU8.set(bytes.subarray(0, len), $1);
        Module.HEAPU8[$1 + len] = 0;
        return len;
    }, key, out, max_len);
}

}