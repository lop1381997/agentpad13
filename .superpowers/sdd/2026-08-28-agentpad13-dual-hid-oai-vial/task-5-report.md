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

The interrupted `npm run smoke:dual-oai-vial` process was terminated at PIDs
62146/62247. A bounded reproduction sampled the Node process while it was in
the rp2040js instruction loop (`Date.now`/V8 interpreter), with no native I/O
wait; the sample is `/tmp/node_2026-08-28_225806_Rmp8.sample.txt`. Static ELF
inspection showed the current shared-keyboard descriptor allocates Vial
endpoints `1 -> 2` and OAI endpoints `3 -> 4`, while the recent runner/test
recovery path still assumed `4 -> 5`. The root-cause hypothesis was that the
stale synthetic endpoint pair prevented OAI frames from reaching their owner
and left the emulator in its unbounded instruction-loop behavior.

Before the correction, the recovery regression failed with the stale `4/5`
expectation. The added
`test_dual_smoke_completes_without_emulator_hang` provides a 15-second test
bound; after the correction the direct Node smoke completed in 8.0 seconds and
the timed `npm run smoke:dual-oai-vial` completed in 8.06 seconds. The final
dual evidence records `channels_isolated: true`.

## Validation

- Pre-build release contract: expected red result (missing dual package).
- Build: four targets PASS; zero flash operations.
- Dual emulator: PASS; exact Vial `FF60:61` / 32-byte and OAI `FF00:61` /
  Report ID 6 / 64-byte descriptors, OAI RPC/status/event/LED checks, Vial
  protocol checks and endpoint isolation all pass.
- Static verifier: PASS, including ELF/UF2 equivalence and exact three-HID
  interface contract; command used the tool's actual
  `--emulator-evidence` option.
- `python3 -m unittest discover -s firmware/tests/codex_oai -p 'test_*.py' -v`:
  144 tests passed, 0 skipped.
- `python3 -B manifest_selfverify.py`: 9/9 checks passed; 156 files and
  56,488,941 bytes agree with the release manifest.
- Final emulator matrix: `smoke:default`, `smoke:vial`,
  `smoke:codex-oai`, and `smoke:dual-oai-vial` all PASS.
- `node --check firmware/tests/emulator/dual_oai_vial_runner.cjs`: PASS.
- `git diff --check`: PASS.

## Limitations

This is offline/emulator validation only. No physical flash, reset, USB
device discovery or Codex Desktop/Vial hardware test was performed. The
runbook's physical result row remains `PENDING`; it requires explicit
per-flash authorization and records recovery separately. The dual emulator
uses its documented rp2040js truncated-configuration recovery metadata; the
static ELF verifier remains the descriptor proof.
