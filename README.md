# ♾️ Recursion

A browser running inside the browser.

**Recursion** is a WebAssembly-powered engine designed to run a self-contained, Chromium-derived rendering core entirely inside a web page. It is a nested, portable, sandboxed browser runtime built to explore what happens when the web becomes its own platform.

---

## 🚀 Project Vision

Recursion aims to create a minimal, single-process browser engine that can execute HTML, CSS, and JavaScript inside another browser tab.

The long-term goal is to embed a stripped-down Chromium core into WebAssembly, enabling:

* A fully self-contained web runtime
* Deterministic, portable execution of web apps
* A true “browser-in-browser” environment
* A foundation for sandboxing, legacy web preservation, and experimental rendering research

Recursion is not an emulator. It is a real engine.

---

## 🧩 Architecture Overview

Recursion is built around three major components:

### 1. Engine Core (C++ → WebAssembly)

A minimal rendering and execution engine compiled to WASM.

Handles:

* Framebuffer rendering
* Event loop
* Input handling
* Platform abstraction
* (Future) HTML/CSS/JS parsing and layout

---

### 2. Platform Layer (JavaScript)

The host environment that connects the engine to the browser:

* Canvas / WebGL / WebGPU rendering
* Mouse / keyboard / gamepad input
* Networking bridge (fetch / WebSocket)
* Virtual filesystem (IndexedDB / memory)

---

### 3. Runtime Shell

A lightweight web app that:

* Loads the WASM engine
* Manages memory
* Displays output

---

## 📁 Repository Structure

recursion/
engine/        # C++ core compiled to WebAssembly
platform/      # JS glue layer (canvas, input, networking)
wasm/          # Emscripten build scripts and configs
examples/      # Small demos for testing the engine
docs/          # Architecture, design notes, roadmap
tools/         # Optional helper scripts
README.md

---

## 🧱 Current Status

Recursion is in early development.

### Current Goals (v0):

* WASM module with a framebuffer
* JS glue layer rendering to a <canvas>
* Basic input handling
* Minimal “fake OS” platform layer

Once the core loop is stable, integration of Chromium components begins.

---

## 🎯 Roadmap (High-Level)

* [ ] v0: WASM engine + framebuffer + input
* [ ] v1: Basic UI toolkit + text rendering
* [ ] v2: HTML/CSS parser prototype
* [ ] v3: Layout engine
* [ ] v4: JavaScript execution environment
* [ ] v5: Chromium-derived components
* [ ] v6: Fully nested browser runtime

---

## 🛠️ Development Setup

You’ll need:

* Emscripten SDK (C++ → WASM compiler)
* Node.js (local dev server + tooling)
* VS Code (recommended editor)
* Git

No Visual Studio or native Windows toolchains required.

---

## 📜 License

Recursion is licensed under the BSD 3-Clause License, following the same model as Chromium.

---

## 🤝 Contributing

Recursion is experimental and evolving.

Contributions, discussions, and ideas are welcome once the core engine stabilizes.

---

## ♾️ About the Name

Recursion represents the project’s core idea:

A browser that contains itself — a web engine running on the web.
