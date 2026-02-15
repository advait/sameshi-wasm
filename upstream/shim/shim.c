#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "sameshi.h"

#define SHIM_INPUT_CAPACITY 512
#define SHIM_OUTPUT_CAPACITY 8192
#define SHIM_MAX_MOVES 256
#define SHIM_INF 30000

// Stable boundary error codes shared with the TS adapter.
enum {
    SHIM_OK = 0,
    SHIM_ERR_INVALID_FEN = 1,
    SHIM_ERR_UNSUPPORTED_RULE = 2,
    SHIM_ERR_OUT_OF_CONTRACT = 3,
    SHIM_ERR_BUFFER_TOO_SMALL = 4,
    SHIM_ERR_ENGINE_STATE = 5,
    SHIM_ERR_CANCELED = 6,
};

typedef struct {
    int from;
    int to;
    int piece;
    int captured;
} Move;

extern int b[120], bs, bd;

static int g_last_error = SHIM_OK;
static int g_side_to_move = 1;
static volatile int g_stop_requested = 0;
static char g_input[SHIM_INPUT_CAPACITY];
static char g_output[SHIM_OUTPUT_CAPACITY];

static int set_error(int code) {
    g_last_error = code;
    return code;
}

static void clear_error(void) {
    g_last_error = SHIM_OK;
}

static int is_on_board(int sq) {
    return b[sq] != 7;
}

static void clear_board(void) {
    for (int i = 0; i < 120; i++) {
        b[i] = 7;
    }

    for (int row = 2; row <= 9; row++) {
        for (int file = 1; file <= 8; file++) {
            b[row * 10 + file] = 0;
        }
    }
}

static int piece_from_fen(char ch) {
    switch (ch) {
        case 'P': return 1;
        case 'N': return 2;
        case 'B': return 3;
        case 'R': return 4;
        case 'Q': return 5;
        case 'K': return 6;
        case 'p': return -1;
        case 'n': return -2;
        case 'b': return -3;
        case 'r': return -4;
        case 'q': return -5;
        case 'k': return -6;
        default: return 0;
    }
}

static void square_to_uci(int sq, char out[3]) {
    out[0] = (char)('a' + (sq % 10) - 1);
    out[1] = (char)('0' + (sq / 10) - 1);
    out[2] = '\0';
}

static int append_move(char **cursor, size_t *remaining, int from, int to) {
    if (*remaining < 6) {
        return set_error(SHIM_ERR_BUFFER_TOO_SMALL);
    }

    char from_sq[3];
    char to_sq[3];
    square_to_uci(from, from_sq);
    square_to_uci(to, to_sq);

    (*cursor)[0] = from_sq[0];
    (*cursor)[1] = from_sq[1];
    (*cursor)[2] = to_sq[0];
    (*cursor)[3] = to_sq[1];
    (*cursor)[4] = '\n';

    *cursor += 5;
    *remaining -= 5;
    **cursor = '\0';
    return SHIM_OK;
}

static int read_field(const char **p, char *out, size_t out_capacity) {
    size_t idx = 0;

    while (**p == ' ') {
        (*p)++;
    }

    if (**p == '\0') {
        return 0;
    }

    while (**p != '\0' && **p != ' ') {
        if (idx + 1 >= out_capacity) {
            return -1;
        }
        out[idx++] = **p;
        (*p)++;
    }

    out[idx] = '\0';
    return 1;
}

