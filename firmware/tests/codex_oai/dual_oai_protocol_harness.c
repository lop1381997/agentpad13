// Host proof for the dedicated 64-byte Report-ID-6 OAI transport.
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "codex_oai.h"

static uint8_t dedicated_report[OAI_REPORT_SIZE];
static uint8_t dedicated_length;
static uint8_t dedicated_calls;
static uint8_t legacy_calls;

void oai_raw_hid_send(uint8_t *data, uint8_t length) {
    ++dedicated_calls;
    dedicated_length = length;
    if (length == OAI_REPORT_SIZE) {
        memcpy(dedicated_report, data, OAI_REPORT_SIZE);
    }
}

void raw_hid_send(uint8_t *data, uint8_t length) {
    (void)data;
    (void)length;
    ++legacy_calls;
}

int main(void) {
    static const char request[] = "{\"method\":\"device.status\",\"id\":17,\"params\":{}}\r\n";
    static const char response[] = "{\"result\":{},\"id\":17}\r\n";
    uint8_t frame[OAI_REPORT_SIZE] = {0};

    codex_oai_init();
    frame[0] = OAI_REPORT_ID;
    frame[1] = OAI_CHANNEL_RPC;
    frame[2] = (uint8_t)(sizeof(request) - 1U);
    memcpy(frame + 3, request, sizeof(request) - 1U);
    oai_raw_hid_receive(frame, sizeof(frame));

    if (dedicated_calls != 1U || legacy_calls != 0U || dedicated_length != 64U) {
        return 1;
    }
    if (dedicated_report[0] != 6U || dedicated_report[1] != OAI_CHANNEL_RPC || dedicated_report[2] != sizeof(response) - 1U) {
        return 2;
    }
    if (memcmp(dedicated_report + 3, response, sizeof(response) - 1U) != 0) {
        return 3;
    }
    for (uint8_t index = (uint8_t)(3U + sizeof(response) - 1U); index < sizeof(dedicated_report); ++index) {
        if (dedicated_report[index] != 0U) {
            return 4;
        }
    }
    return 0;
}
