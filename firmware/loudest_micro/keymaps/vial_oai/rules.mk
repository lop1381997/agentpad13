# Vial-owned dynamic keymaps, macros and encoder map, plus the OAI endpoint.
RAW_ENABLE = yes
VIA_ENABLE = yes
VIAL_ENABLE = yes
VIALRGB_ENABLE = yes
ENCODER_MAP_ENABLE = yes
LTO_ENABLE = yes

# Keep the board's joystick/analog behavior enabled without adding a fourth
# standalone HID interface; the approved dual target has keyboard, Vial and OAI
# interfaces only.
JOYSTICK_SHARED_EP = yes
KEYBOARD_SHARED_EP = yes

SRC += ../codex_oai/codex_oai.c
SRC += ../codex_oai/codex_led.c
SRC += live_monitor.c
SRC += encoder_contract.c
SRC += physical_oai_return.c

# Retain the legacy symbol required by the offline artifact verifier; runtime
# encoder dispatch remains exclusively in Vial's dynamic encoder map.
LDFLAGS += -Wl,-u,encoder_update_user
