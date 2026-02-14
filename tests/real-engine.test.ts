import { beforeAll, describe, expect, it } from "bun:test";

import { createEngineAdapter, EngineAdapter } from "../src/engine/adapter";
import { EngineBoundaryError, ShimErrorCode } from "../src/engine/contracts";

let adapter: EngineAdapter;

beforeAll(async () => {
  const build = Bun.spawnSync(["bash", "-lc", "./scripts/build-wasm.sh"]);
  if (build.exitCode !== 0) {
    throw new Error(`WASM build failed: ${new TextDecoder().decode(build.stderr)}`);
  }

  adapter = await createEngineAdapter({ wasmPath: "artifacts/wasm/sameshi-engine.wasm" });
});

describe("real wasm engine integration", () => {
  it("generates real legal moves from a known position", () => {
    adapter.setPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1");

    const moves = adapter.generateMoves();
    expect(moves.length).toBe(20);
    expect(moves).toContain("e2e4");
    expect(moves).toContain("g1f3");
  });

  it("returns deterministic best move from real search", () => {
    adapter.setPosition("4k3/3q4/8/8/8/8/3R4/4K3 w - - 0 1");

    const best = adapter.bestMove({ depth: 3 });
    expect(best).not.toBeNull();
    expect(best?.move).toBe("d2d7");
    expect(best?.depth).toBe(3);
  });

  it("detects real check state", () => {
    adapter.setPosition("k3r3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(adapter.isInCheck()).toBe(true);

    adapter.setPosition("k7/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(adapter.isInCheck()).toBe(false);
  });

  it("returns typed boundary errors for unsupported and invalid FEN", () => {
    expect(() => adapter.setPosition("8/8/8/8/8/8/8/8 w KQ - 0 1")).toThrow(EngineBoundaryError);
    expect(() => adapter.setPosition("bad fen")).toThrow(EngineBoundaryError);

    try {
      adapter.setPosition("8/8/8/8/8/8/8/8 w KQ - 0 1");
      throw new Error("expected error");
    } catch (error) {
      const boundary = error as EngineBoundaryError;
      expect(boundary.code).toBe(ShimErrorCode.UNSUPPORTED_RULE);
    }
  });
});
