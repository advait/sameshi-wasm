import { createEngineAdapter } from "./adapter";
import { attachWorkerRuntime } from "./worker-runtime";

declare const self: DedicatedWorkerGlobalScope & {
  __SAMESHI_WASM_PATH?: string;
};

async function bootstrap(): Promise<void> {
  const wasmPath =
    self.__SAMESHI_WASM_PATH ?? new URL("../../artifacts/wasm/sameshi-engine.wasm", import.meta.url);
  const adapter = await createEngineAdapter({ wasmPath });
  attachWorkerRuntime(self, adapter);
}

void bootstrap();
