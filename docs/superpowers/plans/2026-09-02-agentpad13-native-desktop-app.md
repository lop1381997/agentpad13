# AgentPad13 Native Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, task by task. Do not spawn subagents: the project owner explicitly requested work in this task.

**Goal:** Build the first native AgentPad13 desktop editor for the eight
persistent Vial layers and encoder map without ever touching Codex's OAI HID
interface.

**Architecture:** A React + TypeScript interface calls a narrow Tauri command
API. The Rust core owns device classification, fixed-size Vial frame encoding,
serial request/response handling, and persistence readback; its transport trait
allows deterministic unit tests without physical USB. HIDAPI is used only by
the production adapter for the FF60:0061 Vial collection.

**Tech Stack:** Tauri 2, Rust stable, HIDAPI, React, TypeScript, Vite, pnpm,
Vitest, Testing Library, and the existing AgentPad13 Vial definition.

**Spec:** docs/superpowers/specs/2026-09-02-agentpad13-native-desktop-app-design.md

## Global Constraints

- Support only VID:PID 303A:8360 on Vial usage FF60:0061, no report ID, with
  exactly 32-byte reports.
- Never open or write the OAI FF00:0061 / Report-ID-6 interface.
- Keep all device writes explicit, serial, scoped to changed cells, and
  verified through readback.
- Do not flash, reset, enumerate, or operate a physical keyboard during
  automated checks.
- Preserve the current firmware, its Vial definition, OAI protocol, and all
  existing build artifacts.
- The application is GPL-2.0-or-later.
- Do not commit, push, merge, publish, sign, or run physical-device actions
  without a new explicit owner approval.

---

## File structure

~~~text
apps/agentpad-desktop/
  package.json                         frontend scripts and pinned dependencies
  pnpm-lock.yaml                       reproducible JavaScript dependency graph
  vite.config.ts                       Vite and cross-repository JSON import setup
  tsconfig.json                        TypeScript compiler configuration
  index.html                           Vite document
  src/
    main.tsx                           React entry point
    App.tsx                            connection/editor composition
    app.css                            responsive AgentPad visual design
    device-definition.ts               typed import of canonical firmware vial.json
    model.ts                           frontend DTOs and domain helpers
    keycodes.ts                        curated codes and AgentPad custom-code derivation
    bridge.ts                          typed Tauri invoke functions
    components/
      ConnectionCard.tsx               discovery, connection, and error state
      LayerTabs.tsx                    eight visible layer selectors
      PadLayout.tsx                    fifteen-control physical layout
      KeyPalette.tsx                   search and action assignment
      EncoderEditor.tsx                CCW/CW binding controls
      UnlockPanel.tsx                  user-driven Vial unlock state
    *.test.tsx                         frontend behaviour tests
  src-tauri/
    Cargo.toml                         Rust and Tauri dependencies
    build.rs                           Tauri build hook
    tauri.conf.json                    desktop bundle metadata
    capabilities/default.json          least-privilege Tauri capability
    src/
      main.rs                          desktop executable entry point
      lib.rs                           Tauri application builder
      domain.rs                        typed AgentPad keymap DTOs
      device.rs                        strict HID candidate classification
      vial_frame.rs                    Vial/VIA frame codec and validation
      transport.rs                     transport trait and HIDAPI adapter
      client.rs                        serial Vial request/read/write client
      commands.rs                      Tauri command boundary and session state
      *_tests.rs                       deterministic Rust unit tests
  packaging/
    99-agentpad13-vial.rules           Linux udev access rule
    LINUX.md                           install and recovery instructions
  README.md                            developer and user guide
  COPYING                              GPL-2.0-or-later text
.github/workflows/
  agentpad-desktop.yml                 non-publishing OS build/test matrix
~~~

## Task 1: Create the reproducible desktop-project foundation

**Files:**

- Create: apps/agentpad-desktop/package.json
- Create: apps/agentpad-desktop/pnpm-lock.yaml
- Create: apps/agentpad-desktop/tsconfig.json
- Create: apps/agentpad-desktop/vite.config.ts
- Create: apps/agentpad-desktop/index.html
- Create: apps/agentpad-desktop/src/main.tsx
- Create: apps/agentpad-desktop/src/App.tsx
- Create: apps/agentpad-desktop/src/app.css
- Create: apps/agentpad-desktop/src-tauri/Cargo.toml
- Create: apps/agentpad-desktop/src-tauri/build.rs
- Create: apps/agentpad-desktop/src-tauri/tauri.conf.json
- Create: apps/agentpad-desktop/src-tauri/capabilities/default.json
- Create: apps/agentpad-desktop/src-tauri/src/main.rs
- Create: apps/agentpad-desktop/src-tauri/src/lib.rs
- Create: apps/agentpad-desktop/README.md
- Create: apps/agentpad-desktop/COPYING

