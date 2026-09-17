// Host proof for the Vial-only AgentPad Live Monitor protocol.
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#undef memcpy

#include "live_monitor.h"

#define REPORT_LENGTH 32U

static uint8_t reply[REPORT_LENGTH];
static uint8_t sent_count;
static bool interleave_capture_all;

void *memcpy(void *destination, const void *source, size_t length) {
    uint8_t *destination_bytes = destination;
    const uint8_t *source_bytes = source;
    const size_t midpoint = length / 2U;

    for (size_t index = 0U; index < midpoint; ++index) {
        destination_bytes[index] = source_bytes[index];
    }
    if (interleave_capture_all && length == sizeof(agentpad_live_monitor_rgb_t) * AGENTPAD_LIVE_MONITOR_LED_COUNT) {
        interleave_capture_all = false;
        rgb_matrix_color_all_observer_kb(0xD1U, 0xD2U, 0xD3U);
    }
    for (size_t index = midpoint; index < length; ++index) {
        destination_bytes[index] = source_bytes[index];
    }
    return destination;
}

void raw_hid_send(uint8_t *data, uint8_t length) {
    assert(length == REPORT_LENGTH);
    assert(sent_count == 0U);
    memcpy(reply, data, REPORT_LENGTH);
    sent_count = 1U;
}

static void clear_reply(void) {
    memset(reply, 0xCC, sizeof(reply));
    sent_count = 0U;
}

static bool send_request(uint8_t command, uint8_t operation, uint8_t chunk, uint8_t length) {
    uint8_t request[REPORT_LENGTH] = {0};
    request[0] = command;
    request[1] = operation;
    request[2] = chunk;
    return agentpad_live_monitor_via_command(request, length);
}

static void assert_frame_chunk(uint8_t chunk, uint16_t sequence, uint8_t layer, uint8_t flags) {
    clear_reply();
    assert(send_request(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        chunk,
        REPORT_LENGTH
    ));
    assert(sent_count == 1U);
    assert(reply[0] == AGENTPAD_LIVE_MONITOR_COMMAND);
    assert(reply[1] == AGENTPAD_LIVE_MONITOR_GET_FRAME);
    assert(reply[2] == (uint8_t)(sequence & 0xFFU));
    assert(reply[3] == (uint8_t)(sequence >> 8));
    assert(reply[4] == layer);
    assert(reply[5] == flags);
    assert(reply[6] == chunk);
    assert(reply[7] == 0U);
    for (uint8_t led = 0U; led < AGENTPAD_LIVE_MONITOR_CHUNK_LEDS; ++led) {
        const uint8_t expected = (uint8_t)(chunk * 8U + led);
        const uint8_t offset = (uint8_t)(8U + led * 3U);
        assert(reply[offset] == (uint8_t)(expected + 1U));
        assert(reply[offset + 1U] == (uint8_t)(expected + 2U));
        assert(reply[offset + 2U] == (uint8_t)(expected + 3U));
    }
}

static void assert_invalid_request_preserves_frame(
    uint8_t command, uint8_t operation, uint8_t chunk, uint8_t length
) {
    clear_reply();
    assert(!send_request(command, operation, chunk, length));
    assert(sent_count == 0U);
    assert_frame_chunk(1U, 1U, 0U, 0U);
}

