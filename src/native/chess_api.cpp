#include <emscripten/bind.h>
#include <string>
#include <vector>

#include "sf/bitboard.h"
#include "sf/movegen.h"
#include "sf/position.h"

using namespace emscripten;
using namespace Stockfish;

static bool initialized = false;

bool isspace(char c) {
    return c == '\n' || c == '\t' || c == ' ';
}

std::optional<Rank> to_rank(char c) {
    return (c >= '1' && c <= '8') ? Rank(c - '1') : std::nullopt;
}

std::optional<File> to_file(char c) {
    return (c >= 'a' && c <= 'h') ? File(c - 'a') : std::nullopt;
}

constexpr PieceType promoMap[26] = {
    [0] = NO_PIECE_TYPE, ['b'-'a'] = BISHOP, ['n'-'a'] = KNIGHT,
    ['q'-'a'] = QUEEN, ['r'-'a'] = ROOK,
};

constexpr char PieceToChar[16] = " PNBRQK   pnbrqk ";

class ChessGame {
public:
    ChessGame(const std::string& fen, bool isChess960) {
        if (!initialized) {
            __builtin_trap();
        }
        states   = StateListPtr(new std::deque<StateInfo>(1));
        err = pos.set(fen, isChess960, &states->back());
    }

    void reset(const std::string& fen, bool isChess960) {
        states->resize(1);
        err = pos.set(fen, isChess960, &states->back());
    }

    bool hasErr() const {
        return err.has_value();
    }

    std::string getErr() const {
        return err.has_value() ? *err : "";
    }

    std::string getSanMovesString() const {
        return std::string(sanMoves, sanMovesEnd - sanMoves);
    }

    

    // Returns std::nullopt on move parse failure, otherwise returns the validated move.
    std::optional<Move> parse_move(const char* start, const char* end) {
        const char* read = start;

        Move candidate;
        const Color us = pos.side_to_move();
        Piece pc = NO_PIECE;
        
        switch (*read) {
        case 'O': case '0': {
            if (read[1] != '-' || (read[2] != 'O' && read[2] != '0')) return std::nullopt;
            int sq_step = 1;
            if (read[3] == '-' && (read[4] == 'O' || read[4] == '0')) {
                sq_step = -1;
            }

            Square ksq = square<KING>(us), fromSq = ksq, toSq = ksq;
            // Search for a rook to castle to. SF encodes as king captures rook
            while (toSq.is_ok() && rank_of(toSq) == rank_of(ksq)) {
                if (pieces(us, ROOK) & toSq) {
                    candidate = Move::make<CASTLING>(fromSq, toSq);
                    goto found;
                }
                toSq += sq_step;
            }
            return std::nullopt;
        }
        case 'a'...'h': {
            File f = *to_file(*read);

            if (auto r = to_rank(read[1])) {
                Square sq = make_square(*f, *r);  // successfully read a square

                if (auto to_f = to_file(read[2])) {
                    // LAN move
                    std::optional<File> to_r = to_rank(read[3]);
                    Square toSq = make_square(*to_f, *to_r);

                    // Potentially a promotion like e4b5n
                    PieceType pt = read[4] >= 'b' && read[4] <= 'q' ? promoMap[read[4] - 'a'] : NO_PIECE_TYPE;
                    if (pt) {
                        candidate = Move::make<PROMOTION>(sq, toSq, pt);
                    } else {
                        candidate = { sq, toSq };
                    }
                    break;
                }

                // sq is the target of a forward pawn move, e.g. "e4"
                int push = pawn_push(us);
                for (int o : { sq - push, sq - 2 * push }) {
                    Square fromSq { o };
                    if (fromSq.is_ok() && pos.pieces(PAWN) & fromSq) {
                        read += 2;
                        candidate = Move(fromSq, sq);
                        goto found;
                    }
                }
                return std::nullopt;
            }

            pc = make_piece(PAWN, us);
            [[fallthrough]];
        }
        case 'B': case 'Q': case 'N': case 'K': case 'R': {
            if (!pc)
                pc = make_piece(promoMap[*read++ - 'A'], us);

            std::optional<File> fileDisambig = to_file(*read);
            read += fileDisambig.has_value();
            std::optional<File> rankDisambig = to_rank(*read);
            read += rankDisambig.has_value();

            bool captures = *read == 'x';
            read += captures;

            // Now we expect a square...
            auto toFile = to_file(*read++);
            if (!toFile.has_value()) return std::nullopt;
            auto toRank = to_rank(*read++);
            if (!toFile.has_value()) return std::nullopt;

            Square toSq = make_square(*toFile, *toRank);

            Bitboard candidatePieces = pos.pieces(us, type_of(pc));
            if (fileDisambig) candidatePieces &= FILE_A << *fileDisambig;
            if (rankDisambig) candidatePieces &= RANK_1 << 8 * *rankDisambig;

            if (!candidatePieces) return std::nullopt;

            while (candidatePieces) {
                Square fromSq = pop_lsb(candidatePieces);
                Bitboard attacks = attacks_bb(pc, fromSq, pos.pieces());
                if (attacks & toSq) {
                    candidate = Move(fromSq, toSq);

                    if (type_of(pc) == PAWN && !(pieces(~us) & toSq)) {
                        candidate = Move::make<EN_PASSANT>(fromSq, toSq);
                    }

                    goto found;
                }
            }
            return std::nullopt;
        }
        default:
            return std::nullopt;
        }
found:;

        if (*read == '=') {  // read a promotion
            if (type_of(pc) != PAWN) return std::nullopt;

            char c = read[1];
            if (c <= 'A' || c >= 'Z') return std::nullopt;

            PieceType pt = promoMap[c - 'A'];
            if (!pt) return std::nullopt;            

            candidate = Move::make<PROMOTION>(candidate.from_sq(), candidate.to_sq(), pt);
        }

        if (pos.pseudo_legal(candidate) && pos.legal(candidate)) return candidate;

        return std::nullopt;
    }

