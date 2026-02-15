import { createEngineAdapter } from "./adapter";
import { attachWorkerRuntime } from "./worker-runtime";
import wasmAssetUrl from "../../artifacts/wasm/sameshi-engine.wasm?url";

declare const self: DedicatedWorkerGlobalScope & {
  __SAMESHI_WASM_PATH?: string;
};

async function bootstrap(): Promise<void> {
  const wasmPath = self.__SAMESHI_WASM_PATH ?? wasmAssetUrl;
  const adapter = await createEngineAdapter({ wasmPath });
  attachWorkerRuntime(self, adapter);
}

void bootstrap();
