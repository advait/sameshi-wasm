import { EngineBoundaryError } from "./contracts";
import { EngineAdapter } from "./adapter";

export type EngineWorkerMethod =
  | "setPosition"
  | "generateMoves"
  | "bestMove"
  | "isInCheck"
  | "sideToMove";

export type EngineWorkerRequest = {
  type: "request";
  id: number;
  method: EngineWorkerMethod;
  params?: unknown;
};

export type EngineWorkerCancel = {
  type: "cancel";
  id: number;
};

export type EngineWorkerMessage = EngineWorkerRequest | EngineWorkerCancel;

export type EngineWorkerSuccess = {
  type: "response";
  id: number;
  ok: true;
  result: unknown;
};

export type EngineWorkerFailure = {
  type: "response";
  id: number;
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type EngineWorkerResponse = EngineWorkerSuccess | EngineWorkerFailure;

function isRequestMessage(value: unknown): value is EngineWorkerRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<EngineWorkerRequest>;
  return candidate.type === "request" && typeof candidate.id === "number" && typeof candidate.method === "string";
}

function isCancelMessage(value: unknown): value is EngineWorkerCancel {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<EngineWorkerCancel>;
  return candidate.type === "cancel" && typeof candidate.id === "number";
}

function normalizeError(error: unknown): EngineWorkerFailure["error"] {
  if (error instanceof EngineBoundaryError) {
    return {
      code: `boundary:${error.code}`,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return { code: "runtime", message: error.message };
  }

  return { code: "runtime", message: "Unknown worker error" };
}

async function invoke(adapter: EngineAdapter, method: EngineWorkerMethod, params?: unknown): Promise<unknown> {
  switch (method) {
    case "setPosition": {
      const fen = (params as { fen?: string } | undefined)?.fen;
      if (typeof fen !== "string") {
        throw new Error("setPosition requires { fen: string }");
      }
      adapter.setPosition(fen);
      return null;
    }

    case "generateMoves":
      return adapter.generateMoves();

    case "bestMove": {
      const depth = (params as { depth?: number } | undefined)?.depth;
      return adapter.bestMove(depth === undefined ? undefined : { depth });
    }

    case "isInCheck":
      return adapter.isInCheck();

    case "sideToMove":
      return adapter.sideToMove();

    default:
      throw new Error(`Unsupported worker method: ${method satisfies never}`);
  }
}

export function createWorkerMessageHandler(
  adapter: EngineAdapter,
  postResponse: (message: EngineWorkerResponse) => void,
): (message: unknown) => Promise<void> {
  const responded = new Set<number>();

  const sendCanceled = (id: number): void => {
    if (responded.has(id)) {
      return;
    }

    responded.add(id);
    postResponse({
      type: "response",
      id,
      ok: false,
      error: {
        code: "canceled",
        message: "request canceled",
      },
    });
  };

  return async (message: unknown): Promise<void> => {
    if (isCancelMessage(message)) {
      adapter.stop();
      sendCanceled(message.id);
      return;
    }

    if (!isRequestMessage(message)) {
      return;
    }

    try {
      const result = await invoke(adapter, message.method, message.params);
      if (!responded.has(message.id)) {
        responded.add(message.id);
        postResponse({
          type: "response",
          id: message.id,
          ok: true,
          result,
        });
      }
    } catch (error) {
      if (!responded.has(message.id)) {
        responded.add(message.id);
        postResponse({
          type: "response",
          id: message.id,
          ok: false,
          error: normalizeError(error),
        });
      }
    }
  };
}
