# AgentPad13 OAI + Vial, eight-layer design

## Purpose

Deliver a new, installable AgentPad13 firmware target that combines the
direct Codex OAI controls and LEDs with Vial's standard remapping,
macro and encoder-map facilities.  It is the firmware foundation for the
future branded native AgentPad13 application; that desktop application is
not part of this delivery.

## Deliverable and compatibility

The new target is named `loudest_micro:vial_oai` and publishes its own UF2,
`agentpad13_vial_oai.uf2`.  It does not replace either existing target:

- `loudest_micro:vial` remains the general-purpose Vial firmware.
- `loudest_micro:codex_oai` remains the experimental Direct OAI firmware
  with its existing 64-byte, report-ID-6 USB identity and protocol.

`vial_oai` uses Vial's normal 32-byte Raw HID interface.  OAI frames on
this target have the fixed format `[0xA6, channel, payload_length,
payload..., zero padding]`, where `channel` is `1` (debug) or `2` (RPC),
and `payload_length` is at most `29`.  `0xA6` is outside QMK/VIA's command
range and Vial's `0xFE` prefix, so the keyboard-level Vial pre-dispatcher
can claim OAI frames without ambiguous parsing.  JSON messages are
fragmented into multiple 29-byte frames when necessary.

This is intentionally a new OAI transport identity.  A host using the old
Direct OAI descriptor (`303a:8360`, report ID 6, 64 bytes) cannot use this
target unchanged.  The future AgentPad13 app must discover the Vial device
and use this `0xA6` transport.

## Layer and input behavior

- `DYNAMIC_KEYMAP_LAYER_COUNT` is exactly `8`.
- Layer 0 is the Codex/OAI default.  Its fifteen physical inputs retain the
  current official `AG00` through `ACT12`, encoder-click and touch-layer
  defaults.
- Layer 1 retains hardware controls.  Layers 2 and 3 retain navigation and
  media defaults.  Layers 4 through 7 begin transparent except for an OAI
  encoder-click and a touch layer-cycle key.
- The touch input cycles all eight initial layers.  Vial may replace it
  with any supported layer keycode or action.
- Vial's dynamic encoder map is enabled.  Its initial Codex rotation routes
  to OAI clockwise/counter-clockwise controls; its other initial layers
  match the current scroll, paging and volume defaults.  Vial owns later
  encoder assignments.
- All OAI controls are exposed in `vial.json` as custom keycodes, so a user
  can assign them to any physical key or encoder direction in any of the
  eight layers.

## EEPROM and ownership

Vial is the sole owner of dynamic keymap, macro and encoder-map EEPROM in
`vial_oai`.  The legacy `v.oai.keymap.get` / `v.oai.keymap.set` RPC and its
private wear-leveling store are not enabled for this target.  The direct
target retains that compatibility path unchanged.

## Safety and release constraints

- The new target uses the existing Vial unlock combo and a new Vial keyboard
  UID/definition, so it is not mistaken for the ordinary Vial target.
- The Vial OAI keymap must keep the current OAI readiness gate, native
  fallback behavior, protected ACCEPT behavior and LED renderer.
- No physical flash, USB reset or hardware input operation is part of the
  build or test process.
- Builds use the repository-pinned Vial-QMK source and existing repository
  patches.  The `vial_oai` target must compile alongside `default`, `vial`
  and `codex_oai`.
- Its release UF2 is accompanied by emulator evidence that proves Vial's
  32-byte endpoint, the `0xA6` OAI dispatcher, OAI handshake/fragments and
  the standard Vial protocol are all present.

## Out of scope

- A branded Windows, macOS and Linux desktop application or a `vial-gui`
  fork.
- New OAI commands, LED effects or changes to the locked Direct OAI wire
  contract.
- Changing or deleting existing prebuilt UF2s.
