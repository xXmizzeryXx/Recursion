const RecursionNet = (() => {

    const sockets = {};
    let nextSocketId = 1;

    async function httpGet(url) {
        const res = await fetch(url);
        return {
            status: res.status,
            text:   await res.text(),
        };
    }

    async function httpGetJSON(url) {
        const res  = await fetch(url);
        const data = await res.json();
        return { status: res.status, data };
    }

    async function httpGetBinary(url) {
        const res    = await fetch(url);
        const buffer = await res.arrayBuffer();
        return { status: res.status, buffer };
    }

    async function httpPost(url, body, headers = {}) {
        const res = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body:    typeof body === "string" ? body : JSON.stringify(body),
        });
        return {
            status: res.status,
            text:   await res.text(),
        };
    }

    async function httpPostBinary(url, buffer, headers = {}) {
        const res = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/octet-stream", ...headers },
            body:    buffer,
        });
        return {
            status: res.status,
            text:   await res.text(),
        };
    }

    function wsConnect(url, onMessage, onOpen, onClose, onError) {
        const id = nextSocketId++;
        const ws = new WebSocket(url);

        ws.binaryType = "arraybuffer";

        ws.onopen    = ()    => { if (onOpen)    onOpen(id); };
        ws.onclose   = ()    => { if (onClose)   onClose(id); delete sockets[id]; };
        ws.onerror   = (e)   => { if (onError)   onError(id, e); };
        ws.onmessage = (msg) => { if (onMessage) onMessage(id, msg.data); };

        sockets[id] = ws;
        return id;
    }

    function wsSend(id, data) {
        const ws = sockets[id];
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(data);
        return true;
    }

    function wsClose(id) {
        const ws = sockets[id];
        if (ws) ws.close();
        delete sockets[id];
    }

    function wsState(id) {
        const ws = sockets[id];
        if (!ws) return -1;
        return ws.readyState;
    }

    const Browser = (() => {

        async function clipboardRead() {
            try { return await navigator.clipboard.readText(); }
            catch { return null; }
        }

        async function clipboardWrite(text) {
            try { await navigator.clipboard.writeText(text); return true; }
            catch { return false; }
        }

        function requestFullscreen(element) {
            const el = element || document.documentElement;
            if (el.requestFullscreen)       return el.requestFullscreen();
            if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
            if (el.mozRequestFullScreen)    return el.mozRequestFullScreen();
        }

        function exitFullscreen() {
            if (document.exitFullscreen)       return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.mozCancelFullScreen)  return document.mozCancelFullScreen();
        }

        function isFullscreen() {
            return !!(document.fullscreenElement || document.webkitFullscreenElement);
        }

        function localStorageSet(key, value) {
            try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); return true; }
            catch { return false; }
        }

        function localStorageGet(key) {
            try {
                const val = localStorage.getItem(key);
                if (val === null) return null;
                try { return JSON.parse(val); } catch { return val; }
            } catch { return null; }
        }

        function localStorageDelete(key) {
            try { localStorage.removeItem(key); return true; }
            catch { return false; }
        }

        function enableDragDrop(element, onDrop) {
            element.addEventListener("dragover", e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
            });

            element.addEventListener("drop", async e => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                for (const file of files) {
                    const buffer = await file.arrayBuffer();
                    onDrop({
                        name:   file.name,
                        size:   file.size,
                        type:   file.type,
                        buffer,
                    });
                }
            });
        }

        return {
            clipboardRead, clipboardWrite,
            requestFullscreen, exitFullscreen, isFullscreen,
            localStorageSet, localStorageGet, localStorageDelete,
            enableDragDrop,
        };

    })();

    function exposeToWASM() {
        Module._net_http_get = async function(urlPtr, callbackPtr) {
            const url    = UTF8ToString(urlPtr);
            const result = await httpGet(url);
            const enc    = new TextEncoder();
            const bytes  = enc.encode(result.text);
            const ptr    = Module._malloc(bytes.length + 1);
            Module.HEAPU8.set(bytes, ptr);
            Module.HEAPU8[ptr + bytes.length] = 0;
            Module.dynCall_vii(callbackPtr, result.status, ptr);
            Module._free(ptr);
        };

        Module._net_http_post = async function(urlPtr, bodyPtr, callbackPtr) {
            const url    = UTF8ToString(urlPtr);
            const body   = UTF8ToString(bodyPtr);
            const result = await httpPost(url, body);
            const enc    = new TextEncoder();
            const bytes  = enc.encode(result.text);
            const ptr    = Module._malloc(bytes.length + 1);
            Module.HEAPU8.set(bytes, ptr);
            Module.HEAPU8[ptr + bytes.length] = 0;
            Module.dynCall_vii(callbackPtr, result.status, ptr);
            Module._free(ptr);
        };

        Module._net_ws_connect = function(urlPtr, onMessagePtr, onOpenPtr, onClosePtr) {
            const url = UTF8ToString(urlPtr);
            return wsConnect(
                url,
                (id, data) => {
                    if (typeof data === "string") {
                        const enc   = new TextEncoder();
                        const bytes = enc.encode(data);
                        const ptr   = Module._malloc(bytes.length + 1);
                        Module.HEAPU8.set(bytes, ptr);
                        Module.HEAPU8[ptr + bytes.length] = 0;
                        Module.dynCall_vii(onMessagePtr, id, ptr);
                        Module._free(ptr);
                    }
                },
                (id) => { Module.dynCall_vi(onOpenPtr,  id); },
                (id) => { Module.dynCall_vi(onClosePtr, id); },
            );
        };

        Module._net_ws_send = function(socketId, dataPtr) {
            return wsSend(socketId, UTF8ToString(dataPtr)) ? 1 : 0;
        };

        Module._net_ws_close = function(socketId) {
            wsClose(socketId);
        };

        Module._browser_clipboard_write = async function(textPtr) {
            const text = UTF8ToString(textPtr);
            await Browser.clipboardWrite(text);
        };

        Module._browser_fullscreen = function() {
            Browser.requestFullscreen(document.getElementById("recursion"));
        };

        Module._browser_localstorage_set = function(keyPtr, valPtr) {
            Browser.localStorageSet(UTF8ToString(keyPtr), UTF8ToString(valPtr));
        };

        Module._browser_localstorage_get = function(keyPtr, outPtr, maxLen) {
            const val = Browser.localStorageGet(UTF8ToString(keyPtr));
            if (val === null) return -1;
            const str   = typeof val === "string" ? val : JSON.stringify(val);
            const enc   = new TextEncoder();
            const bytes = enc.encode(str);
            const len   = Math.min(bytes.length, maxLen - 1);
            Module.HEAPU8.set(bytes.subarray(0, len), outPtr);
            Module.HEAPU8[outPtr + len] = 0;
            return len;
        };
    }

    return {
        httpGet, httpGetJSON, httpGetBinary,
        httpPost, httpPostBinary,
        wsConnect, wsSend, wsClose, wsState,
        Browser,
        exposeToWASM,
    };

})();