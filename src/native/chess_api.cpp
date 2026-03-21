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
        case 'O': case '0':
            return parse_castling(start, end);
        case 'a'...'h': {
            File f = *to_file(*read);

            if (auto r = to_rank(read[1])) {
                Square sq = make_square(*f, *r);  // successfully read a square

                if (auto to_f = to_file(read[2])) {
                    // SAN move
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
            
        }

    }

    /** Returns true if an error occurred, false otherwise. The converted result can be fetched with getSanMovesString. Both LAN and SAN moves are accepted as input. */
    bool playMoves(const std::string& moves, bool emitLAN) {
        err = std::nullopt;
        const char* read = moves.data();
        constexpr char pieceChar[] = " PNBRQK";

        auto peek_file = [&] () -> std::optional<File> {
            int f = *read - 'a';
            if (f < 0 || f >= 8) return std::nullopt;
            return File(f);
        };


        auto eat_file = [&] () -> std::optional<File> {
            auto f = peek_file();
            if (f) read++;
            return f;
        };

        auto eat_rank = [&] () -> std::optional<Rank> {
            auto r = peek_rank();
            if (r) read++;
            return r;
        };

        auto eat_square = [&] () -> std::optional<Square> {
            auto f = eat_file();
            if (!f) return std::nullopt;
            auto r = eat_rank();
            if (!r) { read--; return std::nullopt; } // put back the file
            return make_square(*f, *r);
        };

        sanMovesEnd = sanMoves;
        char move[8];

        for (;;) {
            while (isspace(*read)) read++;
            if (*read == '\0') break;

            PieceType pt = PAWN;
            std::optional<File> disambigFile;
            std::optional<Rank> disambigRank;
            std::optional<Square> target;
            bool capture = false;
            PieceType promo = NO_PIECE_TYPE;
            bool isCastling = false;
            bool isKingside = false;

            // Castling: O-O or O-O-O :owo:
            if (*read == 'O' || *read == '0') {
                char castleChar = *read;
                if (read[0] == castleChar && read[1] == '-' && read[2] == castleChar) {
                    isCastling = true;
                    read += 3;
                    if (read[0] == '-' && read[1] == castleChar) {
                        read += 2; // O-O-O
                        isKingside = false;
                    } else {
                        isKingside = true;
                    }
                } else {
                    err = "Bad castling at " + std::to_string(read - moves.data());
                    return true;
                }
            }
            // Piece letter
            else if (*read == 'N' || *read == 'B' || *read == 'R' || *read == 'Q' || *read == 'K') {
                pt = promoMap[(*read | 0x20) - 'a'];
                read++;
            }

            if (!isCastling) {
                // [file][rank][x]<square>[=promo]
                // or just: <square>[=promo] (no disambiguation)
                // or LAN: <square><square>[promo] :sob:

                // Try reading a square
                const char* save = read;
                auto sq = eat_square();

                if (sq) {
                    // Target square, or first square of LAN, or disambig+more
                    if (*read == 'x' || peek_file()) {
                        // This was disambig or LAN from-square
                        disambigFile = file_of(*sq);
                        disambigRank = rank_of(*sq);

                        if (*read == 'x') { capture = true; read++; }

                        target = eat_square();
                        if (!target) {
                            err = "Bad target square at " + std::to_string(read - moves.data());
                            return true;
                        }
                    } else {
                        // The square we read IS the target (e4, Nf3)
                        target = sq;
                    }
                } else {
                    // maybe just a file disambig (Rae1) or 'x' capture
                    auto f = eat_file();
                    if (f) {
                        disambigFile = f;
                        if (*read == 'x') { capture = true; read++; }
                        target = eat_square();
                    } else if (*read == 'x') {
                        capture = true; read++;
                        target = eat_square();
                    } else {
                        err = "Cannot parse move at " + std::to_string(read - moves.data());
                        return true;
                    }

                    if (!target) {
                        err = "Bad target square at " + std::to_string(read - moves.data());
                        return true;
                    }
                }

                // Promotion: =Q or just q
                if (*read == '=') read++;
                if (*read >= 'a' && *read <= 'z' && *read >= 'A' && *read <= 'Z') {
                    PieceType p = promoMap[(*read | 0x20) - 'a'];
                    if (p != NO_PIECE_TYPE) { promo = p; read++; }
                }
            }

            // Skip check/checkmate symbolsssss
            while (*read == '+' || *read == '#' || *read == '!' || *read == '?') read++;

            // Now find the legal move
            Move selected = Move::none();
            auto legal = MoveList<LEGAL>(pos);
            Color us = pos.side_to_move();

            if (isCastling) {
                Square ksq = pos.square<KING>(us);
                for (const auto& m : legal) {
                    if (m.type_of() == CASTLING && m.from_sq() == ksq
                        && (isKingside == (m.to_sq() > ksq))) {
                        selected = m;
                        break;
                    }
                }
            } else if (pt == PAWN && disambigFile && disambigRank) {
                // LAN: we have from-square and to-square
                Square from = make_square(*disambigFile, *disambigRank);
                for (const auto& m : legal) {
                    if (m.from_sq() == from && m.to_sq() == *target
                        && (promo == NO_PIECE_TYPE || m.promotion_type() == promo)) {
                        selected = m;
                        break;
                    }
                    // LAN castling: king moves 2+ squares
                    if (type_of(pos.piece_on(from)) == KING && m.type_of() == CASTLING
                        && m.from_sq() == from
                        && (*target > from) == (m.to_sq() > from)) {
                        selected = m;
                        break;
                    }
                }
            } else {
                // SAN: use attackers_to to find candidates
                Bitboard candidates = (pt == PAWN ? -1ULL : pos.attackers_to(*target)) & pos.pieces(us, pt);

                if (disambigFile)
                    candidates &= file_bb(*disambigFile);
                if (disambigRank)
                    candidates &= rank_bb(*disambigRank);

                for (const auto& m : legal) {
                    if (m.to_sq() == *target && (candidates & square_bb(m.from_sq()))
                        && type_of(pos.piece_on(m.from_sq())) == pt
                        && (promo == NO_PIECE_TYPE || m.promotion_type() == promo)) {
                        selected = m;
                        break;
                    }
                }

                // e.p., pawn captures to target but target is empty :woozy_face:
                if (selected == Move::none() && pt == PAWN) {
                    for (const auto& m : legal) {
                        if (m.type_of() == EN_PASSANT && m.to_sq() == *target
                            && (!disambigFile || file_of(m.from_sq()) == *disambigFile)) {
                            selected = m;
                            break;
                        }
                    }
                }
            }

            if (selected == Move::none()) {
                err = "Illegal move at " + std::to_string(read - moves.data());
                return true;
            }

            if (sanMovesEnd != sanMoves)
                *sanMovesEnd++ = ' ';

            Square from = selected.from_sq(), to = selected.to_sq();
            PieceType movedPt = type_of(pos.piece_on(from));

            if (emitLAN) {
                if (selected.type_of() == CASTLING) {
                    // Emit as king's actual movement (e.g. e1g1) rather than SF slop
                    // should work ok for chess960 :prayge:
                    bool ks = to > from;
                    // King always ends up on the g-file or c-file
                    Square lanTo = make_square(ks ? FILE_G : FILE_C, rank_of(from));
                    *sanMovesEnd++ = 'a' + file_of(from);
                    *sanMovesEnd++ = '1' + rank_of(from);
                    *sanMovesEnd++ = 'a' + file_of(lanTo);
                    *sanMovesEnd++ = '1' + rank_of(lanTo);
                } else {
                    *sanMovesEnd++ = 'a' + file_of(from);
                    *sanMovesEnd++ = '1' + rank_of(from);
                    *sanMovesEnd++ = 'a' + file_of(to);
                    *sanMovesEnd++ = '1' + rank_of(to);
                    if (selected.type_of() == PROMOTION)
                        *sanMovesEnd++ = char('a' + (selected.promotion_type() - KNIGHT) + ('n' - 'a'));
                }
            } else {
                // SAN
                if (selected.type_of() == CASTLING) {
                    bool ks = to > from;
                    if (ks) { *sanMovesEnd++ = 'O'; *sanMovesEnd++ = '-'; *sanMovesEnd++ = 'O'; }
                    else    { *sanMovesEnd++ = 'O'; *sanMovesEnd++ = '-'; *sanMovesEnd++ = 'O'; *sanMovesEnd++ = '-'; *sanMovesEnd++ = 'O'; }
                } else {
                    bool cap = pos.capture(selected);

                    if (movedPt != PAWN) {
                        *sanMovesEnd++ = pieceChar[movedPt];

                        // Disambiguation
                        Bitboard others = 0;
                        for (const auto& m : legal) {
                            if (m != selected && type_of(pos.piece_on(m.from_sq())) == movedPt
                                && m.to_sq() == to)
                                others |= square_bb(m.from_sq());
                        }
                        if (others) {
                            if (!(others & file_bb(from)))
                                *sanMovesEnd++ = 'a' + file_of(from);
                            else if (!(others & rank_bb(from)))
                                *sanMovesEnd++ = '1' + rank_of(from);
                            else {
                                *sanMovesEnd++ = 'a' + file_of(from);
                                *sanMovesEnd++ = '1' + rank_of(from);
                            }
                        }
                    } else if (cap) {
                        *sanMovesEnd++ = 'a' + file_of(from);
                    }

                    if (cap)
                        *sanMovesEnd++ = 'x';

                    *sanMovesEnd++ = 'a' + file_of(to);
                    *sanMovesEnd++ = '1' + rank_of(to);

                    if (selected.type_of() == PROMOTION) {
                        *sanMovesEnd++ = '=';
                        *sanMovesEnd++ = pieceChar[selected.promotion_type()];
                    }
                }

            }

            states->emplace_back();
            pos.do_move(selected, states->back());

            // Check/checkmate suffix (SAN only)
            if (!emitLAN && pos.checkers()) {
                if (MoveList<LEGAL>(pos).size() == 0)
                    *sanMovesEnd++ = '#';
                else
                    *sanMovesEnd++ = '+';
            }

            *sanMovesEnd = '\0';
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