**Interfaces:**

- Produces the commands "pnpm test", "pnpm build", "pnpm tauri dev", and
  "cargo test" from the desktop app root.
- Uses local "@tauri-apps/cli"; no global Tauri CLI is required.
- Uses the installed local prerequisites: Rust/Cargo, Node, pnpm, Xcode,
  HIDAPI, and pkgconf.

- [ ] **Step 1: Write a failing project-contract test**

Create "src/project-contract.test.ts" with:

~~~ts
import { describe, expect, it } from "vitest";
import definition from "../../../firmware/loudest_micro/keymaps/vial_oai/vial.json";

describe("AgentPad desktop project contract", () => {
  it("imports the canonical eight-layer AgentPad definition", () => {
    expect(definition.vendorId).toBe("0x303A");
    expect(definition.productId).toBe("0x8360");
    expect(definition.matrix).toEqual({ rows: 4, cols: 4 });
    expect(definition.customKeycodes).toHaveLength(20);
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails before the frontend exists**

Run:

~~~sh
cd apps/agentpad-desktop && pnpm test --run src/project-contract.test.ts
~~~

Expected: command fails because the project and Vitest configuration do not
exist.

- [ ] **Step 3: Add the Tauri, React, TypeScript, and test manifests**

Use React + TypeScript + Vite. Add runtime packages:

~~~text
@tauri-apps/api
react
react-dom
~~~

Add development packages:

~~~text
@tauri-apps/cli
@types/react
@types/react-dom
@vitejs/plugin-react
typescript
vite
vitest
jsdom
@testing-library/react
@testing-library/jest-dom
~~~

In "src-tauri/Cargo.toml", add:

~~~toml
[dependencies]
tauri = { version = "2", features = [] }
hidapi = { version = "2", default-features = false, features = ["macos-shared-device", "linux-native", "windows-native"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"

[build-dependencies]
tauri-build = { version = "2", features = [] }
~~~

Configure Vite to allow the canonical "firmware/.../vial.json" import from the
repository root. Configure Tauri with application identifier
"com.hirlu.agentpad13", product name "AgentPad13", and no plugins.

- [ ] **Step 4: Install and lock application dependencies**

Run:

~~~sh
cd apps/agentpad-desktop && pnpm install
cd apps/agentpad-desktop/src-tauri && cargo fetch
~~~

Expected: "pnpm-lock.yaml" and "Cargo.lock" are generated. No firmware or USB
device is changed.

- [ ] **Step 5: Add the smallest renderable shell**

Make "App.tsx" render "AgentPad13" and an empty disconnected state. Make
"main.tsx" use React StrictMode. Include the generated GPL text in "COPYING"
and document the exact local setup commands in "README.md".

- [ ] **Step 6: Verify the foundation**

Run:

~~~sh
cd apps/agentpad-desktop && pnpm test --run src/project-contract.test.ts
cd apps/agentpad-desktop && pnpm build
cd apps/agentpad-desktop/src-tauri && cargo test
~~~

Expected: all commands pass without a physical keyboard.

## Task 2: Implement strict AgentPad/Vial identification and fixed frame codec

**Files:**

- Create: apps/agentpad-desktop/src-tauri/src/domain.rs
- Create: apps/agentpad-desktop/src-tauri/src/device.rs
- Create: apps/agentpad-desktop/src-tauri/src/vial_frame.rs
- Create: apps/agentpad-desktop/src-tauri/src/device_tests.rs
- Create: apps/agentpad-desktop/src-tauri/src/vial_frame_tests.rs
- Modify: apps/agentpad-desktop/src-tauri/src/lib.rs

**Interfaces:**

~~~rust
pub const VIAL_REPORT_BYTES: usize = 32;
pub const AGENTPAD_VENDOR_ID: u16 = 0x303A;
pub const AGENTPAD_PRODUCT_ID: u16 = 0x8360;
pub const VIAL_USAGE_PAGE: u16 = 0xFF60;
pub const VIAL_USAGE: u16 = 0x0061;

pub struct HidCandidate {
    pub vendor_id: u16,
    pub product_id: u16,
    pub usage_page: u16,
    pub usage: u16,
    pub report_id: Option<u8>,
    pub report_bytes: usize,
    pub path: String,
}

pub fn is_agentpad_vial(candidate: &HidCandidate) -> bool;
pub fn encode_via(command: u8, data: &[u8]) -> Result<[u8; VIAL_REPORT_BYTES], VialFrameError>;
pub fn encode_vial(command: u8, data: &[u8]) -> Result<[u8; VIAL_REPORT_BYTES], VialFrameError>;
pub fn parse_response(frame: &[u8], expected_command: u8) -> Result<[u8; VIAL_REPORT_BYTES], VialFrameError>;
~~~

- [ ] **Step 1: Write failing strict-identification tests**

Cover one exact Vial candidate plus these rejection cases:

~~~rust
#[test]
fn rejects_oai_collection_with_matching_vid_pid() {
    let candidate = HidCandidate {
        vendor_id: AGENTPAD_VENDOR_ID,
        product_id: AGENTPAD_PRODUCT_ID,
        usage_page: 0xFF00,
        usage: VIAL_USAGE,
        report_id: Some(6),
        report_bytes: 64,
        path: "oai".into(),
    };
    assert!(!is_agentpad_vial(&candidate));
}
~~~

Also reject a wrong VID, wrong PID, wrong usage, a non-empty report ID, and a
report length other than 32.

- [ ] **Step 2: Run the Rust identification test and verify RED**

Run:

~~~sh
cd apps/agentpad-desktop/src-tauri && cargo test rejects_oai_collection_with_matching_vid_pid
~~~

Expected: compilation failure because "HidCandidate" and
"is_agentpad_vial" do not exist.

- [ ] **Step 3: Implement the domain and candidate classifier**

Keep HIDAPI-specific types out of "device.rs". Convert HIDAPI "DeviceInfo"
into "HidCandidate" only in the later transport adapter. "is_agentpad_vial"
must compare all six protocol identity fields with logical AND.

- [ ] **Step 4: Write failing Vial-frame codec tests**

Test these exact arrays:

~~~rust
assert_eq!(encode_via(0x04, &[3, 2, 1]).unwrap()[..6], [0x04, 3, 2, 1, 0, 0]);
assert_eq!(encode_via(0x05, &[7, 3, 0, 0x7e, 0x13]).unwrap()[..6], [0x05, 7, 3, 0, 0x7e, 0x13]);
assert_eq!(encode_vial(0x03, &[4, 0]).unwrap()[..4], [0xfe, 0x03, 4, 0]);
assert!(encode_via(0x04, &[0; 32]).is_err());
~~~

Add tests that require exactly 32-byte input frames and reject response command
mismatches.

- [ ] **Step 5: Implement the frame codec**

"encode_via" stores the command at byte 0. "encode_vial" stores prefix FE at
byte 0 and the Vial operation at byte 1. Both zero-fill the remainder and
reject payloads too large for the frame. "parse_response" rejects a non-32-byte
frame and a response whose first byte is not the expected VIA command.

- [ ] **Step 6: Verify the pure protocol core**

Run:

~~~sh
cd apps/agentpad-desktop/src-tauri && cargo test device_tests vial_frame_tests
~~~

Expected: all strict matching and fixed-frame tests pass without HIDAPI device
enumeration.

## Task 3: Add a testable Vial keymap, encoder, and unlock client

**Files:**

- Create: apps/agentpad-desktop/src-tauri/src/transport.rs
- Create: apps/agentpad-desktop/src-tauri/src/client.rs
- Create: apps/agentpad-desktop/src-tauri/src/client_tests.rs
- Modify: apps/agentpad-desktop/src-tauri/src/domain.rs
- Modify: apps/agentpad-desktop/src-tauri/src/lib.rs

**Interfaces:**

~~~rust
pub trait VialTransport: Send {
    fn write(&mut self, report: &[u8; VIAL_REPORT_BYTES]) -> Result<(), TransportError>;
    fn read_timeout(&mut self, timeout_ms: i32) -> Result<[u8; VIAL_REPORT_BYTES], TransportError>;
}

pub struct VialClient<T: VialTransport> { /* serial transport owner */ }

impl<T: VialTransport> VialClient<T> {
    pub fn read_snapshot(&mut self) -> Result<KeymapSnapshot, ClientError>;
    pub fn write_changes(&mut self, changes: &[KeyChange]) -> Result<SaveResult, ClientError>;
    pub fn read_encoder(&mut self, layer: u8) -> Result<EncoderBinding, ClientError>;
    pub fn write_encoder(&mut self, change: EncoderChange) -> Result<(), ClientError>;
    pub fn unlock_status(&mut self) -> Result<UnlockStatus, ClientError>;
    pub fn begin_unlock(&mut self) -> Result<(), ClientError>;
    pub fn poll_unlock(&mut self) -> Result<UnlockStatus, ClientError>;
    pub fn lock(&mut self) -> Result<(), ClientError>;
}
~~~

- [ ] **Step 1: Write failing fake-transport tests for an eight-layer read**

Implement an in-memory transport that records outgoing frames and returns
queued responses. Test that "read_snapshot()" first checks command 11 and
rejects any layer count other than 8, then reads 16 cells for each layer using
command 04.

- [ ] **Step 2: Run the snapshot test and verify RED**

Run:

~~~sh
cd apps/agentpad-desktop/src-tauri && cargo test reads_exactly_eight_four_by_four_layers
~~~

Expected: compilation failure because "VialTransport" and "VialClient" do not
exist.

- [ ] **Step 3: Implement immutable keymap DTOs and serial reads**

Define "MatrixPosition", "KeyChange", "EncoderBinding", "EncoderChange",
"UnlockStatus", "KeymapSnapshot", and "SaveResult" in "domain.rs". Preserve
all sixteen matrix cells per layer, even though the React view later hides the
unused cell. Reject out-of-range layers, rows, columns, directions, and keycode
payloads before writing frames.

- [ ] **Step 4: Write failing save/readback tests**

Test a two-cell change set. The fake transport must see two 05 frames in input
order and then two corresponding 04 readback frames. Test a mismatch response:

~~~rust
assert!(matches!(
    client.write_changes(&changes),
    Err(ClientError::ReadbackMismatch { layer: 2, row: 1, col: 3, .. })
));
~~~

- [ ] **Step 5: Implement safe writes and readback**

Skip unchanged values, send writes one at a time, read back immediately after
each write, and stop at the first transport or readback error. Return all
successfully verified changes in "SaveResult"; do not silently retry writes.

- [ ] **Step 6: Add encoder and physical-unlock tests**

Verify:

1. Encoder reads use FE 03 with layer and encoder index 0.
2. Encoder writes use FE 04 with direction 0 for counter-clockwise or 1 for
   clockwise.
3. Unlock status parses FE 05 response bytes 0 and 1 plus row/column pairs
   from byte 2 onward.
4. Starting and polling unlock only emit FE 06 and FE 07; no keyboard or OAI
   frame can be emitted by this client.

- [ ] **Step 7: Verify the Vial client**

Run:

~~~sh
cd apps/agentpad-desktop/src-tauri && cargo test client_tests
~~~

Expected: all reads, writes, readback, encoder, and unlock paths pass with the
fake transport only.

## Task 4: Add the HIDAPI production adapter and Tauri command boundary

**Files:**

- Modify: apps/agentpad-desktop/src-tauri/src/transport.rs
- Create: apps/agentpad-desktop/src-tauri/src/commands.rs
- Create: apps/agentpad-desktop/src-tauri/src/commands_tests.rs
- Modify: apps/agentpad-desktop/src-tauri/src/lib.rs
- Modify: apps/agentpad-desktop/src-tauri/src/main.rs

**Interfaces:**

~~~rust
#[tauri::command]
pub fn list_agentpad_devices(state: tauri::State<AppState>) -> Result<Vec<DeviceSummary>, AppError>;

#[tauri::command]
pub fn connect_agentpad(path: String, state: tauri::State<AppState>) -> Result<EditorSnapshot, AppError>;

#[tauri::command]
pub fn save_keymap_changes(changes: Vec<KeyChange>, state: tauri::State<AppState>) -> Result<SaveResult, AppError>;

#[tauri::command]
pub fn save_encoder_change(change: EncoderChange, state: tauri::State<AppState>) -> Result<(), AppError>;

#[tauri::command]
pub fn begin_unlock(state: tauri::State<AppState>) -> Result<(), AppError>;

#[tauri::command]
pub fn poll_unlock(state: tauri::State<AppState>) -> Result<UnlockStatus, AppError>;

#[tauri::command]
pub fn lock_device(state: tauri::State<AppState>) -> Result<(), AppError>;
~~~

- [ ] **Step 1: Write failing command-boundary tests using a fake session factory**

The test factory must be able to return a matching Vial session or an OAI
candidate. Assert that "connect_agentpad" refuses the OAI candidate before any
open call and that saving without a selected session returns
"AppError::NotConnected".

- [ ] **Step 2: Run the command test and verify RED**

Run:

~~~sh
cd apps/agentpad-desktop/src-tauri && cargo test refuses_oai_candidate_before_open
~~~

Expected: compilation failure because the command adapter does not exist.

- [ ] **Step 3: Implement HIDAPI enumeration and opening**

Use HIDAPI only here. Copy every relevant "DeviceInfo" field into a
"HidCandidate", filter through "is_agentpad_vial", and open the user-selected
path only after it matches. Create a 32-byte HIDAPI adapter that rejects short
writes and short reads. Configure HIDAPI shared access on macOS through the
crate feature already added in Task 1.

- [ ] **Step 4: Implement session state and Tauri commands**

Store one selected session behind a mutex. Commands return serialisable DTOs
only; frontend code never receives a HID path that was not returned by
"list_agentpad_devices". Disconnect and explicit lock both clear the session.
No command named "oai", "flash", "reset", or "bootloader" may be registered.

- [ ] **Step 5: Verify command registration and no-OAI boundary**

Run:

~~~sh
cd apps/agentpad-desktop/src-tauri && cargo test commands_tests
cd apps/agentpad-desktop/src-tauri && cargo test
~~~

Expected: all tests pass with fake sessions; no test calls HIDAPI enumeration.

## Task 5: Build the visual eight-layer editor

**Files:**

- Create: apps/agentpad-desktop/src/device-definition.ts
- Create: apps/agentpad-desktop/src/model.ts
- Create: apps/agentpad-desktop/src/keycodes.ts
- Create: apps/agentpad-desktop/src/bridge.ts
- Create: apps/agentpad-desktop/src/components/ConnectionCard.tsx
- Create: apps/agentpad-desktop/src/components/LayerTabs.tsx
- Create: apps/agentpad-desktop/src/components/PadLayout.tsx
- Create: apps/agentpad-desktop/src/components/KeyPalette.tsx
- Create: apps/agentpad-desktop/src/components/EncoderEditor.tsx
- Create: apps/agentpad-desktop/src/components/UnlockPanel.tsx
- Create: apps/agentpad-desktop/src/App.test.tsx
- Create: apps/agentpad-desktop/src/keycodes.test.ts
- Modify: apps/agentpad-desktop/src/App.tsx
- Modify: apps/agentpad-desktop/src/app.css

**Interfaces:**

~~~ts
export type MatrixPosition = { row: number; col: number };
export type KeyChange = MatrixPosition & { layer: number; keycode: number };
export type EditorSnapshot = { layers: number[][][]; encoders: EncoderBinding[] };

export const CUSTOM_KEYCODE_BASE = 0x7e00;
export function customKeycodesFromDefinition(): KeycodeOption[];
export function physicalControlsFromDefinition(): PhysicalControl[];
~~~

- [ ] **Step 1: Write failing custom-keycode mapping tests**

Use the canonical JSON import and assert:

~~~ts
expect(customKeycodesFromDefinition()[0]).toMatchObject({ code: 0x7e00, label: "JSMODE" });
expect(customKeycodesFromDefinition()[2]).toMatchObject({ code: 0x7e02, label: "AG00" });
expect(customKeycodesFromDefinition().at(-1)).toMatchObject({ code: 0x7e13, label: "LAYER" });
~~~

Also assert exactly fifteen physical controls and ensure the 2U key, encoder
press, and TP5 are represented.

- [ ] **Step 2: Run the frontend mapping test and verify RED**

Run:

~~~sh
cd apps/agentpad-desktop && pnpm test --run src/keycodes.test.ts
~~~

Expected: failure because the definition adapter and keycode catalogue do not
exist.

- [ ] **Step 3: Implement definition and keycode adapters**

Import the canonical firmware JSON directly. Decode its KLE-like keymap list
into fifteen renderable controls. Derive AgentPad custom keycodes by their
array index from 7E00. Add a curated code catalogue with categories:
"Basic", "Modifiers", "Navigation", "Media", "Layers", "VialRGB", and
"AgentPad". Preserve a validated four-hex-digit advanced entry.

- [ ] **Step 4: Write failing editor interaction tests**

Mock "bridge.ts" and test:

1. Eight layer tabs render.
2. Selecting a layer and physical control opens the selected key.
3. Choosing an AgentPad action changes only the local draft.
4. "Save to keyboard" sends only draft differences.
5. A save error is visible and retains the local draft.

- [ ] **Step 5: Implement connection, layer, pad, palette, and encoder views**

Use a responsive three-column desktop layout:

1. connection state and unlock controls;
2. eight layer tabs plus the physical pad;
3. key palette and encoder directions.

Make the selected control and unsaved draft visually distinct. A save button
is disabled when there are no changes or no connected session. The unlock
panel displays firmware-provided matrix pairs as "SW1 + SW13" for the known
AgentPad pair, but retains generic row/column text if a future firmware
reports another pair.

- [ ] **Step 6: Implement the typed Tauri bridge**

Use "@tauri-apps/api/core" "invoke" calls only through "bridge.ts". Map Rust
errors into stable UI error messages. Do not import WebHID, WebUSB, a network
client, or OAI identifiers anywhere in frontend source.

- [ ] **Step 7: Verify the React editor**

Run:

~~~sh
cd apps/agentpad-desktop && pnpm test --run
cd apps/agentpad-desktop && pnpm build
~~~

Expected: the frontend tests and production Vite build pass without hardware.

## Task 6: Document Linux access, local verification, and non-publishing CI

**Files:**

- Create: apps/agentpad-desktop/packaging/99-agentpad13-vial.rules
- Create: apps/agentpad-desktop/packaging/LINUX.md
- Create: apps/agentpad-desktop/scripts/packaging-contract.test.ts
- Create: .github/workflows/agentpad-desktop.yml
- Modify: apps/agentpad-desktop/README.md
- Modify: README.md

**Interfaces:**

- Linux udev rule matches only SUBSYSTEM=="hidraw", ATTRS{idVendor}=="303a",
  ATTRS{idProduct}=="8360".
- CI runs no publishing, signing, flashing, or physical-HID operation.

- [ ] **Step 1: Write a failing documentation/CI contract test**

Add "scripts/packaging-contract.test.ts", a Vitest test that asserts the udev
rule includes both lower-case VID/PID values and the workflow's commands
include:

~~~text
pnpm install --frozen-lockfile
pnpm test --run
cargo test
pnpm tauri build --debug
~~~

It must also assert the workflow contains no "publish", "release", "flash",
"bootloader", or "hidapi::HidApi::new" execution command.

- [ ] **Step 2: Run the documentation/CI contract test and verify RED**

Run:

~~~sh
cd apps/agentpad-desktop && pnpm test --run scripts/packaging-contract.test.ts
~~~

Expected: failure because the rule and workflow do not exist.

- [ ] **Step 3: Add Linux and app documentation**

Document local prerequisites, "pnpm install", development start, tests, debug
bundle, USB privacy boundary, physical unlock pair, and how to install the
udev rule manually. State that the app does not flash firmware and that Codex
Desktop continues owning OAI.

Add a short root README entry that links to the application while leaving all
existing firmware sections intact.

- [ ] **Step 4: Add CI build matrix**

Use macOS, Ubuntu, and Windows jobs. Install Node, pnpm, and Rust per runner;
on Ubuntu install only the packages required to compile HIDAPI. CI builds
without a connected keyboard and uploads no release artifact. Do not enable a
workflow trigger that publishes software.

- [ ] **Step 5: Run the full local verification gate**

Run:

~~~sh
cd apps/agentpad-desktop && pnpm install --frozen-lockfile
cd apps/agentpad-desktop && pnpm test --run
cd apps/agentpad-desktop && pnpm build
cd apps/agentpad-desktop/src-tauri && cargo test
cd apps/agentpad-desktop && pnpm tauri build --debug
git diff --check
~~~

Expected: all checks pass. No physical keyboard is connected, opened, flashed,
or reset.

## Final handoff

Report the app directory, exact installed JavaScript and Rust lockfiles, local
macOS build result, and every unperformed external action. Do not create a
commit or push until the owner explicitly asks for one.
