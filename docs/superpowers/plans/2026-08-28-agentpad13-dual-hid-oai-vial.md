# AgentPad13 Dual-HID OAI + Vial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single AgentPad13 UF2 that keeps the exact deployed Codex
OAI HID protocol while exposing a separate, standard Vial HID interface with
eight editable layers.

**Architecture:** The Vial-QMK fork is extended by a repository-owned patch
that adds a second vendor raw-HID interface on ChibiOS/RP2040.  QMK's existing
raw HID remains Vial's 32-byte `FF60:61` interface; the new OAI raw HID is the
64-byte, Report-ID-6 `FF00:61` interface.  The `vial_oai` keymap uses the
second interface for the unchanged OAI parser and lets Vial own its normal
raw interface and dynamic EEPROM.

**Tech Stack:** Vial-QMK at `00fc4627cd038ac9b7e9b8bf2b40b50e9e88aecb`,
QMK/ChibiOS USB descriptors on RP2040, C11 host harnesses, Python `unittest`,
Node.js/rp2040js, and the pinned Arm GNU Toolchain 15.2.1.

**Spec:** `docs/superpowers/specs/2026-08-28-agentpad13-dual-hid-oai-vial-design.md`

## Global Constraints

- Preserve device VID/PID `0x303A:0x8360`, manufacturer `hirlu`, and product
  `Codex Micro Lab OAI LED` on the combined target.
- Preserve the OAI interface byte for byte: usage `FF00:61`, Report ID `6`,
  64-byte reports, and the current request/response/event framing.
- Preserve standard Vial raw HID independently: usage `FF60:61`, no Report
  ID, 32-byte reports; no OAI prefix or parser may consume this channel.
- `DYNAMIC_KEYMAP_LAYER_COUNT` is exactly `8`; Vial owns keymap, macro and
  encoder-map persistence in the combined target.
- Build only against the pinned Vial-QMK source in a disposable worktree;
  never flash, reset, discover or write to physical hardware.
- Keep `default`, `vial`, and standalone `codex_oai` behaviour unchanged.
- Publish the first candidate only locally.  Do not push, merge or flash it
  until the user has tested it and explicitly authorises the next action.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `firmware/patches/0003-dual-raw-hid-chibios.patch` | Repository-owned Vial-QMK extension for the second OAI raw-HID interface. |
| `firmware/tools/build_codex_oai.py` | Applies and fingerprints all three QMK patches; builds and locally publishes the dual UF2 and `.vial` definition. |
| `firmware/loudest_micro/keymaps/vial_oai/config.h` | Combined target identity, Vial interface and OAI-interface constants. |
| `firmware/loudest_micro/keymaps/vial_oai/rules.mk` | Enables Vial plus the second OAI raw-HID transport. |
| `firmware/loudest_micro/keymaps/codex_oai/codex_oai.{h,c}` | Transport-neutral OAI parser/sender, with direct and dual callback adapters. |
| `firmware/loudest_micro/keymaps/codex_oai/keymap.c` | Separates dynamic-Vial mapping behaviour from OAI transport selection. |
| `firmware/loudest_micro/loudest_micro.c` | Stops the old `0xA6` pre-dispatch path from participating in the combined target. |
| `firmware/loudest_micro/keymaps/vial_oai/vial.json` | Vial definition matching OAI VID/PID and exposing every OAI custom keycode. |
| `firmware/tools/verify_codex_oai_artifact.py` | Dual-interface artifact profile and manifest writer. |
| `firmware/tests/codex_oai/*dual*` and existing contract tests | Host-side descriptor, routing and OAI/Vial configuration contracts. |
| `firmware/tests/emulator/dual_oai_vial_runner.cjs` | rp2040js USB host that enumerates both raw HID interfaces separately. |
| `firmware/evidence/*dual*`, `release/firmware/prebuilt/*dual*` | Generated local candidate, Vial definition and reproducible evidence. |
| `docs/dual-oai-vial-physical-runbook.md`, `firmware/BUILD.md`, `release/MANIFEST.md` | Tester-facing instructions and artifact integrity record. |