int main(void) {
    for (uint8_t led = 0U; led < AGENTPAD_LIVE_MONITOR_LED_COUNT; ++led) {
        rgb_matrix_color_observer_kb(
            led,
            (uint8_t)(led + 1U),
            (uint8_t)(led + 2U),
            (uint8_t)(led + 3U)
        );
    }
    rgb_matrix_color_observer_kb(AGENTPAD_LIVE_MONITOR_LED_COUNT, 200U, 201U, 202U);

    clear_reply();
    assert(send_request(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_INFO,
        0U,
        REPORT_LENGTH
    ));
    assert(sent_count == 1U);
    assert(reply[0] == 0x7DU);
    assert(reply[1] == 0x01U);
    assert(reply[2] == 1U);
    assert(reply[3] == 0U);
    assert(reply[4] == 24U);
    assert(reply[5] == 8U);
    assert(reply[6] == 3U);
    assert(reply[7] == 20U);
    assert(reply[8] == 0x0FU);
    for (uint8_t index = 9U; index < REPORT_LENGTH; ++index) {
        assert(reply[index] == 0U);
    }

    clear_reply();
    assert(send_request(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        0U,
        REPORT_LENGTH
    ));
    assert(sent_count == 1U);
    assert(reply[0] == AGENTPAD_LIVE_MONITOR_COMMAND);
    assert(reply[1] == AGENTPAD_LIVE_MONITOR_GET_FRAME);
    assert(reply[2] == 1U && reply[3] == 0U);
    assert(reply[4] == 0U);
    assert(reply[5] == 0U);
    assert(reply[6] == 0U);
    assert(reply[7] == 0U);
    assert(reply[8] == 1U);

    rgb_matrix_color_observer_kb(8U, 201U, 202U, 203U);
    assert_frame_chunk(1U, 1U, 0U, 0U);
    assert_frame_chunk(2U, 1U, 0U, 0U);

    assert_invalid_request_preserves_frame(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        0U,
        REPORT_LENGTH - 1U
    );
    assert_invalid_request_preserves_frame(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        0x99U,
        0U,
        REPORT_LENGTH
    );
    assert_invalid_request_preserves_frame(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        AGENTPAD_LIVE_MONITOR_CHUNK_COUNT,
        REPORT_LENGTH
    );
    assert_invalid_request_preserves_frame(
        0x7CU,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        0U,
        REPORT_LENGTH
    );

    agentpad_live_monitor_set_layer(7U);
    agentpad_live_monitor_set_flags((uint8_t)(0x80U | 0x01U | 0x02U));
    clear_reply();
    assert(send_request(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        0U,
        REPORT_LENGTH
    ));
    assert(reply[2] == 2U && reply[3] == 0U);
    assert(reply[4] == 7U);
    assert(reply[5] == (uint8_t)(0x80U | 0x01U | 0x02U));
    assert(reply[8] == 1U && reply[9] == 2U && reply[10] == 3U);

    rgb_matrix_color_all_observer_kb(0xA1U, 0xB2U, 0xC3U);
    clear_reply();
    assert(send_request(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        0U,
        REPORT_LENGTH
    ));
    assert(reply[2] == 3U && reply[3] == 0U);
    assert(reply[8] == 0xA1U && reply[9] == 0xB2U && reply[10] == 0xC3U);
    clear_reply();
    assert(send_request(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        2U,
        REPORT_LENGTH
    ));
    assert(reply[2] == 3U && reply[3] == 0U);
    assert(reply[4] == 7U);
    assert(reply[5] == (uint8_t)(0x80U | 0x01U | 0x02U));
    assert(reply[6] == 2U);
    for (uint8_t offset = 8U; offset < REPORT_LENGTH; offset += 3U) {
        assert(reply[offset] == 0xA1U);
        assert(reply[offset + 1U] == 0xB2U);
        assert(reply[offset + 2U] == 0xC3U);
    }

    rgb_matrix_color_all_observer_kb(0x11U, 0x22U, 0x33U);
    interleave_capture_all = true;
    clear_reply();
    assert(send_request(
        AGENTPAD_LIVE_MONITOR_COMMAND,
        AGENTPAD_LIVE_MONITOR_GET_FRAME,
        0U,
        REPORT_LENGTH
    ));
    assert(reply[2] == 4U && reply[3] == 0U);
    for (uint8_t offset = 8U; offset < REPORT_LENGTH; offset += 3U) {
        assert(reply[offset] == 0xD1U);
        assert(reply[offset + 1U] == 0xD2U);
        assert(reply[offset + 2U] == 0xD3U);
    }

    return 0;
}
