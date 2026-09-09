# Dual OAI + Vial Review-Round-1 Remediation Implementation Plan

## Actualización de alcance — 2026-09-09

Remediaciones del candidato dual anterior; el layout posterior tiene evidencia separada. El contenido original se conserva como plan/especificación histórica; no se marcan como ejecutadas pruebas físicas que siguen pendientes. Estado de código: `24d9ebd` en `codex/phase-3`, sin merge.

Referencia: [estado vigente de fase 3](../../PHASE-3-STATUS.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five review findings on the existing local dual-HID candidate without changing the OAI wire contract or performing hardware/remote operations.

**Architecture:** Keep the ELF-derived static verifier authoritative for the complete USB configuration descriptor, including exact endpoint addresses, uniqueness and compiled USB identity. Keep the rp2040js runner’s truncated-configuration recovery explicitly synthetic and separately labeled. Exercise shared keyboard/Vial/joystick behavior through the existing emulator and compile the encoder shim as an independent compatibility check.

**Tech Stack:** Python `unittest`, Node.js/rp2040js, C11 compiler, JSON evidence, Markdown runbook/release records.

**Spec:** `docs/superpowers/specs/2026-08-28-agentpad13-dual-hid-oai-vial-design.md`; approved implementation plan `docs/superpowers/plans/2026-08-28-agentpad13-dual-hid-oai-vial.md`.

## Global Constraints

- Work only in `/Users/hirlu/Documents/Projects/agentpad13/.worktrees/import-direct-oai-firmware` on `codex/oai-vial-eight-layers`.
- Preserve device identity `303A:8360`, manufacturer `hirlu`, product `Codex Micro Lab OAI LED`.
- Preserve OAI `FF00:61`, Report ID `6`, 64-byte framing and Vial `FF60:61`, no Report ID, 32-byte framing.
- Recovery metadata is never configuration-descriptor proof; static ELF inspection is the descriptor authority.
- No flash, reset, device discovery, push, merge or changes to the sibling `CodexMicroPad` repository.

### Task 1: Repair the emulator’s red path and make deadline invocation normal

**Files:**
- Modify: `firmware/tests/codex_oai/test_emulator_contract.py`
- Modify: `firmware/tests/emulator/dual_oai_vial_runner.cjs`
- Modify: `firmware/tests/emulator/package.json`
- Modify: `firmware/evidence/dual-oai-vial-emulator.json`

- [x] Add failing host assertions for Vial dynamic-keymap routing (`0x05`), current `0x85/0x81/0x02/0x83/0x04` recovery metadata, and normal `npm` invocation passing an explicit short deadline.
- [x] Run the focused emulator tests and observe the route/recovery/deadline failures.
- [x] Implement the minimal route and recovery corrections; ensure evidence records `configuration_descriptor_verified: false` whenever recovery is used and never uses synthetic values as descriptor proof.
- [x] Run the focused emulator tests and the normal dual smoke with the independent watchdog.

### Task 2: Strengthen static endpoint and identity proof

**Files:**
- Modify: `firmware/tests/codex_oai/test_artifact_verifier.py`
- Modify: `firmware/tools/verify_codex_oai_artifact.py`

- [x] Add failing fixtures proving duplicate endpoint addresses across keyboard/Vial/OAI, wrong direction/address pairs, duplicate expected compiled identity strings, and identity evidence mismatch.
- [x] Run the verifier suite and observe the missing proof failures.
- [x] Implement exact address-set and uniqueness validation across all three interfaces and require manufacturer/product evidence to match the strings found in the ELF-derived binary.
- [x] Run the verifier suite and inspect the manifest’s endpoint and identity records.

### Task 3: Add direct shared behavior and encoder-shim regression evidence

**Files:**
- Modify: `firmware/tests/codex_oai/test_vial_oai_contract.py`
- Modify: `firmware/tests/codex_oai/test_emulator_contract.py`
- Modify: `firmware/tests/emulator/dual_oai_vial_runner.cjs`
- Modify: `firmware/evidence/dual-oai-vial-emulator.json`

- [x] Add failing assertions requiring a keyboard press/release report after a dynamic Vial keymap write, joystick/gamepad activity while shared endpoints are enabled, and a compiled encoder shim with an explicit callback contract.
- [x] Run the focused behavior tests and observe missing evidence or behavior.
- [x] Implement only the required runner stimulus/assertions and encoder contract test; retain shared keyboard/joystick endpoint settings.
- [x] Run the focused behavior tests and verify evidence names the keyboard, joystick and encoder results independently.

### Task 4: Make recovery authorization independently verifiable in the runbook

**Files:**
- Modify: `docs/dual-oai-vial-physical-runbook.md`
- Modify: `firmware/BUILD.md`
- Modify: `firmware/evidence/README.md`
- Modify: `release/MANIFEST.md`
- Modify: `.superpowers/sdd/2026-08-28-agentpad13-dual-hid-oai-vial/task-5-report.md`

- [x] Add failing release-contract assertions for recovery path, recovery SHA-256/size, and separate authorization before recovery.
- [x] Run the release contract and observe the documentation failure.
- [x] Add verified recovery artifact facts and a literal independent authorization template; distinguish candidate authorization from recovery authorization.
- [x] Recalculate generated evidence/manifest/release rows as needed and run release checks.

### Task 5: Run full non-hardware validation and commit only this worktree

- [x] Run all focused and full `firmware/tests/codex_oai` tests, manifest self-verification, Node syntax checks and all four emulator smokes.
- [x] Inspect the full intended-path status and diff; confirm no other repository was touched.
- [x] Commit the focused remediation in this worktree with a review-round-1 message.
- [x] Report the commit SHA, changed paths, fresh results, and zero-push/zero-flash confirmation.
