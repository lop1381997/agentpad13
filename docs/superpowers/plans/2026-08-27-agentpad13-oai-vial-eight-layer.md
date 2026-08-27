# AgentPad13 OAI + Vial Eight-Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a separate `vial_oai` UF2 that provides direct OAI controls and Vial-editable keys, encoder directions and eight layers.

**Architecture:** `vial_oai` reuses the proven Codex OAI parser and renderer, but retains Vial's ordinary 32-byte Raw HID descriptor.  A reserved `0xA6` frame prefix is intercepted by `via_command_kb()` before Vial parsing; all other frames keep their Vial behavior.  Vial's dynamic EEPROM keymap and encoder map replace the Direct OAI target's private one-layer action map.

**Tech Stack:** Vial-QMK (pinned `00fc4627cd038ac9b7e9b8bf2b40b50e9e88aecb`), QMK dynamic keymaps, C11, Python `unittest`, Node/rp2040js emulator.

**Spec:** `docs/superpowers/specs/2026-08-27-agentpad13-oai-vial-eight-layer-design.md`

## Global Constraints

- Do not modify `main`, the ordinary `vial` target, or the Direct OAI 64-byte wire contract.
- `vial_oai` has exactly eight Vial dynamic layers and one dynamic encoder map.
- Its OAI packets are exactly 32 bytes and begin with `0xA6`; each carries no more than 29 payload bytes.
- Vial owns all editable keymap, macro and encoder-map EEPROM on `vial_oai`.
- Do not run a physical flash, reset or hardware test.
- Build from the pinned Vial-QMK source and publish only the new `agentpad13_vial_oai.uf2` artifact.

---

## File structure

| File | Responsibility |
| --- | --- |
| `firmware/loudest_micro/keymaps/vial_oai/config.h` | Vial UID, unlock combo, eight-layer and Vial-OAI transport constants. |
| `firmware/loudest_micro/keymaps/vial_oai/rules.mk` | Enables Vial, dynamic encoder maps and the shared OAI sources. |
| `firmware/loudest_micro/keymaps/vial_oai/keymap.c` | Instantiates the shared Codex keymap in Vial-OAI mode. |
| `firmware/loudest_micro/keymaps/vial_oai/vial.json` | AgentPad13 layout plus every OAI custom keycode for Vial. |
| `firmware/loudest_micro/keymaps/codex_oai/codex_oai.h` | Makes the OAI frame shape and prefix selectable by target. |
| `firmware/loudest_micro/keymaps/codex_oai/codex_oai.c` | Fragments OAI output and dispatches `0xA6` frames through Vial safely. |
| `firmware/loudest_micro/keymaps/codex_oai/keymap.c` | Provides eight compiled defaults and routes Vial custom keycodes to OAI. |
| `firmware/tests/codex_oai/test_vial_oai_contract.py` | Static and host-compiled contract for Vial-OAI target files and dispatch. |
| `firmware/tests/codex_oai/vial_oai_protocol_harness.c` | C harness for 32-byte `0xA6` OAI framing and Vial pre-dispatch. |
| `firmware/tests/emulator/vial_oai_runner.cjs` | rp2040js proof of Vial and OAI transport coexistence. |
| `firmware/tools/build_codex_oai.py` | Compiles and atomically publishes the additional target. |
| `firmware/BUILD.md` | Documents the separate UF2 and host transport migration. |

### Task 1: Lock the Vial-OAI contract in failing tests

**Files:**
- Create: `firmware/tests/codex_oai/test_vial_oai_contract.py`
- Create: `firmware/tests/codex_oai/vial_oai_protocol_harness.c`
- Modify: `firmware/tests/codex_oai/test_protocol.py`

**Interfaces:**
- Consumes: existing `codex_oai.c` public functions and `via_command_kb(uint8_t *, uint8_t)` Vial hook.
- Produces: executable proof that a 32-byte `0xA6` packet is claimed by OAI and a `0xFE` Vial packet is not.

- [ ] **Step 1: Write a static target contract test**

