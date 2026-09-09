# AgentPad13 Native Desktop App — MVP design

## Actualización de alcance — 2026-09-09

MVP implementado y ampliado con RGB, macros, perfiles, exportación y distribución OAI. Sus no-objetivos describen el alcance inicial, no todas las funciones actuales. El contenido original se conserva como plan/especificación histórica; no se marcan como ejecutadas pruebas físicas que siguen pendientes. Estado de código: `24d9ebd` en `codex/phase-3`, sin merge.

Referencia: [estado vigente de fase 3](../../PHASE-3-STATUS.md).

## Status

Approved by the project owner on 2026-09-02.

## Purpose

Create the first public, branded AgentPad13 desktop application for macOS,
Windows, and Linux. It gives AgentPad13 OAI + Vial owners a visual way to
customise the eight persistent Vial layers, the encoder map, and AgentPad
custom OAI keycodes.

The application is a native desktop distributable built with Tauri 2. Its user
interface is rendered by the system webview; it is not a browser application
and it does not require a network connection.

## Locked compatibility and safety constraints

- The application supports the current combined firmware only:
  "loudest_micro:vial_oai".
- Device discovery accepts only vendor ID 0x303A, product ID 0x8360, Vial usage
  page/usage FF60:0061, no report ID, and fixed 32-byte reports.
- The application must not open, write to, or consume frames from the OAI
  collection FF00:0061 with Report ID 6. Codex Desktop remains its owner.
- The application does not change firmware, VID/PID, USB descriptors, OAI
  messages, RGB rendering, the physical return-to-OAI chord, or Vial EEPROM
  layout.
- No automated test, build, or setup step opens a physical keyboard, flashes
  firmware, resets EEPROM, or enters the bootloader.
- The first MVP does not use remote services, telemetry, user accounts, or
  cloud synchronisation.
- No commit, push, release, or physical-device operation is authorised by this
  design. Those need separate explicit approval.

## User-visible MVP

### Connection

The home view clearly shows one of these states:

1. No supported AgentPad13 detected.
2. A supported AgentPad13 is available but locked for editing.
3. A supported AgentPad13 is connected and its current Vial map has been read.
4. A transport, protocol, or readback error occurred, with an actionable
   message and a retry action.

The app never guesses by selecting the first keyboard-shaped HID device. It
only lists exact AgentPad13 Vial candidates. If more than one exact candidate
is connected, the user chooses one by the stable HID path shown by the app.

### Eight-layer editor

The editor has layer tabs 0 through 7. Layer 0 is labelled "Codex / OAI" and
layers 1 through 7 are labelled "Layer 1" through "Layer 7" in the first MVP.
It renders the 13 switch positions, the encoder press, and TP5 touch position
using the physical AgentPad13 layout from the canonical Vial definition.

Selecting a position opens a searchable action palette. The first MVP includes:

- common keyboard, modifier, navigation, mouse-wheel, consumer/media, layer,
  and VialRGB keycodes;
- the 20 AgentPad custom keycodes in the exact order in the canonical
  "vial.json" definition; and
- an advanced hexadecimal keycode entry for supported QMK values not yet shown
  in the curated palette.

Edits are local drafts. The application writes nothing until the user chooses
"Save to keyboard". It then writes only changed matrix cells, serially, and
reads every changed cell back. A mismatch leaves the editor in an error state
and reports the affected layer and position.

### Encoder and unlock flow

The editor shows encoder counter-clockwise and clockwise bindings for each
layer. It uses Vial encoder-map messages, not keymap cells, to update those
bindings.

Before a write, the app presents the Vial unlock flow. It asks the firmware
which matrix keys are required, displays "hold SW1 + SW13", starts the bounded
unlock operation only after a user action, and polls it. It never synthesises a
key press. The app can lock the Vial editing session on user request or when it
disconnects.

## Protocol ownership

The AgentPad13 composite USB device has three HID interfaces:

| Interface | Owner | Application behaviour |
| --- | --- | --- |
| Keyboard HID | operating system and QMK | Not opened by the app. |
| Vial raw HID, FF60:0061, 32 bytes, no report ID | AgentPad13 app | Read/write only through the Vial protocol. |
| OAI raw HID, FF00:0061, 64 bytes, Report ID 6 | Codex Desktop | Never opened or sent by the app. |

The Vial client uses only fixed 32-byte frames. The initial protocol subset is:

