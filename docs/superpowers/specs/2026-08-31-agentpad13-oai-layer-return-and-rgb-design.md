# AgentPad13: return-to-OAI layer chord and layer-aware RGB

## Actualización de alcance — 2026-09-09

Retorno físico SW1+SW4 y transición de 1 segundo implementados; la ampliación de septiembre permite mover acciones y LED de L0 juntos. El contenido original se conserva como plan/especificación histórica; no se marcan como ejecutadas pruebas físicas que siguen pendientes. Estado de código: `24d9ebd` en `codex/phase-3`, sin merge.

Referencia: [estado vigente de fase 3](../../PHASE-3-STATUS.md).

## Purpose

Extend the Phase-3 combined OAI + Vial firmware before work starts on the
native desktop app. The keyboard must always provide a safe physical way to
return to the OAI/Codex layer, while its lighting is owned by Codex only on
that layer and by ordinary VialRGB effects everywhere else.

This is a firmware-only change to the existing local dual-HID candidate. The
native Windows, macOS and Linux app remains out of scope.

## Locked compatibility constraints

- Preserve the combined device identity exactly: VID:PID `303A:8360`,
  manufacturer `hirlu`, product `Codex Micro Lab OAI LED`.
- Preserve exactly three HID interfaces: keyboard, Vial raw HID `FF60:61`
  without a report ID and 32-byte reports, plus OAI raw HID `FF00:61` with
  Report ID `6` and 64-byte reports.
- Preserve OAI request, response, event, LED-task and timing contracts byte
  for byte. The obsolete `0xA6` OAI-over-Vial framing remains unreachable in
  the combined target.
- Keep Vial as the owner of its eight dynamic layers, macros and encoder map.
  Its keymap and RGB settings must remain persistent.
- Do not flash, reset, enumerate or otherwise operate physical hardware
  without a later explicit authorization. Do not push or merge this work.

## Layer model

The OAI/Codex layer is QMK/Vial layer index `0`. It is the boot layer and the
only layer that uses the established Codex task and link renderer. Layers
`1` through `7` remain ordinary Vial dynamic layers and share one VialRGB
effect configuration selected by the user in Vial. Their only renderer-owned
pixel is physical chain index `13`: it remains a solid colour from the active
layer palette so the current layer is visible while every other LED runs the
selected VialRGB effect.

Changing a layer is transient state only. It must not overwrite Vial's dynamic
keymap or change its saved default configuration.

A fresh or reset Vial EEPROM receives RGB controls on layer `3`. Existing
Vial keymaps are deliberately not overwritten: they can be changed in Vial or
reset explicitly by the owner.

## Global return-to-OAI chord

`SW1` plus `SW4` is a fixed physical chord that selects layer `0` from every
layer. The physical matrix coordinates are `SW1 = [0,0]` and `SW4 = [0,3]`.
The chord applies even when Vial assigns different keycodes to either key.

The chord has an `80 ms` simultaneity window:

1. Pressing either member starts a pending physical-chord window and defers
   its ordinary key action.
2. If the other member is pressed while the first is still held and before the
   window expires, consume both actions and select layer `0`.
3. If the other member does not arrive, replay the deferred press and release
   so the currently configured Vial action behaves normally, including hold
   actions.
4. The implementation must detect positions before OAI/Vial keycode dispatch;
   it must not depend on compile-time keycodes or reserve either key from
   Vial's dynamic keymap.

The chord is consumed even when layer `0` is already active. It produces no
normal key/OAI action and, because no layer changes, it does not start a layer
transition animation.

SW1 is also part of Vial's security-unlock pair, `SW1 + SW13`. While Vial has
explicitly started that bounded unlock poll, the chord component is disabled
and leaves both physical matrix rows untouched. This preserves Vial's raw
unlock observation; immediately outside that flow, SW1+SW4 resumes its normal
global return-to-OAI behavior.

## RGB ownership and transition

The active layer is the highest bit of `layer_state | default_layer_state`.
Every genuine active-layer change, regardless of whether it was caused by the
touch control, the global chord, or a Vial-assigned layer keycode, starts one
one-second full-chain transition:

- `250 ms` fade in to the destination layer colour;
- `500 ms` solid hold;
- `250 ms` fade out.

The overlay addresses all 24 logical chain positions. Boards with only the
opaque-SKU population simply have no visible LEDs at the unpopulated positions.
The existing RGB brightness cap remains enforced at the physical LED boundary.

The palette reuses the existing Codex layer palette:

| Layer | Colour | RGB |
| --- | --- | --- |
| 0 | red | `255, 0, 0` |
| 1 | amber | `255, 192, 0` |
| 2 | green | `0, 255, 0` |
| 3 | cyan | `0, 255, 192` |
| 4 | blue | `0, 64, 255` |
| 5 | violet | `128, 0, 255` |
| 6 | magenta | `255, 0, 192` |
| 7 | rose | `255, 0, 64` |

After the transition ends:

- On layer `0`, the existing Codex renderer resumes its task, connection,
  action-feedback, indicator and underglow display from its current OAI
  state.
- On layers `1` through `7`, the custom renderer releases every LED except
  physical index `13` to the standard VialRGB effect engine. Index `13` is
  painted with the active layer's solid palette colour. All non-OAI layers
  deliberately share the same effect, colour, speed and brightness selected
  in Vial; this change does not introduce per-layer VialRGB profiles.

The priority order is: the established on-board calibration overlay, then an
active layer transition, then the layer-specific owner. A rapid second layer
change restarts the transition from the newly selected layer colour. The boot
diagnostic is not a layer change and remains unchanged.

OAI task and LED state continues to update while a non-OAI layer is active,
but it is not rendered until layer `0` returns. VialRGB settings are neither
reset nor rewritten on a layer change.

## Implementation boundaries

The combined `vial_oai` target will receive the physical-chord logic behind
its dynamic-keymap compile guard so the standalone Direct OAI target keeps its
current behaviour. The shared Codex LED module will own the transition state
and palette. The existing RGB hook will select the calibration overlay, the
transition frame, the Codex frame, or standard VialRGB without changing the
USB/OAI paths.

No QMK `COMBO_ENABLE` keycode combo is used: those combos are tied to keycodes
and would stop being global after a Vial remap. The required chord is based on
the two physical matrix positions instead.

## Verification and delivery

The implementation must add or extend automated proof for:

- `SW1 + SW4` returning to layer `0` from all eight layers, consuming both
  actions, and replaying either key normally outside the 80 ms chord window;
- a Vial remap of either physical key not disabling the chord;
- the exact one-second timing, palette and restart-on-rapid-change rules;
- Codex RGB rendering only on layer `0`, with standard VialRGB ownership on
  layers `1` through `7` after the overlay ends;
- preservation of calibration-overlay priority, existing OAI events and
  direct-OAI behaviour;
- Vial dynamic keymap, macro and encoder persistence, and the existing
  three-HID/OAI artifact contract.

Delivery includes a rebuilt local dual UF2, its paired `.vial` file, emulator
evidence, static artifact manifest, release hash, and a physical-runbook row
for the chord, layer flash, Codex display and VialRGB behaviour. Physical
validation remains pending until explicitly authorized.

## Non-goals

- A native desktop app, app port or public distribution pipeline.
- Per-layer saved VialRGB profiles.
- Any new USB interface, VID/PID, report ID, OAI RPC or frame format.
- Changing the historical `agentpad13_vial_oai.uf2` artifact.
