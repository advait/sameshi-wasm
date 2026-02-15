import { Chess, type Move, type Square } from "chess.js";
import { Chessground } from "chessground";
import type { Key } from "chessground/types";

import { WorkerEngineClient } from "./engine/worker-client";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "./styles.css";

const ENGINE_DEPTH = 3;
const STANDARD_LITE_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Missing #app root element");
}

appRoot.innerHTML = `
  <main class="app-shell">
    <section class="board-panel">
      <div class="board-frame">
        <div id="board" data-testid="board"></div>
      </div>
      <p class="status" id="status" data-testid="status"></p>
      <p class="feedback" id="feedback" data-testid="feedback"></p>
    </section>
    <section class="control-panel">
      <h1>Sameshi WASM</h1>
      <p class="subhead">Human plays White. Engine plays Black.</p>
      <form id="move-form" class="move-form">
        <label for="move-input">Move (UCI)</label>
        <div class="move-form-row">
          <input id="move-input" data-testid="move-input" autocomplete="off" spellcheck="false" placeholder="e2e4" />
          <button id="make-move" data-testid="make-move" type="submit">Make Move</button>
        </div>
      </form>
      <div class="actions">
        <button id="new-game" data-testid="new-game" type="button">New Game</button>
      </div>
      <div class="meta-grid">
        <div>
          <h2>Ply Count</h2>
          <p id="ply-count" data-testid="ply-count">0</p>
        </div>
        <div>
          <h2>FEN</h2>
          <p id="fen" data-testid="fen"></p>
        </div>
      </div>
      <div class="history">
        <h2>Move History</h2>
        <ol id="ply-history" data-testid="ply-history"></ol>
      </div>
    </section>
  </main>
`;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element as T;
}

const boardElement = requiredElement<HTMLDivElement>("board");
const statusElement = requiredElement<HTMLParagraphElement>("status");
const feedbackElement = requiredElement<HTMLParagraphElement>("feedback");
const fenElement = requiredElement<HTMLParagraphElement>("fen");
const plyCountElement = requiredElement<HTMLParagraphElement>("ply-count");
const historyElement = requiredElement<HTMLOListElement>("ply-history");
const moveInput = requiredElement<HTMLInputElement>("move-input");
const moveForm = requiredElement<HTMLFormElement>("move-form");
const newGameButton = requiredElement<HTMLButtonElement>("new-game");

const game = new Chess(STANDARD_LITE_START_FEN);
const playedPlies: string[] = [];
let lastMove: [Key, Key] | undefined;
let engineReady = false;
let engineThinking = false;
let disposed = false;
let engineBootError: string | null = null;
let inFlightSearch: AbortController | null = null;

const wasmPath = `${import.meta.env.BASE_URL}wasm/sameshi-engine.wasm`;
const worker = new Worker(new URL("./engine/engine-worker.ts", import.meta.url), { type: "module" });
worker.postMessage({ type: "init", wasmPath });
const engine = new WorkerEngineClient(worker);

const ground = Chessground(boardElement, {
  orientation: "white",
  fen: game.fen(),
  movable: {
    free: false,
    color: "white",
    dests: buildDests(),
    events: {
      after: (orig, dest) => {
        void handleHumanMove(orig, dest);
      },
    },
  },
});

function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function toStandardLiteFen(fen: string): string {
  const parts = fen.split(" ");
  if (parts.length !== 6) {
    return fen;
  }

  parts[2] = "-";
  parts[3] = "-";
  return parts.join(" ");
}

function normalizeGameToStandardLite(): void {
  game.load(toStandardLiteFen(game.fen()));
}

function parseUciMove(uci: string): { from: Square; to: Square; promotion?: "q" | "r" | "b" | "n" } | null {
  const normalized = uci.trim().toLowerCase();
  const match = normalized.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) {
    return null;
  }

  return {
    from: match[1] as Square,
    to: match[2] as Square,
    promotion: match[3] as "q" | "r" | "b" | "n" | undefined,
  };
}

function buildDests(): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const move of game.moves({ verbose: true })) {
    const from = move.from as Key;
    const to = move.to as Key;
    const fromDests = dests.get(from);
    if (fromDests) {
      fromDests.push(to);
    } else {
      dests.set(from, [to]);
    }
  }
  return dests;
}

function checkColor(): "white" | "black" | false {
  if (!game.isCheck()) {
    return false;
  }
  return game.turn() === "w" ? "white" : "black";
}

function canHumanMove(): boolean {
  return engineReady && !engineThinking && game.turn() === "w" && !game.isGameOver();
}

function gameStatus(): string {
  if (engineBootError) {
    return "Engine failed to boot.";
  }

  if (!engineReady) {
    return "Booting engine...";
  }

  if (engineThinking) {
    return "Engine is thinking...";
  }

  if (game.isCheckmate()) {
    return game.turn() === "w" ? "Checkmate. Black won." : "Checkmate. White won.";
  }

  if (game.isDraw()) {
    if (game.isStalemate()) {
      return "Draw by stalemate.";
    }
    if (game.isInsufficientMaterial()) {
      return "Draw by insufficient material.";
    }
    if (game.isThreefoldRepetition()) {
      return "Draw by repetition.";
    }
    if (game.isDrawByFiftyMoves()) {
      return "Draw by fifty-move rule.";
    }
    return "Draw.";
  }

  return game.turn() === "w" ? "Your move (White)." : "Engine to move (Black).";
}

function setFeedback(value: string): void {
  feedbackElement.textContent = value;
}

