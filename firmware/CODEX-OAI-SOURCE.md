# AgentPad13 direct-OAI source snapshot

## Actualización de alcance — 2026-09-09

Este inventario corresponde a la alternativa Direct OAI. El desarrollo activo de fase 3 está en `lop1381997/agentpad13`, rama remota `codex/phase-3` (`24d9ebd`), e incorpora el target dual `vial_oai` y Studio. El UF2 Direct OAI de este documento no ofrece el editor Vial; el nuevo layout usa el binario específico de la guía de fase 3.

Referencia: [estado vigente de fase 3](../docs/PHASE-3-STATUS.md).

This directory is the buildable source hand-off for the AgentPad13 Direct OAI
firmware. The original snapshot came from the `agentpad13-direct-oai` worktree
on branch `dev`, based at commit
`567efcba52709e7850540b5100361c0d85734b8e`, including the working-tree fixes
present when that snapshot was assembled. The destination port has since been
rebuilt from the reviewed AgentPad13 source; the current artifact facts below
supersede the snapshot candidate.

## What is included

- `loudest_micro/keymaps/codex_oai/`: the direct HID keymap, six OAI task
  slots, FIFO task LEDs, layer indicator, startup sweep, touch-layer cycling,
  encoder controls and the keymap RPC/customization surface;
- `loudest_micro/`: the AgentPad13 RP2040 keyboard definition and pin map;
- `patches/`: the VIA command-hook backport and the Raw HID Report-ID
  descriptor patch required by the direct-OAI endpoint;
- `tools/`: reproducible build and artifact-verification scripts;
- `tests/codex_oai/`, `tests/emulator/` and `tests/conformance/`: protocol,
  LED, keymap, artifact, emulator and legacy conformance checks;
- `evidence/`: the machine-readable emulator and manifest evidence;
- `../release/firmware/prebuilt/`: the default, Vial and Direct OAI UF2 artifacts;
- the corresponding direct-OAI plans and runbooks under `../docs/`.

Dependency trees (`node_modules`), Python bytecode, QMK build directories and
the Git worktree metadata are intentionally not copied. The existing
`hardware/` tree remains alongside this source and contains the PCB pin map
and fabrication data used by the firmware.

## Rebuild

The builder uses the pinned Vial-QMK commit prefix `00fc4627`, verifies the
required submodules and applies the repository-owned descriptor patch in a
disposable QMK worktree. From the repository root:

```sh
python3 firmware/tools/build_codex_oai.py --help
python3 firmware/tools/verify_codex_oai_artifact.py \
  --profile direct \
  --uf2 release/firmware/prebuilt/agentpad13_codex_oai.uf2 \
  --elf /path/to/pinned-vial-qmk/.build/loudest_micro_codex_oai.elf \
  --emulator-evidence firmware/evidence/codex-oai-emulator.json \
  --output firmware/evidence/codex-oai-current-manifest.json
```

The actual build requires a prepared QMK checkout and the ARM GNU toolchain;
the complete command and safety gates are in [`BUILD.md`](BUILD.md). No
physical flash is implied or performed by this source hand-off.

## Current direct-OAI artifact

- file: `release/firmware/prebuilt/agentpad13_codex_oai.uf2`
- size: `93,696` bytes
- SHA-256: `7c41bbdd32bfbe89bebb3bef55ba0d04fe8893f0b2799411d58ebd605d7a9f4e`

The artifact is bound to the current emulator capture and manifest under
[`evidence/`](evidence/). Physical keyboard verification remains a separate,
PENDING step; no automatic install or flash occurred.

## Historical artifact provenance

The imported phase-3 baseline was 92,160 bytes with SHA-256
`d1768471eef4d0be12c1fc264279f20b9a7d293ea902c0608ebcfb4643ae35be`.
It is superseded by the destination rebuild above. The older retained manifest
describes a 92,672-byte artifact with SHA-256
`11ee3ed649cf198186fc1e3c190fcaf6a7a1cfbdb18f68ebbead974b09a1712b`;
it is historical provenance, not a claim about the current release UF2.
