import { MainModule, ChessGame } from './native/chess_api.d.ts';
export type { ChessGame };
export declare function init(): Promise<MainModule>;
type File = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
type Rank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type Square = `${File}${Rank}`;
export type Piece = "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K";
export type BaseMove = {};
export type SANMove = BaseMove & {
    san: string;
};
export type LANMove = BaseMove & {
    lan: string;
};
export type MoveConversionResult<T> = {
    moves: T[];
    error: string | null;
};
/**
 * Consumes moves of any format (SAN or LAN) and attempts to play
 * them on the given FEN. The first illegal move ends the conversion,
 * but the sequence of moves leading up to it is still provided.
 * The validated moves are provided as a list.
 *
 * You must call and await init() before using this function.
 */
export declare function movesToSan(fen: string, moves: string[]): MoveConversionResult<SANMove>;
/**
 * Consumes moves of any format (SAN or LAN) and attempts to play
 * them on the given FEN. The first illegal move ends the conversion,
 * but the sequence of moves leading up to it is still provided.
 *
 * You must call and await init() before using this function.
 */
export declare function movesToLan(fen: string, moves: string[]): MoveConversionResult<LANMove>;
