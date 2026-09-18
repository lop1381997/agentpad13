# Evidence files

## Current Phase-3 layout and live-monitor candidate

`dual-oai-vial-current-manifest.json` and `dual-oai-vial-emulator.json` refer
to `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2`, 125952 bytes,
SHA-256 `7f89f40e76b653fbef2ac0fe01d922d48275bd26ba1a633548a4baaae838702e`.
The static verifier proves ELF/UF2 equivalence and USB descriptors; the emulator
proves protocol isolation and input behavior, with synthetic configuration
recovery explicitly excluded from descriptor proof. Actual LED permutations
are covered by the compiled C harness, not physical RGB capture.
The complete host suite passed 175 tests on 2026-09-09; hardware acceptance
is still pending. See [Studio verification](../../apps/agentpad-desktop/VERIFICATION.md).

## Preserved target-specific evidence

“Current” in the filenames below means current for that preserved artifact
lineage, not the latest Phase-3 layout build. Never pair their hashes with the
new UF2 or overwrite a historical capture to make it appear newly validated.

`codex-oai-emulator.json` is the current emulator capture for the direct
transport, `release/firmware/prebuilt/agentpad13_codex_oai.uf2`. It must match
the UF2 SHA-256 and byte size recorded in `codex-oai-current-manifest.json`.
The current port rebuild is 93,696 bytes with SHA-256
`c809dc4876a9b065cfbf22af0e10ee9dd18b3010fedd8095ec1ef88d0111c736`.

`dual-oai-vial-emulator.json` is the current Task-5 capture for
`release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2`. Together with its
static verifier manifest it documents the three-interface descriptor and exact Vial `FF60:61` and OAI `FF00:61`
contracts, exact compiled endpoint address set (`0x85`, `0x81`/`0x02`,
`0x83`/`0x04`), shared keyboard/joystick press/release and axis behavior,
runtime Vial encoder-map readback/write/rotation behavior, both protocol paths,
OAI event/LED behavior and response isolation. Its `config_descriptor_recovery_used` and synthetic
endpoint fields describe rp2040js transport recovery only; they are never
configuration-descriptor proof. That proof is recorded by the ELF-derived
static verifier in `dual-oai-vial-current-manifest.json`.
The current dual rebuild is 125,952 bytes with SHA-256
`7f89f40e76b653fbef2ac0fe01d922d48275bd26ba1a633548a4baaae838702e`.
Its generated version metadata and Vial build ID are fixed by the verified
builder.
Its verifier manifest is `dual-oai-vial-current-manifest.json`.

`vial-oai-emulator.json` is the historical capture for
`release/firmware/prebuilt/agentpad13_vial_oai.uf2`, the eight-layer Vial OAI
target. Its evidence must match `vial-oai-current-manifest.json`; it proves
both ordinary Vial traffic and the default dynamic keymap. The current Vial
OAI rebuild is 124,416 bytes with SHA-256
`848e7249a3ccae3dcf8a52a25bbc1493de358f6b3c24bdb1c19aa7c8fdc49aef`. This
artifact uses the obsolete single-interface `0xA6` framing and is not a claim
about the current dual-HID release.

Two earlier provenance layers remain explicit:

- The imported phase-3 migration baseline was 92,160 bytes with SHA-256
  `d1768471eef4d0be12c1fc264279f20b9a7d293ea902c0608ebcfb4643ae35be`.
  It was copied byte-for-byte before the destination rebuild and is superseded
  by the current port artifact; it is not a claim about the final source.
- `codex-oai-manifest.json` is retained as historical full-image evidence for
  the still older 92,672-byte artifact with SHA-256
  `11ee3ed649cf198186fc1e3c190fcaf6a7a1cfbdb18f68ebbead974b09a1712b`.
  Its ELF metrics and hash intentionally refer to that older artifact; it is
  not a claim about the current release UF2.

To produce a new full manifest after a clean QMK build, run
`firmware/tools/verify_codex_oai_artifact.py` with the matching `--profile`,
newly generated ELF, current emulator JSON and an output path below this
directory. The verifier checks the UF2 hash, ELF size/symbols and emulator
handshake atomically; no device or removable volume is accessed.