### Task 1: Add the second raw-HID capability to the pinned ChibiOS QMK source

**Files:**
- Create: `firmware/patches/0003-dual-raw-hid-chibios.patch`
- Modify: `firmware/tools/build_codex_oai.py`
- Modify: `firmware/tests/codex_oai/test_build_tool.py`

**Interfaces:**
- Consumes: the existing `RAW_ENABLE` transport and patch `0002`, which adds
  Report-ID-aware descriptor sizing.
- Produces: `OAI_RAW_HID_ENABLE`, `oai_raw_hid_send(uint8_t *, uint8_t)`,
  `oai_raw_hid_task(void)`, and weak
  `oai_raw_hid_receive(uint8_t *, uint8_t)` for RP2040/ChibiOS builds.
- Produces: a second HID collection whose descriptor uses
  `OAI_RAW_USAGE_PAGE`, `OAI_RAW_USAGE_ID`, `OAI_RAW_REPORT_ID`, and
  `OAI_RAW_EPSIZE`; Vial retains the existing `RAW_*` collection.

- [ ] **Step 1: Write the failing patch and builder contracts**

  In `test_build_tool.py`, add a test that requires a third repository patch
  and checks that it changes every needed QMK boundary:

  ```python
  required = (
      "quantum/main.c", "quantum/raw_hid.c", "quantum/raw_hid.h",
      "tmk_core/protocol/host.c", "tmk_core/protocol/host.h",
      "tmk_core/protocol/usb_descriptor.c", "tmk_core/protocol/usb_descriptor.h",
      "tmk_core/protocol/chibios/usb_endpoints.c",
      "tmk_core/protocol/chibios/usb_endpoints.h",
      "tmk_core/protocol/chibios/usb_main.c",
      "OAI_RAW_HID_ENABLE", "oai_raw_hid_receive", "oai_raw_hid_send",
      "OAI_RAW_REPORT_ID", "OAI_RAW_REPORT_PAYLOAD_SIZE",
  )
  for fragment in required:
      self.assertIn(fragment, patch_text)
  ```

  Add tests that `validate_qmk_state()` accepts exactly the three-patch state
  and rejects an unlisted changed QMK file, and that the builder calls patches
  in order `0001`, `0002`, then `0003`.

