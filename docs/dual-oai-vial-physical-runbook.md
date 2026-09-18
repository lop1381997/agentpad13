# AgentPad13 dual OAI + Vial physical test runbook

This is a gated manual test for the Phase-3 coupled-layout candidate. No physical row is
validated until the tester records the result, date, host OS and device serial
or board identifier below. The automated build, emulator and verifier do not
authorize a flash or reset.

## Candidate and authorization

- UF2: `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2`
- Size: **126976 bytes**
- SHA-256: `66dd5e2e630577ef0c14282fc6bc0aed0f04fe7bf5c1b716ea6feda7d7252149`
- Vial definition: `release/firmware/prebuilt/agentpad13_oai_vial_dual.vial`
- recovery UF2: `release/firmware/prebuilt/agentpad13_reference.uf2`
- Recovery size: **93696 bytes**
- Recovery SHA-256: `1c8b9d5a716f24373477fd2368df1e41a122242d406c2adb332f4e12cd24a212`

Before each physical flash, obtain and retain this literal authorization:

> I authorize one BOOTSEL flash of `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2` on board `<board id>`, after verifying SHA-256 `66dd5e2e630577ef0c14282fc6bc0aed0f04fe7bf5c1b716ea6feda7d7252149` and size 126976 bytes. I understand this candidate is not yet physically validated and authorize no other device operation.

Recovery requires a separate authorization, obtained only if the candidate
fails to enumerate or is otherwise unsafe to continue testing:

> I separately authorize one BOOTSEL recovery flash of `release/firmware/prebuilt/agentpad13_reference.uf2` on board `<board id>`, after verifying SHA-256 `1c8b9d5a716f24373477fd2368df1e41a122242d406c2adb332f4e12cd24a212` and size 93696 bytes. This authorization is independent of any candidate authorization, permits no candidate reflash, and authorizes no other device operation.

## Flash and recovery

1. Export the current Studio profile as a backup. Verify the candidate path,
   byte size and SHA-256 above. Preserve a known working firmware separately.
2. Disconnect the board. Hold **BOOTSEL** while connecting USB, then wait for
   the `RPI-RP2` volume.
3. Copy only the authorized dual UF2 to `RPI-RP2` and wait for the volume to
   disappear and the board to reboot. Do not use `qmk flash` for this test.
4. If the board does not enumerate, re-enter BOOTSEL and copy the **recovery
   UF2** listed above. Record recovery use before attempting another candidate
   flash.

## Host contracts

Confirm the candidate exposes one keyboard HID, one Vial raw HID and one OAI
raw HID. The two raw interfaces are:

- Vial: usage `FF60:61`, no report ID, 32-byte input/output reports.
- OAI: usage `FF00:61`, Report ID `6`, 64-byte input/output reports.

The compiled-artifact static proof records the unique interrupt endpoint
addresses: keyboard IN `0x85` (shared with joystick reports), Vial IN/OUT
`0x81`/`0x02`, and OAI IN/OUT `0x83`/`0x04`. The emulator’s truncated-configuration recovery
metadata is transport scaffolding only; it is not configuration-descriptor
proof. That proof comes from the ELF-derived static verifier.

The OAI interface must remain byte-compatible with Codex Desktop. This target
does not use, reserve or reactivate the obsolete `0xA6` framing.

## Vial configuration checks

Load the local `.vial` definition from the candidate path above. Hold **SW1
([0,0]) + SW13 ([3,0])** to unlock Vial, then record:

- **Vial layer persistence:** change a key on a non-default layer, disconnect
  and reconnect, and confirm the edit persists.
- **encoder-map persistence:** change both encoder directions and confirm the
  assignments survive reconnect.
- The offline emulator evidence already proves a real Vial encoder get/set
  round trip and a subsequent clockwise rotation using the programmed
  `KC_UP`; the physical check above remains required for persistence.
- **macro persistence:** create a short macro, invoke it, reconnect and invoke
  it again.
- **custom OAI assignment:** assign an OAI custom keycode to a different key or
  layer, invoke it, and confirm the expected action.
- **default RGB layer:** on a fresh/reset Vial map, layer 3 has toggle,
  effect previous/next, hue up/down, saturation up/down, brightness up/down
  and speed up/down across its 12 small keys; the encoder selects previous/
  next effect. Existing Vial EEPROM data is preserved and therefore must be
  remapped manually if it predates this default.
- **RGB ownership:** change to a non-OAI layer and confirm a one-second
  full-chain layer-colour flash (250 ms in, 500 ms solid, 250 ms out). Then
  confirm VialRGB resumes on all normal LEDs while physical chain LED 13 stays
  a solid active-layer palette colour.
- **fixed OAI return:** from each non-OAI layer, press **SW1 + SW4** together.
  It must select layer 0, consume the two assigned key actions and run the
  normal one-second layer-0 colour flash. Start the Vial unlock flow
  separately and hold **SW1 + SW13**; it must still unlock Vial.

## Codex checks

- **Codex Desktop detection:** confirm Codex Desktop detects the device without
  a host-side protocol or identity change.
- **event/LED:** invoke an OAI action, confirm the Codex event arrives, and
  confirm task/status LED output changes as expected.
- Confirm ordinary keyboard input remains usable while both raw interfaces are
  connected.

## Physical record

### Studio and coupled-layout acceptance

With Codex and Studio open, unlock Vial and prepare an SW1 ↔ SW7 swap in
Mapa de teclas → L0 → Distribución OAI. Before saving, the device must remain
unchanged. After saving, verify that each LED follows the agent/action now
assigned to that position, and each key opens or acts on the corresponding agent.
Undo/redo affects local drafts; it is not an automatic rollback of device writes.

Repeat with vertical layout (AG00 at SW1, AG01 at SW5, AG02 at SW9). Presets
restore all 13 canonical OAI actions; they are not a rotation of arbitrary custom
bindings. Export/import the profile, save explicitly and confirm the same layout.
Check that TP5, the encoder and underglow positions have not been swapped.

Finally **Bloquear edición → Desconectar → unplug/reconnect** and confirm normal
keyboard input, persisted mappings, Codex operation and ability to connect again.
This specifically retests the reported lock/disconnect failure. Do not lock or
disconnect during an in-progress unlock; resume polling when requested by Studio.

Record board, encoder observations, firmware SHA, OS, app revision, each result
and any recovery used. Prior user feedback about older builds does not establish
physical acceptance of this exact UF2. Test Windows/Linux separately.

| Date / host | Board ID | Result | Notes |
|---|---|---|---|
| PENDING | PENDING | NOT PHYSICALLY VALIDATED | Record only after an explicitly authorized test. |
