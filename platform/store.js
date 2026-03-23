const RecursionStore = (() => {

    const REGISTRY_KEY = "recursion_installed_apps";
    const APP_FS_ROOT  = "/apps/";

    let registryURL  = null;
    let remoteApps   = [];
    let installedApps = {};

    function setRegistry(url) {
        registryURL = url;
    }

    function loadInstalled() {
        const raw = RecursionNet.Browser.localStorageGet(REGISTRY_KEY);
        installedApps = (raw && typeof raw === "object") ? raw : {};
    }

    function saveInstalled() {
        RecursionNet.Browser.localStorageSet(REGISTRY_KEY, installedApps);
    }

    async function fetchRegistry() {
        if (!registryURL) {
            RecursionTools.warn("No registry URL set. Call RecursionStore.setRegistry(url)");
            return [];
        }
        try {
            const res  = await RecursionNet.httpGetJSON(registryURL);
            remoteApps = res.data?.apps ?? [];
            RecursionTools.info("Registry fetched: " + remoteApps.length + " apps available");
            return remoteApps;
        } catch (e) {
            RecursionTools.error("Failed to fetch registry: " + e.message);
            return [];
        }
    }

    async function install(appId) {
        const app = remoteApps.find(a => a.id === appId);
        if (!app) {
            RecursionTools.error("App not found in registry: " + appId);
            return false;
        }

        try {
            RecursionTools.info("Installing " + app.name + "...");

            const manifest = {
                id:       app.id,
                name:     app.name,
                version:  app.version,
                entry:    app.entry,
                installed: Date.now(),
            };

            if (app.files) {
                for (const file of app.files) {
                    const res = await RecursionNet.httpGetBinary(file.url);
                    RecursionFS.writeBinary(APP_FS_ROOT + app.id + "/" + file.path, res.buffer);
                }
            }

            if (app.wasmUrl) {
                const res = await RecursionNet.httpGetBinary(app.wasmUrl);
                RecursionFS.writeBinary(APP_FS_ROOT + app.id + "/app.wasm", res.buffer);
                manifest.hasWasm = true;
            }

            if (app.scriptUrl) {
                const res = await RecursionNet.httpGet(app.scriptUrl);
                RecursionFS.writeText(APP_FS_ROOT + app.id + "/app.js", res.text);
                manifest.hasScript = true;
            }

            RecursionFS.writeJSON(APP_FS_ROOT + app.id + "/manifest.json", manifest);
            installedApps[app.id] = manifest;
            saveInstalled();

            RecursionTools.log("Installed: " + app.name + " v" + app.version, "#aaffaa");
            return true;
        } catch (e) {
            RecursionTools.error("Install failed: " + e.message);
            return false;
        }
    }

    async function update(appId) {
        if (!installedApps[appId]) {
            RecursionTools.error("App not installed: " + appId);
            return false;
        }
        uninstall(appId);
        return install(appId);
    }

    function uninstall(appId) {
        const files = RecursionFS.listDir(APP_FS_ROOT + appId + "/");
        for (const f of files) RecursionFS.deleteFile(f);
        delete installedApps[appId];
        saveInstalled();
        RecursionTools.log("Uninstalled: " + appId, "#ffaaaa");
    }

    function listInstalled() {
        return Object.values(installedApps);
    }

    function listRemote() {
        return remoteApps;
    }

    async function launch(appId, winTitle, x = 20, y = 20, w = 240, h = 180) {
        const manifest = installedApps[appId];
        if (!manifest) {
            RecursionTools.error("App not installed: " + appId);
            return null;
        }

        const winId = RecursionOS.createWindow(winTitle || manifest.name, x, y, w, h, appId);

        if (manifest.hasScript) {
            const src = RecursionFS.readText(APP_FS_ROOT + appId + "/app.js");
            if (src) {
                try {
                    const appFactory = new Function("state", "ctx", "dt", "msgs", "OS", "FS", "Net", "Math", "Audio", "Tools", src);
                    RecursionOS.Sandbox.createApp(appId, (state) => {
                        state._factory = appFactory;
                    });
                    const app = RecursionOS.Sandbox.getApp(appId);
                    if (app) {
                        app.tick = (state, ctx, dt, msgs) =>
                            state._factory(state, ctx, dt, msgs, RecursionOS, RecursionFS, RecursionNet, RecursionMath, RecursionAudio, RecursionTools);
                    }
                    RecursionTools.log("Launched: " + manifest.name, "#aaffaa");
                } catch (e) {
                    RecursionTools.error("Launch error: " + e.message);
                }
            }
        }

        if (manifest.hasWasm) {
            await RecursionMultiModule.load(appId, APP_FS_ROOT + appId + "/app.wasm");
        }

        return winId;
    }

    async function launchInline(id, name, scriptSrc, x = 20, y = 20, w = 240, h = 180) {
        const winId = RecursionOS.createWindow(name, x, y, w, h, id);
        try {
            RecursionOS.Sandbox.createApp(id, (state) => {});
            const app = RecursionOS.Sandbox.getApp(id);
            if (app) {
                const fn = new Function("state", "ctx", "dt", "msgs", "OS", "FS", "Net", "Math", "Audio", "Tools", scriptSrc);
                app.tick = (state, ctx, dt, msgs) =>
                    fn(state, ctx, dt, msgs, RecursionOS, RecursionFS, RecursionNet, RecursionMath, RecursionAudio, RecursionTools);
            }
            RecursionTools.log("Launched inline: " + name, "#aaffaa");
        } catch (e) {
            RecursionTools.error("Inline launch error: " + e.message);
        }
        return winId;
    }

    return {
        setRegistry, fetchRegistry,
        install, update, uninstall,
        listInstalled, listRemote,
        launch, launchInline,
        loadInstalled,
    };

})();