| Operation | Frame shape |
| --- | --- |
| Read VIA protocol version | 01 followed by zeroes |
| Read layer count | 11 followed by zeroes |
| Read one keycode | 04, layer, row, column, followed by zeroes |
| Write one keycode | 05, layer, row, column, high byte, low byte, followed by zeroes |
| Read encoder directions | FE, 03, layer, encoder, followed by zeroes |
| Write encoder direction | FE, 04, layer, encoder, direction, high byte, low byte, followed by zeroes |
| Vial unlock status/start/poll/lock | FE with operation 05, 06, 07, or 08 |

All decoding validates length and command echo before exposing data to the UI.
The matrix is stored as 4 by 4 Vial cells for wire correctness, while the UI
shows only the fifteen physical AgentPad13 controls.

Custom keycodes are derived from the canonical definition, not duplicated as
independent firmware knowledge:

- base keycode: QK_KB_0, hexadecimal 7E00;
- index: position in the "customKeycodes" array;
- first custom code: JS_MODE;
- third custom code: OAI_AG00;
- final custom code: CODEX_TOUCH_LAYER.

## Technical architecture

~~~text
React + TypeScript UI
        |
Tauri command boundary
        |
Rust application core
  - device matching
  - Vial frame codec
  - serial request queue
  - keymap and encoder model
        |
HID transport abstraction
  - HIDAPI production transport
  - deterministic in-memory test transport
~~~

The Rust core is independent of Tauri and of physical HIDAPI handles. It
accepts a small transport trait, so tests prove discovery rules, frame
construction, errors, write ordering, and readback without enumerating USB.
The Tauri layer owns the production HIDAPI implementation and serialises access
to one selected device.

On macOS, HIDAPI is configured for shared access so normal keyboard operation
is not monopolised. On Linux, the app ships a udev rule and documentation
because unprivileged raw-HID access requires it. Windows relies on the normal
HID stack and needs no custom driver.

## Source and licensing layout

The application lives under "apps/agentpad-desktop". It is deliberately
separate from the firmware build tree.

- "apps/agentpad-desktop/src": React user interface.
- "apps/agentpad-desktop/src-tauri/src": Rust core and Tauri adapter.
- "apps/agentpad-desktop/packaging": Linux udev rule and platform notes.
- "firmware/loudest_micro/keymaps/vial_oai/vial.json": canonical keyboard
  definition imported at build time by the UI.

The app is GPL-2.0-or-later. That is the compatible public-project choice for
using Vial behaviour and definition data alongside GPL-licensed firmware.
Third-party dependency notices remain in their own package manifests.

## Explicit non-goals for the first MVP

- A second implementation of Codex Desktop or an OAI task/LED dashboard.
- Macros, tap dances, combos, key overrides, QMK settings, and saved VialRGB
  profiles. The existing keymap can still contain those values; this MVP does
  not edit them.
- Firmware flashing, firmware download, EEPROM reset, or a web flasher.
- Cross-compilation, signing, notarisation, store publication, or an automatic
  public release. The first build is locally verified on macOS; CI packaging is
  the next delivery boundary.
- A literal fork of Vial GUI. AgentPad13 has its own user interface and narrow
  Vial protocol client.

## Acceptance criteria

1. A macOS build starts without a connected keyboard and shows the expected
   disconnected state.
2. Device matching rejects the keyboard interface and OAI collection even when
   the VID/PID match, and accepts only FF60:0061 with 32-byte Vial reports.
3. The test transport proves all eight layers are read as a 4 by 4 Vial matrix
   and that the UI exposes fifteen physical controls.
4. A matrix change produces the exact Vial set-keycode frame, performs a
   readback, and updates the UI only after matching readback.
5. Encoder map reads and writes use Vial prefix FE operations 03 and 04.
6. The unlock UI renders the keys received from Vial and never fabricates HID
   input.
7. The generated app contains no OAI raw-HID write path and tests assert that
   an FF00:0061 candidate cannot become the selected transport.
8. Rust unit tests, frontend unit tests, production frontend build, and a
   macOS Tauri debug build pass without hardware.

## Later Phase 3 increments

1. Full Vial-style keycode catalogue and editable macros.
2. VialRGB controls, profiles, and import/export of AgentPad layouts.
3. Read-only OAI diagnostics, but only after an explicit coexistence design
   that preserves Codex Desktop's OAI ownership.
4. Signed, notarised, and CI-built Windows, macOS, and Linux packages.
