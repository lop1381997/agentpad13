# AgentPad13 Studio Functional App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` inline, task by task. Do not spawn subagents: the project owner explicitly requested work in this task.

**Goal:** Turn the existing AgentPad13 Tauri editor into the complete, native AgentPad13 Studio: a safe Vial-only editor with the approved Studio visual system, eight-layer mapping, VialRGB, text macros, local profiles, diagnostics, and settings.

**Architecture:** Keep the existing Rust HID boundary narrow: it opens only the exact 32-byte Vial collection and owns all reads and writes. Extend that same client with verified VialRGB and dynamic-macro operations, while React owns drafts, undo/redo, local profiles, navigation, accessibility, and the selected Stitch visual language. Every keyboard change remains local until the user presses **Guardar en AgentPad**; the app never opens the OAI collection or sends Codex actions itself.

**Tech Stack:** Tauri 2, Rust stable, HIDAPI, React 19, TypeScript, Vite, Vitest, Testing Library, pnpm, `@tabler/icons-react`, bundled Inter and JetBrains Mono font packages, browser-standard local storage and file import/export APIs.

**Spec:** `docs/superpowers/specs/2026-09-03-agentpad13-studio-mockup-brief.md`

## Execution status — 2026-09-09

Tasks 1–6 are integrated in the native app: Studio shell, eight-layer editor,
undo/redo, safe lock/disconnect, global VialRGB, conservative text macros,
local profiles, diagnostics and accessibility settings. Existing PadLayout
and UnlockPanel components were reused instead of renamed.
Task 7 automated verification: 34 frontend tests and 30 Rust tests passed on
September 9, as did TypeScript/Vite and 175 firmware tests. The macOS debug
bundle and Clippy passed previously; native macOS diagnostic export was verified
September 8. WebKit flows pass with mocked HID. Coupled OAI layout is integrated
under the September 7 extension plan and requires its new firmware for LED movement.
Remaining acceptance: complete visual comparison with the supplied Stitch source,
physical-device checks, Windows/Linux execution and native dialogs there.
Code was published as `24d9ebd` to `codex/phase-3`. No merge or firmware flash occurred.
The original constraints and task recipes below are historical scope; later
explicit owner approvals authorized the layout firmware and branch publication.

## Global Constraints

- Support only VID:PID `303A:8360` on Vial usage `FF60:0061`, no report ID, with exactly 32-byte reports.
- Never enumerate, open, read, or write the OAI `FF00:0061` / report-ID-6 / 64-byte collection.
- Keep all device writes explicit, serial, scoped to changed data, and verified through a readback before persistence where the protocol permits it.
- Keep VialRGB global: it is firmware-owned and applies to layers 1–7; layer 0 is a read-only Codex/OAI lighting explanation.
- Do not claim per-layer RGB configuration, hardware telemetry, OAI connectivity, OLEDs, touch strips, encoder hardware, firmware hooks, or physical chassis customization that the firmware does not expose.
- Dynamic macros are the firmware’s 16 Vial text-macro slots. Preserve non-text/raw macros without rewriting them; only editable text slots are saved by the text editor.
- Do not send `vial_lock` while unlock is in progress. The UI must disable disconnect and lock controls during that state, and the backend must independently reject the unsafe request.
- Do not flash, reset, enter the bootloader, enumerate the physical OAI collection, publish, sign, commit, push, merge, or execute physical-device actions without a new explicit owner approval.
- Preserve all existing unrelated worktree changes. New work is limited to `apps/agentpad-desktop/`, the two Studio planning/spec documents, and required non-publishing CI/docs updates.
- The application remains GPL-2.0-or-later and works on macOS, Windows, and Linux.

---

## File structure