- [ ] **Step 2: Run the new contract and confirm it fails**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_build_tool.BuildToolSafetyTest -v
  ```

  Expected: FAIL because `0003-dual-raw-hid-chibios.patch` and its builder
  constants do not yet exist.

- [ ] **Step 3: Implement the repository-owned QMK patch**

  Create `0003-dual-raw-hid-chibios.patch` relative to the pinned source with
  `0001` and `0002` applied.  It must add a second raw interface only under
  `OAI_RAW_HID_ENABLE`; a normal QMK/Vial target therefore remains unchanged.
  Use this API shape throughout the patch:

  ```c
  /* quantum/raw_hid.h */
  void oai_raw_hid_receive(uint8_t *data, uint8_t length);
  void oai_raw_hid_send(uint8_t *data, uint8_t length);
  void oai_raw_hid_task(void);

  /* quantum/raw_hid.c */
  __attribute__((weak)) void oai_raw_hid_receive(uint8_t *data, uint8_t length) {}
  void oai_raw_hid_send(uint8_t *data, uint8_t length) {
      host_oai_raw_hid_send(data, length);
  }

  /* tmk_core/protocol/chibios/usb_main.c */
  void oai_raw_hid_task(void) {
      uint8_t buffer[OAI_RAW_EPSIZE];
      while (receive_report(USB_ENDPOINT_OUT_OAI_RAW, buffer, sizeof(buffer))) {
          oai_raw_hid_receive(buffer, sizeof(buffer));
      }
  }
  ```

  Add matching OAI IN/OUT endpoint enum members, endpoint tables, interface
  lookup entry and descriptor fields.  The existing raw/Vial collection stays
  at QMK's stable `RAW_INTERFACE`; append the OAI collection after it.  Give
  it separate interrupt IN/OUT endpoints and use `OAI_RAW_EPSIZE` for both.
  Add `oai_raw_hid_task()` to `quantum/main.c` next to, not instead of,
  `raw_hid_task()`.

  Define `OAI_RAW_REPORT_PAYLOAD_SIZE` as `OAI_RAW_EPSIZE - 1` when
  `OAI_RAW_REPORT_ID` exists, otherwise as `OAI_RAW_EPSIZE`.  Emit the report
  ID and payload count in the OAI report descriptor using the same semantics
  as patch `0002`.

- [ ] **Step 4: Make the build gate reproducible**

  In `build_codex_oai.py`, declare `DUAL_RAW_HID_PATCH`, calculate and store
  its SHA-256 after the patch content is final, and extend the file-digest
  inventory to all QMK files changed by `0003`.  Replace the two-state check
  with explicit allowed states: `0001`, `0001+0002`, and `0001+0002+0003`.
  Apply the three patches in order before linting or compiling.

  The capability check must reject a source tree that lacks either endpoint,
  the OAI descriptor collection, its Report ID support, the send path or the
  receive callback:

  ```python
  required = (
      "OAI_RAW_HID_ENABLE", "OAI_RAW_EPSIZE", "OAI_RAW_REPORT_ID",
      "OAI_RAW_REPORT_PAYLOAD_SIZE", "OAI_RAW_INTERFACE",
      "USB_ENDPOINT_IN_OAI_RAW", "USB_ENDPOINT_OUT_OAI_RAW",
      "oai_raw_hid_send", "oai_raw_hid_receive", "oai_raw_hid_task",
  )
  if not all(fragment in combined_qmk_sources for fragment in required):
      raise BuildError("the required dual Raw HID patch is not applied")
  ```

- [ ] **Step 5: Run tests and an isolated patch application**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_build_tool.BuildToolSafetyTest -v
  git -C <disposable-pinned-vial-qmk> apply firmware/patches/0001-via-command-kb-backport.patch
  git -C <disposable-pinned-vial-qmk> apply firmware/patches/0002-raw-hid-report-id-chibios.patch
  git -C <disposable-pinned-vial-qmk> apply --check firmware/patches/0003-dual-raw-hid-chibios.patch
  git -C <disposable-pinned-vial-qmk> apply firmware/patches/0003-dual-raw-hid-chibios.patch
  ```

  Expected: PASS.  A clean pinned QMK worktree accepts each patch in order;
  its post-patch status contains only the fingerprinted repository-owned
  paths.

- [ ] **Step 6: Commit the capability**

  ```bash
  git add firmware/patches/0003-dual-raw-hid-chibios.patch firmware/tools/build_codex_oai.py firmware/tests/codex_oai/test_build_tool.py
  git commit -m "feat: add dual raw HID support for Vial QMK"
  ```

### Task 2: Route the unchanged OAI protocol through the dedicated interface

**Files:**
- Modify: `firmware/loudest_micro/keymaps/vial_oai/config.h`
- Modify: `firmware/loudest_micro/keymaps/vial_oai/rules.mk`
- Modify: `firmware/loudest_micro/keymaps/vial_oai/vial.json`
- Modify: `firmware/loudest_micro/keymaps/codex_oai/codex_oai.h`
- Modify: `firmware/loudest_micro/keymaps/codex_oai/codex_oai.c`
- Modify: `firmware/loudest_micro/keymaps/codex_oai/keymap.c`
- Modify: `firmware/loudest_micro/loudest_micro.c`
- Create: `firmware/tests/codex_oai/dual_oai_protocol_harness.c`
- Modify: `firmware/tests/codex_oai/test_vial_oai_contract.py`
- Modify: `firmware/tests/codex_oai/stubs/raw_hid.h`

