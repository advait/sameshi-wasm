import {
  BestMoveResult,
  EngineBoundaryError,
  normalizeShimErrorCode,
  ShimErrorCode,
  shimErrorMessage,
  SideToMove,
} from "./contracts";
import { loadShimWasmExports, LoadShimWasmOptions, ShimWasmExports } from "./wasm-loader";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export interface EngineAdapter {
  setPosition(fen: string): void;
  generateMoves(): string[];
  bestMove(options?: { depth?: number }): BestMoveResult | null;
  isInCheck(): boolean;
  sideToMove(): SideToMove;
  stop(): void;
}

function parseCString(memory: Uint8Array, ptr: number, capacity: number): string {
  const end = ptr + capacity;
  let index = ptr;
  while (index < end && memory[index] !== 0) {
    index += 1;
  }
  return DECODER.decode(memory.subarray(ptr, index));
}

function parseBestMovePayload(payload: string): BestMoveResult | null {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  const [move, scoreRaw, depthRaw] = trimmed.split(/\s+/);
  const result: BestMoveResult = { move };

  if (scoreRaw !== undefined) {
    const score = Number.parseInt(scoreRaw, 10);
    if (!Number.isNaN(score)) {
      result.score = score;
    }
  }

  if (depthRaw !== undefined) {
    const depth = Number.parseInt(depthRaw, 10);
    if (!Number.isNaN(depth)) {
      result.depth = depth;
    }
  }

  return result;
}

function throwForCode(operation: string, statusCode: number): never {
  const code = normalizeShimErrorCode(statusCode);
  throw new EngineBoundaryError(code, operation, `${operation}: ${shimErrorMessage(code)}`);
}

export function createEngineAdapterFromExports(exportsObj: ShimWasmExports): EngineAdapter {
  const inputPtr = exportsObj.shim_input_ptr();
  const inputCapacity = exportsObj.shim_input_capacity();
  const outputPtr = exportsObj.shim_output_ptr();
  const outputCapacity = exportsObj.shim_output_capacity();

  const getMemory = (): Uint8Array => new Uint8Array(exportsObj.memory.buffer);

  const writeInput = (value: string): void => {
    const bytes = ENCODER.encode(value);
    if (bytes.length + 1 > inputCapacity) {
      throw new EngineBoundaryError(
        ShimErrorCode.OUT_OF_CONTRACT,
        "setPosition",
        `input exceeds boundary capacity (${inputCapacity})`,
      );
    }

    const memory = getMemory();
    memory.set(bytes, inputPtr);
    memory[inputPtr + bytes.length] = 0;
  };

  const readOutput = (): string => {
    const memory = getMemory();
    return parseCString(memory, outputPtr, outputCapacity);
  };

  return {
    setPosition(fen: string): void {
      writeInput(fen);
      const code = exportsObj.shim_set_position();
      if (code !== ShimErrorCode.OK) {
        throwForCode("setPosition", code);
      }
    },

    generateMoves(): string[] {
      const result = exportsObj.shim_generate_moves();
      if (result < 0) {
        throwForCode("generateMoves", result);
      }

      const output = readOutput().trim();
      if (!output) {
        return [];
      }

      return output
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    },

    bestMove(options?: { depth?: number }): BestMoveResult | null {
      const depth = options?.depth ?? 5;
      const result = exportsObj.shim_best_move(depth);
      if (result < 0) {
        throwForCode("bestMove", result);
      }

      return parseBestMovePayload(readOutput());
    },

    isInCheck(): boolean {
      const result = exportsObj.shim_is_in_check();
      if (result < 0) {
        throwForCode("isInCheck", result);
      }
      return result === 1;
    },

    sideToMove(): SideToMove {
      const result = exportsObj.shim_side_to_move();
      if (result === 1) {
        return "w";
      }
      if (result === -1) {
        return "b";
      }
      throw new EngineBoundaryError(ShimErrorCode.ENGINE_STATE, "sideToMove", "invalid side value");
    },

    stop(): void {
      exportsObj.shim_request_stop();
    },
  };
}

export async function createEngineAdapter(options?: LoadShimWasmOptions): Promise<EngineAdapter> {
  const exportsObj = await loadShimWasmExports(options);
  return createEngineAdapterFromExports(exportsObj);
}