const RecursionMultiModule = (() => {

    const modules  = {};
    const buses    = {};
    let   nextBus  = 1;

    async function load(id, wasmPathOrUrl) {
        if (modules[id]) {
            RecursionTools.warn("Module already loaded: " + id);
            return modules[id];
        }

        try {
            let buffer;
            const data = RecursionFS.readBinary(wasmPathOrUrl);
            if (data) {
                buffer = data;
            } else {
                const res = await RecursionNet.httpGetBinary(wasmPathOrUrl);
                buffer    = res.buffer;
            }

            const memory  = new WebAssembly.Memory({ initial: 16, maximum: 256, shared: true });
            const imports = {
                env: {
                    memory,
                    emscripten_resize_heap: () => {},
                    abort: (msg) => RecursionTools.error("WASM abort: " + msg),
                },
                wasi_snapshot_preview1: {
                    proc_exit: () => {},
                    fd_write:  () => 0,
                    fd_seek:   () => 0,
                    fd_close:  () => 0,
                },
            };

            const result  = await WebAssembly.instantiate(buffer, imports);
            const exports = result.instance.exports;

            modules[id] = {
                id,
                instance: result.instance,
                exports,
                memory,
                heap: new Uint8Array(memory.buffer),
            };

            RecursionTools.log("Loaded WASM module: " + id, "#aaffaa");
            return modules[id];
        } catch (e) {
            RecursionTools.error("Failed to load module " + id + ": " + e.message);
            return null;
        }
    }

    function unload(id) {
        delete modules[id];
        RecursionTools.log("Unloaded module: " + id);
    }

    function getModule(id) {
        return modules[id] ?? null;
    }

    function call(id, fn, ...args) {
        const mod = modules[id];
        if (!mod) { RecursionTools.error("Module not loaded: " + id); return null; }
        if (!mod.exports[fn]) { RecursionTools.error("Function not found: " + fn); return null; }
        try { return mod.exports[fn](...args); }
        catch (e) { RecursionTools.error("Module call error: " + e.message); return null; }
    }

    function createBus(name) {
        const id  = nextBus++;
        buses[id] = { id, name, subscribers: {} };
        return id;
    }

    function subscribe(busId, topic, fn) {
        if (!buses[busId]) return;
        if (!buses[busId].subscribers[topic]) buses[busId].subscribers[topic] = [];
        buses[busId].subscribers[topic].push(fn);
    }

    function publish(busId, topic, data) {
        if (!buses[busId]) return;
        const subs = buses[busId].subscribers[topic] ?? [];
        for (const fn of subs) { try { fn(data); } catch (e) { RecursionTools.error("Bus error: " + e.message); } }
    }

    function listModules() {
        return Object.keys(modules);
    }

    return {
        load, unload, getModule, call,
        createBus, subscribe, publish,
        listModules,
    };

})();

