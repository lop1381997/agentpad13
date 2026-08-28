// SPDX-License-Identifier: GPL-2.0-or-later
// The dynamic Vial encoder map owns encoder dispatch for this target.  Keep
// the legacy callback symbol defined for the artifact contract without adding
// a second runtime encoder path.
#include QMK_KEYBOARD_H

__attribute__((used, noinline, externally_visible))
bool encoder_update_user(uint8_t index, bool clockwise) {
    (void)index;
    (void)clockwise;
    return false;
}
