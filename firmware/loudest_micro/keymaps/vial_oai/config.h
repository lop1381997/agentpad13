// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

// AgentPad13's OAI + Vial target has its own identity so Vial does not mistake
// it for the ordinary Vial firmware with the same physical layout.
#undef VENDOR_ID
#undef PRODUCT_ID
#undef DEVICE_VER
#undef MANUFACTURER
#undef PRODUCT
#undef RAW_USAGE_PAGE
#undef RAW_USAGE_ID
#undef RAW_EPSIZE
#undef RAW_REPORT_ID

#define VENDOR_ID 0x303A
#define PRODUCT_ID 0x8360
#define DEVICE_VER 0x0005
#define MANUFACTURER "hirlu"
#define PRODUCT "Codex Micro Lab OAI LED"

#define RAW_USAGE_PAGE 0xFF60
#define RAW_USAGE_ID 0x61
#define RAW_EPSIZE 32

#define OAI_RAW_HID_ENABLE
#define OAI_RAW_USAGE_PAGE 0xFF00
#define OAI_RAW_USAGE_ID 0x61
#define OAI_RAW_EPSIZE 64
#define OAI_RAW_REPORT_ID 6
#define CODEX_OAI_DUAL_HID
#define CODEX_OAI_DYNAMIC_KEYMAP
#define LOUDEST_CUSTOM_RAW_HID

#define VIAL_KEYBOARD_UID {0x3C, 0x01, 0xD0, 0xC2, 0x79, 0x9F, 0xEA, 0xC4}

// Hold SW1 ([0,0]) + SW13 ([3,0]) to unlock Vial security.
#define VIAL_UNLOCK_COMBO_ROWS {0, 3}
#define VIAL_UNLOCK_COMBO_COLS {0, 0}

// Vial owns all eight editable keymaps and the dynamic encoder map.
#define DYNAMIC_KEYMAP_LAYER_COUNT 8
