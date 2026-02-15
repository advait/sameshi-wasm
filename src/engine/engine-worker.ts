import { createEngineAdapter } from "./adapter";
import { attachWorkerRuntime } from "./worker-runtime";

declare const self: DedicatedWorkerGlobalScope & {
  __SAMESHI_WASM_PATH?: string;
};

async function bootstrap(): Promise<void> {
  const wasmPath = self.__SAMESHI_WASM_PATH ?? `${import.meta.env.BASE_URL}wasm/sameshi-engine.wasm`;
  const adapter = await createEngineAdapter({ wasmPath });
  attachWorkerRuntime(self, adapter);
}

void bootstrap().catch((error) => {
  console.error("[engine-worker] bootstrap failed", error);
  throw error;
});
