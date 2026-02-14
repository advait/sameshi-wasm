import { BestMoveResult, SideToMove } from "./contracts";
import { EngineWorkerResponse } from "./worker-protocol";

interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class WorkerEngineClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly onMessage: (event: { data: unknown }) => void;

  constructor(private readonly worker: WorkerLike) {
    this.onMessage = (event) => {
      const message = event.data as EngineWorkerResponse;
      if (!message || typeof message !== "object" || message.type !== "response") {
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.ok) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      }
    };

    worker.addEventListener("message", this.onMessage);
  }

  dispose(): void {
    for (const [id, pending] of this.pending) {
      pending.reject(new Error(`request ${id} disposed`));
    }
    this.pending.clear();
    this.worker.removeEventListener("message", this.onMessage);
  }

  private request<T>(method: string, params?: unknown, signal?: AbortSignal): Promise<T> {
    const id = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: (value) => resolve(value as T),
        reject,
      };

      this.pending.set(id, pending);

      if (signal) {
        if (signal.aborted) {
          this.pending.delete(id);
          this.worker.postMessage({ type: "cancel", id });
          reject(new Error("aborted"));
          return;
        }

        const abortListener = () => {
          if (this.pending.has(id)) {
            this.worker.postMessage({ type: "cancel", id });
          }
        };
        signal.addEventListener("abort", abortListener, { once: true });
      }

      this.worker.postMessage({ type: "request", id, method, params });
    });
  }

  async setPosition(fen: string, signal?: AbortSignal): Promise<void> {
    await this.request("setPosition", { fen }, signal);
  }

  generateMoves(signal?: AbortSignal): Promise<string[]> {
    return this.request("generateMoves", undefined, signal);
  }

  bestMove(depth?: number, signal?: AbortSignal): Promise<BestMoveResult | null> {
    return this.request("bestMove", depth === undefined ? undefined : { depth }, signal);
  }

  isInCheck(signal?: AbortSignal): Promise<boolean> {
    return this.request("isInCheck", undefined, signal);
  }

  sideToMove(signal?: AbortSignal): Promise<SideToMove> {
    return this.request("sideToMove", undefined, signal);
  }
}
