import { describe, it, expect, afterEach } from "vitest";
import { init, type ChessGame, movesToSan, movesToLan } from "../index.ts";

const StartPos = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export async function createGame(
  fen: string = StartPos,
  isChess960 = false,
): Promise<ChessGame> {
  const mod = await init();
  const game = new mod.ChessGame(fen, isChess960);
  if (game.hasErr()) {
    const err = game.getErr();
    game.delete();
    throw new Error(err);
  }
  return game;
}

describe("ChessGame", () => {
  let game: ChessGame;

  afterEach(() => {
    if (game && !game.isDeleted()) game.delete();
  });

  it("creates a game from the starting position", async () => {
    game = await createGame();
    expect(game.hasErr()).toBe(false);
  });

  it("plays LAN moves and outputs SAN", async () => {
    game = await createGame();
    const err = game.playMoves("e2e4 e7e5 g1f3 b8c6 f1b5", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("e4 e5 Nf3 Nc6 Bb5");
  });

  it("plays LAN moves and outputs LAN", async () => {
    game = await createGame();
    const err = game.playMoves("e2e4 e7e5 g1f3", true);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("e2e4 e7e5 g1f3");
  });

  it("accepts SAN piece moves (non-pawn)", async () => {
    // Use LAN for pawn moves, SAN for piece moves
    game = await createGame();
    const err = game.playMoves("e2e4 e7e5 Nf3 Nc6 Bb5", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("e4 e5 Nf3 Nc6 Bb5");
  });

  it("rejects illegal moves", async () => {
    game = await createGame();
    const err = game.playMoves("e2e4 e2e4", false);
    expect(game.getErr()).toContain("Illegal move: e2e4");
    expect(err).toBe(true);
    expect(game.hasErr()).toBe(true);
  });

  it("rejects goofy fens", async () => {
    await expect(createGame("not a fen")).rejects.toThrow();
  });

  it("resets to a new position", async () => {
    game = await createGame();
    game.playMoves("e2e4 e7e5", false);
    game.reset(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      false,
    );
    expect(game.getErr()).toBe("");
    expect(game.hasErr()).toBe(false);
    const err = game.playMoves("d2d4 d7d5", false);
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("d4 d5");
  });

  it("handles castling", async () => {
    game = await createGame();
    const err = game.playMoves(
      "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 O-O",
      false,
    );
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toContain("O-O");
  });

  it("handles pawn promotion", async () => {
    game = await createGame("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const err = game.playMoves("a8=Q", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("a8=Q+");
  });

  it("handles pawn capture", async () => {
    game = await createGame("4k3/q7/1P6/8/8/8/8/4K3 w - - 0 1");
    const err = game.playMoves("bxa7", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("bxa7");
  });

  it("handles pawn promotion-capture", async () => {
    game = await createGame("1q2k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const err = game.playMoves("axb8=R", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("axb8=R+");
  });

  it("rejects chess960 castling in normal mode", async () => {
    game = await createGame(
      "rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w KQkq - 4 11",
      false,
    );
    const err = game.playMoves("e1g1", false);
    expect(game.getErr()).toContain("Illegal move: e1g1");
    expect(err).toBe(true);
  });

  it("handles chess960 castling", async () => {
    game = await createGame(
      "rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w Gkq - 4 11",
      true,
    );
    const err = game.playMoves("e1g1", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("O-O");
  });

  it("handles illegal chess960 castling", async () => {
    // Trying to castle with the H rook :woozy:
    game = await createGame(
      "rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w Hkq - 4 11",
      true,
    );
    const err = game.playMoves("e1g1", false);
    expect(game.getErr()).toContain("Illegal move: e1g1");
    expect(err).toBe(true);
  });

  it("handles ambiguous pawn capture", async () => {
    // Two pawns can capture on the same square
    game = await createGame("4k3/8/8/3p4/2P1P3/8/8/4K3 w - - 0 1");
    const err = game.playMoves("exd5", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("exd5");
  });

  it("handles double pawn push discovered check", async () => {
    // Bishop on c1 discovers check when pawn moves from d2 to d4
    game = await createGame("4k3/8/8/8/8/8/3P4/2B1K3 w - - 0 1");
    const err = game.playMoves("d2d4", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("d4");
  });

  it("handles en passant capture", async () => {
    game = await createGame(
      "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1",
    );
    const err = game.playMoves("exd6", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("exd6");
  });

  it("rejects invalid en passant with horizontal pin", async () => {
    // Pawn is pinned horizontally by rook, en passant would expose king
    game = await createGame("8/8/8/r2pP1K1/8/8/8/4k3 w - d6 0 1");
    const err = game.playMoves("exd6", false);
    expect(game.getErr()).toContain("Illegal move: exd6");
    expect(err).toBe(true);
  });

  it("handles en passant capture with stm in check by the to-be-captured pawn", async () => {
    // The pawn that just double-pushed is giving discovered check, and en passant resolves it
    game = await createGame("8/8/8/2K5/3pP3/8/8/4k3 b - e3 0 1");
    const err = game.playMoves("dxe3", false);
    expect(game.getErr()).toBe("");
    expect(err).toBe(false);
    expect(game.getMovesString()).toBe("dxe3");
  });

  it("rejects invalid en passant with stm in check", async () => {
    // King is in check from a piece, and en passant doesn't resolve it
    game = await createGame("4K3/8/8/8/3pP3/8/8/3Qk3 b - e3 0 1");
    const err = game.playMoves("dxe3", false);
    expect(game.getErr()).toContain("Illegal move: dxe3");
    expect(err).toBe(true);
  });

  it("survives a FEN round trip", async () => {
    const exampleFens = [
      "8/7n/4p1kp/8/6PK/1R6/8/8 b - - 0 1",
      "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1",
      "rn1qkb1r/p1pbpppp/5n2/8/2pP4/2N5/1PQ1PPPP/R1B1KBNR w KQkq - 0 7",
      "r2qkb1r/p1pbpppp/2n2n2/8/2pP4/2N2N2/1PQ1PPPP/R1B1KB1R w KQkq - 2 8",
      "r2qkb1r/p1pbpppp/5n2/8/1npPP3/2N2N2/1PQ2PPP/R1B1KB1R w KQkq - 1 9",
      "r2qkb1r/p1pb1ppp/4pn2/8/1npPP3/2N2N2/1P3PPP/R1BQKB1R w KQkq - 0 10",
      "r2qk2r/p1pbbppp/4pn2/8/1nBPP3/2N2N2/1P3PPP/R1BQK2R w KQkq - 1 11",
      "r2q1rk1/p1pbbppp/4pn2/8/1nBPP3/2N2N2/1P3PPP/R1BQ1RK1 w - - 3 12",
      "r2q1rk1/2pbbppp/p3pn2/8/1nBPPB2/2N2N2/1P3PPP/R2Q1RK1 w - - 0 13",
      "r2q1rk1/2p1bppp/p3pn2/1b6/1nBPPB2/2N2N2/1P3PPP/R2QR1K1 w - - 2 14",
      "r2q1rk1/4bppp/p1p1pn2/1b6/1nBPPB2/1PN2N2/5PPP/R2QR1K1 w - - 0 15",
      "r4rk1/3qbppp/p1p1pn2/1b6/1nBPPB2/1PN2N2/3Q1PPP/R3R1K1 w - - 2 16",
      "r4rk1/1q2bppp/p1p1pn2/1b6/1nBPPB2/1PN2N1P/3Q1PP1/R3R1K1 w - - 1 17",
      "r3r1k1/1q2bppp/p1p1pn2/1b6/1nBPPB2/1PN2N1P/4QPP1/R3R1K1 w - - 3 18",
      "r3r1k1/1q1nbppp/p1p1p3/1b6/1nBPPB2/1PN2N1P/4QPP1/3RR1K1 w - - 5 19",
      "r3rbk1/1q1n1ppp/p1p1p3/1b6/1nBPPB2/1PN2N1P/3RQPP1/4R1K1 w - - 7 20",
      "r3rbk1/1q3ppp/pnp1p3/1b6/1nBPPB2/1PN2N1P/3RQPP1/4R2K w - - 9 21",
      "2r1rbk1/1q3ppp/pnp1p3/1b6/1nBPPB2/1PN2N1P/3RQPP1/1R5K w - - 11 22",
      "2r1rbk1/1q4pp/pnp1pp2/1b6/1nBPPB2/1PN2N1P/4QPP1/1R1R3K w - - 0 23",
      "2r1rbk1/5qpp/pnp1pp2/1b6/1nBPP3/1PN1BN1P/4QPP1/1R1R3K w - - 2 24",
      "2r1rbk1/5qp1/pnp1pp1p/1b6/1nBPP3/1PN1BN1P/4QPP1/1R1R2K1 w - - 0 25",
      "2r1rbk1/5qp1/pnp1pp1p/1b6/2BPP3/1P2BN1P/n3QPP1/1R1R2K1 w - - 0 26",
      "r3rbk1/5qp1/pnp1pp1p/1b6/2BPP3/1P2BN1P/Q4PP1/1R1R2K1 w - - 1 27",
      "rr3bk1/5qp1/pnp1pp1p/1b6/2BPP3/1P2BN1P/Q4PP1/R2R2K1 w - - 3 28",
      "rr2qbk1/6p1/pnp1pp1p/1b6/2BPP3/1P2BN1P/4QPP1/R2R2K1 w - - 5 29",
      "rr2qbk1/6p1/1np1pp1p/pb6/2BPP3/1P1QBN1P/5PP1/R2R2K1 w - - 0 30",
      "rr2qbk1/6p1/1n2pp1p/pp6/3PP3/1P1QBN1P/5PP1/R2R2K1 w - - 0 31",
      "rr2qbk1/6p1/1n2pp1p/1p1P4/p3P3/1P1QBN1P/5PP1/R2R2K1 w - - 0 32",
      "rr2qbk1/3n2p1/3Ppp1p/1p6/p3P3/1P1QBN1P/5PP1/R2R2K1 w - - 1 33",
      "rr3bk1/3n2p1/3Ppp1p/1p5q/pP2P3/3QBN1P/5PP1/R2R2K1 w - - 1 34",
      "rr3bk1/3n2p1/3Ppp1p/1p5q/1P2P3/p2QBN1P/5PP1/2RR2K1 w - - 0 35",
      "1r3bk1/3n2p1/r2Ppp1p/1p5q/1P2P3/pQ2BN1P/5PP1/2RR2K1 w - - 2 36",
      "1r2qbk1/2Rn2p1/r2Ppp1p/1p6/1P2P3/pQ2BN1P/5PP1/3R2K1 w - - 4 37",
      "1r2qbk1/2Rn2p1/r2Ppp1p/1pB5/1P2P3/1Q3N1P/p4PP1/3R2K1 w - - 0 38",
      "1r2q1k1/2Rn2p1/r2bpp1p/1pB5/1P2P3/1Q3N1P/p4PP1/R5K1 w - - 0 39",
      "1r2q1k1/2Rn2p1/3rpp1p/1p6/1P2P3/1Q3N1P/p4PP1/R5K1 w - - 0 40",
      "2r1q1k1/2Rn2p1/3rpp1p/1p6/1P2P3/5N1P/Q4PP1/R5K1 w - - 1 41",
      "1r2q1k1/1R1n2p1/3rpp1p/1p6/1P2P3/5N1P/Q4PP1/R5K1 w - - 3 42",
      "2r1q1k1/2Rn2p1/3rpp1p/1p6/1P2P3/5N1P/Q4PP1/R5K1 w - - 5 43",
      "1r2q1k1/1R1n2p1/3rpp1p/1p6/1P2P3/5N1P/Q4PP1/R5K1 w - - 7 44",
      "1rq3k1/R2n2p1/3rpp1p/1p6/1P2P3/5N1P/Q4PP1/R5K1 w - - 9 45",
      "2q3k1/Rr1n2p1/3rpp1p/1p6/1P2P3/5N1P/4QPP1/R5K1 w - - 11 46",
      "Rrq3k1/3n2p1/3rpp1p/1p6/1P2P3/5N1P/4QPP1/R5K1 w - - 13 47",
      "rnbq1rk1/ppp1npb1/4p1p1/3P3p/3PP3/2N2N2/PP2BPPP/R1BQ1RK1 b - - 0 8",
      "rnbq1rk1/ppp1npb1/6p1/3pP2p/3P4/2N2N2/PP2BPPP/R1BQ1RK1 b - - 0 9",
      "rn1q1rk1/ppp1npb1/6p1/3pP2p/3P2b1/2N2N2/PP2BPPP/R1BQR1K1 b - - 2 10",
      "r2q1rk1/ppp1npb1/2n3p1/3pP2p/3P2bN/2N5/PP2BPPP/R1BQR1K1 b - - 4 11",
      "r4rk1/pppqnpb1/2n3p1/3pP2p/3P2bN/2N4P/PP2BPP1/R1BQR1K1 b - - 0 12",
      "r4rk1/pppqnpb1/2n3p1/3pP2p/3P3N/7P/PP2NPP1/R1BQR1K1 b - - 0 13",
      "r4rk1/pppq1pb1/2n3p1/3pPN1p/3P4/7P/PP2NPP1/R1BQR1K1 b - - 0 14",
      "r4rk1/ppp2pb1/2n3p1/3pPq1p/3P1N2/7P/PP3PP1/R1BQR1K1 b - - 1 15",
      "r4rk1/pppq1pb1/2n3p1/3pP2p/P2P1N2/7P/1P3PP1/R1BQR1K1 b - - 0 16",
      "r2n1rk1/pppq1pb1/6p1/3pP2p/P2P1N2/R6P/1P3PP1/2BQR1K1 b - - 2 17",
      "r4rk1/pppq1pb1/4N1p1/3pP2p/P2P4/R6P/1P3PP1/2BQR1K1 b - - 0 18",
      "r4rk1/ppp2pb1/4q1p1/3pP1Bp/P2P4/R6P/1P3PP1/3QR1K1 b - - 1 19",
      "r3r1k1/ppp2pb1/4q1p1/3pP1Bp/P2P1P2/R6P/1P4P1/3QR1K1 b - - 0 20",
      "r3r1k1/ppp3b1/4qpp1/3pP2p/P2P1P1B/R6P/1P4P1/3QR1K1 b - - 1 21",
      "r3r1k1/ppp3b1/4q1p1/3pP2p/P4P1B/R6P/1P4P1/3QR1K1 b - - 0 22",
      "r4rk1/ppp3b1/4q1p1/3pP1Bp/P4P2/R6P/1P4P1/3QR1K1 b - - 2 23",
      "r4rk1/pp4b1/4q1p1/2ppP1Bp/P4P2/3R3P/1P4P1/3QR1K1 b - - 1 24",
      "r4rk1/pp4b1/4q1p1/2p1P1Bp/P2p1PP1/3R3P/1P6/3QR1K1 b - - 0 25",
      "r4rk1/pp4b1/4q1p1/2p1P1B1/P2p1PP1/3R4/1P6/3QR1K1 b - - 0 26",
      "r5k1/pp3rb1/4q1p1/2p1P1B1/P2p1PP1/6R1/1P6/3QR1K1 b - - 2 27",
      "5rk1/pp3rb1/4q1p1/2p1P1B1/P2pRPP1/6R1/1P6/3Q2K1 b - - 4 28",
      "5rk1/1p3rb1/p3q1p1/P1p1P1B1/3pRPP1/6R1/1P6/3Q2K1 b - - 0 29",
      "4r1k1/1p3rb1/p3q1p1/P1p1P1B1/3pRPP1/1P4R1/8/3Q2K1 b - - 0 30",
      "4r1k1/5rb1/pP2q1p1/2p1P1B1/3pRPP1/1P4R1/8/3Q2K1 b - - 0 31",
      "4r1k1/5rb1/pq4p1/2p1P1B1/3pRPP1/1P4R1/4Q3/6K1 b - - 1 32",
      "4r1k1/1r4b1/pq4p1/2p1P1B1/3pRPP1/1P4R1/2Q5/6K1 b - - 3 33",
      "4r1k1/1r4b1/1q4p1/p1p1P1B1/3p1PP1/1P4R1/2Q5/4R1K1 b - - 1 34",
      "4r1k1/3r2b1/1q4p1/p1p1P1B1/2Qp1PP1/1P4R1/8/4R1K1 b - - 3 35",
      "4r1k1/3r2b1/4q1p1/p1p1P1B1/2Qp1PP1/1P4R1/5K2/4R3 b - - 5 36",
      "4r1k1/3r2b1/6p1/p1p1P1B1/2Pp1PP1/6R1/5K2/4R3 b - - 0 37",
      "4r1k1/3r2b1/6p1/p1p1P1B1/2P2PP1/3p2R1/5K2/3R4 b - - 1 38",
      "5rk1/3r2b1/6p1/p1p1P1B1/2P2PP1/3p2R1/8/3RK3 b - - 3 39",
      "5rk1/6b1/6p1/p1p1P1B1/2Pr1PP1/3R4/8/3RK3 b - - 0 40",
      "5rk1/3R2b1/6p1/p1p1P1B1/2r2PP1/8/8/3RK3 b - - 1 41",
      "5rk1/3R2b1/6p1/p1p1P1B1/4rPP1/8/3K4/3R4 b - - 3 42",
      "1r4k1/3R2b1/6p1/p1p1P1B1/4rPP1/2K5/8/3R4 b - - 5 43",
      "1r4k1/3R2b1/6p1/p1p1P1B1/2K2PP1/4r3/8/3R4 b - - 7 44",
      "1r3bk1/8/3R2p1/p1p1P1B1/2K2PP1/4r3/8/3R4 b - - 9 45",
      "1r3bk1/8/6R1/2p1P1B1/p1K2PP1/4r3/8/3R4 b - - 0 46",
      "1r3b2/5k2/R7/2p1P1B1/p1K2PP1/4r3/8/3R4 b - - 2 47",
      "5b2/1r3k2/R7/2p1P1B1/p1K2PP1/4r3/8/7R b - - 4 48",
      "5b2/5k2/R7/2pKP1B1/pr3PP1/4r3/8/7R b - - 6 49",
      "5b2/5k2/R1K5/2p1P1B1/p2r1PP1/4r3/8/7R b - - 8 50",
      "8/R4kb1/2K5/2p1P1B1/p2r1PP1/4r3/8/7R b - - 10 51",
      "8/R5b1/2K3k1/2p1PPB1/p2r2P1/4r3/8/7R b - - 0 52",
      "8/6R1/2K5/2p1PPk1/p2r2P1/4r3/8/7R b - - 0 53",
      "8/6R1/2K5/2p1PP2/p2r1kP1/4r3/8/5R2 b - - 2 54",
      "8/6R1/2K2P2/2p1P3/p2r2P1/4r1k1/8/5R2 b - - 0 55",
      "8/5PR1/2K5/2p1P3/p2r2P1/4r3/6k1/5R2 b - - 0 56",
    ];
    game = await createGame();
    for (const fen of exampleFens) {
      game.reset(fen, false);
      expect(game.fen()).toBe(fen);
    }
  });
});

describe("movesToSan", async () => {
  await init();

  it("works on the evergreen game", () => {
    const result = movesToSan(
      StartPos,
      "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4 e5d4 e1g1 d4d3 d1b3 d8f6 e4e5 f6g6 f1e1 g8e7 c1a3 b7b5 b3b5 a8b8 b5a4 a5b6 b1d2 c8b7 d2e4 g6f5 c4d3 f5h5 e4f6 g7f6 e5f6 h8g8 a1d1 h5f3 e1e7 c6e7 a4d7 e8d7 d3f5 d7e8 f5d7 e8f8 a3e7".split(
        " ",
      ),
    );

    expect(result.error).toBe(null);
    expect(result.moves.map((m) => m.san).join(" ")).toBe(
      "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#",
    );
  });

  it("works from a set position", () => {
    const moves =
      "g1h2 f6f5 g2g3 e8d8 a1b1 c5e4 b1b2 g6h7 d1b1 h7g8 h2g1 g8f7 b2e2 d8e8 g1h2 e8d8 b1a1 d8e8 a1d1 e8d8 d1b1 d8g8 e2b2 g8d8 h2g1 d8e8 b1e1 c8c7 e1d1 e8d8 g1h2 d7c5 d1e1 f7g8 h2g1 d8e8 e1a1 c7c8 f2f4 g4f3 d4f3 e5e6 f3d4 e6e5 g1h2 c8c7 b4a3 c5d7 a1b1 e8b8 b2c2 e5a5";

    const result = movesToSan(
      "2k1r3/1p1n4/p4pb1/P1n1r2p/1BPN2pP/2P5/5PP1/R2R1BK1 w - - 1 32 ",
      moves.split(" "),
    );

    expect(result.error).toBe(null);
    expect(result.moves.map((m) => m.san).join(" ")).toBe(
      "Kh2 f5 g3 Rd8 Rab1 Ne4 Rb2 Bh7 Rdb1 Bg8 Kg1 Bf7 Re2 Rde8 Kh2 Rd8 Ra1 Rde8 Rd1 Rd8 Rb1 Rg8 Reb2 Rd8 Kg1 Rde8 Re1 Kc7 Rd1 Rd8 Kh2 Ndc5 Re1 Bg8 Kg1 Rde8 Ra1 Kc8 f4 gxf3 Nxf3 R5e6 Nd4 Re5 Kh2 Kc7 Ba3 Nd7 Rab1 Rb8 Rc2 Rxa5",
    );
  });

  it("work with rook underpromotion", () => {
    const fen = "1r4rk/1P5p/2n1p1n1/3pPpQ1/5P2/1R1BP2P/3qN2K/6R1 b - - 6 35";
    const result = movesToSan(fen, ["b8f8", "b7b8r"]);

    expect(result.error).toBe(null);
    expect(result.moves.map((m) => m.san).join(" ")).toBe("Rbf8 b8=R");
  });

  it("work with bishop underpromotion", () => {
    const fen = "1r4rk/1P5p/2n1p1n1/3pPpQ1/5P2/1R1BP2P/3qN2K/6R1 b - - 6 35";
    const result = movesToSan(fen, ["b8f8", "b7b8b"]);

    expect(result.error).toBe(null);
    expect(result.moves.map((m) => m.san).join(" ")).toBe("Rbf8 b8=B");
  });

  it("work with knight underpromotion", () => {
    const fen = "1r4rk/1P5p/2n1p1n1/3pPpQ1/5P2/1R1BP2P/3qN2K/6R1 b - - 6 35";
    const result = movesToSan(fen, ["b8f8", "b7b8n"]);

    expect(result.error).toBe(null);
    expect(result.moves.map((m) => m.san).join(" ")).toBe("Rbf8 b8=N");
  });

  it("work with queen promotion", () => {
    const fen = "1r4rk/1P5p/2n1p1n1/3pPpQ1/5P2/1R1BP2P/3qN2K/6R1 b - - 6 35";
    const result = movesToSan(fen, ["b8f8", "b7b8q"]);

    expect(result.error).toBe(null);
    expect(result.moves.map((m) => m.san).join(" ")).toBe("Rbf8 b8=Q");
  });
});

describe("movesToLan", async () => {
  await init();

  it("works on the evergreen game", () => {
    const result = movesToLan(
      StartPos,
      "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#".split(
        " ",
      ),
    );

    expect(result.error).toBe(null);
    expect(result.moves.map((m) => m.lan).join(" ")).toBe(
      "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4 e5d4 e1h1 d4d3 d1b3 d8f6 e4e5 f6g6 f1e1 g8e7 c1a3 b7b5 b3b5 a8b8 b5a4 a5b6 b1d2 c8b7 d2e4 g6f5 c4d3 f5h5 e4f6 g7f6 e5f6 h8g8 a1d1 h5f3 e1e7 c6e7 a4d7 e8d7 d3f5 d7e8 f5d7 e8f8 a3e7",
    );
  });

  it("works on a set position with pinned piece", () => {
    const result = movesToLan(
      "8/1Q2bk2/P2p2p1/2pPp3/2P1P3/2N2n2/2KN1q2/8 w - - 1 61",
      ["Nb1"],
    );

    expect(result.error).toBe(null);
  });
});