static int parse_fen(const char *fen) {
    if (fen == NULL || *fen == '\0') {
        return set_error(SHIM_ERR_INVALID_FEN);
    }

    clear_board();
    g_output[0] = '\0';

    int rank = 8;
    int file = 1;
    const char *p = fen;

    while (*p != '\0' && *p != ' ') {
        char ch = *p;

        if (ch == '/') {
            if (file != 9 || rank <= 1) {
                return set_error(SHIM_ERR_INVALID_FEN);
            }
            rank--;
            file = 1;
            p++;
            continue;
        }

        if (ch >= '1' && ch <= '8') {
            int span = ch - '0';
            if (file + span > 9) {
                return set_error(SHIM_ERR_INVALID_FEN);
            }
            file += span;
            p++;
            continue;
        }

        int piece = piece_from_fen(ch);
        if (piece == 0 || file > 8 || rank < 1 || rank > 8) {
            return set_error(SHIM_ERR_INVALID_FEN);
        }

        int sq = (rank + 1) * 10 + file;
        if (!is_on_board(sq)) {
            return set_error(SHIM_ERR_INVALID_FEN);
        }

        b[sq] = piece;
        file++;
        p++;
    }

    if (rank != 1 || file != 9) {
        return set_error(SHIM_ERR_INVALID_FEN);
    }

    if (*p != ' ') {
        return set_error(SHIM_ERR_INVALID_FEN);
    }

    p++;
    if (*p == 'w') {
        g_side_to_move = 1;
    } else if (*p == 'b') {
        g_side_to_move = -1;
    } else {
        return set_error(SHIM_ERR_INVALID_FEN);
    }
    p++;

    // Optional FEN fields. Reject non-lite rules when explicitly requested.
    char castling[16];
    char ep[16];
    int got_castling = read_field(&p, castling, sizeof(castling));
    if (got_castling < 0) {
        return set_error(SHIM_ERR_INVALID_FEN);
    }
    if (got_castling == 1 && strcmp(castling, "-") != 0) {
        return set_error(SHIM_ERR_UNSUPPORTED_RULE);
    }

    int got_ep = read_field(&p, ep, sizeof(ep));
    if (got_ep < 0) {
        return set_error(SHIM_ERR_INVALID_FEN);
    }
    if (got_ep == 1 && strcmp(ep, "-") != 0) {
        return set_error(SHIM_ERR_UNSUPPORTED_RULE);
    }

    g_stop_requested = 0;
    return SHIM_OK;
}

static int push_legal_move(int side, int from, int to, Move *moves, int max_moves, int *count) {
    int piece = b[from];
    int captured = b[to];

    b[to] = piece;
    b[from] = 0;
    int legal = !C(side);
    b[from] = piece;
    b[to] = captured;

    if (!legal) {
        return SHIM_OK;
    }

    if (*count < max_moves) {
        moves[*count].from = from;
        moves[*count].to = to;
        moves[*count].piece = piece;
        moves[*count].captured = captured;
    }
    (*count)++;

    if (*count > max_moves) {
        return set_error(SHIM_ERR_OUT_OF_CONTRACT);
    }

    return SHIM_OK;
}

static int collect_legal_moves(int side, Move *moves, int max_moves, int *count) {
    *count = 0;

    for (int from = 21; from < 99; from++) {
        int piece = b[from];
        if (piece == 7 || piece == 0 || ((piece > 0) != (side > 0))) {
            continue;
        }

        int abs_piece = j(piece);

        if (abs_piece == 1) {
            int o = (side == 1) ? 10 : -10;

            int t = from + o - 1;
            int target = b[t];
            if (target != 7 && target != 0 && ((target > 0) != (side > 0))) {
                int rc = push_legal_move(side, from, t, moves, max_moves, count);
                if (rc != SHIM_OK) return rc;
            }

            t = from + o + 1;
            target = b[t];
            if (target != 7 && target != 0 && ((target > 0) != (side > 0))) {
                int rc = push_legal_move(side, from, t, moves, max_moves, count);
                if (rc != SHIM_OK) return rc;
            }

            t = from + o;
            if (b[t] == 0) {
                int rc = push_legal_move(side, from, t, moves, max_moves, count);
                if (rc != SHIM_OK) return rc;

                int start_row_ok = (side == 1 && from < 40) || (side == -1 && from > 70);
                int two = from + 2 * o;
                if (start_row_ok && b[two] == 0) {
                    rc = push_legal_move(side, from, two, moves, max_moves, count);
                    if (rc != SHIM_OK) return rc;
                }
            }
            continue;
        }

        const int *dirs = K;
        int start = 0;
        int end = 8;
        int sliding = 1;

        if (abs_piece == 2) {
            dirs = N;
            start = 0;
            end = 8;
            sliding = 0;
        } else if (abs_piece == 3) {
            start = 4;
            end = 8;
        } else if (abs_piece == 4) {
            start = 0;
            end = 4;
        } else if (abs_piece == 6) {
            start = 0;
            end = 8;
            sliding = 0;
        }

        for (int i = start; i < end; i++) {
            int to = from;
            while (1) {
                to += dirs[i];
                int target = b[to];
                if (target == 7) {
                    break;
                }
                if (target != 0 && ((target > 0) == (side > 0))) {
                    break;
                }

                int rc = push_legal_move(side, from, to, moves, max_moves, count);
                if (rc != SHIM_OK) return rc;

                if (target != 0 || !sliding) {
                    break;
                }
            }
        }
    }

    return SHIM_OK;
}

