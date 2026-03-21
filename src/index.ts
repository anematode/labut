import createModule from './native/chess_api.js';
import type { MainModule, ChessGame } from './native/chess_api.d.ts';

export type { MainModule, ChessGame };

let modulePromise: Promise<MainModule> | null = null;

/** Initialize the WASM module. Safe to call multiple times — returns the same promise. */
export function init(): Promise<MainModule> {
  if (!modulePromise) {
    modulePromise = createModule().then((mod) => {
      mod.initChess();
      return mod;
    });
  }
  return modulePromise;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Create a new ChessGame. Calls init() automatically if needed. */
export async function createGame(fen: string = START_FEN, isChess960 = false): Promise<ChessGame> {
  const mod = await init();
  const game = new mod.ChessGame(fen, isChess960);
  if (game.hasErr()) {
    const err = game.getErr();
    game.delete();
    throw new Error(err);
  }
  return game;
}
