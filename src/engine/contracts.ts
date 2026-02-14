export enum ShimErrorCode {
  OK = 0,
  INVALID_FEN = 1,
  UNSUPPORTED_RULE = 2,
  OUT_OF_CONTRACT = 3,
  BUFFER_TOO_SMALL = 4,
  ENGINE_STATE = 5,
  CANCELED = 6,
}

export type SideToMove = "w" | "b";

export interface BestMoveResult {
  move: string;
  score?: number;
  depth?: number;
}

export class EngineBoundaryError extends Error {
  readonly code: ShimErrorCode;
  readonly operation: string;

  constructor(code: ShimErrorCode, operation: string, message?: string) {
    super(message ?? `${operation} failed (${ShimErrorCode[code] ?? code})`);
    this.name = "EngineBoundaryError";
    this.code = code;
    this.operation = operation;
  }
}

export function normalizeShimErrorCode(value: number): ShimErrorCode {
  const code = Math.abs(value);
  if (code in ShimErrorCode) {
    return code as ShimErrorCode;
  }
  return ShimErrorCode.ENGINE_STATE;
}

export function shimErrorMessage(code: ShimErrorCode): string {
  switch (code) {
    case ShimErrorCode.OK:
      return "ok";
    case ShimErrorCode.INVALID_FEN:
      return "invalid_fen";
    case ShimErrorCode.UNSUPPORTED_RULE:
      return "unsupported_rule";
    case ShimErrorCode.OUT_OF_CONTRACT:
      return "out_of_contract";
    case ShimErrorCode.BUFFER_TOO_SMALL:
      return "buffer_too_small";
    case ShimErrorCode.ENGINE_STATE:
      return "engine_state";
    case ShimErrorCode.CANCELED:
      return "canceled";
    default:
      return "unknown";
  }
}
