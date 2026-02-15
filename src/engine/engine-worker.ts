import { createEngineAdapter } from "./adapter";
import { createWorkerMessageHandler, type EngineWorkerMessage, type EngineWorkerResponse } from "./worker-protocol";

declare const self: DedicatedWorkerGlobalScope & {
  __SAMESHI_WASM_PATH?: string;
};

type BootstrapErrorMessage = {
  type: "bootstrap-error";
  error: string;
  wasmPath: string;
};

type InitMessage = {
  type: "init";
  wasmPath: string;
};

function isRequestMessage(value: unknown): value is { type: "request"; id: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<{ type: string; id: number }>;
  return candidate.type === "request" && typeof candidate.id === "number";
}

function isInitMessage(value: unknown): value is InitMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<InitMessage>;
  return candidate.type === "init" && typeof candidate.wasmPath === "string";
}

let configuredWasmPath: string | null = null;

function resolveWasmPath(): string {
  if (configuredWasmPath) {
    return configuredWasmPath;
  }

  return self.__SAMESHI_WASM_PATH ?? `${import.meta.env.BASE_URL}wasm/sameshi-engine.wasm`;
}

const pendingMessages: EngineWorkerMessage[] = [];
let bootErrorMessage: string | null = null;
let bootPromise: Promise<void> | null = null;

const queueListener = (event: MessageEvent<unknown>): void => {
  const data = event.data;

  if (isInitMessage(data)) {
    configuredWasmPath = data.wasmPath;
    startBootstrap();
    return;
  }

  if (bootErrorMessage) {
    if (isRequestMessage(data)) {
      const response: EngineWorkerResponse = {
        type: "response",
        id: data.id,
        ok: false,
        error: {
          code: "bootstrap",
          message: bootErrorMessage,
        },
      };
      self.postMessage(response);
    }
    return;
  }

  pendingMessages.push(data as EngineWorkerMessage);
  startBootstrap();
};

self.addEventListener("message", queueListener);

function reportBootstrapError(wasmPath: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  bootErrorMessage = message;

  const payload: BootstrapErrorMessage = {
    type: "bootstrap-error",
    error: message,
    wasmPath,
  };
  self.postMessage(payload);
  console.error("[engine-worker] bootstrap failed", { wasmPath, error });
}

function startBootstrap(): void {
  if (bootPromise) {
    return;
  }

  bootPromise = bootstrap().catch((error) => {
    reportBootstrapError(resolveWasmPath(), error);
  });
}

async function bootstrap(): Promise<void> {
  const wasmPath = resolveWasmPath();
  console.info("[engine-worker] booting", { wasmPath });

  const adapter = await createEngineAdapter({ wasmPath });
  const handleMessage = createWorkerMessageHandler(adapter, (response) => self.postMessage(response));

  self.removeEventListener("message", queueListener);

  for (const message of pendingMessages.splice(0)) {
    await handleMessage(message);
  }

  self.addEventListener("message", (event: MessageEvent<unknown>) => {
    void handleMessage(event.data as EngineWorkerMessage);
  });
}
