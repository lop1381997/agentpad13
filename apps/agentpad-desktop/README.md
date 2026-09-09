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

This Studio update does not itself require flashing firmware if the device already
runs the compatible eight-layer OAI/Vial build with VialRGB and dynamic macros.
It does not modify the OAI HID protocol.

## Verification on 2026-09-07

31 frontend tests and 30 Rust tests pass. Clippy passes with warnings denied.
TypeScript and the macOS debug app bundle
build successfully. The UI uses the supplied Stitch HTML's local design tokens
and bundled fonts. Browser visual comparison and physical keyboard acceptance
have not been performed. Export now uses a native save dialog through Tauri,
with cancellation and error handling tested at the UI boundary.
Windows/Linux builds and native file export on those
platforms still need platform verification.

Physical acceptance: connect and unlock; remap one spare key and both encoder
directions; save and reconnect to verify persistence; test a text macro; adjust
VialRGB on L1 and confirm L0 lighting remains unchanged; export/import a profile;
finally lock editing and disconnect. Keep Codex open to check OAI coexistence.

## Verify and bundle

~~~sh
pnpm test --run
pnpm build
(cd src-tauri && cargo test)
pnpm tauri build --debug
~~~

For Linux account access, see [packaging/LINUX.md](packaging/LINUX.md).

## License

GPL-2.0-or-later. The full GPL version 2 text is in [COPYING](COPYING).
