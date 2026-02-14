import { describe, expect, it } from "bun:test";

import { createWorkerMessageHandler, EngineWorkerResponse } from "../src/engine/worker-protocol";
import { EngineAdapter } from "../src/engine/adapter";

describe("worker protocol", () => {
  it("returns success responses for requests", async () => {
    const adapter: EngineAdapter = {
      setPosition() {},
      generateMoves() {
        return ["e2e4", "g1f3"];
      },
      bestMove() {
        return { move: "e2e4", depth: 3 };
      },
      isInCheck() {
        return false;
      },
      sideToMove() {
        return "w";
      },
      stop() {},
    };

    const responses: EngineWorkerResponse[] = [];
    const handler = createWorkerMessageHandler(adapter, (response) => responses.push(response));

    await handler({ type: "request", id: 7, method: "generateMoves" });

    expect(responses).toEqual([
      {
        type: "response",
        id: 7,
        ok: true,
        result: ["e2e4", "g1f3"],
      },
    ]);
  });

  it("supports cancellation and stop semantics", async () => {
    let stopCalls = 0;

    const adapter = {
      setPosition() {},
      generateMoves() {
        return [];
      },
      async bestMove() {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { move: "e2e4", depth: 5 };
      },
      isInCheck() {
        return false;
      },
      sideToMove() {
        return "w" as const;
      },
      stop() {
        stopCalls += 1;
      },
    } as unknown as EngineAdapter;

    const responses: EngineWorkerResponse[] = [];
    const handler = createWorkerMessageHandler(adapter, (response) => responses.push(response));

    const inFlight = handler({ type: "request", id: 9, method: "bestMove", params: { depth: 5 } });
    await new Promise((resolve) => setTimeout(resolve, 1));
    await handler({ type: "cancel", id: 9 });
    await inFlight;

    expect(stopCalls).toBe(1);
    expect(responses).toEqual([
      {
        type: "response",
        id: 9,
        ok: false,
        error: {
          code: "canceled",
          message: "request canceled",
        },
      },
    ]);
  });
});
