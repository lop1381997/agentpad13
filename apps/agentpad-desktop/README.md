# AgentPad13 Desktop

AgentPad13 Desktop is the native macOS, Windows, and Linux editor for the
AgentPad13 Vial interface. It presents all eight persistent layers, the
encoder map, standard VialRGB actions, and the pad's custom actions.

## Hardware boundary

The application recognises only VID:PID `303A:8360` on usage page `FF60`,
usage `0061`, with Vial's unnumbered 32-byte reports. It never opens the
separate OAI raw-HID collection, so Codex Desktop remains its owner.

All edits remain local until **Save** is pressed. The app writes changed cells
serially and verifies each keycode or encoder binding by reading it back. It
does not flash firmware, reset the keyboard, enter a bootloader, or send any
network request.

## Prerequisites

- Node.js and pnpm 11
- Rust stable / Cargo
- Platform build tooling for Tauri 2
- HIDAPI and pkg-config when your platform needs them

On macOS with Homebrew, the development prerequisites can be installed with:

~~~sh
brew install rust pnpm pkgconf hidapi
~~~

## Run locally

~~~sh
pnpm install
pnpm tauri dev
~~~

The app does not inspect HID devices until you press **Buscar AgentPad13**.

## Use the editor

1. Press **Buscar AgentPad13**, select the detected Vial device, then **Conectar**.
2. Press **Iniciar desbloqueo físico** and hold the firmware-reported pair:
   `SW1 + SW13`. The app does not emulate this combination.
3. Select any of the eight layers, a physical control or encoder direction,
   then choose an action from the palette.
4. Review amber draft controls and press **Guardar en AgentPad**. A failed readback leaves the
   unsaved draft visible for correction or retry.
5. In Inicio, use **Bloquear edición**, then **Desconectar** when finished.
   These are separate actions. Never disconnect during physical unlock.
   If the polling window ends, use **Continuar comprobación** while holding
   the displayed combination; this resumes polling without restarting unlock.

## Studio functionality

- A permanent virtual keyboard at the top of Studio mirrors all 24 physical
  LEDs: 13 switch LEDs, the fixed layer marker and the peripheral LEDs. On
  compatible firmware it reads atomic three-chunk Vial monitor frames at up to
  20 FPS; it pauses while saving, during Vial unlock, with a hidden window or
  while a previous read is in flight. Its buttons select controls for editing
  only—they never send a key event or open OAI. You can follow the physical
  active layer or pin a different layer to edit. Older firmware stays editable
  and is clearly labelled as a safe preview.
- Eight-layer map, physical controls and both encoder directions; local undo/redo.
- Iluminación has its own layer selector. L0 describes protected Codex lighting;
  L1–L7 share the firmware's global VialRGB effect, speed, hue, saturation and brightness.
- Macros y acciones edits printable ASCII slots and preserves advanced sequences.
  Assign MACRO00–MACRO15 in the map to trigger them. Advanced macro authoring is
  not implemented.
- Perfiles captures the current map plus local drafts. Profiles can be duplicated,
  removed, imported/exported as JSON and compared before preparing device changes.
  Local profiles live in the app's localStorage; JSON is the portable backup.
- Diagnóstico provides a local session report. Ajustes stores high contrast locally.
- Confirmed save groups are removed from the draft; unconfirmed groups remain
  after errors. A failed multi-key group can have partially reached the device:
  retrying writes the same intended values and verifies them again.

Basic editing does not require a reflash when the device already runs compatible
eight-layer dual OAI/Vial firmware with VialRGB and dynamic macros. However,
**coupled OAI key and LED movement requires the new layout firmware** documented
in [OAI-LAYOUT.md](OAI-LAYOUT.md). In Mapa de teclas → L0, choose horizontal,
vertical or a two-key swap; review the draft and save. Presets restore the 13
canonical actions; swaps preserve displaced assignments. Neither changes OAI HID.

**The real-time LED monitor requires the rebuilt dual firmware**
[`agentpad13_oai_vial_dual.uf2`](../../release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2),
which includes `0005-rgb-matrix-color-observer.patch` and Vial command `0x7D`.
Older firmware remains editable but uses the clearly labelled preview state.
The rebuilt artifact has emulator and static-verifier evidence; do not flash it
without completing the explicit physical test runbook.

## Verification recorded through 2026-09-18

42 frontend tests and 46 Rust tests passed on September 18, together with
TypeScript/Vite and a native macOS binary build. The 32 firmware tests directly
covering this feature and Phase 3 passed. The full firmware suite is not claimed
as a fresh result because two concurrent emulator runs had to be stopped. The
DMG wrapper reached macOS's graphical `osascript` packaging stage and needs an
interactive Finder session to finish. Windows/Linux builds and native dialogs
remain unverified here.
The cross-platform workflow is now published on `codex/phase-3`; publication
alone is not evidence of CI success. See [VERIFICATION.md](VERIFICATION.md).

Physical acceptance: install the rebuilt dual UF2 only with explicit approval,
then connect and unlock; remap one spare key and both encoder
directions; save and reconnect to verify persistence; test a text macro; adjust
VialRGB on L1 and confirm L0 lighting remains unchanged; export/import a profile;
finally lock editing and disconnect. Keep Codex open to check OAI coexistence.

## Verify and bundle

The source icon is `src-tauri/icons/agentpad.svg`. Regenerate platform assets
with `pnpm tauri icon src-tauri/icons/agentpad.svg --output src-tauri/icons`.
The PNG, ICO and ICNS outputs must also be listed in `bundle.icon` in
`src-tauri/tauri.conf.json`; having them on disk alone is insufficient.

~~~sh
pnpm test --run
pnpm build
(cd src-tauri && cargo test)
pnpm tauri build --debug
~~~

For Linux account access, see [packaging/LINUX.md](packaging/LINUX.md).

Windows now has two packaging paths: a conventional NSIS installer and a
self-contained x64 portable ZIP with fixed WebView2 and local Data storage.
See [packaging/WINDOWS.md](packaging/WINDOWS.md) for usage, build commands,
runtime updates, profile migration and pending native acceptance. This source
change has not yet produced Windows artifacts in a verified CI run.

## License

GPL-2.0-or-later. The full GPL version 2 text is in [COPYING](COPYING).