**Interfaces:**
- Consumes: Task 1's `oai_raw_hid_send` and `oai_raw_hid_receive` API.
- Produces: `CODEX_OAI_DUAL_HID` for the combined wire transport and
  `CODEX_OAI_DYNAMIC_KEYMAP` for Vial-owned keymap/encoder persistence.
- Produces: a `vial_oai` target that has device VID/PID `303A:8360`, Vial's
  primary raw endpoint, and a separate legacy OAI endpoint.

- [ ] **Step 1: Write failing dual transport tests**

  Replace the old `0xA6` assertions in `test_vial_oai_contract.py` with these
  contracts:

  ```python
  self.assertIn("#define OAI_RAW_HID_ENABLE", config)
  self.assertIn("#define OAI_RAW_USAGE_PAGE 0xFF00", config)
  self.assertIn("#define OAI_RAW_USAGE_ID 0x61", config)
  self.assertIn("#define OAI_RAW_EPSIZE 64", config)
  self.assertIn("#define OAI_RAW_REPORT_ID 6", config)
  self.assertIn('"vendorId": "0x303A"', vial_json)
  self.assertIn('"productId": "0x8360"', vial_json)
  self.assertNotIn("OAI_VIAL_FRAME_PREFIX", config)
  ```

  Compile `dual_oai_protocol_harness.c` with
  `-DCODEX_OAI_DUAL_HID -DCODEX_OAI_DYNAMIC_KEYMAP -DOAI_RAW_EPSIZE=64
  -DOAI_RAW_REPORT_ID=6`.  The harness stubs both send APIs and asserts that a
  valid OAI RPC sent to `oai_raw_hid_receive()` produces only a 64-byte
  Report-ID-6 reply through `oai_raw_hid_send()`; `raw_hid_send()` must remain
  unused.

