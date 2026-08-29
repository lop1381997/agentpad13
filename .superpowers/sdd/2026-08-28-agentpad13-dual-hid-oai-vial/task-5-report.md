# Task 5 implementation report

Status: complete; local candidate prepared for the focused local commit; no
push, merge or hardware operation.

## Changed files

- Published `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2` and its
  paired `agentpad13_oai_vial_dual.vial` definition.
- Generated
  `firmware/evidence/dual-oai-vial-emulator.json` and
  `firmware/evidence/dual-oai-vial-current-manifest.json`.
- Added `docs/dual-oai-vial-physical-runbook.md` and updated the firmware
  build/evidence documentation and `release/MANIFEST.md`.
- Marked the 2026-08-27 single-interface `0xA6` design and plan historical;
  the old `agentpad13_vial_oai.uf2` and evidence remain unchanged.
- Corrected the dual emulator's bounded recovery expectation to the actual
  shared-keyboard allocation (`Vial 1 -> 2`, `OAI 3 -> 4`) and added a bounded
  completion regression.
- Kept the dynamic Vial encoder map as the runtime owner while retaining the
  verifier-required `encoder_update_user` symbol in the dual target only.
  Joystick behavior remains enabled with shared endpoints, so the dual image
  has exactly keyboard, Vial and OAI HID interfaces.

## Build and artifact

Build command:

```text
python3 firmware/tools/build_codex_oai.py --qmk-home /private/tmp/agentpad13-vial-oai-qmk.um0cwO/qmk --clean
```

The disposable QMK worktree was pinned at
`00fc4627cd038ac9b7e9b8bf2b40b50e9e88aecb` with initialized submodules. The
exact workspace-provided compiler was used:

```text
/tmp/agentpad13-arm-gcc-15.2-rel1.1mTh1y/arm-gnu-toolchain-15.2.rel1-darwin-arm64-arm-none-eabi/bin/arm-none-eabi-gcc
arm-none-eabi-gcc (Arm GNU Toolchain 15.2.Rel1 (Build arm-15.86)) 15.2.1 20251203
```

The build passed lint and all four targets (`default`, `vial`, `codex_oai`,
`vial_oai`) and reported `flash operations 0`. The dual UF2 is 123,904 bytes
with SHA-256
`ca57bdb4f85ba8e65f80e6f45b3cf8fce7dfbbb894793be45398868353d9ed1c`. The
paired definition is 2,318 bytes with SHA-256
`cee99c3c45628bee725b95e7ef737cc2b42d4b83a6ef4220fa95bbacf5c32596`.

## Debugging evidence and fix

The interrupted `npm run smoke:dual-oai-vial` process was terminated after it
stayed alive beyond four minutes. A bounded reproduction showed two distinct
failure paths: the shared keyboard endpoint is `0x85` (not the old assumed
address), and a Vial dynamic-keymap `0x05` frame was rejected by the route
guard. The runner then set `process.exitCode` while rp2040js retained active
handles, so Node did not exit. The corrected runner routes `0x05` and exits
nonzero on failure.

The user-supplied deadline diagnosis was also reproduced directly: a synchronous
50 ms JavaScript loop delayed a 1 ms `setTimeout` until the loop returned. Thus
the runner’s in-process timer/check cannot interrupt a non-returning
rp2040js `execute`/`tick` path. The normal npm script now invokes the independent
`dual_oai_vial_watchdog.cjs` parent, which kills the child process at the
process-wide deadline, removes the child temporary evidence and exits nonzero.
The exact regression is `npm run smoke:dual-oai-vial -- --deadline-ms 1`; it
completes within three seconds, reports `watchdog deadline exceeded`, and leaves
the checked-in evidence byte-identical.

Static ELF inspection confirms the shared-keyboard descriptor allocates Vial
endpoints `1 -> 2` and OAI endpoints `3 -> 4`; the final compiled endpoint set
is keyboard IN `0x85`, Vial IN/OUT `0x81`/`0x02`, and OAI IN/OUT `0x83`/`0x04`.
The emulator’s truncated-configuration recovery records those values as
synthetic transport metadata only and sets both
`configuration_descriptor_verified` and `descriptor_verified` false. The
ELF-derived verifier is the sole configuration-descriptor proof. The final
dual evidence records `channels_isolated: true`, keyboard press/release,
joystick axis movement on the shared endpoint, and the compiled encoder shim.

## Validation

- Pre-build release contract: expected red result (missing dual package).
- Build: four targets PASS; zero flash operations.
- Dual emulator: PASS; Vial `FF60:61` / 32-byte and OAI `FF00:61` / Report ID 6
  / 64-byte report contracts, OAI RPC/status/event/LED checks, Vial protocol
  checks, shared keyboard/joystick behavior and endpoint isolation all pass.
- Static verifier: PASS, including ELF/UF2 equivalence, exact unique endpoint
  addresses, compiled `hirlu` / `Codex Micro Lab OAI LED` identity and exact
  three-HID interface contract; command used the tool's actual
  `--emulator-evidence` option.
