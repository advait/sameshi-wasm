# WASM Build

Install Emscripten via `emsdk` (one-time):

```bash
git clone https://github.com/emscripten-core/emsdk.git /tmp/emsdk
cd /tmp/emsdk
./emsdk install latest
./emsdk activate latest
```

Build WASM artifact:

```bash
make -C upstream wasm \
  WASM_OUT_DIR=../artifacts/wasm \
  WASM_BASENAME=sameshi-engine \
  SOURCE_DATE_EPOCH=1704067200
```

`upstream/Makefile` will use `emcc` from `PATH` when available, or fall back to
`$EMSDK_ROOT/emsdk_env.sh` (default `/tmp/emsdk/emsdk_env.sh`).

Or use project helper:

```bash
./scripts/build-wasm.sh
```

Expected artifact:

- `artifacts/wasm/sameshi-engine.wasm`