- [ ] **Step 2: Run the tests and confirm the old transport fails**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract -v
  ```

  Expected: FAIL because the current target declares `FEED:4C4D` and uses the
  `0xA6` shared Vial endpoint.

- [ ] **Step 3: Configure the dual target and separate the two meanings of Vial**

  In `vial_oai/config.h`, retain the Vial UID, unlock combo and
  `DYNAMIC_KEYMAP_LAYER_COUNT 8`, then set the device identity and dual OAI
  endpoint exactly as follows:

  ```c
  #define VENDOR_ID 0x303A
  #define PRODUCT_ID 0x8360
  #define MANUFACTURER "hirlu"
  #define PRODUCT "Codex Micro Lab OAI LED"

  #define RAW_USAGE_PAGE 0xFF60
  #define RAW_USAGE_ID 0x61
  #define RAW_EPSIZE 32

  #define OAI_RAW_HID_ENABLE
  #define OAI_RAW_USAGE_PAGE 0xFF00
  #define OAI_RAW_USAGE_ID 0x61
  #define OAI_RAW_EPSIZE 64
  #define OAI_RAW_REPORT_ID 6
  #define CODEX_OAI_DUAL_HID
  #define CODEX_OAI_DYNAMIC_KEYMAP
  #define LOUDEST_CUSTOM_RAW_HID
  ```

  Undefine inherited ID/Raw macros before redefining them, as the direct OAI
  target already does.  Keep `RAW_ENABLE`, `VIA_ENABLE`, `VIAL_ENABLE`,
  `ENCODER_MAP_ENABLE` and the shared OAI source files in `rules.mk`.
  Change only `vendorId` and `productId` in `vial.json`; keep the UID, layout
  and full custom-keycode list intact.

- [ ] **Step 4: Make the OAI parser transport-neutral**

  In `codex_oai.h`, make `OAI_REPORT_SIZE`, `OAI_REPORT_ID` and
  `OAI_FRAME_PREFIX` select the existing 64-byte direct values for both the
  standalone and `CODEX_OAI_DUAL_HID` target.  Use
  `CODEX_OAI_DYNAMIC_KEYMAP`, not transport selection, to decide whether the
  private OAI keymap store is compiled.

  In `codex_oai.c`, route every OAI output through one helper and expose the
  dedicated callback only in dual mode:

  ```c
  static void oai_send(uint8_t *report, uint8_t length) {
  #if defined(CODEX_OAI_DUAL_HID)
      oai_raw_hid_send(report, length);
  #else
      raw_hid_send(report, length);
  #endif
  }

  #if defined(CODEX_OAI_DUAL_HID)
  CODEX_OAI_KEEP void oai_raw_hid_receive(uint8_t *data, uint8_t length) {
      oai_receive_frame(data, length);
  }
  #else
  CODEX_OAI_KEEP void raw_hid_receive(uint8_t *data, uint8_t length) {
      oai_receive_frame(data, length);
  }
  #endif
  ```

  Do not change `oai_frame_is_valid`, JSON accumulation, replies, event
  payloads, readiness gating, LED logic or protected-ACCEPT behaviour.

  Update the shared keymap so all Vial-layer, custom-keycode and dynamic
  encoder behaviour tests `CODEX_OAI_DYNAMIC_KEYMAP`.  The standalone target
  keeps its existing private keymap path.  Remove the `CODEX_OAI_VIAL`/`0xA6`
  branch from `via_command_kb()`; `LOUDEST_CUSTOM_RAW_HID` makes Vial's raw
  interface exclusively Vial-owned in the combined target.

- [ ] **Step 5: Run direct and dual protocol checks**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_protocol firmware.tests.codex_oai.test_keymap_contract firmware.tests.codex_oai.test_vial_oai_contract -v
  ```

  Expected: PASS.  The existing direct harness remains a 64-byte Report-ID-6
  test; the new dual harness proves the same bytes use only the second raw HID
  sender, while Vial configuration remains 32-byte and prefix-free.

- [ ] **Step 6: Commit OAI/Vial routing**

  ```bash
  git add firmware/loudest_micro firmware/tests/codex_oai
  git commit -m "feat: route Codex OAI through a dedicated HID interface"
  ```

### Task 3: Verify and publish the combined artifact as a two-interface contract

**Files:**
- Modify: `firmware/tools/build_codex_oai.py`
- Modify: `firmware/tools/verify_codex_oai_artifact.py`
- Modify: `firmware/tests/codex_oai/test_artifact_verifier.py`
- Modify: `firmware/tests/codex_oai/test_build_tool.py`

**Interfaces:**
- Consumes: Task 1's deterministic descriptor patch and Task 2's target
  configuration.
- Produces: profile `dual` for `loudest_micro:vial_oai`, artifact
  `agentpad13_oai_vial_dual.uf2`, definition
  `agentpad13_oai_vial_dual.vial`, and a manifest with both HID interfaces.

- [ ] **Step 1: Write failing verifier fixtures for both interfaces**

  Add a `DUAL_PROFILE` test fixture with the device identity and this evidence
  shape:

  ```python
  evidence = {
      "vid_pid": "303a:8360",
      "oai_interface": {"usage": "ff00:0061", "report_id": 6, "report_bytes": 64},
      "vial_interface": {"usage": "ff60:0061", "report_id": None, "report_bytes": 32},
      "vial_protocol_ack": True,
      "channels_isolated": True,
  }
  ```

  Require `oai_raw_hid_receive`, `codex_oai_notify`, `codex_led_render` and
  `encoder_update_user` as dual symbols.  Assert that an evidence object with
  either interface missing, swapped report sizes, a Vial Report ID, or an OAI
  usage other than `FF00:61` raises `VerificationError`.

  Add a fixture ELF-binary byte sequence containing one keyboard descriptor,
  a Vial `FF60:61` collection and an OAI `FF00:61`/Report-ID-6 collection.
  Require the new descriptor parser to reject the fixture when either raw
  interface or either matching endpoint pair is absent.