function renderHistory(): void {
  historyElement.replaceChildren();

  for (let index = 0; index < playedPlies.length; index += 1) {
    const item = document.createElement("li");
    item.dataset.plyIndex = String(index + 1);
    item.textContent = `${index + 1}. ${playedPlies[index]}`;
    historyElement.appendChild(item);
  }
}

function syncBoard(): void {
  const humanCanPlay = canHumanMove();

  ground.set({
    fen: game.fen(),
    check: checkColor(),
    turnColor: game.turn() === "w" ? "white" : "black",
    lastMove,
    movable: {
      free: false,
      color: humanCanPlay ? "white" : undefined,
      dests: humanCanPlay ? buildDests() : new Map<Key, Key[]>(),
    },
  });

  statusElement.textContent = gameStatus();
  fenElement.textContent = game.fen();
  plyCountElement.textContent = String(playedPlies.length);
  renderHistory();
}

async function playHumanMove(from: Square, to: Square, promotion: "q" | "r" | "b" | "n" = "q"): Promise<boolean> {
  if (!canHumanMove()) {
    setFeedback("Wait for your turn.");
    syncBoard();
    return false;
  }

  try {
    const move = game.move({ from, to, promotion });
    normalizeGameToStandardLite();
    lastMove = [move.from as Key, move.to as Key];
    playedPlies.push(moveToUci(move));
    setFeedback(`You played ${moveToUci(move)}.`);
    syncBoard();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Illegal move";
    setFeedback(message);
    syncBoard();
    return false;
  }
}

async function engineTurn(): Promise<void> {
  if (!engineReady || disposed || game.turn() !== "b" || game.isGameOver()) {
    syncBoard();
    return;
  }

  engineThinking = true;
  syncBoard();

  inFlightSearch?.abort();
  const controller = new AbortController();
  inFlightSearch = controller;

  try {
    await engine.setPosition(toStandardLiteFen(game.fen()), controller.signal);
    const best = await engine.bestMove(ENGINE_DEPTH, controller.signal);
    if (controller.signal.aborted || disposed) {
      return;
    }

    if (!best) {
      setFeedback("Engine returned no move.");
      return;
    }

    const parsed = parseUciMove(best.move);
    if (!parsed) {
      throw new Error(`Engine returned invalid move "${best.move}"`);
    }

    const move = game.move({
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion ?? "q",
    });
    normalizeGameToStandardLite();
    lastMove = [move.from as Key, move.to as Key];
    playedPlies.push(moveToUci(move));
    setFeedback(`Engine played ${moveToUci(move)}${best.depth ? ` at depth ${best.depth}` : ""}.`);
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown engine failure";
    setFeedback(`Engine error: ${message}`);
  } finally {
    if (inFlightSearch === controller) {
      inFlightSearch = null;
      engineThinking = false;
    }
    syncBoard();
  }
}

async function handleHumanMove(orig: string, dest: string): Promise<void> {
  const played = await playHumanMove(orig as Square, dest as Square);
  if (played) {
    await engineTurn();
  }
}

moveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const parsed = parseUciMove(moveInput.value);
  if (!parsed) {
    setFeedback("Move must be UCI format, for example e2e4.");
    return;
  }

  moveInput.value = "";
  void (async () => {
    const played = await playHumanMove(parsed.from, parsed.to, parsed.promotion ?? "q");
    if (played) {
      await engineTurn();
    }
  })();
});

async function resetGame(): Promise<void> {
  inFlightSearch?.abort();
  inFlightSearch = null;
  engineThinking = false;
  game.load(STANDARD_LITE_START_FEN);
  playedPlies.length = 0;
  lastMove = undefined;
  moveInput.value = "";
  setFeedback("New game started.");

  if (engineReady) {
    try {
      await engine.setPosition(toStandardLiteFen(game.fen()));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reset engine state";
      setFeedback(`Engine error: ${message}`);
    }
  }

  syncBoard();
}

newGameButton.addEventListener("click", () => {
  void resetGame();
});

worker.addEventListener("error", (event) => {
  engineReady = false;
  engineBootError = event.message || "Worker crashed";
  const message = event.message || "Worker crashed";
  setFeedback(`Engine worker error: ${message}`);
  syncBoard();
});

worker.addEventListener("messageerror", () => {
  engineBootError = "Worker message decode error";
  setFeedback("Engine worker sent an unreadable message.");
  syncBoard();
});

worker.addEventListener("message", (event) => {
  const data = event.data as {
    type?: string;
    error?: string;
    wasmPath?: string;
  };

  if (data?.type !== "bootstrap-error") {
    return;
  }

  engineReady = false;
  engineBootError = data.error ?? "worker bootstrap error";
  const wasmPathUsed = data.wasmPath ?? "unknown";
  setFeedback(`Engine bootstrap failed at ${wasmPathUsed}: ${engineBootError}`);
  syncBoard();
});

async function bootEngine(): Promise<void> {
  engineBootError = null;
  try {
    await engine.setPosition(toStandardLiteFen(game.fen()));
    engineReady = true;
    engineBootError = null;
    setFeedback("Engine ready.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup failure";
    engineBootError = message;
    setFeedback(`Engine failed to start: ${message}`);
  } finally {
    syncBoard();
  }
}

window.addEventListener("pagehide", () => {
  disposed = true;
  inFlightSearch?.abort();
  engine.dispose();
  worker.terminate();
});

syncBoard();
void bootEngine();