```text
apps/agentpad-desktop/
  package.json                                      bundled fonts and line-icon dependency
  src/
    App.tsx                                         Studio composition and device/draft orchestration
    app.css                                         approved dark Studio design tokens and responsive layout
    bridge.ts                                       typed Tauri commands for VialRGB and macros
    model.ts                                        shared DTOs, profile payloads, drafts, diagnostics
    keycodes.ts                                     existing keycodes plus Macro00–Macro15 catalogue entries
    studio/
      editor-state.ts                               pure staging, undo/redo, diff, safe-save selection helpers
      editor-state.test.ts                          draft and history behavior tests
      macro-text.ts                                 conservative text/raw macro recognition and buffer helpers
      macro-text.test.ts                            macro parsing/encoding safety tests
      profile-store.ts                              versioned local profile persistence/import/export validation
      profile-store.test.ts                         profile persistence and compatibility tests
      studio-data.ts                                layer names, colors, RGB effect labels, diagnostic formatting
    components/
      StudioShell.tsx                               header, navigation, status, responsive layout frame
      DeviceConnectPanel.tsx                        safe discovery/connection onboarding
      HardwarePad.tsx                               15-control semantic pad representation used by pages
      KeymapWorkspace.tsx                           layers, inspector, action search, encoder directions
      ChangeBar.tsx                                 change list, undo/redo, discard, explicit save CTA
      UnlockCard.tsx                                physical unlock progress and safe lock/disconnect controls
      LightingWorkspace.tsx                         global VialRGB settings and layer-0 protection state
      MacroWorkspace.tsx                            16-slot text-macro editor and assignment guidance
      ProfilesWorkspace.tsx                         local profile CRUD, comparison, import/export, staged apply
      DiagnosticsWorkspace.tsx                      factual Vial-only status and exportable report
      SettingsWorkspace.tsx                         local appearance/accessibility preferences
      *.test.tsx                                    page and accessibility behavior tests
  src-tauri/
    src/
      domain.rs                                     VialRGB and macro DTOs alongside existing keymap DTOs
      client.rs                                     VialRGB and macro protocol implementation with readback
      commands.rs                                   safe Tauri command boundary; guarded lock state
      client_tests.rs                               deterministic fake-transport protocol tests
      commands_tests.rs                             safe lock/session behavior tests
  README.md                                         updated user guide and safe unlock/recovery instructions
```

## Task 1: Establish Studio dependencies, pure state, and the local visual system

**Files:**

- Modify: `apps/agentpad-desktop/package.json`
- Modify: `apps/agentpad-desktop/pnpm-lock.yaml`
- Modify: `apps/agentpad-desktop/src/model.ts`
- Create: `apps/agentpad-desktop/src/studio/editor-state.ts`
- Create: `apps/agentpad-desktop/src/studio/editor-state.test.ts`
- Create: `apps/agentpad-desktop/src/studio/studio-data.ts`
- Modify: `apps/agentpad-desktop/src/keycodes.ts`

**Interfaces:**

```ts
export type StudioPage = "home" | "keymap" | "lighting" | "macros" | "profiles" | "diagnostics" | "settings";
export type ChangeSummary = { id: string; scope: "key" | "encoder" | "lighting" | "macro"; label: string; before: string; after: string };
export type DraftHistory<T> = { present: T; undo: T[]; redo: T[] };

export function stageKeyChange(state: DraftState, change: KeyChange, original: number): DraftState;
export function stageEncoderChange(state: DraftState, change: EncoderChange, original: number): DraftState;
export function stageLightingChange(state: DraftState, next: VialRgbState, original: VialRgbState): DraftState;
export function summarizeChanges(snapshot: EditorSnapshot, state: DraftState): ChangeSummary[];
export function undoDraft(history: DraftHistory<DraftState>): DraftHistory<DraftState>;
export function redoDraft(history: DraftHistory<DraftState>): DraftHistory<DraftState>;
```

- [ ] **Step 1: Write the failing pure-state tests**

Create `src/studio/editor-state.test.ts` with three independent assertions:

