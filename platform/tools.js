const RecursionTools = (() => {

    const LOG_MAX    = 128;
    const CON_H      = 120;
    const INS_W      = 200;
    const FONT       = "11px monospace";
    const LINE_H     = 14;
    const PAD        = 6;

    let visible      = false;
    let activeTab    = "console";
    let inputBuffer  = "";
    let scrollOffset = 0;

    const logs       = [];
    const commands   = {};
    const watchVars  = {};

    function show()   { visible = true; }
    function hide()   { visible = false; }
    function toggle() { visible = !visible; }
    function isVisible() { return visible; }

    function log(msg, color = "#e0e0ff") {
        logs.push({ msg: String(msg), color, time: performance.now() });
        if (logs.length > LOG_MAX) logs.shift();
        scrollOffset = 0;
    }

    function warn(msg)  { log("[WARN] " + msg, "#ffcc00"); }
    function error(msg) { log("[ERR]  " + msg, "#ff4444"); }
    function info(msg)  { log("[INFO] " + msg, "#44aaff"); }

    function registerCommand(name, fn, help = "") {
        commands[name] = { fn, help };
    }

    function runCommand(input) {
        const parts = input.trim().split(/\s+/);
        const name  = parts[0];
        const args  = parts.slice(1);
        if (!name) return;
        if (commands[name]) {
            try {
                const result = commands[name].fn(...args);
                if (result !== undefined) log("> " + String(result), "#aaffaa");
            } catch (e) {
                error(e.message);
            }
        } else {
            try {
                const result = eval(input);
                if (result !== undefined) log("> " + JSON.stringify(result), "#aaffaa");
            } catch (e) {
                error(e.message);
            }
        }
    }

    function watch(name, fn) {
        watchVars[name] = fn;
    }

    function unwatch(name) {
        delete watchVars[name];
    }

    registerCommand("help", () => {
        for (const [name, cmd] of Object.entries(commands)) log(`  ${name} — ${cmd.help}`, "#aaaaff");
    }, "list all commands");

    registerCommand("clear", () => {
        logs.length = 0;
    }, "clear the console");

    registerCommand("fps", () => {
        return "use watch vars to track fps";
    }, "show fps");

    registerCommand("ls", () => {
        return RecursionFS.listDir("/").join(", ") || "(empty)";
    }, "list root fs");

    registerCommand("mem", () => {
        return "WASM heap: " + (Module.HEAPU8.length / 1024).toFixed(1) + " KB";
    }, "show memory usage");

    registerCommand("entities", () => {
        return "entities: " + RecursionOS.Scene.getAll().length;
    }, "count scene entities");

    registerCommand("windows", () => {
        return "windows: " + Object.keys(RecursionOS).length;
    }, "list open windows");

    registerCommand("audio", () => {
        return "audio state: " + RecursionAudio.state;
    }, "show audio state");

    registerCommand("backend", () => {
        return "renderer: " + window.renderer?.backend;
    }, "show renderer backend");

    function drawConsole(ctx, w, h) {
        const y0 = h - CON_H;

        ctx.fillStyle = "rgba(10,10,20,0.92)";
        ctx.fillRect(0, y0, w, CON_H);

        ctx.strokeStyle = "#333366";
        ctx.lineWidth   = 1;
        ctx.strokeRect(0, y0, w, CON_H);

        ctx.font = FONT;
        const visibleLines = Math.floor((CON_H - LINE_H - PAD * 2) / LINE_H);
        const start = Math.max(0, logs.length - visibleLines - scrollOffset);
        const end   = Math.min(logs.length, start + visibleLines);

        for (let i = start; i < end; i++) {
            const entry = logs[i];
            const ly    = y0 + PAD + (i - start) * LINE_H + LINE_H;
            ctx.fillStyle = entry.color;
            ctx.fillText(entry.msg.substring(0, Math.floor(w / 7)), PAD, ly);
        }

        const inputY = y0 + CON_H - PAD - 2;
        ctx.fillStyle = "rgba(20,20,40,0.95)";
        ctx.fillRect(0, inputY - LINE_H, w, LINE_H + PAD);
        ctx.fillStyle = "#5555ff";
        ctx.fillText("> " + inputBuffer + "█", PAD, inputY);
    }

    function drawInspector(ctx, w, h) {
        ctx.fillStyle = "rgba(10,10,20,0.92)";
        ctx.fillRect(w - INS_W, 0, INS_W, h);

        ctx.strokeStyle = "#333366";
        ctx.lineWidth   = 1;
        ctx.strokeRect(w - INS_W, 0, INS_W, h);

        ctx.font      = FONT;
        ctx.fillStyle = "#5555ff";
        ctx.fillText("INSPECTOR", w - INS_W + PAD, LINE_H + PAD);

        ctx.strokeStyle = "#333366";
        ctx.beginPath();
        ctx.moveTo(w - INS_W, LINE_H + PAD * 2);
        ctx.lineTo(w, LINE_H + PAD * 2);
        ctx.stroke();

        let ly = LINE_H * 2 + PAD * 3;

        ctx.fillStyle = "#aaaaff";
        ctx.fillText("ENGINE", w - INS_W + PAD, ly); ly += LINE_H;

        ctx.fillStyle = "#e0e0ff";
        ctx.fillText("frame: " + Module._recursion_get_frame_count(), w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillText("width: " + Module._recursion_get_width(),       w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillText("height: " + Module._recursion_get_height(),     w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillText("heap: " + (Module.HEAPU8.length / 1024).toFixed(0) + " KB", w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillText("backend: " + (window.renderer?.backend ?? "?"), w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillText("audio: " + RecursionAudio.state,                w - INS_W + PAD, ly); ly += LINE_H * 1.5;

        ctx.fillStyle = "#aaaaff";
        ctx.fillText("SCENE", w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillStyle = "#e0e0ff";
        const entities = RecursionOS.Scene.getAll();
        ctx.fillText("entities: " + entities.length, w - INS_W + PAD, ly); ly += LINE_H;
        for (const e of entities.slice(0, 6)) {
            const comps = Object.keys(e.components).join(", ") || "none";
            ctx.fillText(`  [${e.id}] ${e.tags[0] ?? ""} (${comps})`.substring(0, 26), w - INS_W + PAD, ly);
            ly += LINE_H;
        }
        if (entities.length > 6) { ctx.fillText(`  ...+${entities.length - 6} more`, w - INS_W + PAD, ly); ly += LINE_H; }

        ly += LINE_H * 0.5;
        ctx.fillStyle = "#aaaaff";
        ctx.fillText("WATCH", w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillStyle = "#e0e0ff";
        for (const [name, fn] of Object.entries(watchVars)) {
            let val;
            try { val = fn(); } catch { val = "?"; }
            ctx.fillText(`  ${name}: ${String(val).substring(0, 18)}`, w - INS_W + PAD, ly);
            ly += LINE_H;
        }

        ctx.fillStyle = "#aaaaff";
        ly += LINE_H * 0.5;
        ctx.fillText("FILESYSTEM", w - INS_W + PAD, ly); ly += LINE_H;
        ctx.fillStyle = "#e0e0ff";
        const files = RecursionFS.listDir("/").slice(0, 6);
        for (const f of files) {
            ctx.fillText("  " + f.substring(0, 24), w - INS_W + PAD, ly);
            ly += LINE_H;
        }
    }

    function drawTabs(ctx, w, h) {
        const tabs  = ["console", "inspector"];
        const TAB_W = 70;
        const TAB_H = 16;
        const y0    = h - CON_H - TAB_H;

        for (let i = 0; i < tabs.length; i++) {
            const tx = i * TAB_W;
            ctx.fillStyle = tabs[i] === activeTab ? "#1a1a3e" : "#0a0a18";
            ctx.fillRect(tx, y0, TAB_W, TAB_H);
            ctx.strokeStyle = "#333366";
            ctx.strokeRect(tx, y0, TAB_W, TAB_H);
            ctx.fillStyle = tabs[i] === activeTab ? "#e0e0ff" : "#666688";
            ctx.font      = FONT;
            ctx.fillText(tabs[i], tx + PAD, y0 + TAB_H - PAD + 2);
        }
    }

    function handleKey(e) {
        if (!visible) return false;

        if (e.key === "Enter") {
            log("> " + inputBuffer, "#888899");
            runCommand(inputBuffer);
            inputBuffer = "";
            return true;
        }
        if (e.key === "Backspace") {
            inputBuffer = inputBuffer.slice(0, -1);
            return true;
        }
        if (e.key === "ArrowUp") {
            scrollOffset = Math.min(scrollOffset + 1, Math.max(0, logs.length - 1));
            return true;
        }
        if (e.key === "ArrowDown") {
            scrollOffset = Math.max(0, scrollOffset - 1);
            return true;
        }
        if (e.key.length === 1) {
            inputBuffer += e.key;
            return true;
        }
        return false;
    }

    function handleClick(x, y, w, h) {
        if (!visible) return false;
        const tabs  = ["console", "inspector"];
        const TAB_W = 70;
        const TAB_H = 16;
        const y0    = h - CON_H - TAB_H;

        for (let i = 0; i < tabs.length; i++) {
            const tx = i * TAB_W;
            if (x >= tx && x <= tx + TAB_W && y >= y0 && y <= y0 + TAB_H) {
                activeTab = tabs[i];
                return true;
            }
        }
        return false;
    }

    function draw(ctx, w, h) {
        if (!visible) return;
        if (activeTab === "console")   drawConsole(ctx, w, h);
        if (activeTab === "inspector") drawInspector(ctx, w, h);
        drawTabs(ctx, w, h);
    }

    const Build = (() => {

        async function bundle(outputName = "bundle.json") {
            const manifest = {
                version:   1,
                timestamp: Date.now(),
                files:     [],
            };

            const paths = RecursionFS.listDir("/");
            for (const path of paths) {
                const data = RecursionFS.readFile(path);
                if (data === null) continue;

                let encoded;
                if (typeof data === "string") {
                    encoded = { type: "text", data };
                } else if (data instanceof ArrayBuffer) {
                    encoded = { type: "binary", data: bufferToBase64(data) };
                } else {
                    encoded = { type: "json", data: JSON.stringify(data) };
                }

                manifest.files.push({ path, ...encoded });
            }

            const json = JSON.stringify(manifest);
            RecursionFS.writeText("/" + outputName, json);
            log("Bundled " + manifest.files.length + " files → /" + outputName, "#aaffaa");
            return manifest;
        }

        async function loadBundle(url) {
            const res      = await fetch(url);
            const manifest = await res.json();

            for (const entry of manifest.files) {
                if (entry.type === "text") {
                    RecursionFS.writeText(entry.path, entry.data);
                } else if (entry.type === "binary") {
                    RecursionFS.writeBinary(entry.path, base64ToBuffer(entry.data));
                } else if (entry.type === "json") {
                    RecursionFS.writeText(entry.path, entry.data);
                }
            }

            log("Loaded bundle: " + manifest.files.length + " files", "#aaffaa");
            return manifest;
        }

        function exportBundle(outputName = "bundle.json") {
            const text = RecursionFS.readText("/" + outputName);
            if (!text) { log("No bundle found, run Build.bundle() first", "#ff4444"); return; }
            const blob = new Blob([text], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = outputName;
            a.click();
            URL.revokeObjectURL(url);
            log("Exported " + outputName, "#aaffaa");
        }

        function bufferToBase64(buffer) {
            const bytes  = new Uint8Array(buffer);
            let binary   = "";
            for (const b of bytes) binary += String.fromCharCode(b);
            return btoa(binary);
        }

        function base64ToBuffer(b64) {
            const binary = atob(b64);
            const bytes  = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes.buffer;
        }

        return { bundle, loadBundle, exportBundle };

    })();

    return {
        show, hide, toggle, isVisible,
        log, warn, error, info,
        registerCommand, runCommand,
        watch, unwatch,
        handleKey, handleClick, draw,
        Build,
    };

})();