const RecursionChromium = (() => {

    let iframe      = null;
    let overlay     = null;
    let winId       = null;
    let pipelineCtx = null;

    const features  = {
        serviceWorker: "serviceWorker" in navigator,
        webAssembly:   typeof WebAssembly !== "undefined",
        webGPU:        !!navigator.gpu,
        webGL2:        !!document.createElement("canvas").getContext("webgl2"),
        sharedMemory:  typeof SharedArrayBuffer !== "undefined",
        webRTC:        !!window.RTCPeerConnection,
        webUSB:        !!navigator.usb,
        webBluetooth:  !!navigator.bluetooth,
        webSerial:     !!navigator.serial,
        webHID:        !!navigator.hid,
        fileSystem:    !!window.showOpenFilePicker,
        notifications: !!window.Notification,
        geolocation:   !!navigator.geolocation,
        webCodecs:     !!window.VideoDecoder,
        webTransport:  !!window.WebTransport,
    };

    function getFeatures() {
        return { ...features };
    }

    function embedURL(url, x, y, w, h) {
        if (iframe) { RecursionTools.warn("Chromium subsystem: iframe already active"); return; }

        const canvas  = document.getElementById("recursion");
        const rect    = canvas.getBoundingClientRect();

        overlay       = document.createElement("div");
        overlay.style.cssText = `
            position: fixed;
            left:   ${rect.left + x}px;
            top:    ${rect.top  + y}px;
            width:  ${w}px;
            height: ${h}px;
            z-index: 1000;
            border: 2px solid #5555ff;
            background: #000;
            overflow: hidden;
        `;

        iframe            = document.createElement("iframe");
        iframe.src        = url;
        iframe.style.cssText = "width:100%;height:100%;border:none;";
        iframe.sandbox    = "allow-scripts allow-same-origin allow-forms allow-popups";

        overlay.appendChild(iframe);
        document.body.appendChild(overlay);

        winId = RecursionOS.createWindow("Browser: " + url.substring(0, 24), x, y, w + 4, 20, null);

        RecursionTools.log("Chromium subsystem: embedded " + url, "#aaffaa");
        return iframe;
    }

    function closeEmbed() {
        if (overlay) { overlay.remove(); overlay = null; iframe = null; }
        if (winId)   { RecursionOS.destroyWindow(winId); winId = null; }
        RecursionTools.log("Chromium subsystem: closed embed");
    }

    function navigate(url) {
        if (iframe) iframe.src = url;
        else RecursionTools.warn("No active embed");
    }

    function postMessage(data, origin = "*") {
        if (iframe) iframe.contentWindow.postMessage(data, origin);
        else RecursionTools.warn("No active embed to post message to");
    }

    function onMessage(fn) {
        window.addEventListener("message", e => fn(e.data, e.origin));
    }

    function initCustomPipeline(canvas) {
        const offscreen = canvas.transferControlToOffscreen
            ? canvas.transferControlToOffscreen()
            : null;

        if (!offscreen) {
            RecursionTools.warn("OffscreenCanvas not supported");
            return null;
        }

        pipelineCtx = { offscreen, canvas };
        RecursionTools.log("Custom rendering pipeline initialized", "#aaffaa");
        return pipelineCtx;
    }

    async function registerServiceWorker(swUrl) {
        if (!features.serviceWorker) {
            RecursionTools.warn("Service workers not supported");
            return null;
        }
        try {
            const reg = await navigator.serviceWorker.register(swUrl);
            RecursionTools.log("Service worker registered: " + swUrl, "#aaffaa");
            return reg;
        } catch (e) {
            RecursionTools.error("Service worker registration failed: " + e.message);
            return null;
        }
    }

    async function requestUSB(filters = []) {
        if (!features.webUSB) { RecursionTools.warn("WebUSB not supported"); return null; }
        try { return await navigator.usb.requestDevice({ filters }); }
        catch (e) { RecursionTools.error("WebUSB error: " + e.message); return null; }
    }

    async function requestBluetooth(options = {}) {
        if (!features.webBluetooth) { RecursionTools.warn("WebBluetooth not supported"); return null; }
        try { return await navigator.bluetooth.requestDevice(options); }
        catch (e) { RecursionTools.error("WebBluetooth error: " + e.message); return null; }
    }

    async function requestSerial() {
        if (!features.webSerial) { RecursionTools.warn("WebSerial not supported"); return null; }
        try { return await navigator.serial.requestPort(); }
        catch (e) { RecursionTools.error("WebSerial error: " + e.message); return null; }
    }

    async function openFilePicker(options = {}) {
        if (!features.fileSystem) { RecursionTools.warn("File System Access API not supported"); return null; }
        try {
            const handles = await window.showOpenFilePicker(options);
            const results = [];
            for (const handle of handles) {
                const file   = await handle.getFile();
                const buffer = await file.arrayBuffer();
                results.push({ name: file.name, size: file.size, buffer, handle });
            }
            return results;
        } catch (e) { RecursionTools.error("File picker error: " + e.message); return null; }
    }

    async function requestNotification(title, body, icon) {
        if (!features.notifications) { RecursionTools.warn("Notifications not supported"); return; }
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") return new Notification(title, { body, icon });
    }

    async function getGeolocation() {
        if (!features.geolocation) { RecursionTools.warn("Geolocation not supported"); return null; }
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                pos  => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
                err  => { RecursionTools.error("Geolocation error: " + err.message); reject(err); }
            );
        });
    }

    function exposeFeatureReport() {
        const win = RecursionOS.createWindow("Browser Features", 10, 10, 200, 200, null);
        const w   = RecursionOS.getWindow(win);
        if (!w) return;

        const origTick = RecursionOS.Sandbox.getApp;
        RecursionOS.Sandbox.createApp("__features__", (state) => { state.features = getFeatures(); });
        const app = RecursionOS.Sandbox.getApp("__features__");
        if (app) {
            app.tick = (state, ctx) => {
                RecursionOS.UI.drawPanel(ctx, 0, 20, 200, 180);
                let y = 36;
                for (const [key, val] of Object.entries(state.features)) {
                    RecursionOS.UI.drawText(ctx, key + ": " + (val ? "✓" : "✗"), 8, y, val ? "#aaffaa" : "#ff6666", 10);
                    y += 13;
                }
            };
        }

        const w2 = RecursionOS.getWindow(win);
        if (w2) w2.appId = "__features__";
        return win;
    }

    return {
        getFeatures, embedURL, closeEmbed, navigate,
        postMessage, onMessage,
        initCustomPipeline,
        registerServiceWorker,
        requestUSB, requestBluetooth, requestSerial,
        openFilePicker, requestNotification, getGeolocation,
        exposeFeatureReport,
    };

})();