    void emit_file(File f) {
        *moveEnd++ = f + 'a';
    }
    void emit_rank(Rank r) {
        *moveEnd++ = r + '1';
    }

    void emit_square(Square sq) {
        emit_file(file_of(sq));
        emit_rank(rank_of(sq));
    }

    void emit_lan_move(Move move) {
        emit_square(move.from_sq());
        emit_square(move.to_sq());
        if (move.type_of() == PROMOTION) {
            *moveEnd++ = PieceToChar[make_piece(BLACK, move.promo_type())];
        }
    }

    // Check/checkmate is emitted after the move is played
    void emit_san_move(Move move) {
        Square fromSq = move.from_sq(), toSq = move.to_sq();
        Piece pc = pos.piece_on(fromSq);

        if (!pc) return; // oops

        PieceType pt = type_of(pc);
        Color us = color_of(pc);

        if (pt == PAWN) {
            if (file_of(fromSq) == file_of(toSq)) { // "e4"
                emit_square(toSq);
            } else { // "exd4"
                emit_file(file_of(fromSq));
                *moveEnd++ = 'x';
                emit_square(toSq);
            }
            if (move.type_of() == PROMOTION) {
                *moveEnd++ = '=';
                *moveEnd++ = PieceToChar[m.promo_type()];
            }
        } else {
            Bitboard others = pos.pieces(pt, us) ^ fromSq;
            Bitboard ambiguous = 0;

            *moveEnd++ = PieceToChar[pt];

            while (others) {
                Square sq = pop_lsb(others);
                Bitboard attacks = attacks_bb(pt, sq, pos.pieces());
                if (attacks & toSq) ambiguous |= sq;
            }

            if (ambiguous) {
                // If none are on the same file, then that's sufficient disambiguation
                if (!(ambiguous & (FILE_A << 8 * file_of(fromSq)))) {
                    emit_file(file_of(fromSq));
                } else if (!(ambiguous & (RANK_1 << 8 * rank_of(fromSq)))) {
                    emit_rank(rank_of(fromSq));
                } else {
                    emit_square(fromSq);
                }
            }

            if (pos.piece_on(toSq)) *moveEnd++ = 'x';

            emit_square(toSq);
        }
    }

    /** Returns true if an error occurred, false otherwise. The converted result can be fetched with getSanMovesString. Both LAN and SAN moves are accepted as input. */
    bool playMoves(const std::string& moves, bool emitLAN) {
        err = std::nullopt;

        const char* read = moves.data();

        for (;;) {
            // Advance to next non-ws
            while (*read && isspace(*read)) read++;
            // Done reading moves
            if (!*read) break;

            // Find end of move string
            const char* end_move = read + 1;
            while (*end_move && !isspace(*end_move)) end_move++;

            auto move = parse_move(read, end_move);
            if (!move.has_value()) return true; // fail

            if (emitLAN) {
                emit_lan_move(move);
            } else {
                emit_san_move(move);
            }
            
            states->emplace_back();
            pos.do_move(*move, states->back());

            // Check/checkmate suffix (SAN only)
            if (!emitLAN && pos.checkers()) {
                if (MoveList<LEGAL>(pos).size() == 0)
                    *movesEnd++ = '#';
                else
                    *movesEnd++ = '+';
            }

            *movesEnd++ = ' ';
            read = end_move;
        }
        return false;
    }

    std::string fenAt(int index) const {
        // todo
        return "";
    }

    std::string moveAt(int index) const {
        // todo
        return "";
    }

private:
    Position pos;
    StateListPtr states;

    std::optional<std::string> err;
    char *sanMovesEnd;
    char sanMoves[100000];
};

void initChess() {
    if (initialized)
        return;
    initialized = true;
    Bitboards::init();
    Position::init();
}

EMSCRIPTEN_BINDINGS(chess_module) {
    function("initChess", &initChess);

    class_<ChessGame>("ChessGame")
        .constructor<std::string, bool>()
        .function("reset", &ChessGame::reset)
        .function("hasErr", &ChessGame::hasErr)
        .function("getErr", &ChessGame::getErr)
        .function("playMoves", &ChessGame::playMoves)
        .function("getSanMovesString", &ChessGame::getSanMovesString)
        .function("fenAt", &ChessGame::fenAt)
        .function("moveAt", &ChessGame::moveAt);
}