```python
def test_vial_oai_uses_vial_and_exactly_eight_dynamic_layers(self):
    self.assertEqual(self.rules["VIA_ENABLE"], "yes")
    self.assertEqual(self.rules["VIAL_ENABLE"], "yes")
    self.assertEqual(self.config["DYNAMIC_KEYMAP_LAYER_COUNT"], "8")
    self.assertIn("#define OAI_VIAL_FRAME_PREFIX 0xA6", self.config_text)
```

- [ ] **Step 2: Run the static contract test to verify it fails**

Run: `python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract -v`

Expected: FAIL because the `vial_oai` keymap directory and its target files do not exist.

- [ ] **Step 3: Add a host C harness for Vial dispatch**

```c
uint8_t frame[32] = {0xA6, 2, 0};
assert(via_command_kb(frame, sizeof(frame)));
frame[0] = 0xFE;
assert(!via_command_kb(frame, sizeof(frame)));
```

The harness defines `raw_hid_send()` and verifies that a long OAI notification
is reassembled exactly from 29-byte fragments.

- [ ] **Step 4: Run the harness test to verify it fails**

Run: `python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract.VialOaiProtocolTest -v`

Expected: FAIL because the OAI source does not yet implement `via_command_kb()` or `0xA6` framing.

- [ ] **Step 5: Commit the red contract**

```bash
git add firmware/tests/codex_oai/test_vial_oai_contract.py firmware/tests/codex_oai/vial_oai_protocol_harness.c firmware/tests/codex_oai/test_protocol.py
git commit -m "test: define Vial OAI transport contract"
```

### Task 2: Create the Vial-OAI target with eight editable layers

**Files:**
- Create: `firmware/loudest_micro/keymaps/vial_oai/config.h`
- Create: `firmware/loudest_micro/keymaps/vial_oai/rules.mk`
- Create: `firmware/loudest_micro/keymaps/vial_oai/keymap.c`
- Create: `firmware/loudest_micro/keymaps/vial_oai/vial.json`
- Modify: `firmware/loudest_micro/keymaps/codex_oai/keymap.c`

**Interfaces:**
- Consumes: `CODEX_OAI_VIAL`, `DYNAMIC_KEYMAP_LAYER_COUNT`, all `OAI_*` keycodes.
- Produces: compiled defaults `L_CODEX` through `L_USER7`, Vial custom keycodes and `encoder_map` for every layer.

- [ ] **Step 1: Extend the failing test with the exact layer defaults**

```python
def test_vial_oai_has_eight_defaults_and_vial_encoder_map(self):
    for layer in ("L_CODEX", "L_FN", "L_USER2", "L_USER3", "L_USER4", "L_USER5", "L_USER6", "L_USER7"):
        self.assertIn(f"[{layer}] = LAYOUT(", self.keymap)
    self.assertIn("ENCODER_CCW_CW(OAI_ENC_CCW, OAI_ENC_CW)", self.keymap)
    self.assertEqual(self.rules["ENCODER_MAP_ENABLE"], "yes")
```

- [ ] **Step 2: Run the layer test to verify it fails**

Run: `python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract.VialOaiLayoutTest -v`

Expected: FAIL because the target does not yet have eight initial layer definitions.

- [ ] **Step 3: Implement the target configuration and Vial definition**

Create a new Vial UID, retain the existing unlock combo, set
`DYNAMIC_KEYMAP_LAYER_COUNT 8`, and enable `VIA_ENABLE`, `VIAL_ENABLE`,
`VIALRGB_ENABLE` and `ENCODER_MAP_ENABLE`.  Add the two current hardware
custom keycodes followed by `OAI_AG00` through `OAI_ACT12`, `OAI_ENC`,
`OAI_ENC_CW`, `OAI_ENC_CCW` and `CODEX_TOUCH_LAYER` in `vial.json`, matching
their C enum order.

Use `vial_oai/keymap.c` only to select `CODEX_OAI_VIAL` and include the shared
Codex keymap.  Add the OAI parser and LED source paths in `rules.mk`.

- [ ] **Step 4: Implement the eight default maps and dynamic encoder defaults**

In the shared keymap, keep the Direct OAI default at four layers.  When
`CODEX_OAI_VIAL` is defined, compile all eight layers: OAI, hardware, nav,
media, then four transparent extension layers.  Each starts with
`OAI_ENC` and `CODEX_TOUCH_LAYER` on the encoder click and touch positions.
Declare an `encoder_map` with this first layer:

```c
[L_CODEX] = { ENCODER_CCW_CW(OAI_ENC_CCW, OAI_ENC_CW) },
```

and preserve the existing scroll, paging and volume defaults on layers 1–3.

- [ ] **Step 5: Run target contract tests to verify they pass**

Run: `python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract.VialOaiLayoutTest -v`

Expected: PASS; the direct-OAI tests still remain unchanged and passing.

- [ ] **Step 6: Commit the Vial target**

```bash
git add firmware/loudest_micro/keymaps/vial_oai firmware/loudest_micro/keymaps/codex_oai/keymap.c firmware/tests/codex_oai/test_vial_oai_contract.py
git commit -m "feat: add eight-layer Vial OAI keymap"
```

### Task 3: Implement collision-free OAI transport and Vial-owned mappings

**Files:**
- Modify: `firmware/loudest_micro/keymaps/codex_oai/codex_oai.h`
- Modify: `firmware/loudest_micro/keymaps/codex_oai/codex_oai.c`
- Modify: `firmware/loudest_micro/keymaps/codex_oai/keymap.c`
- Modify: `firmware/tests/codex_oai/test_vial_oai_contract.py`
- Modify: `firmware/tests/codex_oai/vial_oai_protocol_harness.c`

**Interfaces:**
- Consumes: the target's `CODEX_OAI_VIAL` and the Vial-QMK `via_command_kb()` pre-hook.
- Produces: `bool codex_oai_vial_frame(const uint8_t *, uint8_t)` and safe, fragmenting OAI transmit behavior.

- [ ] **Step 1: Extend the test for exact framing and Vial ownership**

```python
def test_oai_prefix_is_claimed_before_vial_and_uses_29_byte_fragments(self):
    self.assertTrue(self.harness.claims(bytes([0xA6, 2, 0]) + bytes(29)))
    self.assertFalse(self.harness.claims(bytes([0xFE]) + bytes(31)))
    self.assertEqual(self.harness.notification_payload(), b'{"method":"v.oai.hid","params":{"k":"AG00","act":1}}\r\n')
    self.assertGreaterEqual(self.harness.notification_frame_count(), 2)
```

Also assert that the Vial build does not call `wear_leveling_write()` for the
obsolete OAI keymap and does not expose the `v.oai.keymap` RPC handlers.

- [ ] **Step 2: Run transport tests to verify they fail**

Run: `python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract.VialOaiProtocolTest -v`

Expected: FAIL because Direct OAI still requires 64 bytes, report ID 6 and owns `raw_hid_receive()`.

- [ ] **Step 3: Implement selectable frame transport and fragmentation**

Keep Direct OAI constants unchanged.  In Vial-OAI mode define
`OAI_REPORT_SIZE 32`, `OAI_MAX_PAYLOAD 29` and a `0xA6` frame prefix.  Replace
single-report outbound construction with a helper that fills, sends and
zero-pads one or more reports.  Every Direct OAI response must still fit and
therefore remain one byte-identical 64-byte report.

- [ ] **Step 4: Dispatch only OAI-prefixed Vial frames**

Compile `via_command_kb()` only in Vial-OAI mode.  It returns `true` only for
well-formed `0xA6` OAI frames, sends any response and otherwise returns
`false`, leaving all VIA/Vial traffic untouched.  The Direct target retains
its public `raw_hid_receive()` function.

- [ ] **Step 5: Route dynamic Vial keycodes without OAI EEPROM writes**

In Vial-OAI mode map every OAI custom keycode to its explicit OAI control,
derive LED feedback from the physical key record, retain the protected
`ACT10` accept behavior, and let `CODEX_TOUCH_LAYER` cycle all eight layers.
Do not initialize, read, write or serve the legacy private OAI keymap in this
mode; Vial's dynamic map is the only mapping store.

- [ ] **Step 6: Run the transport and Direct OAI regression tests**

Run: `python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract firmware.tests.codex_oai.test_protocol firmware.tests.codex_oai.test_keymap_contract -v`

Expected: PASS; the Direct OAI tests prove its 64-byte report-ID-6 protocol is unchanged, and Vial-OAI tests prove the new 32-byte prefix protocol.

