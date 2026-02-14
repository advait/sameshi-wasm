import { beforeAll, describe, expect, it } from "bun:test";

import { loadShimWasmExports } from "../src/engine/wasm-loader";

beforeAll(() => {
  const build = Bun.spawnSync(["bash", "-lc", "./scripts/build-wasm.sh"]);
  if (build.exitCode !== 0) {
    throw new Error(`WASM build failed: ${new TextDecoder().decode(build.stderr)}`);
  }
});

describe("wasm loader", () => {
  it("loads real shim exports from compiled wasm", async () => {
    const exportsObj = await loadShimWasmExports({ wasmPath: "artifacts/wasm/sameshi-engine.wasm" });

    expect(exportsObj.memory).toBeInstanceOf(WebAssembly.Memory);
    expect(typeof exportsObj.shim_set_position).toBe("function");
    expect(typeof exportsObj.shim_generate_moves).toBe("function");
    expect(typeof exportsObj.shim_best_move).toBe("function");
  });

  it("fails when an extra required export is missing", async () => {
    await expect(
      loadShimWasmExports({
        wasmPath: "artifacts/wasm/sameshi-engine.wasm",
        requiredExports: ["memory", "shim_set_position", "definitely_missing_export"],
      }),
    ).rejects.toThrow("WASM export missing: definitely_missing_export");
  });
});
