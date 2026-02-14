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
source /tmp/emsdk/emsdk_env.sh
make -C upstream wasm \
  WASM_OUT_DIR=../artifacts/wasm \
  WASM_BASENAME=sameshi-engine \
  SOURCE_DATE_EPOCH=1704067200
```

Or use project helper:

```bash
./scripts/build-wasm.sh
```

Expected artifact:

- `artifacts/wasm/sameshi-engine.wasm`