- [ ] **Step 2: Run verifier tests and confirm they fail**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_artifact_verifier -v
  ```

  Expected: FAIL because the current verifier profile represents only one raw
  HID interface per artifact.

- [ ] **Step 3: Implement the dual profile and local output names**

  Add a small immutable HID-interface profile type and let `ArtifactProfile`
  own a tuple of expected raw interfaces.  Keep the old direct profile and
  its top-level manifest fields for compatibility.  For the dual profile,
  write a top-level `vid_pid` plus an `interfaces` array containing these
  exact entries in descriptor order:

  ```python
  (
      {"role": "vial", "usage": "ff60:0061", "report_id": None, "report_bytes": 32},
      {"role": "oai", "usage": "ff00:0061", "report_id": 6, "report_bytes": 64},
  )
  ```

  Change the builder's combined output constant to
  `DUAL_OAI_VIAL_ARTIFACT = ... / "agentpad13_oai_vial_dual.uf2"` and add
  `DUAL_OAI_VIAL_DEFINITION = ... / "agentpad13_oai_vial_dual.vial"`.
  Publish both atomically from the built UF2 and
  `keymaps/vial_oai/vial.json`.  Do not overwrite the earlier
  `agentpad13_vial_oai.uf2`.

  Add `verify_usb_descriptor_contract(elf, profile)`.  It must scan the
  ELF-derived binary for the USB configuration descriptor, parse its declared
  total length as a sequence of USB descriptors, and require one boot
  keyboard HID interface plus the profile's raw HID interface descriptors and
  IN/OUT endpoint sizes.  It must also scan the compiled report descriptors
  for the exact page, usage, report-count and Report-ID items of each raw
  interface.  Run this check inside `verify()` before returning a manifest.
  This static ELF check is authoritative for the complete composite
  descriptor; it does not rely on a simulator control-transfer limitation.

- [ ] **Step 4: Run verifier and builder safety suites**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_artifact_verifier firmware.tests.codex_oai.test_build_tool -v
  ```

  Expected: PASS.  A dual artifact cannot be accepted unless both interfaces,
  OAI events/LED acknowledgements, Vial protocol acknowledgement and channel
  isolation are all demonstrated.

- [ ] **Step 5: Commit verification support**

  ```bash
  git add firmware/tools firmware/tests/codex_oai/test_artifact_verifier.py firmware/tests/codex_oai/test_build_tool.py
  git commit -m "test: verify the dual OAI and Vial HID contract"
  ```

### Task 4: Exercise both interfaces through the RP2040 USB emulator

**Files:**
- Create: `firmware/tests/emulator/dual_oai_vial_runner.cjs`
- Modify: `firmware/tests/emulator/package.json`
- Modify: `firmware/tests/codex_oai/test_emulator_contract.py`
- Modify: `firmware/tests/codex_oai/test_phase3_contract.py`

**Interfaces:**
- Consumes: the dual target UF2 and profile evidence shape from Task 3.
- Produces: `firmware/evidence/dual-oai-vial-emulator.json` whose interface,
  Vial and OAI evidence can be consumed by the verifier.

- [ ] **Step 1: Write the failing dual-emulator contract**

  Add a runner test that requires a dedicated script instead of the
  environment-variable `0xA6` wrapper.  Assert its evidence has two distinct
  endpoint records, the exact OAI and Vial descriptors, a Vial protocol ACK,
  the legacy OAI RGB/status/device acknowledgements, the AG00 key event and
  `channels_isolated: true`.

  The host-only fixture must demonstrate the routing decision with two
  descriptors and endpoint pairs:

  ```javascript
  const oai = hidByReportDescriptor(hidDescriptors, { usagePage: 0xff00, reportBytes: 64 });
  const vial = hidByReportDescriptor(hidDescriptors, { usagePage: 0xff60, reportBytes: 32 });
  if (oai.number === vial.number || oai.inEp === vial.inEp) process.exit(1);
  ```

