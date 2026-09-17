// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <stdbool.h>
#include <stdint.h>

#define AGENTPAD_LIVE_MONITOR_COMMAND 0x7DU
#define AGENTPAD_LIVE_MONITOR_GET_INFO 0x01U
#define AGENTPAD_LIVE_MONITOR_GET_FRAME 0x02U
#define AGENTPAD_LIVE_MONITOR_LED_COUNT 24U
#define AGENTPAD_LIVE_MONITOR_CHUNK_LEDS 8U
#define AGENTPAD_LIVE_MONITOR_CHUNK_COUNT 3U
#define AGENTPAD_LIVE_MONITOR_REPORT_LENGTH 32U

#define AGENTPAD_LIVE_MONITOR_FLAG_LIVE 0x01U
#define AGENTPAD_LIVE_MONITOR_FLAG_TRANSITION 0x02U
#define AGENTPAD_LIVE_MONITOR_FLAG_STARTUP 0x04U
#define AGENTPAD_LIVE_MONITOR_FLAG_RGB_OFF 0x08U
#define AGENTPAD_LIVE_MONITOR_CAPABILITY_FLAGS \
    (AGENTPAD_LIVE_MONITOR_FLAG_LIVE | AGENTPAD_LIVE_MONITOR_FLAG_TRANSITION | \
     AGENTPAD_LIVE_MONITOR_FLAG_STARTUP | AGENTPAD_LIVE_MONITOR_FLAG_RGB_OFF)

typedef struct {
    uint8_t r;
    uint8_t g;
    uint8_t b;
} agentpad_live_monitor_rgb_t;

void agentpad_live_monitor_capture_led(uint8_t led, uint8_t r, uint8_t g, uint8_t b);
void agentpad_live_monitor_capture_all(uint8_t r, uint8_t g, uint8_t b);
void agentpad_live_monitor_set_layer(uint8_t layer);
void agentpad_live_monitor_set_flags(uint8_t flags);
bool agentpad_live_monitor_via_command(uint8_t *data, uint8_t length);

void rgb_matrix_color_observer_kb(uint8_t led, uint8_t r, uint8_t g, uint8_t b);
void rgb_matrix_color_all_observer_kb(uint8_t r, uint8_t g, uint8_t b);