```ts
it("removes a key draft when the selected action matches the device value", () => {
  const staged = stageKeyChange(emptyDraftState(), { layer: 2, row: 1, column: 3, keycode: 0x7e07 }, 0x0029);
  expect(stageKeyChange(staged, { layer: 2, row: 1, column: 3, keycode: 0x0029 }, 0x0029).keyChanges).toEqual([]);
});

it("undoes and redoes the last staged change without mutating the snapshot", () => {
  const history = pushDraft(emptyDraftHistory(), stageEncoderChange(emptyDraftState(), { layer: 3, direction: "clockwise", keycode: 0x5cc3 }, 0x00a9));
  expect(undoDraft(history).present.encoderChanges).toEqual([]);
  expect(redoDraft(undoDraft(history)).present.encoderChanges).toHaveLength(1);
});

it("labels a VialRGB change as global rather than layer-local", () => {
  expect(summarizeChanges(snapshot, stateWithLightingDraft).at(-1)).toMatchObject({ scope: "lighting", label: "VialRGB global" });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test --run src/studio/editor-state.test.ts`

Expected: the test fails because `studio/editor-state.ts` does not exist.

- [ ] **Step 3: Add the smallest state and catalogue implementation**

Define serializable `DraftState` with `keyChanges`, `encoderChanges`, optional `lighting`, and optional `macroBuffer`. Use stable IDs based on matrix address/direction, de-duplicate a draft by address, and delete it when it equals the original value. Store history snapshots by value, never mutate `EditorSnapshot`.

Add `@tabler/icons-react`, `@fontsource-variable/inter`, and `@fontsource-variable/jetbrains-mono`; import the two fonts from `src/main.tsx`. Add keycodes `MACRO00` through `MACRO15` (`0x5F12` through `0x5F21`) under a new `Macros` category. Add the eight layer labels/colors and VialRGB display names in `studio-data.ts`.

- [ ] **Step 4: Verify GREEN and repository type safety**

Run:

```sh
pnpm test --run src/studio/editor-state.test.ts src/keycodes.test.ts
pnpm build
```

Expected: the new state tests pass, all existing keycode tests pass, and TypeScript emits no files or errors.

## Task 2: Make unlock/lock/disconnect safe in the real Vial boundary

**Files:**

- Modify: `apps/agentpad-desktop/src-tauri/src/commands.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/commands_tests.rs`
- Modify: `apps/agentpad-desktop/src/bridge.ts`
- Modify: `apps/agentpad-desktop/src/components/UnlockPanel.tsx` or replace it with `UnlockCard.tsx`
- Modify: `apps/agentpad-desktop/src/App.test.tsx`

**Interfaces:**

```rust
#[error("The physical Vial unlock is still in progress. Finish it before disconnecting or locking editing.")]
UnlockInProgress,

pub fn lock_device_impl(state: &AppState) -> Result<UnlockStatus, AppError>;
pub fn disconnect_agentpad_impl(state: &AppState) -> Result<(), AppError>;
```

```ts
export function lockDevice(): Promise<UnlockStatus>;
// `disconnectAgentpad` rejects while `unlockStatus.in_progress` is true.
```

- [ ] **Step 1: Write the failing Rust safety regression test**

Add a fake-transport test to `commands_tests.rs` that returns `{ unlocked: false, in_progress: true }` for `vial_get_unlock_status`, invokes `lock_device_impl`, and asserts:

```rust
assert!(matches!(result, Err(AppError::UnlockInProgress)));
assert!(!transport.writes().iter().any(|frame| frame[..2] == [0xFE, 0x08]));
assert!(state_has_session(&state));
```

Add the matching disconnect case: it returns `UnlockInProgress`, keeps the Vial session intact, and sends no lock frame.

- [ ] **Step 2: Verify RED**

Run: `cargo test refuses_lock_or_disconnect_while_vial_unlock_is_in_progress`