- [ ] **Step 7: Commit the transport integration**

```bash
git add firmware/loudest_micro/keymaps/codex_oai firmware/tests/codex_oai/test_vial_oai_contract.py firmware/tests/codex_oai/vial_oai_protocol_harness.c
git commit -m "feat: route OAI through Vial raw HID"
```

### Task 4: Build, emulate and publish the independent Vial-OAI UF2

**Files:**
- Modify: `firmware/tools/build_codex_oai.py`
- Create: `firmware/tests/emulator/vial_oai_runner.cjs`
- Modify: `firmware/tests/emulator/package.json`
- Modify: `firmware/tests/codex_oai/test_phase3_contract.py`
- Modify: `firmware/BUILD.md`
- Create: `release/firmware/prebuilt/agentpad13_vial_oai.uf2`
- Create: `firmware/evidence/vial-oai-emulator.json`

**Interfaces:**
- Consumes: `loudest_micro:vial_oai`, its standard Vial USB descriptor and `0xA6` OAI frames.
- Produces: published UF2 plus reproducible emulator evidence.

- [ ] **Step 1: Add failing release assertions**

```python
def test_vial_oai_release_has_a_dedicated_artifact_and_smoke(self):
    self.assertEqual(package["scripts"]["smoke:vial-oai"], "node vial_oai_runner.cjs ../../../release/firmware/prebuilt/agentpad13_vial_oai.uf2 --json ../../evidence/vial-oai-emulator.json")
    self.assertTrue((REPO / "release/firmware/prebuilt/agentpad13_vial_oai.uf2").is_file())
```

- [ ] **Step 2: Run release assertions to verify they fail**

Run: `python3 -m unittest firmware.tests.codex_oai.test_phase3_contract -v`

Expected: FAIL because neither the target artifact nor its emulator smoke exists.

- [ ] **Step 3: Extend the safe build tool**

Add `vial_oai` to `KEYMAPS`, lint both OAI targets, and atomically publish
only `agentpad13_vial_oai.uf2` in addition to the existing Direct OAI output.
Keep its no-hardware guarantee and exact QMK source checks unchanged.

- [ ] **Step 4: Implement emulator coexistence evidence**

Adapt the existing emulator runner to discover one 32-byte Raw HID interface,
prove that a Vial prefix receives a Vial response, perform OAI handshake and
fragmented task-status update with `0xA6`, then prove an OAI key event and LED
activity.  Record the UF2's exact size and SHA-256 in JSON.

- [ ] **Step 5: Build and run all required verification**

Run:

```bash
python3 firmware/tools/build_codex_oai.py --qmk-home /path/to/clean-pinned-vial-qmk --clean
cd firmware/tests/emulator && npm ci && npm run smoke:default && npm run smoke:vial && npm run smoke:codex-oai && npm run smoke:vial-oai
python3 -m unittest discover -s firmware/tests/codex_oai -p 'test_*.py' -v
git diff --check
```

Expected: all targets compile; all four emulator smokes and every Python test pass; no whitespace errors; no physical operation occurs.

- [ ] **Step 6: Document installation and host transport migration**

State the three firmware choices, that `vial_oai` is installed as its own
UF2, how to unlock and remap in Vial, and that its future host app uses the
`0xA6` 32-byte OAI transport rather than the Direct OAI descriptor.

- [ ] **Step 7: Commit the release**

```bash
git add firmware/tools/build_codex_oai.py firmware/tests/emulator firmware/tests/codex_oai/test_phase3_contract.py firmware/BUILD.md firmware/evidence/vial-oai-emulator.json release/firmware/prebuilt/agentpad13_vial_oai.uf2
git commit -m "feat: publish AgentPad13 Vial OAI firmware"
```

## Self-review

- The spec's separate-target, 32-byte transport, eight-layer, encoder,
  EEPROM ownership, safety and emulator requirements each map to Tasks 1–4.
- A placeholder-pattern scan of this plan returned no matches.
- The contract uses the same `CODEX_OAI_VIAL`, `via_command_kb`, `0xA6`,
  `OAI_ENC_CW` and `OAI_ENC_CCW` names across all tasks.
