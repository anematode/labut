import { describe, it, expect, afterEach } from 'vitest';
import { init, type ChessGame, movesToSan, movesToLan } from '../index.ts';

const StartPos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export async function createGame(fen: string = StartPos, isChess960 = false): Promise<ChessGame> {
  const mod = await init();
  const game = new mod.ChessGame(fen, isChess960);
  if (game.hasErr()) {
    const err = game.getErr();
    game.delete();
    throw new Error(err);
  }
  return game;
}

describe('ChessGame', () => {
  let game: ChessGame;

  afterEach(() => {
    if (game && !game.isDeleted()) game.delete();
  });

  it('creates a game from the starting position', async () => {
    game = await createGame();
    expect(game.hasErr()).toBe(false);
  });

  it('plays LAN moves and outputs SAN', async () => {
    game = await createGame();
    const err = game.playMoves('e2e4 e7e5 g1f3 b8c6 f1b5', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('e4 e5 Nf3 Nc6 Bb5');
  });

  it('plays LAN moves and outputs LAN', async () => {
    game = await createGame();
    const err = game.playMoves('e2e4 e7e5 g1f3', true);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('e2e4 e7e5 g1f3');
  });

  it('accepts SAN piece moves (non-pawn)', async () => {
    // Use LAN for pawn moves, SAN for piece moves
    game = await createGame();
    const err = game.playMoves('e2e4 e7e5 Nf3 Nc6 Bb5', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('e4 e5 Nf3 Nc6 Bb5');
  });

  it('rejects illegal moves', async () => {
    game = await createGame();
    const err = game.playMoves('e2e4 e2e4', false);
    expect(game.getErr()).toContain("Illegal move: e2e4");
    expect(err).toBe(true);
    expect(game.hasErr()).toBe(true);
  });

  it('rejects goofy fens', async () => {
    await expect(createGame('not a fen')).rejects.toThrow();
  });

  it('resets to a new position', async () => {
    game = await createGame();
    game.playMoves('e2e4 e7e5', false);
    game.reset('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', false);
    expect(game.getErr()).toBe("");
    expect(game.hasErr()).toBe(false);
    const err = game.playMoves('d2d4 d7d5', false);
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('d4 d5');
  });

  it('handles castling', async () => {
    game = await createGame();
    const err = game.playMoves('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 O-O', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toContain('O-O');
  });

  it('handles pawn promotion', async () => {
    game = await createGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const err = game.playMoves('a8=Q', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('a8=Q+');
  });

  it('handles pawn capture', async () => {
    game = await createGame('4k3/q7/1P6/8/8/8/8/4K3 w - - 0 1');
    const err = game.playMoves('bxa7', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('bxa7');
  });

  it('handles pawn promotion-capture', async () => {
    game = await createGame('1q2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const err = game.playMoves('axb8=R', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('axb8=R+');
  });

  it('rejects chess960 castling in normal mode', async () => {
    game = await createGame('rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w KQkq - 4 11', false);
    const err = game.playMoves('e1g1', false);
    expect(game.getErr()).toContain("Illegal move: e1g1");
    expect(err).toBe(true);
  });

  it('handles chess960 castling', async () => {
    game = await createGame('rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w Gkq - 4 11', true);
    const err = game.playMoves('e1g1', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('O-O');
  });

  it('handles illegal chess960 castling', async () => {
    // Trying to castle with the H rook :woozy:
    game = await createGame('rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w Hkq - 4 11', true);
    const err = game.playMoves('e1g1', false);
    expect(game.getErr()).toContain("Illegal move: e1g1");
    expect(err).toBe(true);
  });

  it('handles ambiguous pawn capture', async () => {
    // Two pawns can capture on the same square
    game = await createGame('4k3/8/8/3p4/2P1P3/8/8/4K3 w - - 0 1');
    const err = game.playMoves('exd5', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('exd5');
  });

  it('handles double pawn push discovered check', async () => {
    // Bishop on c1 discovers check when pawn moves from d2 to d4
    game = await createGame('4k3/8/8/8/8/8/3P4/2B1K3 w - - 0 1');
    const err = game.playMoves('d2d4', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('d4');
  });

  it('handles en passant capture', async () => {
    game = await createGame('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1');
    const err = game.playMoves('exd6', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('exd6');
  });

  it('rejects invalid en passant with horizontal pin', async () => {
    // Pawn is pinned horizontally by rook, en passant would expose king
    game = await createGame('8/8/8/r2pP1K1/8/8/8/4k3 w - d6 0 1');
    const err = game.playMoves('exd6', false);
    expect(game.getErr()).toContain("Illegal move: exd6");
    expect(err).toBe(true);
  });

  it('handles en passant capture with stm in check by the to-be-captured pawn', async () => {
    // The pawn that just double-pushed is giving discovered check, and en passant resolves it
    game = await createGame('8/8/8/2K5/3pP3/8/8/4k3 b - e3 0 1');
    const err = game.playMoves('dxe3', false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe('dxe3');
  });

  it('rejects invalid en passant with stm in check', async () => {
    // King is in check from a piece, and en passant doesn't resolve it
    game = await createGame('4K3/8/8/8/3pP3/8/8/3Qk3 b - e3 0 1');
    const err = game.playMoves('dxe3', false);
    expect(game.getErr()).toContain("Illegal move: dxe3");
    expect(err).toBe(true);
  });
});

describe("movesToLan", async () => {
    await init();

    it('works on the evergreen game', () => {
        const result = movesToLan(StartPos, "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4 e5d4 e1g1 d4d3 d1b3 d8f6 e4e5 f6g6 f1e1 g8e7 c1a3 b7b5 b3b5 a8b8 b5a4 a5b6 b1d2 c8b7 d2e4 g6f5 c4d3 f5h5 e4f6 g7f6 e5f6 h8g8 a1d1 h5f3 e1e7 c6e7 a4d7 e8d7 d3f5 d7e8 f5d7 e8f8 a3e7".split(" "));

        expect(result.error).toBe(null);
        expect(result.moves.map(m => m.lan).join(" ")).toBe("e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#");
    });
});

describe("movesToSan", async () => {
    await init();

    it('works on the evergreen game', () => {
        const result = movesToSan(StartPos, "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#".split(" "));

        expect(result.error).toBe(null);
        expect(result.moves.map(m => m.san).join(" ")).toBe("e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4 e5d4 e1h1 d4d3 d1b3 d8f6 e4e5 f6g6 f1e1 g8e7 c1a3 b7b5 b3b5 a8b8 b5a4 a5b6 b1d2 c8b7 d2e4 g6f5 c4d3 f5h5 e4f6 g7f6 e5f6 h8g8 a1d1 h5f3 e1e7 c6e7 a4d7 e8d7 d3f5 d7e8 f5d7 e8f8 a3e7");
    });
});
