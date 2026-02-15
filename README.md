# sameshi-wasm

A small WASM shim around the original sameshi chess engine to create a web-playable game.

## Live Demo

https://advait.github.io/sameshi-wasm/

## What This Project Does

This repository wraps the upstream `sameshi` chess engine for browser use by compiling it to WebAssembly and exposing a small JS/TS adapter layer. It then adds a web UI using Chessground so you can play locally in the browser as White against the engine playing Black.

In short:
- engine core: upstream `sameshi`
- runtime wrapper: WASM boundary + worker adapter in this repo
- frontend: Chessground-based playable web interface

## Upstream Engine

Original sameshi repository:

https://github.com/peterellisjones/sameshi

## Licensing

The licensing status of the upstream `sameshi` engine is currently unclear from this repository context and should be reviewed before reuse or redistribution of upstream code.

The wrapper code and web UI in this repository are MIT licensed. See `LICENSE`.
