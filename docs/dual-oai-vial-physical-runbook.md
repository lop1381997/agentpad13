# AgentPad13 dual OAI + Vial physical test runbook

This is a gated manual test for the local Task-5 candidate. No physical row is
validated until the tester records the result, date, host OS and device serial
or board identifier below. The automated build, emulator and verifier do not
authorize a flash or reset.

## Candidate and authorization

- UF2: `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2`
- Size: **123904 bytes**
- SHA-256: `ca57bdb4f85ba8e65f80e6f45b3cf8fce7dfbbb894793be45398868353d9ed1c`
- Vial definition: `release/firmware/prebuilt/agentpad13_oai_vial_dual.vial`
- recovery UF2: `release/firmware/prebuilt/agentpad13_reference.uf2`
- Recovery size: **93696 bytes**
- Recovery SHA-256: `1c8b9d5a716f24373477fd2368df1e41a122242d406c2adb332f4e12cd24a212`

Before each physical flash, obtain and retain this literal authorization:

> I authorize one BOOTSEL flash of `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2` on board `<board id>`, after verifying SHA-256 `ca57bdb4f85ba8e65f80e6f45b3cf8fce7dfbbb894793be45398868353d9ed1c` and size 123904 bytes. I understand this is a local, physically unvalidated candidate and authorize no other device operation.

Recovery requires a separate authorization, obtained only if the candidate
fails to enumerate or is otherwise unsafe to continue testing:

> I separately authorize one BOOTSEL recovery flash of `release/firmware/prebuilt/agentpad13_reference.uf2` on board `<board id>`, after verifying SHA-256 `1c8b9d5a716f24373477fd2368df1e41a122242d406c2adb332f4e12cd24a212` and size 93696 bytes. This authorization is independent of any candidate authorization, permits no candidate reflash, and authorizes no other device operation.

## Flash and recovery

1. Verify the candidate path, byte size and SHA-256 above.
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

The compiled-artifact static proof records the unique endpoint addresses:
keyboard IN `0x85` (shared with joystick reports), Vial IN/OUT `0x81`/`0x02`,
and OAI IN/OUT `0x83`/`0x04`. The emulator’s truncated-configuration recovery
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
- **macro persistence:** create a short macro, invoke it, reconnect and invoke
  it again.
- **custom OAI assignment:** assign an OAI custom keycode to a different key or
  layer, invoke it, and confirm the expected action.

## Codex checks

- **Codex Desktop detection:** confirm Codex Desktop detects the device without
  a host-side protocol or identity change.
- **event/LED:** invoke an OAI action, confirm the Codex event arrives, and
  confirm task/status LED output changes as expected.
- Confirm ordinary keyboard input remains usable while both raw interfaces are
  connected.

## Physical record

| Date / host | Board ID | Result | Notes |
|---|---|---|---|
| PENDING | PENDING | NOT PHYSICALLY VALIDATED | Record only after an explicitly authorized test. |
