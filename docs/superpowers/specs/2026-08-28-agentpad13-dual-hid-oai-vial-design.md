# AgentPad13: OAI and Vial on dual raw-HID interfaces

## Actualización de alcance — 2026-09-09

Separación Vial/OAI implementada; el layout posterior mantiene VID/PID, interfaces y tramas. El contenido original se conserva como plan/especificación histórica; no se marcan como ejecutadas pruebas físicas que siguen pendientes. Estado de código: `24d9ebd` en `codex/phase-3`, sin merge.

Referencia: [estado vigente de fase 3](../../PHASE-3-STATUS.md).

## Purpose

Deliver one AgentPad13 firmware that preserves the existing Codex Desktop
OAI connection without any host-side change and, at the same time, exposes
Vial's standard configuration protocol.  The user can customise keys,
macros, encoder directions and up to eight layers in Vial while Codex
continues to receive the established OAI events and control the LEDs.

This firmware is the foundation for a future public, branded desktop app for
Windows, macOS and Linux.  That app is out of scope for this firmware change;
until it exists, Vial is used with the supplied device definition.

## Locked compatibility contract

The device-level USB identity stays exactly as the deployed Direct OAI
firmware:

| Property | Required value |
| --- | --- |
| Vendor ID | `0x303A` |
| Product ID | `0x8360` |
| Manufacturer string | `hirlu` |
| Product string | `Codex Micro Lab OAI LED` |

The legacy OAI transport also stays unchanged.  It is exposed on its own HID
interface with usage page and usage `0xFF00:0x61`, Report ID `6`, and
64-byte reports.  Existing request, response, event, framing and timing
behaviour are retained byte for byte.  In particular, Codex Desktop does not
need a new VID/PID, report ID, transport prefix, discovery rule or update.

## USB architecture

The target is a single composite USB device with three HID interfaces:

| Interface | Owner | HID purpose | Contract |
| --- | --- | --- | --- |
| Keyboard | QMK | Keyboard and existing physical inputs | Current keyboard descriptor and behaviour |
| OAI raw HID | AgentPad13 OAI | Codex Desktop RPC, events and LED controls | `FF00:61`, Report ID 6, 64 bytes |
| Vial raw HID | Vial-QMK | Vial discovery, unlock, dynamic keymap, macro and encoder commands | `FF60:61`, no Report ID, 32 bytes |

The order and endpoint allocation must be deterministic in the USB
descriptor, but no host logic may rely on the interface ordinal.  Codex
discovers the OAI raw-HID collection by its current device identity, usage,
Report ID and report length.  Vial discovers the separate standard raw-HID
collection by `FF60:61` and matches the supplied definition to device
`303A:8360`.

The existing single-raw-HID Vial-QMK descriptor machinery will be extended
by a repository-owned, reproducible patch.  The extension supplies two raw
HID report descriptors, endpoints and receive/send paths.  It must not
change descriptor bytes or callback semantics for the existing standalone
`codex_oai` target.

## Firmware routing and configuration

The two raw interfaces are isolated:

- Traffic received through the OAI interface goes directly to the established
  OAI parser and its existing response/event sender.  It never enters VIA or
  Vial dispatch.
- Traffic received through the Vial interface is handled by standard Vial-QMK
  dispatch.  It never enters the OAI parser.
- The experimental `0xA6` OAI-over-Vial framing is not part of this target.
  It will be removed or made unreachable from the dual-interface build, so
  it cannot shadow or redefine either public protocol.

The new keymap target has exactly eight dynamic Vial layers.  Vial owns the
dynamic keymap, macro and encoder-map EEPROM areas.  Its initial layer and
encoder assignments retain the current AgentPad13/Codex defaults, while all
later edits made in Vial persist across power cycles.

OAI actions are Vial custom keycodes included in the supplied `.vial`
definition.  They can be assigned to any supported physical key, layer or
encoder direction.  Invoking one uses the same OAI action path, readiness
gate, protected-ACCEPT behaviour, fallback and LED interaction as the
existing Direct OAI firmware.

The legacy OAI private keymap RPC and its wear-levelled store are not enabled
for the dual target because Vial is the single owner of editable mappings.
They remain unchanged in the standalone `codex_oai` target for backwards
compatibility.

## Build and release model

The dual target replaces the earlier experimental `vial_oai` transport as the
firmware offered for combined testing.  The standalone `default`, `vial` and
`codex_oai` targets remain buildable and unmodified in behaviour.

The build tool will:

1. start from the repository-pinned Vial-QMK revision;
2. apply the existing compatibility patches and the new dual-raw-HID patch;
3. build all four targets in a clean work directory; and
4. verify descriptors, symbols and protocol fixtures before publishing a
   release artifact.

The first deliverable stays local and unpushed:

- `agentpad13_oai_vial_dual.uf2`;
- `agentpad13_oai_vial_dual.vial` using VID/PID `303A:8360` and the eight
  layer definition; and
- a concise installation and test guide.

No firmware is flashed by automation.  The user decides whether and when to
flash the UF2.  No branch is pushed or merged until the user has tested the
artifact and explicitly authorises it.

## Verification and acceptance

Automated verification must cover the following before the artifact is
handed over:

1. The compiled USB descriptors contain one keyboard HID interface, one
   OAI raw-HID interface with the exact locked contract, and one standard
   Vial raw-HID interface.
2. The OAI emulator exercises the legacy handshake, RPC, events, LED state
   and 64-byte Report-ID-6 framing through the OAI path.
3. The Vial emulator exercises discovery, unlock, dynamic keymap writes,
   custom OAI keycode exposure, macros, encoder-map commands and eight-layer
   persistence through the Vial path.
4. A coexistence test sends interleaved OAI and Vial traffic and proves each
   response is emitted only on its owning interface.
5. Existing direct OAI and ordinary Vial contract tests continue to pass.

The manual checklist supplied with the files requires the tester to: flash
the UF2; load the `.vial` definition in Vial; change and persist a key on a
non-default layer; assign and invoke an OAI action; reconnect to confirm the
Vial edit remains; and confirm Codex Desktop still detects the device,
receives actions and controls LEDs.

## Out of scope

- Modifying Codex Desktop, its OAI host protocol or its discovery code.
- A custom desktop application, signing, distribution or public Vial
  catalogue submission.
- New OAI commands, LED effects or changes to the current OAI wire contract.
- Changing or deleting existing prebuilt UF2s before the dual firmware has
  passed automated and manual validation.
