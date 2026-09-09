VIA_ENABLE = no
VIAL_ENABLE = no
RAW_ENABLE = yes
# Keep the inherited joystick HID report on the keyboard endpoint so Direct
# OAI enumerates exactly keyboard + its Raw HID transport.
JOYSTICK_SHARED_EP = yes
KEYBOARD_SHARED_EP = yes
BOOTMAGIC_ENABLE = yes
ENCODER_ENABLE = yes
ENCODER_MAP_ENABLE = no
RGB_MATRIX_ENABLE = yes
CONSOLE_ENABLE = no
COMMAND_ENABLE = no
QMK_SETTINGS = no
TAP_DANCE_ENABLE = no
COMBO_ENABLE = no
LTO_ENABLE = yes

SRC += codex_oai.c
SRC += codex_led.c
