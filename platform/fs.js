const RecursionFS = (() => {

    const memfs = {};
    let db = null;

    function normalizePath(path) {
        return path.replace(/\\/g, "/").replace(/\/+/g, "/");
    }

    function writeFile(path, data) {
        memfs[normalizePath(path)] = data;
    }

    function readFile(path) {
        return memfs[normalizePath(path)] ?? null;
    }

    function deleteFile(path) {
        delete memfs[normalizePath(path)];
    }

    function exists(path) {
        return normalizePath(path) in memfs;
    }

    function listDir(prefix) {
        prefix = normalizePath(prefix);
        return Object.keys(memfs).filter(k => k.startsWith(prefix));
    }

    function writeJSON(path, obj) {
        writeFile(path, JSON.stringify(obj));
    }

    function readJSON(path) {
        const raw = readFile(path);
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }

    function writeText(path, text) {
        writeFile(path, text);
    }

    function readText(path) {
        return readFile(path);
    }

    function writeBinary(path, buffer) {
        writeFile(path, buffer);
    }

    function readBinary(path) {
        return readFile(path);
    }

    async function initDB(dbName = "RecursionFS") {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 1);
            req.onupgradeneeded = e => {
                e.target.result.createObjectStore("files");
            };
            req.onsuccess = e => {
                db = e.target.result;
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function persist(path) {
        if (!db) return;
        path = normalizePath(path);
        return new Promise((resolve, reject) => {
            const tx    = db.transaction("files", "readwrite");
            const store = tx.objectStore("files");
            const req   = store.put(memfs[path], path);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    async function restore(path) {
        if (!db) return;
        path = normalizePath(path);
        return new Promise((resolve, reject) => {
            const tx    = db.transaction("files", "readonly");
            const store = tx.objectStore("files");
            const req   = store.get(path);
            req.onsuccess = () => {
                if (req.result !== undefined) memfs[path] = req.result;
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function persistAll() {
        for (const path of Object.keys(memfs)) await persist(path);
    }

    async function restoreAll() {
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx    = db.transaction("files", "readonly");
            const store = tx.objectStore("files");
            const req   = store.getAllKeys();
            req.onsuccess = async () => {
                for (const key of req.result) await restore(key);
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function loadImage(path, url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                writeFile(path, img);
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    async function loadAudio(path, url) {
        const res    = await fetch(url);
        const buffer = await res.arrayBuffer();
        writeBinary(path, buffer);
        return buffer;
    }

    async function loadJSON(path, url) {
        const res  = await fetch(url);
        const data = await res.json();
        writeJSON(path, data);
        return data;
    }

    async function loadBinary(path, url) {
        const res    = await fetch(url);
        const buffer = await res.arrayBuffer();
        writeBinary(path, buffer);
        return buffer;
    }

    async function loadText(path, url) {
        const res  = await fetch(url);
        const text = await res.text();
        writeText(path, text);
        return text;
    }

    function exposeToWASM() {
        Module._fs_write = function(pathPtr, dataPtr, length) {
            const path = UTF8ToString(pathPtr);
            const data = Module.HEAPU8.slice(dataPtr, dataPtr + length);
            writeBinary(path, data.buffer);
        };

        Module._fs_read = function(pathPtr, outPtr, maxLen) {
            const path = UTF8ToString(pathPtr);
            const data = readBinary(path);
            if (!data) return -1;
            const bytes = new Uint8Array(data);
            const len   = Math.min(bytes.length, maxLen);
            Module.HEAPU8.set(bytes.subarray(0, len), outPtr);
            return len;
        };

        Module._fs_exists = function(pathPtr) {
            return exists(UTF8ToString(pathPtr)) ? 1 : 0;
        };

        Module._fs_delete = function(pathPtr) {
            deleteFile(UTF8ToString(pathPtr));
        };
    }

    return {
        writeFile, readFile, deleteFile, exists, listDir,
        writeJSON, readJSON, writeText, readText, writeBinary, readBinary,
        initDB, persist, restore, persistAll, restoreAll,
        loadImage, loadAudio, loadJSON, loadBinary, loadText,
        exposeToWASM,
    };

})();