#include <assert.h>
#include "../../loudest_micro/keymaps/vial_oai/oai_led_layout.h"

int main(void) {
    codex_led_rgb_t frame[24];
    uint16_t keys[13];
    for (unsigned a = 0; a < 13; ++a) {
        for (unsigned b = 0; b < 13; ++b) {
            for (unsigned i = 0; i < 24; ++i) frame[i] = (codex_led_rgb_t){i + 1, i + 2, i + 3};
            for (unsigned i = 0; i < 13; ++i) keys[i] = 0x7e02 + i;
            keys[a] = 0x7e02 + b;
            keys[b] = 0x7e02 + a;
            oai_led_layout_apply(frame, keys, 0x7e02);
            for (unsigned i = 0; i < 24; ++i) {
                unsigned source = i == a ? b : i == b ? a : i;
                assert(frame[i].r == source + 1);
                assert(frame[i].g == source + 2);
                assert(frame[i].b == source + 3);
            }
        }
    }
    keys[0] = 0x29;
    oai_led_layout_apply(frame, keys, 0x7e02);
    assert(frame[0].r == 0 && frame[0].g == 0 && frame[0].b == 0);
    return 0;
}
