const Desktop = (() => {

    const windowArea = document.getElementById("windowarea");
    const taskbarWin = document.getElementById("taskbar-windows");
    const urlbar     = document.getElementById("urlbar");
    const goBtn      = document.getElementById("go-btn");
    const welcome    = document.getElementById("welcome");
    const clock      = document.getElementById("clock");

    const windows    = {};
    let   nextId     = 1;
    let   focusedId  = null;

    function updateClock() {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    setInterval(updateClock, 1000);
    updateClock();

    function proxyURL(url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        try {
            if (typeof __uv$config !== "undefined") {
                return __uv$config.prefix + __uv$config.encodeUrl(url);
            }
        } catch {}
        return url;
    }

    function createWindow(title, url, x, y, w, h) {
        welcome.style.display = "none";

        const id  = nextId++;
        const win = document.createElement("div");
        win.className = "win focused";
        win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${10 + id}`;

        const proxied = proxyURL(url);

        win.innerHTML = `
            <div class="win-titlebar">
                <button class="win-btn close"></button>
                <button class="win-btn minimize"></button>
                <button class="win-btn maximize"></button>
                <span class="win-title">${title}</span>
            </div>
            <div class="win-content">
                <iframe src="${proxied}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>
            </div>
            <div class="win-resize"></div>
        `;

        windowArea.appendChild(win);

        const titlebar = win.querySelector(".win-titlebar");
        const closeBtn = win.querySelector(".win-btn.close");
        const minBtn   = win.querySelector(".win-btn.minimize");
        const maxBtn   = win.querySelector(".win-btn.maximize");
        const resize   = win.querySelector(".win-resize");

        let dragging  = false;
        let resizing  = false;
        let offX = 0, offY = 0;
        let prevState = null;

        titlebar.addEventListener("mousedown", e => {
            if (e.target.classList.contains("win-btn")) return;
            dragging = true;
            offX = e.clientX - win.offsetLeft;
            offY = e.clientY - win.offsetTop;
            focusWindow(id);
            e.preventDefault();
        });

        resize.addEventListener("mousedown", e => {
            resizing = true;
            focusWindow(id);
            e.preventDefault();
        });

        document.addEventListener("mousemove", e => {
            if (dragging) {
                const area = windowArea.getBoundingClientRect();
                win.style.left = Math.max(0, Math.min(e.clientX - offX, area.width  - win.offsetWidth))  + "px";
                win.style.top  = Math.max(0, Math.min(e.clientY - offY, area.height - win.offsetHeight)) + "px";
            }
            if (resizing) {
                const area = windowArea.getBoundingClientRect();
                const newW = Math.max(300, e.clientX - win.getBoundingClientRect().left);
                const newH = Math.max(200, e.clientY - win.getBoundingClientRect().top);
                win.style.width  = Math.min(newW, area.width)  + "px";
                win.style.height = Math.min(newH, area.height) + "px";
            }
        });

        document.addEventListener("mouseup", () => {
            dragging = false;
            resizing = false;
        });

        closeBtn.addEventListener("click", () => destroyWindow(id));

        minBtn.addEventListener("click", () => {
            const content = win.querySelector(".win-content");
            const isMin   = content.style.display === "none";
            content.style.display = isMin ? "" : "none";
            win.querySelector(".win-resize").style.display = isMin ? "" : "none";
        });

        maxBtn.addEventListener("click", () => {
            if (prevState) {
                win.style.left   = prevState.left;
                win.style.top    = prevState.top;
                win.style.width  = prevState.width;
                win.style.height = prevState.height;
                prevState = null;
            } else {
                prevState = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
                win.style.left   = "0px";
                win.style.top    = "0px";
                win.style.width  = windowArea.offsetWidth  + "px";
                win.style.height = windowArea.offsetHeight + "px";
            }
        });

        win.addEventListener("mousedown", () => focusWindow(id));

        const tbBtn = document.createElement("button");
        tbBtn.className   = "taskbar-btn active";
        tbBtn.textContent = title;
        tbBtn.addEventListener("click", () => {
            const content = win.querySelector(".win-content");
            if (focusedId === id) {
                content.style.display = content.style.display === "none" ? "" : "none";
            } else {
                content.style.display = "";
                focusWindow(id);
            }
        });
        taskbarWin.appendChild(tbBtn);

        windows[id] = { win, tbBtn, title, url };
        focusWindow(id);
        return id;
    }

    function destroyWindow(id) {
        const w = windows[id];
        if (!w) return;
        w.win.remove();
        w.tbBtn.remove();
        delete windows[id];
        if (Object.keys(windows).length === 0) welcome.style.display = "";
    }

    function focusWindow(id) {
        for (const [wid, w] of Object.entries(windows)) {
            w.win.classList.toggle("focused", Number(wid) === id);
            w.tbBtn.classList.toggle("active", Number(wid) === id);
            w.win.style.zIndex = Number(wid) === id ? 999 : 10 + Number(wid);
        }
        focusedId = id;
    }

    function navigate(url) {
        const offset = Object.keys(windows).length * 24;
        const title  = url.replace(/^https?:\/\//, "").split("/")[0];
        createWindow(title, url, 20 + offset, 20 + offset, 1000, 580);
    }

    goBtn.addEventListener("click", () => {
        const url = urlbar.value.trim();
        if (url) navigate(url);
    });

    urlbar.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            const url = urlbar.value.trim();
            if (url) navigate(url);
        }
    });

    return { createWindow, destroyWindow, focusWindow, navigate };

})();