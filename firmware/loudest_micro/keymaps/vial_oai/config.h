// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

// AgentPad13's OAI + Vial target has its own identity so Vial does not mistake
// it for the ordinary Vial firmware with the same physical layout.
#define VIAL_KEYBOARD_UID {0x3C, 0x01, 0xD0, 0xC2, 0x79, 0x9F, 0xEA, 0xC4}

// Hold SW1 ([0,0]) + SW13 ([3,0]) to unlock Vial security.
#define VIAL_UNLOCK_COMBO_ROWS {0, 3}
#define VIAL_UNLOCK_COMBO_COLS {0, 0}

// Vial owns all eight editable keymaps and the dynamic encoder map.
#define DYNAMIC_KEYMAP_LAYER_COUNT 8

// OAI shares Vial's standard 32-byte Raw HID endpoint.  This prefix is outside
// VIA's command range and Vial's 0xFE command prefix, so via_command_kb() can
// claim only OAI frames before Vial decodes the rest.
#define CODEX_OAI_VIAL
#define OAI_VIAL_FRAME_PREFIX 0xA6
