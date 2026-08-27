// Host proof for the 32-byte OAI transport that coexists with Vial.
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "codex_oai.h"

static uint8_t sent[8][OAI_REPORT_SIZE];
static uint8_t sent_count;

void raw_hid_send(uint8_t *data, uint8_t length) {
    if (length == OAI_REPORT_SIZE && sent_count < 8U) {
        memcpy(sent[sent_count++], data, OAI_REPORT_SIZE);
    }
}

static bool send_rpc(const char *message) {
    size_t length = strlen(message);
    for (size_t offset = 0; offset < length; offset += OAI_MAX_PAYLOAD) {
        size_t chunk = length - offset;
        if (chunk > OAI_MAX_PAYLOAD) {
            chunk = OAI_MAX_PAYLOAD;
        }
        uint8_t frame[OAI_REPORT_SIZE] = {0};
        frame[0] = OAI_VIAL_FRAME_PREFIX;
        frame[1] = OAI_CHANNEL_RPC;
        frame[2] = (uint8_t)chunk;
        memcpy(frame + 3, message + offset, chunk);
        if (!codex_oai_vial_command(frame, sizeof(frame))) {
            return false;
        }
    }
    return true;
}

int main(void) {
    uint8_t frame[OAI_REPORT_SIZE] = {0};
    static const char expected[] = "{\"method\":\"v.oai.hid\",\"params\":{\"k\":\"AG00\",\"act\":1}}\r\n";
    char rebuilt[sizeof(expected)] = {0};
    size_t rebuilt_length = 0;

    codex_oai_init();
    frame[0] = OAI_VIAL_FRAME_PREFIX;
    frame[1] = OAI_CHANNEL_RPC;
    if (!codex_oai_vial_command(frame, sizeof(frame))) {
        return 1;
    }
    frame[0] = 0xFE;
    if (codex_oai_vial_command(frame, sizeof(frame))) {
        return 2;
    }
    if (!send_rpc("{\"method\":\"v.oai.rgbcfg\",\"id\":1,\"params\":{}}")) {
        return 3;
    }
    if (!send_rpc("{\"method\":\"v.oai.thstatus\",\"id\":2,\"params\":[]}")) {
        return 4;
    }
    // Handshake replies are not part of the notification under test.
    sent_count = 0;
    if (!codex_oai_ready() || !codex_oai_notify(OAI_CONTROL_AG00, true) || sent_count < 2U) {
        return 5;
    }
    for (uint8_t index = 0; index < sent_count; ++index) {
        if (sent[index][0] != OAI_VIAL_FRAME_PREFIX || sent[index][1] != OAI_CHANNEL_RPC || sent[index][2] > OAI_MAX_PAYLOAD) {
            return 6;
        }
        if (rebuilt_length + sent[index][2] > sizeof(rebuilt) - 1U) {
            return 7;
        }
        memcpy(rebuilt + rebuilt_length, sent[index] + 3, sent[index][2]);
        rebuilt_length += sent[index][2];
    }
    if (rebuilt_length != sizeof(expected) - 1U || memcmp(rebuilt, expected, sizeof(expected) - 1U) != 0) {
        return 8;
    }
    return 0;
}