Expected: the test fails because the existing implementation drops the session and sends `vial_lock` without checking status.

- [ ] **Step 3: Implement the guarded session operations**

Read `VialClient::unlock_status()` inside the existing session mutex before both operations. Refuse when `in_progress` is true. For a safe completed state, `lock_device_impl` keeps the session open, sends `vial_lock`, reads fresh status, and returns it. `disconnect_agentpad_impl` simply drops the session only after a non-progress status. Do not add automatic locking, cancellation, reconnect tricks, or firmware writes.

- [ ] **Step 4: Write the failing frontend behavior test**

Extend `App.test.tsx` with a snapshot whose `unlockStatus.in_progress` is true, then assert:

```ts
expect(screen.getByText(/No desconectes ni bloquees/i)).toBeVisible();
expect(screen.queryByRole("button", { name: /Bloquear edición/i })).toBeNull();
expect(screen.getByRole("button", { name: /Desconectar/i })).toBeDisabled();
```

- [ ] **Step 5: Implement the safe UI copy**

Replace the combined **Lock & disconnect** action. Show **Desconectar** only when unlock is not in progress. Show **Bloquear edición** only after an unlocked, non-progress status and refresh state from the returned command. During unlock, show the exact physical combo, remaining checks, and the non-dismissible warning that the user must finish the combination or reconnect USB if a prior app/session was interrupted.

- [ ] **Step 6: Verify GREEN**

Run:

```sh
cargo test refuses_lock_or_disconnect_while_vial_unlock_is_in_progress
pnpm test --run src/App.test.tsx
```

Expected: no unsafe Vial lock frame is sent, the session remains usable, and the UI never presents the dangerous combined action.

## Task 3: Add verified VialRGB support and the illumination contract

**Files:**

- Modify: `apps/agentpad-desktop/src-tauri/src/domain.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/client.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/client_tests.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/commands.rs`
- Modify: `apps/agentpad-desktop/src/bridge.ts`
- Modify: `apps/agentpad-desktop/src/model.ts`
- Create: `apps/agentpad-desktop/src/components/LightingWorkspace.tsx`
- Create: `apps/agentpad-desktop/src/components/LightingWorkspace.test.tsx`

**Interfaces:**

```rust
pub struct VialRgbInfo { pub protocol_version: u16, pub maximum_brightness: u8, pub supported_modes: Vec<u16> }
pub struct VialRgbState { pub mode: u16, pub speed: u8, pub hue: u8, pub saturation: u8, pub brightness: u8 }

impl<T: VialTransport> VialClient<T> {
    pub fn read_vialrgb(&mut self) -> Result<(VialRgbInfo, VialRgbState), ClientError>;
    pub fn write_vialrgb(&mut self, next: &VialRgbState) -> Result<VialRgbState, ClientError>;
}
```

```ts
export function getVialRgb(): Promise<VialRgbSnapshot>;
export function saveVialRgb(state: VialRgbState): Promise<VialRgbState>;
```

- [ ] **Step 1: Write failing fake-transport RGB protocol tests**

In `client_tests.rs`, queue fixed 32-byte responses and assert that `read_vialrgb()` emits exactly these first bytes:

```rust
assert_eq!(writes[0][..2], [0x08, 0x40]); // VialRGB info
assert_eq!(writes[1][..2], [0x08, 0x42]); // supported modes, lower bound 0
assert_eq!(writes.last().unwrap()[..2], [0x08, 0x41]); // state
```

For `write_vialrgb`, assert `[0x07, 0x41, mode_lo, mode_hi, speed, hue, saturation, brightness]`, a readback query, then `[0x09, 0x00]`; reject a readback that differs from the requested state.

- [ ] **Step 2: Verify RED**

Run: `cargo test reads_and_persists_vialrgb_with_readback`

Expected: compilation fails because VialRGB DTOs and client methods do not exist.

- [ ] **Step 3: Implement VialRGB protocol methods**

