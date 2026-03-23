import createModule from './native/chess_api.js';
import wasmUrl from './native/chess_api.wasm?url';
import type { MainModule, ChessGame } from './native/chess_api.d.ts';

export type { ChessGame };

let mod: MainModule;
let game: ChessGame;
let modulePromise: Promise<MainModule>;

export async function init() {
  const isNode = typeof process !== 'undefined';
  if (!modulePromise) {
    function locateFile() {
      if (!isNode) return wasmUrl;

      const path = require('path');
     return path.resolve(__dirname, './native/chess_api.wasm');
    }
    modulePromise = createModule({ locateFile }).then((m) => {
      mod = m;
      mod.initChess();
      return mod;
    });
  }
  return modulePromise;
};

/*
function getModule(): MainModule {
    if (!mod) throw new Error("Module not yet initialized! Must call init()");

    return mod;
}
*/

const StartPos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function getGameSingleton(): ChessGame {
    if (game) return game;

    if (!mod) throw new Error("Module not yet initialized! Must call init()");

    return (game = new mod.ChessGame(StartPos, true));
}

type File = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
type Rank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export type Square = `${File}${Rank}`;
export type Piece = "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K"

export type BaseMove = {
    //from: Square;
    //to: Square;
    //piece: Piece;

    //mr50Count: number;
    //repetition: number;
    //givesCheck: boolean;
};

export type SANMove = BaseMove & {
    // e.g. "a3b4"
    san: string;
};
export type LANMove = BaseMove & {
    // e.g. "Nxf3+"
    lan: string;
};

export type MoveConversionResult<T> = {
    moves: T[];
    error: string | null;
};

function movesToSanOrLan(fen: string, moves: string[], lan: boolean): MoveConversionResult<any> {
    let truncated = moves.length >= 1000;
    if (truncated) {
        moves = moves.slice(0, 1000);
    }

    const game = getGameSingleton();
    game.reset(fen, /*chess960=*/true);
    
    if (game.hasErr()) {
        return { moves: [], error: game.getErr() };
    }

    const joined = moves.join(" ");
    game.playMoves(joined, lan);

    const converted = game.getMovesString().split(' ');
    let err = game.hasErr() ? game.getErr() : null;

    const convertedResult: (SANMove | LANMove)[] = [];
    if (lan) {
        for (const mv of converted) convertedResult.push({ lan: mv });
    } else {
        for (const mv of converted) convertedResult.push({ san: mv });
    }
    
    return { moves: convertedResult, error: err };
}

/**
 * Consumes moves of any format (SAN or LAN) and attempts to play
 * them on the given FEN. The first illegal move ends the conversion,
 * but the sequence of moves leading up to it is still provided.
 * The validated moves are provided as a list.
 *
 * You must call and await init() before using this function.
 */
export function movesToSan(fen: string, moves: string[]): MoveConversionResult<SANMove> {
    return movesToSanOrLan(fen, moves, false);
}

/**
 * Consumes moves of any format (SAN or LAN) and attempts to play
 * them on the given FEN. The first illegal move ends the conversion,
 * but the sequence of moves leading up to it is still provided.
 *
 * You must call and await init() before using this function.
 */
export function movesToLan(fen: string, moves: string[]): MoveConversionResult<LANMove> {
    return movesToSanOrLan(fen, moves, true);
}
