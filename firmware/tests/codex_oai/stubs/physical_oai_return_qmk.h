#pragma once

#include <stdbool.h>
#include <stdint.h>

#define MATRIX_ROWS 4
#define MATRIX_COLS 4

typedef uint8_t matrix_row_t;

typedef struct {
    uint8_t row;
    uint8_t col;
} keypos_t;

typedef struct {
    keypos_t key;
    bool     pressed;
    uint16_t time;
} keyevent_t;

extern matrix_row_t matrix[MATRIX_ROWS];

bool matrix_is_on(uint8_t row, uint8_t col);
void action_exec(keyevent_t event);

#define MAKE_KEYEVENT(event_row, event_col, event_pressed) \
    ((keyevent_t){.key = {.row = (event_row), .col = (event_col)}, .pressed = (event_pressed), .time = 0U})
