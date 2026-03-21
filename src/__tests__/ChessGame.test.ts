import { describe, it, expect, afterEach } from 'vitest';
import { createGame, type ChessGame } from '../index.ts';

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
    expect(err).toBe(false);
    expect(game.getSanMovesString()).toBe('e4 e5 Nf3 Nc6 Bb5');
  });

  it('plays LAN moves and outputs LAN', async () => {
    game = await createGame();
    const err = game.playMoves('e2e4 e7e5 g1f3', true);
    expect(err).toBe(false);
    expect(game.getSanMovesString()).toBe('e2e4 e7e5 g1f3');
  });

  it('accepts SAN piece moves (non-pawn)', async () => {
    // Use LAN for pawn moves, SAN for piece moves
    game = await createGame();
    const err = game.playMoves('e2e4 e7e5 Nf3 Nc6 Bb5', false);
    expect(err).toBe(false);
    expect(game.getSanMovesString()).toBe('e4 e5 Nf3 Nc6 Bb5');
  });

  it('rejects illegal moves', async () => {
    game = await createGame();
    const err = game.playMoves('e2e4 e2e4', false);
    expect(err).toBe(true);
    expect(game.hasErr()).toBe(true);
    expect(game.getErr()).toContain('Illegal move');
  });

  it('rejects goofy fens', async () => {
    await expect(createGame('not a fen')).rejects.toThrow();
  });

  it('resets to a new position', async () => {
    game = await createGame();
    game.playMoves('e2e4 e7e5', false);
    game.reset('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', false);
    expect(game.hasErr()).toBe(false);
    const err = game.playMoves('d2d4 d7d5', false);
    expect(err).toBe(false);
    expect(game.getSanMovesString()).toBe('d4 d5');
  });

  it('handles castling', async () => {
    game = await createGame();
    const err = game.playMoves('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 O-O', false);
    expect(err).toBe(false);
    expect(game.getSanMovesString()).toContain('O-O');
  });

  it('handles pawn promotion', async () => {
    game = await createGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const err = game.playMoves('a8=Q', false);
    expect(err).toBe(false);
    expect(game.getSanMovesString()).toBe('a8=Q+');
  });

  it('handles pawn promotion-capture', async () => {
    game = await createGame('1q2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const err = game.playMoves('axb7=R', false);
    expect(err).toBe(false);
    expect(game.getSanMovesString()).toBe('axb7=R+');
  });
});