int shim_input_ptr(void) {
    return (int)(intptr_t)&g_input[0];
}

int shim_input_capacity(void) {
    return SHIM_INPUT_CAPACITY;
}

int shim_output_ptr(void) {
    return (int)(intptr_t)&g_output[0];
}

int shim_output_capacity(void) {
    return SHIM_OUTPUT_CAPACITY;
}

int shim_last_error(void) {
    return g_last_error;
}

int shim_side_to_move(void) {
    return g_side_to_move;
}

const char *shim_error_message(int code) {
    switch (code) {
        case SHIM_OK: return "ok";
        case SHIM_ERR_INVALID_FEN: return "invalid_fen";
        case SHIM_ERR_UNSUPPORTED_RULE: return "unsupported_rule";
        case SHIM_ERR_OUT_OF_CONTRACT: return "out_of_contract";
        case SHIM_ERR_BUFFER_TOO_SMALL: return "buffer_too_small";
        case SHIM_ERR_ENGINE_STATE: return "engine_state";
        case SHIM_ERR_CANCELED: return "canceled";
        default: return "unknown";
    }
}

void shim_request_stop(void) {
    g_stop_requested = 1;
}

void shim_clear_stop(void) {
    g_stop_requested = 0;
}

int shim_set_position(void) {
    clear_error();
    return parse_fen(g_input);
}

int shim_generate_moves(void) {
    clear_error();

    Move moves[SHIM_MAX_MOVES];
    int count = 0;
    int rc = collect_legal_moves(g_side_to_move, moves, SHIM_MAX_MOVES, &count);
    if (rc != SHIM_OK) {
        return -rc;
    }

    char *cursor = g_output;
    size_t remaining = SHIM_OUTPUT_CAPACITY;
    g_output[0] = '\0';

    int actual_count = count > SHIM_MAX_MOVES ? SHIM_MAX_MOVES : count;
    for (int i = 0; i < actual_count; i++) {
        rc = append_move(&cursor, &remaining, moves[i].from, moves[i].to);
        if (rc != SHIM_OK) {
            return -rc;
        }
    }

    return actual_count;
}

int shim_best_move(int depth) {
    clear_error();

    if (depth < 1 || depth > 8) {
        return -set_error(SHIM_ERR_OUT_OF_CONTRACT);
    }

    Move moves[SHIM_MAX_MOVES];
    int count = 0;
    int rc = collect_legal_moves(g_side_to_move, moves, SHIM_MAX_MOVES, &count);
    if (rc != SHIM_OK) {
        return -rc;
    }

    if (count <= 0) {
        g_output[0] = '\0';
        return 0;
    }

    int best_index = -1;
    int best_score = -SHIM_INF;

    for (int i = 0; i < count; i++) {
        if (g_stop_requested) {
            return -set_error(SHIM_ERR_CANCELED);
        }

        Move m = moves[i];
        b[m.to] = m.piece;
        b[m.from] = 0;
        int score = -S(-g_side_to_move, depth - 1, -SHIM_INF, SHIM_INF);
        b[m.from] = m.piece;
        b[m.to] = m.captured;

        if (best_index < 0 || score > best_score) {
            best_index = i;
            best_score = score;
        }
    }

    if (best_index < 0) {
        return -set_error(SHIM_ERR_ENGINE_STATE);
    }

    bs = moves[best_index].from;
    bd = moves[best_index].to;

    char from_sq[3];
    char to_sq[3];
    square_to_uci(bs, from_sq);
    square_to_uci(bd, to_sq);

    int n = snprintf(g_output, SHIM_OUTPUT_CAPACITY, "%s%s %d %d", from_sq, to_sq, best_score, depth);
    if (n < 0 || n >= SHIM_OUTPUT_CAPACITY) {
        return -set_error(SHIM_ERR_BUFFER_TOO_SMALL);
    }

    return 0;
}

int shim_is_in_check(void) {
    clear_error();
    if (g_side_to_move != 1 && g_side_to_move != -1) {
        return -set_error(SHIM_ERR_ENGINE_STATE);
    }
    return C(g_side_to_move);
}
