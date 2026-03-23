var Module = {
    onRuntimeInitialized: async function () {
        Module._recursion_init();

        await RecursionFS.initDB();
        await RecursionFS.restoreAll();
        RecursionFS.exposeToWASM();
        RecursionNet.exposeToWASM();
        RecursionAudio.init();
        RecursionStore.loadInstalled();

        const width  = Module._recursion_get_width();
        const height = Module._recursion_get_height();

        const canvas = document.getElementById("recursion");
        canvas.width  = width;
        canvas.height = height;

        RecursionNet.Browser.enableDragDrop(canvas, file => {
            RecursionFS.writeBinary("/dropped/" + file.name, file.buffer);
            RecursionTools.log("Dropped: " + file.name + " (" + file.size + " bytes)");
        });

        const renderer = await createRenderer(canvas, width, height);
        window.renderer = renderer;

        const osCanvas = document.createElement("canvas");
        osCanvas.width  = width;
        osCanvas.height = height;
        const osCtx = osCanvas.getContext("2d");

        let lastTime = performance.now();
        let frame    = 0;
        let lastFPS  = 0;
        let fpsTimer = 0;
        let fpsCount = 0;

        RecursionTools.watch("fps",     () => lastFPS);
        RecursionTools.watch("frame",   () => Module._recursion_get_frame_count());
        RecursionTools.watch("audio",   () => RecursionAudio.state);
        RecursionTools.watch("backend", () => window.renderer?.backend);

        RecursionTools.log("Recursion 1.0 booted", "#aaffaa");
        RecursionTools.log("Press F1 to toggle tools", "#aaaaff");

        document.addEventListener("keydown", e => {
            if (e.key === "F1") { e.preventDefault(); RecursionTools.toggle(); return; }
            if (RecursionTools.handleKey(e)) return;
            e.preventDefault();
            Module._recursion_key_down(e.keyCode);
        });

        document.addEventListener("keyup", e => {
            Module._recursion_key_up(e.keyCode);
        });

        canvas.addEventListener("mousemove", e => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            Module._recursion_mouse_move(x, y, e.movementX, e.movementY);
            RecursionOS.handleMouseMove(x, y);
        });

        canvas.addEventListener("mousedown", e => {
            const rect = canvas.getBoundingClientRect();
            const x    = e.clientX - rect.left;
            const y    = e.clientY - rect.top;
            Module._recursion_mouse_button(e.button, 1);
            RecursionTools.handleClick(x, y, width, height);
            RecursionOS.handleMouseDown(x, y);
            RecursionAudio.resume();
        });

        canvas.addEventListener("mouseup", e => {
            Module._recursion_mouse_button(e.button, 0);
            RecursionOS.handleMouseUp();
        });

        canvas.addEventListener("click", () => {
            canvas.requestPointerLock();
        });

        document.addEventListener("pointerlockchange", () => {
            const locked = document.pointerLockElement === canvas ? 1 : 0;
            Module._recursion_set_pointer_locked(locked);
        });

        function loop(now) {
            const dt = Math.min((now - lastTime) / 1000.0, 0.1);
            lastTime  = now;

            fpsCount++;
            fpsTimer += dt;
            if (fpsTimer >= 1.0) {
                lastFPS  = fpsCount;
                fpsCount = 0;
                fpsTimer = 0;
            }

            Module._recursion_set_delta(dt);
            while (Module._recursion_should_fixed_update()) {}
            Module._recursion_tick(frame++);

            const fbPtr = Module._recursion_get_framebuffer();
            const fb    = new Uint8Array(Module.HEAPU8.buffer, fbPtr, width * height * 4);

            renderer.uploadFramebuffer(fb);
            renderer.drawFramebuffer();

            osCtx.clearRect(0, 0, width, height);
            RecursionOS.tick(osCtx, width, height, dt);
            RecursionTools.draw(osCtx, width, height);

            const imageData = osCtx.getImageData(0, 0, width, height);
            renderer.uploadFramebuffer(imageData.data);
            renderer.drawFramebuffer();

            requestAnimationFrame(loop);
        }

        requestAnimationFrame(loop);
    }
};

