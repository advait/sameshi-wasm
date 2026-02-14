# Sameshi WASM Spec

## Objective
Build a browser-playable Sameshi integration with minimal custom C code by compiling Sameshi directly to WebAssembly and delegating most product behavior to TypeScript UI/game logic.

## Scope
- In scope: direct WASM engine integration, TypeScript adapter, Web Worker execution, frontend board integration, automated tests.
- Out of scope: UCI protocol shim and external UCI GUI compatibility.

## Architecture
### High-level flow
1. `upstream/` remains the source chess engine implementation.
2. A thin C shim exposes stable exported functions for WASM consumption.
3. Emscripten builds a browser-consumable WASM module.
4. A TypeScript engine adapter runs WASM in a dedicated Web Worker.
5. The UI layer handles rendering, interaction, history, and UX feedback.

### Responsibility split
- WASM (engine): move generation, best-move search, check detection, engine legality checks for engine-facing operations.
- TypeScript (app/UI): board rendering, user interaction, move list/history, clocks/settings, status presentation, persistence, and orchestration.

## Confirmed Decisions
1. Rules authority: TypeScript owns UI state/history, but WASM legality is authoritative for engine-facing actions to prevent search/input drift.
2. Position contract: v1 contract uses `FEN + side-to-move + optional move history`; optimize later only if profiling demands it.
3. Variant policy: ship as explicit `standard-lite` and disable unsupported actions instead of pretending full orthodox chess support.
4. Concurrency model: run WASM in a dedicated Web Worker from day 1 with request IDs and cancellation/stop semantics.
5. API surface: expose both move-generation and best-move functions in v1 to enable parity checks and flexible integration.

## Data Contract (v1)
Input:
- FEN string plus search/options payload where needed.

Outputs:
- `generateMoves`: array of engine move strings.
- `bestMove`: best move string plus optional score/depth metadata.
- `isInCheck`: boolean check state for current side.

Error model:
- Explicit typed errors for invalid FEN, unsupported-rule requests, and out-of-contract calls.

## Testing Strategy
### Bun + WASM tests
- Use Bun test runner for unit and integration tests around the TypeScript adapter and WASM boundary.
- Bun WASM prerequisites validated from docs:
1. runtime exposes the global `WebAssembly` API;
2. built-in loaders support `.wasm` modules.
- Core integration checks:
1. module loads and initializes reliably;
2. FEN round-trip correctness through adapter calls;
3. deterministic engine responses for fixed test positions/depth;
4. error handling for malformed FEN and unsupported-rule scenarios;
5. parity checks between `generateMoves` and `bestMove` legality.

### UI tests
- Component-level tests for board interaction/state projection (move input, highlights, status messages, disabled unsupported actions).
- End-to-end browser tests (Playwright) verify:
1. app boots with worker-backed WASM engine;
2. user move -> engine reply loop works;
3. illegal move UX is correct;
4. game state/history updates and remains consistent after multiple plies.

### CI intent
- Fast suite: Bun unit tests plus selected adapter integration tests on every push.
- Full suite: browser E2E tests on PRs and release branches.

## Implementation Phases
### Phase 1: Engine Boundary and Build
- Define minimal C shim function signatures and error conventions.
- Add Emscripten Makefile target for WASM artifacts.
- Produce reproducible local build command and artifact layout.

### Phase 2: TypeScript Engine Adapter
- Implement WASM loader and typed adapter API.
- Add Web Worker runtime and request/response protocol with cancellation.
- Add Bun integration tests for adapter and boundary behavior.

### Phase 3: Frontend Integration
- Wire adapter into chess UI flow.
- Enforce `standard-lite` UX constraints in controls and validation messages.
- Add component tests for user interaction and state transitions.

### Phase 4: End-to-End Validation
- Add Playwright scenarios for real browser behavior.
- Validate stability/performance under repeated search calls.
- Finalize regression suites and CI test matrix.

## Notes on Bun Research
- Bun documentation confirms runtime `WebAssembly` global availability and `.wasm` loader support, making Bun-based WASM integration tests viable.
- Reference: https://bun.sh/docs/runtime/globals
- Reference: https://bun.sh/docs/runtime/loaders