- `python3 -m unittest discover -s firmware/tests/codex_oai -p 'test_*.py' -v`:
  153 tests passed, 0 skipped.
- Exact npm deadline regression: `npm run smoke:dual-oai-vial --
  --deadline-ms 1` returned nonzero within three seconds, reported the
  independent watchdog deadline and left the existing evidence unchanged.
- `python3 -B manifest_selfverify.py`: 9/9 checks passed; 156 files and
  56,488,941 bytes agree with the release manifest.
- Final emulator matrix: `smoke:default`, `smoke:vial`,
  `smoke:codex-oai`, and `smoke:dual-oai-vial` all PASS.
- `node --check firmware/tests/emulator/dual_oai_vial_runner.cjs` and
  `dual_oai_vial_watchdog.cjs`: PASS.
- `git diff --check`: PASS.

## Review-round-1 remediation

The recovery image named by the runbook is independently verifiable before use:
`release/firmware/prebuilt/agentpad13_reference.uf2`, 93696 bytes,
SHA-256 `1c8b9d5a716f24373477fd2368df1e41a122242d406c2adb332f4e12cd24a212`.
The runbook contains a separate literal recovery authorization; candidate
authorization does not authorize recovery.

## Limitations

This is offline/emulator validation only. No physical flash, reset, USB
device discovery or Codex Desktop/Vial hardware test was performed. The
runbook's physical result row remains `PENDING`; it requires explicit
per-flash authorization and records recovery separately. The dual emulator
uses its documented rp2040js truncated-configuration recovery metadata; the
static ELF verifier remains the descriptor proof.

## Review-round-2 remediation

### Root causes

- Encoder compatibility was only represented by a compilable legacy callback
  symbol. The previous test never exercised Vial's live encoder-map protocol or
  the firmware's quadrature path, so it could not establish runtime behavior.
- Compiled identity verification decoded every USB string descriptor and looked
  for expected values globally. It did not resolve the manufacturer/product
  indices selected by the device descriptor, allowing the wrong indexed strings
  to pass when the expected values appeared elsewhere.
- The static HID endpoint contract checked direction, size and address but
  ignored `bmAttributes` byte 3, so a bulk endpoint could pass as HID transport.

### Tests and fixes

- The dual emulator now uses Vial's runtime encoder get/set commands, stimulates
  both quadrature directions, observes the OAI encoder event, reads the changed
  clockwise keycode back, and confirms a subsequent rotation emits the
  programmed keyboard keycode. The evidence and manifest require every one of
  those checks.
- The verifier now anchors USB string tables at the language descriptor, maps
  descriptor indices in both linker layouts used by the artifact fixtures, and
  resolves the device descriptor's actual manufacturer/product indices. A
  fixture with correct strings at the wrong indices is rejected.
- Keyboard, Vial and OAI endpoint descriptors now require interrupt transfer
  type (`bmAttributes & 0x03 == 0x03`). A bulk-endpoint fixture is rejected.
- The dual smoke watchdog allowance is 30 seconds because the real encoder
  stimulus adds bounded emulator work; the independent parent watchdog remains
  the process-wide hang boundary.

The round-2 generated evidence was produced by the real dual UF2 and records:
`initial_map_readback_verified`, `initial_rotation_emitted_oai_event`,
`dynamic_map_write_ack`, `map_readback_after_write == 0x52`,
`rotation_after_map_write_seen`, and `rotation_used_programmed_keycode` all
true. The regenerated ELF/UF2 manifest resolves `hirlu` / `Codex Micro Lab OAI
LED`, verifies the exact interrupt endpoint contract, and preserves the UF2
SHA-256 `ca57bdb4f85ba8e65f80e6f45b3cf8fce7dfbbb894793be45398868353d9ed1c`.

### Round-2 verification record

- Focused TDD set: 58 tests passed, including the runtime encoder test, the
  descriptor-index identity fixture and the bulk-endpoint fixture.
- Full `firmware/tests/codex_oai` matrix: 157 tests passed, 0 failures.
- Emulator matrix: `smoke:default`, `smoke:vial`, `smoke:codex-oai`,
  `smoke:vial-oai` and `smoke:dual-oai-vial` all returned PASS. The dual smoke
  used the independent 30-second watchdog and the final evidence capture
  returned the locked UF2 hash and all encoder fields above.
- Static verifier: PASS with the matching disposable ELF; it resolved the
  device descriptor's selected strings and verified interrupt transfer type on
  keyboard, Vial and OAI endpoints.
- `python3 -B manifest_selfverify.py`: 9/9 checks passed; 156 files and
  56,488,941 bytes agree with `release/MANIFEST.md`.
- `node --check` passed for both dual emulator scripts, JSON parsing passed for
  the generated evidence and manifest, and `git diff --check` passed.

No flash, reset, push or merge was performed.
