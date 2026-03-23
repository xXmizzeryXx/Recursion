const RecursionOS = (() => {

    const windows   = [];
    const apps      = {};
    let   nextWinId = 1;
    let   focusedId = null;

    const TITLE_H   = 20;
    const BORDER    = 2;
    const BTN_W     = 14;

    function createWindow(title, x, y, w, h, appId) {
        const win = {
            id:      nextWinId++,
            title,
            x, y, w, h,
            appId,
            visible:   true,
            minimized: false,
            canvas:    document.createElement("canvas"),
            ctx:       null,
            dragging:  false,
            resizing:  false,
            dragOffX:  0,
            dragOffY:  0,
        };
        win.canvas.width  = w;
        win.canvas.height = h;
        win.ctx           = win.canvas.getContext("2d");
        windows.push(win);
        focusedId = win.id;
        return win.id;
    }

    function destroyWindow(id) {
        const idx = windows.findIndex(w => w.id === id);
        if (idx !== -1) windows.splice(idx, 1);
        if (focusedId === id) focusedId = windows.length ? windows[windows.length - 1].id : null;
    }

    function getWindow(id) {
        return windows.find(w => w.id === id) ?? null;
    }

    function focusWindow(id) {
        const idx = windows.findIndex(w => w.id === id);
        if (idx === -1) return;
        const win = windows.splice(idx, 1)[0];
        windows.push(win);
        focusedId = id;
    }

    function moveWindow(id, x, y) {
        const win = getWindow(id);
        if (win) { win.x = x; win.y = y; }
    }

    function resizeWindow(id, w, h) {
        const win = getWindow(id);
        if (!win) return;
        win.w             = w;
        win.h             = h;
        win.canvas.width  = w;
        win.canvas.height = h;
    }

    function minimizeWindow(id) {
        const win = getWindow(id);
        if (win) win.minimized = !win.minimized;
    }

    function drawChrome(ctx, win) {
        const focused = win.id === focusedId;

        ctx.fillStyle = focused ? "#1a1a2e" : "#111118";
        ctx.fillRect(0, 0, win.w, TITLE_H);

        ctx.fillStyle = focused ? "#e0e0ff" : "#888899";
        ctx.font      = "12px monospace";
        ctx.fillText(win.title, 8, 14);

        ctx.fillStyle = "#cc3333";
        ctx.fillRect(win.w - BTN_W - 4, 4, BTN_W, TITLE_H - 8);

        ctx.fillStyle = "#ccaa00";
        ctx.fillRect(win.w - BTN_W * 2 - 8, 4, BTN_W, TITLE_H - 8);

        ctx.strokeStyle = focused ? "#5555ff" : "#333344";
        ctx.lineWidth   = BORDER;
        ctx.strokeRect(1, 1, win.w - 2, win.h - 2);
    }

    function drawWindows(hostCtx, hostW, hostH) {
        for (const win of windows) {
            if (!win.visible || win.minimized) continue;
            drawChrome(win.ctx, win);
            hostCtx.drawImage(win.canvas, win.x, win.y);
        }
    }

    function handleMouseDown(x, y) {
        for (let i = windows.length - 1; i >= 0; i--) {
            const win = windows[i];
            if (!win.visible || win.minimized) continue;

            if (x >= win.x && x <= win.x + win.w && y >= win.y && y <= win.y + win.h) {
                focusWindow(win.id);

                const lx = x - win.x;
                const ly = y - win.y;

                if (ly < TITLE_H) {
                    if (lx >= win.w - BTN_W - 4 && lx <= win.w - 4) {
                        destroyWindow(win.id);
                        return;
                    }
                    if (lx >= win.w - BTN_W * 2 - 8 && lx <= win.w - BTN_W - 8) {
                        minimizeWindow(win.id);
                        return;
                    }
                    win.dragging = true;
                    win.dragOffX = lx;
                    win.dragOffY = ly;
                }

                const nearRight  = lx >= win.w - 8;
                const nearBottom = ly >= win.h - 8;
                if (nearRight || nearBottom) {
                    win.resizing = true;
                    win.dragging = false;
                }

                return;
            }
        }
    }

    function handleMouseMove(x, y) {
        for (const win of windows) {
            if (win.dragging) {
                win.x = x - win.dragOffX;
                win.y = y - win.dragOffY;
            }
            if (win.resizing) {
                const newW = Math.max(100, x - win.x);
                const newH = Math.max(60,  y - win.y);
                resizeWindow(win.id, newW, newH);
            }
        }
    }

    function handleMouseUp() {
        for (const win of windows) {
            win.dragging = false;
            win.resizing = false;
        }
    }

    const UI = (() => {

        function drawPanel(ctx, x, y, w, h, color = "#16213e") {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#333366";
            ctx.lineWidth   = 1;
            ctx.strokeRect(x, y, w, h);
        }

        function drawText(ctx, text, x, y, color = "#e0e0ff", size = 12) {
            ctx.fillStyle = color;
            ctx.font      = `${size}px monospace`;
            ctx.fillText(text, x, y);
        }

        function drawButton(ctx, label, x, y, w, h, hovered = false) {
            ctx.fillStyle = hovered ? "#3333aa" : "#222266";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#5555ff";
            ctx.lineWidth   = 1;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = "#e0e0ff";
            ctx.font      = "11px monospace";
            ctx.fillText(label, x + 6, y + h / 2 + 4);
        }

        function hitTest(mx, my, x, y, w, h) {
            return mx >= x && mx <= x + w && my >= y && my <= y + h;
        }

        return { drawPanel, drawText, drawButton, hitTest };
    })();

    const Sandbox = (() => {

        function createApp(id, initFn) {
            if (apps[id]) return;
            apps[id] = {
                id,
                state:    {},
                messages: [],
                alive:    true,
                init:     initFn,
            };
            initFn(apps[id].state);
        }

        function destroyApp(id) {
            if (apps[id]) apps[id].alive = false;
            delete apps[id];
        }

        function sendMessage(fromId, toId, msg) {
            if (!apps[toId]) return;
            apps[toId].messages.push({ from: fromId, ...msg });
        }

        function tickApp(id, ctx, dt) {
            const app = apps[id];
            if (!app || !app.alive) return;
            if (app.tick) app.tick(app.state, ctx, dt, app.messages.splice(0));
        }

        function getApp(id) {
            return apps[id] ?? null;
        }

        return { createApp, destroyApp, sendMessage, tickApp, getApp };
    })();

    const Scene = (() => {

        let nextEntityId = 1;
        const entities   = {};

        function createEntity(tags = []) {
            const id = nextEntityId++;
            entities[id] = { id, tags, components: {}, active: true };
            return id;
        }

        function destroyEntity(id) {
            delete entities[id];
        }

        function addComponent(entityId, name, data) {
            if (!entities[entityId]) return;
            entities[entityId].components[name] = data;
        }

        function getComponent(entityId, name) {
            return entities[entityId]?.components[name] ?? null;
        }

        function removeComponent(entityId, name) {
            if (entities[entityId]) delete entities[entityId].components[name];
        }

        function hasComponent(entityId, name) {
            return !!(entities[entityId]?.components[name]);
        }

        function query(...componentNames) {
            return Object.values(entities).filter(e =>
                e.active && componentNames.every(n => n in e.components)
            );
        }

        function queryTag(tag) {
            return Object.values(entities).filter(e => e.active && e.tags.includes(tag));
        }

        function setActive(id, active) {
            if (entities[id]) entities[id].active = active;
        }

        function getAll() {
            return Object.values(entities);
        }

        function clear() {
            for (const id of Object.keys(entities)) delete entities[id];
            nextEntityId = 1;
        }

        return {
            createEntity, destroyEntity,
            addComponent, getComponent, removeComponent, hasComponent,
            query, queryTag, setActive, getAll, clear,
        };

    })();

    function tick(hostCtx, hostW, hostH, dt) {
        for (const win of windows) {
            if (!win.visible || win.minimized) continue;
            win.ctx.clearRect(0, TITLE_H, win.w, win.h - TITLE_H);
            if (win.appId) Sandbox.tickApp(win.appId, win.ctx, dt);
        }
        drawWindows(hostCtx, hostW, hostH);
    }

    return {
        createWindow, destroyWindow, getWindow,
        focusWindow, moveWindow, resizeWindow, minimizeWindow,
        handleMouseDown, handleMouseMove, handleMouseUp,
        drawWindows, tick,
        UI, Sandbox, Scene,
    };

})();