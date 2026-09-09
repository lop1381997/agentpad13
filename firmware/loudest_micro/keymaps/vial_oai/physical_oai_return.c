// SPDX-License-Identifier: GPL-2.0-or-later
#include QMK_KEYBOARD_H

#include "physical_oai_return.h"

/* QMK's standard matrix backend exports the debounced rows from
 * quantum/matrix_common.c, but matrix.h intentionally exposes only readers.
 * This board uses that backend, so the chord can hide its members before
 * quantum/keyboard.c compares matrix_get_row() against the previous scan. */
extern matrix_row_t matrix[MATRIX_ROWS];

#define PHYSICAL_OAI_RETURN_TERM 80U

#define PHYSICAL_OAI_RETURN_SW1_ROW 0U
#define PHYSICAL_OAI_RETURN_SW1_COL 0U
#define PHYSICAL_OAI_RETURN_SW4_ROW 0U
#define PHYSICAL_OAI_RETURN_SW4_COL 3U

#define PHYSICAL_OAI_RETURN_MASK \
    ((matrix_row_t)(((matrix_row_t)1U << PHYSICAL_OAI_RETURN_SW1_COL) | \
                    ((matrix_row_t)1U << PHYSICAL_OAI_RETURN_SW4_COL)))

typedef enum {
    PHYSICAL_OAI_RETURN_NONE,
    PHYSICAL_OAI_RETURN_SW1,
    PHYSICAL_OAI_RETURN_SW4,
} physical_oai_return_member_t;

static physical_oai_return_member_t pending_member;
static uint32_t                    pending_started;
static bool                        sw1_delivered;
static bool                        sw4_delivered;
static bool                        chord_consumed;

static bool member_is_down(physical_oai_return_member_t member, bool sw1_down, bool sw4_down) {
    return member == PHYSICAL_OAI_RETURN_SW1 ? sw1_down : sw4_down;
}

static void set_member_delivered(physical_oai_return_member_t member, bool delivered) {
    if (member == PHYSICAL_OAI_RETURN_SW1) {
        sw1_delivered = delivered;
    } else {
        sw4_delivered = delivered;
    }
}

static void emit_member_event(physical_oai_return_member_t member, bool pressed) {
    if (member == PHYSICAL_OAI_RETURN_SW1) {
        action_exec(MAKE_KEYEVENT(PHYSICAL_OAI_RETURN_SW1_ROW, PHYSICAL_OAI_RETURN_SW1_COL, pressed));
    } else {
        action_exec(MAKE_KEYEVENT(PHYSICAL_OAI_RETURN_SW4_ROW, PHYSICAL_OAI_RETURN_SW4_COL, pressed));
    }
}

static void replay_short_tap(physical_oai_return_member_t member) {
    emit_member_event(member, true);
    emit_member_event(member, false);
}

void physical_oai_return_init(void) {
    pending_member = PHYSICAL_OAI_RETURN_NONE;
    pending_started = 0U;
    sw1_delivered  = false;
    sw4_delivered  = false;
    chord_consumed = false;
}

bool physical_oai_return_matrix_scan(uint32_t now_ms, bool enabled) {
    const bool sw1_down = matrix_is_on(PHYSICAL_OAI_RETURN_SW1_ROW, PHYSICAL_OAI_RETURN_SW1_COL);
    const bool sw4_down = matrix_is_on(PHYSICAL_OAI_RETURN_SW4_ROW, PHYSICAL_OAI_RETURN_SW4_COL);

    /* SW1 is part of Vial's SW1+SW13 unlock combination.  During its bounded
     * unlock poll, preserve the raw matrix exactly as Vial expects. */
    if (!enabled) {
        physical_oai_return_init();
        return false;
    }

    matrix[PHYSICAL_OAI_RETURN_SW1_ROW] &= (matrix_row_t)~PHYSICAL_OAI_RETURN_MASK;

    if (chord_consumed) {
        if (!sw1_down && !sw4_down) {
            chord_consumed = false;
        }
        return false;
    }

    if (sw1_delivered && !sw1_down) {
        emit_member_event(PHYSICAL_OAI_RETURN_SW1, false);
        sw1_delivered = false;
    }
    if (sw4_delivered && !sw4_down) {
        emit_member_event(PHYSICAL_OAI_RETURN_SW4, false);
        sw4_delivered = false;
    }

    if (pending_member != PHYSICAL_OAI_RETURN_NONE) {
        const bool pending_down = member_is_down(pending_member, sw1_down, sw4_down);
        const bool other_down   = member_is_down(
            pending_member == PHYSICAL_OAI_RETURN_SW1 ? PHYSICAL_OAI_RETURN_SW4 : PHYSICAL_OAI_RETURN_SW1,
            sw1_down,
            sw4_down);

        if (pending_down && other_down && (uint32_t)(now_ms - pending_started) < PHYSICAL_OAI_RETURN_TERM) {
            pending_member = PHYSICAL_OAI_RETURN_NONE;
            chord_consumed = true;
            return true;
        }

        if (!pending_down) {
            replay_short_tap(pending_member);
            pending_member = PHYSICAL_OAI_RETURN_NONE;
            return false;
        }

        if ((uint32_t)(now_ms - pending_started) >= PHYSICAL_OAI_RETURN_TERM) {
            emit_member_event(pending_member, true);
            set_member_delivered(pending_member, true);
            pending_member = PHYSICAL_OAI_RETURN_NONE;
        } else {
            return false;
        }
    }

    if (sw1_down && !sw1_delivered) {
        if (sw4_down && !sw4_delivered) {
            chord_consumed = true;
            return true;
        }
        if (!sw4_delivered) {
            pending_member  = PHYSICAL_OAI_RETURN_SW1;
            pending_started = now_ms;
            return false;
        }
        emit_member_event(PHYSICAL_OAI_RETURN_SW1, true);
        sw1_delivered = true;
    }

    if (sw4_down && !sw4_delivered) {
        if (!sw1_delivered) {
            pending_member  = PHYSICAL_OAI_RETURN_SW4;
            pending_started = now_ms;
            return false;
        }
        emit_member_event(PHYSICAL_OAI_RETURN_SW4, true);
        sw4_delivered = true;
    }

    return false;
}
