import { EngineAdapter } from "./adapter";
import { createWorkerMessageHandler, EngineWorkerMessage, EngineWorkerResponse } from "./worker-protocol";

export interface WorkerLikeEndpoint {
  postMessage(message: EngineWorkerResponse): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export function attachWorkerRuntime(endpoint: WorkerLikeEndpoint, adapter: EngineAdapter): () => void {
  const handleMessage = createWorkerMessageHandler(adapter, (response) => endpoint.postMessage(response));

  const listener = (event: { data: unknown }): void => {
    void handleMessage(event.data as EngineWorkerMessage);
  };

  endpoint.addEventListener("message", listener);
  return () => endpoint.removeEventListener("message", listener);
}