async function createRenderer(canvas, width, height) {
    if (navigator.gpu) {
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                const device = await adapter.requestDevice();
                return createWebGPURenderer(canvas, width, height, device);
            }
        } catch (e) {
            console.warn("WebGPU failed, falling back to WebGL:", e);
        }
    }
    return createWebGLRenderer(canvas, width, height);
}

function createWebGLRenderer(canvas, width, height) {
    const gl = canvas.getContext("webgl");
    if (!gl) throw new Error("WebGL not supported");

    const vsSource = `
        attribute vec2 a_pos;
        attribute vec2 a_uv;
        varying vec2 v_uv;
        void main() {
            gl_Position = vec4(a_pos, 0.0, 1.0);
            v_uv = a_uv;
        }
    `;

    const fsSource = `
        precision mediump float;
        varying vec2 v_uv;
        uniform sampler2D u_tex;
        void main() {
            gl_FragColor = texture2D(u_tex, v_uv);
        }
    `;

    const vsPrimitive = `
        attribute vec2 a_pos;
        uniform vec2 u_resolution;
        void main() {
            vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
            gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        }
    `;

    const fsPrimitive = `
        precision mediump float;
        uniform vec4 u_color;
        void main() {
            gl_FragColor = u_color;
        }
    `;

    function compileShader(src, type) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
    }

    function linkProgram(vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, compileShader(vs, gl.VERTEX_SHADER));
        gl.attachShader(p, compileShader(fs, gl.FRAGMENT_SHADER));
        gl.linkProgram(p);
        return p;
    }

    const texProgram  = linkProgram(vsSource, fsSource);
    const primProgram = linkProgram(vsPrimitive, fsPrimitive);

    const quadVerts = new Float32Array([
        -1, -1,  0, 1,
         1, -1,  1, 1,
        -1,  1,  0, 0,
         1,  1,  1, 0,
    ]);

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const primBuf = gl.createBuffer();

    let fbData = null;

    function uploadFramebuffer(pixels) {
        fbData = pixels;
    }

    function drawFramebuffer() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, fbData);

        gl.useProgram(texProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);

        const aPos = gl.getAttribLocation(texProgram, "a_pos");
        const aUV  = gl.getAttribLocation(texProgram, "a_uv");

        gl.enableVertexAttribArray(aPos);
        gl.enableVertexAttribArray(aUV);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(aUV,  2, gl.FLOAT, false, 16, 8);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function drawRect(x, y, w, h, r, g, b, a) {
        const x2 = x + w;
        const y2 = y + h;
        const verts = new Float32Array([
            x,  y,
            x2, y,
            x,  y2,
            x2, y2,
        ]);

        gl.useProgram(primProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, primBuf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

        const aPos = gl.getAttribLocation(primProgram, "a_pos");
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(gl.getUniformLocation(primProgram, "u_resolution"), width, height);
        gl.uniform4f(gl.getUniformLocation(primProgram, "u_color"), r/255, g/255, b/255, a/255);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.BLEND);
    }

    function drawLine(x1, y1, x2, y2, r, g, b, a) {
        const verts = new Float32Array([x1, y1, x2, y2]);

        gl.useProgram(primProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, primBuf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

        const aPos = gl.getAttribLocation(primProgram, "a_pos");
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(gl.getUniformLocation(primProgram, "u_resolution"), width, height);
        gl.uniform4f(gl.getUniformLocation(primProgram, "u_color"), r/255, g/255, b/255, a/255);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, 2);
        gl.disable(gl.BLEND);
    }

    function drawSprite(imgTexture, x, y, w, h) {
        const x1 = (x / width)  * 2 - 1;
        const y1 = -((y / height) * 2 - 1);
        const x2 = ((x + w) / width)  * 2 - 1;
        const y2 = -(((y + h) / height) * 2 - 1);

        const verts = new Float32Array([
            x1, y1,  0, 1,
            x2, y1,  1, 1,
            x1, y2,  0, 0,
            x2, y2,  1, 0,
        ]);

        gl.useProgram(texProgram);
        gl.bindTexture(gl.TEXTURE_2D, imgTexture);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

        const aPos = gl.getAttribLocation(texProgram, "a_pos");
        const aUV  = gl.getAttribLocation(texProgram, "a_uv");
        gl.enableVertexAttribArray(aPos);
        gl.enableVertexAttribArray(aUV);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(aUV,  2, gl.FLOAT, false, 16, 8);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.BLEND);
    }

    function createSpriteFromImage(src, cb) {
        const img = new Image();
        img.onload = () => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            cb(t);
        };
        img.src = src;
    }

    return { uploadFramebuffer, drawFramebuffer, drawRect, drawLine, drawSprite, createSpriteFromImage, backend: "webgl" };
}