Use VIA command `0x08` with subcommands `0x40`, `0x41`, and paginated `0x42`; parse all values little-endian where VialRGB defines them. Use VIA `0x07` / VialRGB `0x41` to stage the mode and HSVS values in RAM, read it back, then VIA `0x09` to persist. Treat a response with `0xFF` command/status as unsupported and surface a precise error without changing local drafts.

- [ ] **Step 4: Write failing Lighting page tests**

Create tests that render the page with two layer states:

```tsx
expect(screen.getByRole("heading", { name: /Iluminación de Codex/i })).toBeVisible();
expect(screen.getByText(/solo lectura/i)).toBeVisible();
expect(screen.queryByLabelText(/Brillo/i)).toBeNull();

rerender(<LightingWorkspace activeLayer={3} ... />);
fireEvent.change(screen.getByLabelText(/Brillo/i), { target: { value: "82" } });
expect(onStage).toHaveBeenCalledWith(expect.objectContaining({ brightness: 82 }));
```

- [ ] **Step 5: Implement the functional illumination page**

Show the protected layer-0 explanation and visual LED legend without edit controls. For layers 1–7, show the firmware-reported effect selector, hue/saturation/brightness/speed controls, a faithful hardware preview, and a clear **VialRGB global** draft label. Include the two factual transition/indicator cards from the approved brief. Do not present a per-layer RGB save button; submit through the global explicit change bar.

- [ ] **Step 6: Verify GREEN**

Run:

```sh
cargo test reads_and_persists_vialrgb_with_readback
pnpm test --run src/components/LightingWorkspace.test.tsx
```

Expected: actual frames and UI behavior match the VialRGB contract without contacting a physical device.

## Task 4: Add conservative, atomic dynamic text-macro support

**Files:**

- Modify: `apps/agentpad-desktop/src-tauri/src/domain.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/client.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/client_tests.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/commands.rs`
- Modify: `apps/agentpad-desktop/src/bridge.ts`
- Create: `apps/agentpad-desktop/src/studio/macro-text.ts`
- Create: `apps/agentpad-desktop/src/studio/macro-text.test.ts`
- Create: `apps/agentpad-desktop/src/components/MacroWorkspace.tsx`
- Create: `apps/agentpad-desktop/src/components/MacroWorkspace.test.tsx`

**Interfaces:**

```rust
pub struct MacroBuffer { pub count: u8, pub bytes: Vec<u8> }
impl<T: VialTransport> VialClient<T> {
    pub fn read_macro_buffer(&mut self) -> Result<MacroBuffer, ClientError>;
    pub fn write_macro_buffer(&mut self, next: &[u8]) -> Result<MacroBuffer, ClientError>;
}
```

```ts
export type MacroSlot = { index: number; text?: string; rawHex?: string; editable: boolean };
export function parseMacroSlots(bytes: number[], count: number): MacroSlot[];
export function replaceTextMacro(bytes: number[], slot: number, value: string, count: number): number[];
```

- [ ] **Step 1: Write failing macro parser tests**

Use a sixteen-slot buffer that begins `hello\0world\0` and assert that the first two slots are editable text. Add a byte sequence containing QMK’s prefix byte (`0x01`) and assert it is returned as `{ editable: false, rawHex: "01…" }`. Assert that replacing slot 1 preserves every untouched raw slot and keeps the final validity byte zero.

- [ ] **Step 2: Verify RED**

Run: `pnpm test --run src/studio/macro-text.test.ts`

Expected: the module does not exist.

- [ ] **Step 3: Implement the conservative frontend macro codec**

Treat only printable ASCII bytes that do not contain `0x01` as editable text. Preserve non-text data byte-for-byte and render it as a read-only advanced sequence. Validate the requested text is ASCII, contains no NUL byte, occupies capacity after all sixteen null terminators, and leaves the final buffer byte `0x00`.

