// Host harness for the SW1+SW4 physical return-to-OAI state machine.
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

#include "physical_oai_return_qmk.h"
#include "physical_oai_return.h"

matrix_row_t matrix[MATRIX_ROWS];

typedef struct {
    uint8_t row;
    uint8_t col;
    bool    pressed;
} recorded_event_t;

static recorded_event_t events[8];
static uint8_t          event_count;

bool matrix_is_on(uint8_t row, uint8_t col) {
    return (matrix[row] & ((matrix_row_t)1U << col)) != 0U;
}

void action_exec(keyevent_t event) {
    if (event_count < (sizeof(events) / sizeof(events[0]))) {
        events[event_count++] = (recorded_event_t){event.key.row, event.key.col, event.pressed};
    }
}

static void run_scan(uint32_t now_ms, bool enabled, bool sw1_down, bool sw4_down) {
    matrix[0] = (sw1_down ? ((matrix_row_t)1U << 0) : 0U) |
                (sw4_down ? ((matrix_row_t)1U << 3) : 0U);
    event_count = 0U;
    printf("RETURN %u\n", physical_oai_return_matrix_scan(now_ms, enabled) ? 1U : 0U);
    printf("MASK %u\n", matrix[0]);
    for (uint8_t index = 0U; index < event_count; ++index) {
        printf("EVENT %u %u %u\n", events[index].row, events[index].col, events[index].pressed ? 1U : 0U);
    }
    printf("---\n");
    fflush(stdout);
}

int main(void) {
    unsigned now_ms;
    unsigned enabled;
    unsigned sw1_down;
    unsigned sw4_down;

    physical_oai_return_init();
    while (scanf(" SET %u %u %u %u", &now_ms, &enabled, &sw1_down, &sw4_down) == 4) {
        run_scan((uint32_t)now_ms, enabled != 0U, sw1_down != 0U, sw4_down != 0U);
    }
    return 0;
}
