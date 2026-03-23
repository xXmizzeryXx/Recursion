# Recursion Architecture

Recursion consists of a WebAssembly engine, a JavaScript platform layer, and a browser-based runtime shell.

## Engine
The engine is written in C++ and compiled to WebAssembly. It exposes a framebuffer and update loop.

## Platform
The platform layer is written in JavaScript. It loads the WebAssembly module, manages memory, and renders the framebuffer to a canvas.

## Runtime
The runtime shell is a simple web environment that initializes the platform and displays output.
