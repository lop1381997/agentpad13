// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include "../codex_oai/codex_led.h"

/* Project logical OAI colors onto SW1..SW13 using their persistent Vial
 * assignments. Read from an immutable copy so cycles/swaps cannot lose colors.
 * TP5 (13) and underglow (14..23) remain physical, never remapped. */
static inline void oai_led_layout_apply(
    codex_led_rgb_t frame[CODEX_LED_COUNT], const uint16_t keycodes[13],
    uint16_t first_action
) {
    codex_led_rgb_t logical[13];
    for (uint8_t i = 0; i < 13; ++i) logical[i] = frame[i];
    for (uint8_t i = 0; i < 13; ++i) {
        uint16_t keycode = keycodes[i];
        if (keycode >= first_action && keycode <= first_action + 12U) {
            frame[i] = logical[keycode - first_action];
        } else if (keycode == first_action + 13U) {
            frame[i] = logical[10]; /* legacy accept alias */
        } else {
            frame[i] = (codex_led_rgb_t){0, 0, 0};
        }
    }
}