- [ ] **Step 2: Run the emulator contract and confirm it fails**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_emulator_contract -v
  ```

  Expected: FAIL because the only combined runner still treats `0xA6` frames
  on the single Vial raw interface as OAI traffic.

- [ ] **Step 3: Implement a two-channel USB host fixture**

  Copy only the stable USB-enumeration and RP2040 setup pieces from
  `oai_runner.cjs` into `dual_oai_vial_runner.cjs`.  Parse all HID interfaces,
  request each raw interface's report descriptor separately, and maintain a
  receive queue per OUT endpoint and captured frames per IN endpoint.

  rp2040js currently truncates the multi-packet configuration-descriptor
  transfer after the first packet.  Preserve the bytes it supplies, then
  reconstruct only the known ChibiOS OAI endpoint pair from the verified
  descriptor layout (`OAI_RAW_IN_EPNUM` followed by `OAI_RAW_OUT_EPNUM`) so the
  emulator can exercise endpoint traffic.  The Task-3 ELF verifier, not this
  reconstruction, is the proof of the full descriptor's interface count and
  endpoint allocation.

  Send `0x01` (VIA get-protocol-version) and `0x04` (layer-0 K00 read) only to
  the Vial endpoint.  Send the unchanged Report-ID-6/64-byte OAI RPC frames
  only to the OAI endpoint.  Interleave one Vial probe and one OAI RPC before
  reading replies.  Set `channels_isolated` only when the Vial reply appears
  solely on Vial IN and each OAI reply/event appears solely on OAI IN.

  Export evidence in this exact form:

  ```javascript
  {
    vid_pid: '303a:8360',
    vial_interface: { usage: 'ff60:0061', report_id: null, report_bytes: 32 },
    oai_interface: { usage: 'ff00:0061', report_id: 6, report_bytes: 64 },
    vial_protocol_ack: true,
    channels_isolated: true,
  }
  ```

  Add `smoke:dual-oai-vial` to `package.json` and keep the existing standalone
  Direct and ordinary Vial smoke commands unchanged.  Update phase-3 tests to
  use the new UF2/evidence names and to classify the older `vial_oai` evidence
  as historical rather than current.

- [ ] **Step 4: Run the new emulator gate**

  Run:

  ```bash
  cd firmware/tests/emulator && npm run smoke:dual-oai-vial
  cd ../../.. && python3 -m unittest firmware.tests.codex_oai.test_emulator_contract firmware.tests.codex_oai.test_phase3_contract -v
  ```

  Expected: PASS after a Task-5 candidate build is available.  Before then,
  the test may skip only with its explicit "pre-hardware build gate" message;
  it must never silently pass without a UF2.

- [ ] **Step 5: Commit emulator coverage**

  ```bash
  git add firmware/tests/emulator firmware/tests/codex_oai/test_emulator_contract.py firmware/tests/codex_oai/test_phase3_contract.py
  git commit -m "test: smoke both OAI and Vial HID interfaces"
  ```

### Task 5: Build the local candidate, record evidence and hand off the test package

**Files:**
- Create: `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2`
- Create: `release/firmware/prebuilt/agentpad13_oai_vial_dual.vial`
- Create: `firmware/evidence/dual-oai-vial-emulator.json`
- Create: `firmware/evidence/dual-oai-vial-current-manifest.json`
- Create: `docs/dual-oai-vial-physical-runbook.md`
- Modify: `firmware/BUILD.md`
- Modify: `firmware/evidence/README.md`
- Modify: `release/MANIFEST.md`
- Modify: `docs/superpowers/specs/2026-08-27-agentpad13-oai-vial-eight-layer-design.md`
- Modify: `docs/superpowers/plans/2026-08-27-agentpad13-oai-vial-eight-layer.md`

**Interfaces:**
- Consumes: Tasks 1–4, the pinned QMK worktree and the Arm toolchain.
- Produces: a local, hash-recorded UF2 and `.vial` definition plus the exact
  manual test instructions the user needs; no USB write or remote operation.

- [ ] **Step 1: Add failing release-contract assertions**

  Extend `test_phase3_contract.py` so the current combined candidate must be
  named `agentpad13_oai_vial_dual.uf2`, have a sibling `.vial` file, and agree
  byte-for-byte on hash and size across the UF2, emulator evidence, verifier
  manifest and release manifest.  Require the runbook to name both raw HID
  contracts and these manual checks: Vial layer persistence, custom OAI
  assignment, Codex detection, Codex event/LED response, and recovery UF2.

- [ ] **Step 2: Run the release test and confirm it fails before the build**

  Run:

  ```bash
  python3 -m unittest firmware.tests.codex_oai.test_phase3_contract -v
  ```

  Expected: FAIL because the dual UF2, definition, evidence and manifest have
  not yet been generated.

- [ ] **Step 3: Build, smoke and verify in a disposable QMK worktree**

  Use a clean pinned Vial-QMK checkout with its recorded submodules, then run:

  ```bash
  python3 firmware/tools/build_codex_oai.py --qmk-home <disposable-pinned-vial-qmk> --clean
  cd firmware/tests/emulator && npm run smoke:default && npm run smoke:vial && npm run smoke:codex-oai && npm run smoke:dual-oai-vial
  cd ../../..
  python3 firmware/tools/verify_codex_oai_artifact.py \
    --profile dual \
    --uf2 release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2 \
    --elf <disposable-pinned-vial-qmk>/.build/loudest_micro_vial_oai.elf \
    --evidence firmware/evidence/dual-oai-vial-emulator.json \
    --output firmware/evidence/dual-oai-vial-current-manifest.json
  ```

  Expected: every command passes and only creates repository-owned candidate,
  evidence and manifest files; it performs zero flash operations.

- [ ] **Step 4: Write the tester-facing runbook and mark the old design historical**

  In `docs/dual-oai-vial-physical-runbook.md`, include the generated SHA-256
  and byte size, a literal per-flash authorisation template, BOOTSEL recovery
  instructions, the local `.vial` file path, the Vial unlock combination,
  layer/encoder/macro persistence checks, custom OAI-keycode assignment,
  Codex Desktop detection and OAI event/LED checks.  State that no row is
  physically validated until the user records it.

  Update `firmware/BUILD.md`, the evidence README and release manifest to use
  the new candidate and generated digest.  Add one leading sentence to the
  2026-08-27 design and plan stating that their `0xA6` single-interface design
  is historical and superseded by the 2026-08-28 dual-HID specification.  Do
  not delete or overwrite the prior UF2/evidence.

- [ ] **Step 5: Run the full non-hardware verification matrix**

  Run:

  ```bash
  python3 -m unittest discover -s firmware/tests/codex_oai -p 'test_*.py' -v
  python3 -B manifest_selfverify.py
  cd firmware/tests/emulator && npm run smoke:default && npm run smoke:vial && npm run smoke:codex-oai && npm run smoke:dual-oai-vial
  ```

  Expected: PASS.  Inspect `git status --short` and confirm that changes are
  only the planned dual-HID implementation, generated candidate/evidence and
  documentation; there must be no remote or hardware action.

- [ ] **Step 6: Commit the local test package without pushing**

  ```bash
  git add release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2 release/firmware/prebuilt/agentpad13_oai_vial_dual.vial firmware/evidence docs firmware/BUILD.md release/MANIFEST.md
  git commit -m "build: publish local dual OAI Vial test firmware"
  ```

  Hand the user the UF2, `.vial`, checksum and runbook path.  Stop and wait
  for their physical-test result.  Do not run `git push`, merge the branch or
  flash a keyboard.
