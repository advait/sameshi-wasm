export interface ShimWasmExports {
  memory: WebAssembly.Memory;
  shim_input_ptr: () => number;
  shim_input_capacity: () => number;
  shim_output_ptr: () => number;
  shim_output_capacity: () => number;
  shim_last_error: () => number;
  shim_side_to_move: () => number;
  shim_error_message?: (code: number) => number;
  shim_request_stop: () => void;
  shim_clear_stop: () => void;
  shim_set_position: () => number;
  shim_generate_moves: () => number;
  shim_best_move: (depth: number) => number;
  shim_is_in_check: () => number;
}

type InstantiateResult =
  | WebAssembly.WebAssemblyInstantiatedSource
  | { instance: { exports: Record<string, unknown> } };

export interface LoadShimWasmOptions {
  wasmPath?: string | URL;
  wasmBinary?: ArrayBuffer | Uint8Array;
  imports?: WebAssembly.Imports;
  requiredExports?: string[];
  instantiate?: (
    binary: BufferSource,
    imports: WebAssembly.Imports,
  ) => Promise<InstantiateResult>;
}

const DEFAULT_REQUIRED_EXPORTS = [
  "memory",
  "shim_input_ptr",
  "shim_input_capacity",
  "shim_output_ptr",
  "shim_output_capacity",
  "shim_last_error",
  "shim_side_to_move",
  "shim_request_stop",
  "shim_clear_stop",
  "shim_set_position",
  "shim_generate_moves",
  "shim_best_move",
  "shim_is_in_check",
];

async function readWasmBinary(path: string | URL): Promise<ArrayBuffer> {
  const target = path instanceof URL ? path.toString() : path;

  if (typeof Bun !== "undefined") {
    return Bun.file(target).arrayBuffer();
  }

  const response = await fetch(target);
  if (!response.ok) {
    throw new Error(`Unable to load wasm from ${target}: ${response.status}`);
  }
  return response.arrayBuffer();
}

function asBufferSource(binary: ArrayBuffer | Uint8Array): BufferSource {
  if (binary instanceof Uint8Array) {
    return binary;
  }
  return new Uint8Array(binary);
}

function assertRequiredExports(exportsObj: Record<string, unknown>, required: string[]): void {
  for (const name of required) {
    if (!(name in exportsObj)) {
      throw new Error(`WASM export missing: ${name}`);
    }
  }
}

export async function loadShimWasmExports(options: LoadShimWasmOptions = {}): Promise<ShimWasmExports> {
  const imports = options.imports ?? {};

  const binary = options.wasmBinary
    ? asBufferSource(options.wasmBinary)
    : await readWasmBinary(
        options.wasmPath ?? new URL("../../artifacts/wasm/sameshi-engine.wasm", import.meta.url),
      );

  const instantiate = options.instantiate ?? WebAssembly.instantiate;
  const instantiated = await instantiate(binary, imports);
  const exportsObj = (instantiated.instance?.exports ?? {}) as Record<string, unknown>;

  assertRequiredExports(exportsObj, options.requiredExports ?? DEFAULT_REQUIRED_EXPORTS);

  return exportsObj as unknown as ShimWasmExports;
}