- [ ] **Step 4: Write failing Rust atomic-write tests**

Test that the client reads macro count (`0x0C`) and buffer size (`0x0D`), retrieves/sets blocks through `0x0E`/`0x0F` in 28-byte chunks, writes a non-zero validity byte before the first content chunk, writes `0x00` as the final byte only after all content, and reads the full buffer back. Add a mismatch test that returns a different buffer and expects `MacroReadbackMismatch`.

- [ ] **Step 5: Verify RED**

Run: `cargo test writes_macro_buffer_atomically_and_reads_it_back`

Expected: the macro client methods do not exist.

- [ ] **Step 6: Implement the macro commands and editor**

Expose `get_macros` and `save_macros` through Tauri. The editor shows 16 firmware slots, one selected slot at a time, a text area only for editable values, capacity information derived from the returned buffer, a raw/advanced warning for preserved slots, and the corresponding `MACRO00`–`MACRO15` assignment code. Staging a macro changes only local draft state; saving uses the global change bar and requires physical unlock.

- [ ] **Step 7: Verify GREEN**

Run:

```sh
pnpm test --run src/studio/macro-text.test.ts src/components/MacroWorkspace.test.tsx
cargo test writes_macro_buffer_atomically_and_reads_it_back
```

Expected: text slots can be safely changed without rewriting uneditable macro sequences, and every firmware write is protected by the valid-flag protocol.

## Task 5: Implement local, versioned profiles and review-before-apply behavior

**Files:**

- Create: `apps/agentpad-desktop/src/studio/profile-store.ts`
- Create: `apps/agentpad-desktop/src/studio/profile-store.test.ts`
- Create: `apps/agentpad-desktop/src/components/ProfilesWorkspace.tsx`
- Create: `apps/agentpad-desktop/src/components/ProfilesWorkspace.test.tsx`
- Modify: `apps/agentpad-desktop/src/model.ts`
- Modify: `apps/agentpad-desktop/src/App.tsx`

**Interfaces:**

```ts
export type AgentPadProfile = {
  schemaVersion: 1;
  device: { vendorId: "303A"; productId: "8360"; matrixRows: 4; matrixColumns: 4; layerCount: 8 };
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layers: number[][][];
  encoders: EncoderBinding[];
  lighting?: VialRgbState;
  macroBuffer?: number[];
  layerNames: string[];
};

export function listProfiles(storage: Storage): AgentPadProfile[];
export function saveProfile(storage: Storage, profile: AgentPadProfile): AgentPadProfile[];
export function parseImportedProfile(input: string): AgentPadProfile;
export function compareProfile(snapshot: EditorSnapshot, profile: AgentPadProfile): ChangeSummary[];
```

- [ ] **Step 1: Write failing profile-store tests**

Test that a profile is stored under the versioned local key, invalid shapes or a non-`303A:8360` profile claim are rejected, import/export round-trips retain all eight `4×4` layers and encoder bindings, and comparison outputs only changed controls.

- [ ] **Step 2: Verify RED**

Run: `pnpm test --run src/studio/profile-store.test.ts`

Expected: the profile store module does not exist.

- [ ] **Step 3: Implement validated local persistence**

Use a single namespaced local-storage key and an explicit schema version. Validate arrays and keycodes before accepting imported JSON; never invoke a device command from import/export. Create a Blob download for export and a hidden file input for import. Profile apply converts the diff into the existing draft state and shows it for review; it does not write to the keyboard.

- [ ] **Step 4: Write failing Profiles page tests**

Render a connected snapshot, save a profile named `Codex Principal`, select it, and assert its diff appears. Click **Preparar cambios** and assert `onApply` receives drafts while `saveKeymapChanges` has not been called.

- [ ] **Step 5: Implement the visual Profiles workflow**

