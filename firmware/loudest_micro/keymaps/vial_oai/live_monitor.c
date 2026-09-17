// SPDX-License-Identifier: GPL-2.0-or-later
#include "live_monitor.h"

#include <string.h>

#include "raw_hid.h"

static agentpad_live_monitor_rgb_t captured_frame[AGENTPAD_LIVE_MONITOR_LED_COUNT];
static agentpad_live_monitor_rgb_t served_frame[AGENTPAD_LIVE_MONITOR_LED_COUNT];
static uint16_t served_sequence;
static uint8_t served_layer;
static uint8_t served_flags;
static uint8_t current_layer;
static uint8_t current_flags;

static bool payload_is_zero(const uint8_t *data, uint8_t from) {
    for (uint8_t index = from; index < AGENTPAD_LIVE_MONITOR_REPORT_LENGTH; ++index) {
        if (data[index] != 0U) {
            return false;
        }
    }
    return true;
}

static void send_info(void) {
    uint8_t reply[AGENTPAD_LIVE_MONITOR_REPORT_LENGTH] = {0};
    reply[0] = AGENTPAD_LIVE_MONITOR_COMMAND;
    reply[1] = AGENTPAD_LIVE_MONITOR_GET_INFO;
    reply[2] = 1U;
    reply[3] = 0U;
    reply[4] = AGENTPAD_LIVE_MONITOR_LED_COUNT;
    reply[5] = AGENTPAD_LIVE_MONITOR_CHUNK_LEDS;
    reply[6] = AGENTPAD_LIVE_MONITOR_CHUNK_COUNT;
    reply[7] = 20U;
    reply[8] = AGENTPAD_LIVE_MONITOR_CAPABILITY_FLAGS;
    raw_hid_send(reply, sizeof(reply));
}

static void send_frame(uint8_t chunk) {
    uint8_t reply[AGENTPAD_LIVE_MONITOR_REPORT_LENGTH] = {0};
    const uint8_t first_led = (uint8_t)(chunk * AGENTPAD_LIVE_MONITOR_CHUNK_LEDS);

    reply[0] = AGENTPAD_LIVE_MONITOR_COMMAND;
    reply[1] = AGENTPAD_LIVE_MONITOR_GET_FRAME;
    reply[2] = (uint8_t)(served_sequence & 0xFFU);
    reply[3] = (uint8_t)(served_sequence >> 8);
    reply[4] = served_layer;
    reply[5] = served_flags;
    reply[6] = chunk;
    for (uint8_t led = 0U; led < AGENTPAD_LIVE_MONITOR_CHUNK_LEDS; ++led) {
        const agentpad_live_monitor_rgb_t color = served_frame[first_led + led];
        const uint8_t offset = (uint8_t)(8U + led * 3U);
        reply[offset] = color.r;
        reply[offset + 1U] = color.g;
        reply[offset + 2U] = color.b;
    }
    raw_hid_send(reply, sizeof(reply));
}

void agentpad_live_monitor_capture_led(uint8_t led, uint8_t r, uint8_t g, uint8_t b) {
    if (led >= AGENTPAD_LIVE_MONITOR_LED_COUNT) {
        return;
    }
    captured_frame[led] = (agentpad_live_monitor_rgb_t){r, g, b};
}

void agentpad_live_monitor_capture_all(uint8_t r, uint8_t g, uint8_t b) {
    const agentpad_live_monitor_rgb_t color = {r, g, b};
    for (uint8_t led = 0U; led < AGENTPAD_LIVE_MONITOR_LED_COUNT; ++led) {
        captured_frame[led] = color;
    }
}

void agentpad_live_monitor_set_layer(uint8_t layer) {
    if (layer < 8U) {
        current_layer = layer;
    }
}

void agentpad_live_monitor_set_flags(uint8_t flags) {
    current_flags = flags;
}

bool agentpad_live_monitor_via_command(uint8_t *data, uint8_t length) {
    if (data == NULL || length != AGENTPAD_LIVE_MONITOR_REPORT_LENGTH ||
        data[0] != AGENTPAD_LIVE_MONITOR_COMMAND || !payload_is_zero(data, 3U)) {
        return false;
    }

    switch (data[1]) {
        case AGENTPAD_LIVE_MONITOR_GET_INFO:
            if (data[2] != 0U) {
                return false;
            }
            send_info();
            return true;

        case AGENTPAD_LIVE_MONITOR_GET_FRAME:
            if (data[2] >= AGENTPAD_LIVE_MONITOR_CHUNK_COUNT) {
                return false;
            }
            if (data[2] == 0U) {
                memcpy(served_frame, captured_frame, sizeof(served_frame));
                served_sequence = (uint16_t)(served_sequence + 1U);
                served_layer = current_layer;
                served_flags = current_flags;
            }
            send_frame(data[2]);
            return true;

        default:
            return false;
    }
}

void rgb_matrix_color_observer_kb(uint8_t led, uint8_t r, uint8_t g, uint8_t b) {
    agentpad_live_monitor_capture_led(led, r, g, b);
}

void rgb_matrix_color_all_observer_kb(uint8_t r, uint8_t g, uint8_t b) {
    agentpad_live_monitor_capture_all(r, g, b);
}
