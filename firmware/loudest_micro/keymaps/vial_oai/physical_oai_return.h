// SPDX-License-Identifier: GPL-2.0-or-later
// Physical SW1+SW4 return chord for the Vial + OAI target.
#pragma once

#include <stdbool.h>
#include <stdint.h>

void physical_oai_return_init(void);

/* Processes raw physical matrix state before key lookup.  When enabled is
 * false, the matrix remains untouched so Vial can observe its unlock combo. */
bool physical_oai_return_matrix_scan(uint32_t now_ms, bool enabled);