Build the selected Stitch layout as an honest local-profile workspace: profile list with metadata, create/duplicate/delete, comparison dialog, prepare-for-save action, JSON import/export, and backup copy. Make it clear that the computer stores profiles while the keyboard stores only Vial state.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm test --run src/studio/profile-store.test.ts src/components/ProfilesWorkspace.test.tsx`

Expected: profile changes are fully reviewable and never write to a device before the existing explicit Save action.

## Task 6: Compose the approved Studio shell and make every primary route useful

**Files:**

- Modify: `apps/agentpad-desktop/src/App.tsx`
- Modify: `apps/agentpad-desktop/src/app.css`
- Modify: `apps/agentpad-desktop/src/main.tsx`
- Create: `apps/agentpad-desktop/src/components/StudioShell.tsx`
- Create: `apps/agentpad-desktop/src/components/DeviceConnectPanel.tsx`
- Create: `apps/agentpad-desktop/src/components/HardwarePad.tsx`
- Create: `apps/agentpad-desktop/src/components/KeymapWorkspace.tsx`
- Create: `apps/agentpad-desktop/src/components/ChangeBar.tsx`
- Create: `apps/agentpad-desktop/src/components/UnlockCard.tsx`
- Create: `apps/agentpad-desktop/src/components/DiagnosticsWorkspace.tsx`
- Create: `apps/agentpad-desktop/src/components/SettingsWorkspace.tsx`
- Create: `apps/agentpad-desktop/src/components/StudioShell.test.tsx`
- Modify or retire: `ConnectionCard.tsx`, `EncoderEditor.tsx`, `KeyPalette.tsx`, `LayerTabs.tsx`, `PadLayout.tsx`, `UnlockPanel.tsx`
- Modify: `apps/agentpad-desktop/src/App.test.tsx`

**Interfaces:**

```ts
type StudioShellProps = {
  page: StudioPage;
  connected: boolean;
  changeCount: number;
  unlocked: boolean;
  onNavigate: (page: StudioPage) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

type HardwarePadProps = {
  controls: PhysicalControl[];
  activeLayer: number;
  keycodeFor: (control: PhysicalControl) => number;
  selected?: string;
  draftIds: Set<string>;
  onSelect: (control: PhysicalControl) => void;
};
```

- [ ] **Step 1: Write failing Studio-shell navigation tests**

Create `StudioShell.test.tsx` and assert that the header contains the actual connection state, the sidebar has seven named routes, keyboard navigation selects the active route, and the explicit save CTA is disabled for zero drafts or locked editing.

- [ ] **Step 2: Verify RED**

Run: `pnpm test --run src/components/StudioShell.test.tsx`

Expected: the Studio shell does not exist.

- [ ] **Step 3: Build the shared shell from the approved HTML source**

Use the supplied visual language directly: `#0D1117` foundation, `#151B23` panels, `#45D6C1` action color, `#A78BFA` OAI accents, `#F4B860` drafts, Inter plus JetBrains Mono, dense system-like header, left rail, and right-side inspector. Use Tabler’s line icons, semantic buttons, focus-visible outlines, responsive breakpoints at 1120 px and 760 px, and no fake browser title bar or online font request.

- [ ] **Step 4: Write failing keymap and change-bar behavior tests**

Extend `App.test.tsx` with:

```tsx
fireEvent.click(screen.getByRole("button", { name: /SW7/i }));
fireEvent.click(screen.getByRole("button", { name: /ACT07/i }));
expect(screen.getByText(/1 cambio pendiente/i)).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: /Deshacer/i }));
expect(screen.queryByText(/1 cambio pendiente/i)).toBeNull();
```

Add a route test asserting that **Diagnóstico** exposes the literal OAI ownership note and that **Ajustes** persists high contrast locally.

- [ ] **Step 5: Implement all routed workspaces**

Implement:

- **Inicio:** connection state, exact Vial-only explanation, search/connect action, and a helpful connected overview.
- **Mapa de teclas:** eight layer chips, all fifteen physical controls in their correct geometry, encoder CW/CCW selection, filtered action inspector, agent/OAI action cards, local changes, undo/redo, discard, and save review.
- **Iluminación:** Task 3 workspace.
- **Macros y acciones:** Task 4 editor plus the canonical twenty AgentPad/OAI actions derived from `vial.json`.
- **Perfiles:** Task 5 workspace.
- **Diagnóstico:** facts from the active session, last successful read/save, exact Vial report contract, and the immutable text `Canal OAI reservado para Codex — AgentPad13 Studio no lo abre ni lo controla.` Copy/export must use only local browser APIs.
- **Ajustes:** dark/high-contrast selection and local connection/UI preferences; telemetry visibly remains disabled.

Use a single change bar across all writes. Save key cells serially with existing readback, then encoder bindings, VialRGB, and macros. On a partial failure, update only already-confirmed data and leave the unconfirmed draft visible with the exact error.

- [ ] **Step 6: Verify GREEN**

Run:

```sh
pnpm test --run src/App.test.tsx src/components/StudioShell.test.tsx
pnpm build
```

Expected: all major navigation, draft, safe-unlock, and accessibility tests pass, with a production Vite build using no remote UI dependency.

## Task 7: Update user documentation and complete non-physical verification

**Files:**

- Modify: `apps/agentpad-desktop/README.md`
- Modify: `apps/agentpad-desktop/scripts/packaging-contract.test.ts` only if required to cover new packaged dependencies
- Modify: `docs/superpowers/specs/2026-09-03-agentpad13-studio-mockup-brief.md` only if implementation reveals a factual mismatch

- [ ] **Step 1: Write a failing documentation-contract assertion**

Add a test that reads the README and requires the factual safe unlock language:

```ts
expect(readFromApp("README.md")).toContain("No desconectes ni bloquees mientras la comprobación física está en curso");
expect(readFromApp("README.md")).not.toContain("Lock & disconnect");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test --run scripts/packaging-contract.test.ts`

Expected: it fails because the README still names the unsafe combined action.

- [ ] **Step 3: Update the guide**

Document installation, Vial-only device matching, all seven Studio routes, staged-save semantics, the physical unlock process, the recovery step for an interrupted unlock (complete the combo or USB power-cycle), macro limitations, local profile storage/import/export, and the fact no new firmware is needed for the application itself. Do not promise automatic device recovery or physical testing.

- [ ] **Step 4: Run all automated checks**

Run:

```sh
pnpm test --run
pnpm build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
pnpm tauri build --debug --bundles app
git diff --check
```

Expected: all checks pass without requiring an AgentPad13 to be connected or any physical firmware action.

- [ ] **Step 5: Inspect final scope and report the manual test matrix**

Confirm `git status --short` includes only the deliberately changed Studio files plus pre-existing unrelated worktree changes. Report the local macOS application bundle path, exact firmware compatibility requirements, the no-firmware-needed conclusion, and physical checks still required on macOS, Windows, and Linux. Do not commit, push, flash, or publish.

## Plan self-review

- **Spec coverage:** Tasks 1–6 cover the approved visual system, navigation, physical map, eight layers, safe unlock, VialRGB, macros, profiles, diagnostics, settings, and all stated OAI/Vial ownership constraints. Task 7 covers documentation and verification.
- **Safety coverage:** Task 2 contains both backend and UI protections against the observed unlock/lock failure. Tasks 3–5 use drafts and readback/validation; no task reaches OAI or firmware flashing.
- **Type consistency:** `VialRgbState`, `MacroBuffer`, `DraftState`, `AgentPadProfile`, and `ChangeSummary` are defined once in shared domains and consumed by the commands, bridge, state reducer, and views under the same names.
- **Placeholder scan:** no unfinished markers or unbounded error-handling steps remain; every task contains an explicit test, expected red result, minimal implementation direction, and green verification.