function createWebGPURenderer(canvas, width, height, device) {
    const context = canvas.getContext("webgpu");
    const format  = navigator.gpu.getPreferredCanvasFormat();

    context.configure({ device, format, alphaMode: "opaque" });

    const shaderSrc = `
        @group(0) @binding(0) var u_sampler: sampler;
        @group(0) @binding(1) var u_texture: texture_2d<f32>;

        struct VertOut {
            @builtin(position) pos: vec4f,
            @location(0) uv: vec2f,
        };

        @vertex
        fn vs_main(@builtin(vertex_index) idx: u32) -> VertOut {
            var pos = array<vec2f, 4>(
                vec2f(-1.0, -1.0),
                vec2f( 1.0, -1.0),
                vec2f(-1.0,  1.0),
                vec2f( 1.0,  1.0),
            );
            var uv = array<vec2f, 4>(
                vec2f(0.0, 1.0),
                vec2f(1.0, 1.0),
                vec2f(0.0, 0.0),
                vec2f(1.0, 0.0),
            );
            var out: VertOut;
            out.pos = vec4f(pos[idx], 0.0, 1.0);
            out.uv  = uv[idx];
            return out;
        }

        @fragment
        fn fs_main(in: VertOut) -> @location(0) vec4f {
            return textureSample(u_texture, u_sampler, in.uv);
        }
    `;

    const module = device.createShaderModule({ code: shaderSrc });

    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex:   { module, entryPoint: "vs_main" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-strip" },
    });

    const sampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest" });

    let gpuTexture = device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    let bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: gpuTexture.createView() },
        ],
    });

    let fbData = null;

    function uploadFramebuffer(pixels) {
        fbData = pixels;
    }

    function drawFramebuffer() {
        if (!fbData) return;

        device.queue.writeTexture(
            { texture: gpuTexture },
            fbData,
            { bytesPerRow: width * 4 },
            [width, height]
        );

        const encoder = device.createCommandEncoder();
        const pass    = encoder.beginRenderPass({
            colorAttachments: [{
                view:       context.getCurrentTexture().createView(),
                loadOp:     "clear",
                storeOp:    "store",
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
            }]
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }

    function drawRect(x, y, w, h, r, g, b, a) {
        console.warn("drawRect not yet implemented for WebGPU");
    }

    function drawLine(x1, y1, x2, y2, r, g, b, a) {
        console.warn("drawLine not yet implemented for WebGPU");
    }

    function drawSprite(texture, x, y, w, h) {
        console.warn("drawSprite not yet implemented for WebGPU");
    }

    function createSpriteFromImage(src, cb) {
        console.warn("createSpriteFromImage not yet implemented for WebGPU");
    }

    return { uploadFramebuffer, drawFramebuffer, drawRect, drawLine, drawSprite, createSpriteFromImage, backend: "webgpu" };
}