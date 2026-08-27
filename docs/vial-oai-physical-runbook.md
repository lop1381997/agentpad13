# AgentPad13 Vial OAI — physical verification runbook

This runbook is for the future, after the Vial OAI artifact has passed its
isolated build, emulator smoke and artifact-verifier gates. It contains no
automatic installation action.

## Required authorization before a hardware operation

Obtain a literal approval containing the exact candidate hash and number of
flashes:

```text
AUTORIZO <N> FLASH(ES) DE loudest_micro:vial_oai SHA-256 848e7249a3ccae3dcf8a52a25bbc1493de358f6b3c24bdb1c19aa7c8fdc49aef
```

A changed target, hash or number requires a new approval. Keep the normal
AgentPad13 Vial UF2 available for recovery. This document does not authorize
installation on its own.

Current build candidate (still unflashed):
`release/firmware/prebuilt/agentpad13_vial_oai.uf2`, UF2 `124416` bytes,
SHA-256
`848e7249a3ccae3dcf8a52a25bbc1493de358f6b3c24bdb1c19aa7c8fdc49aef`.

## Physical matrix

| Check | Status | Observation to record |
|---|---|---|
| BOOTSEL recovery | PENDING | The normal Vial firmware can be restored. |
| USB Vial endpoint | PENDING | Host observes `FEED:4C4D`, usage `FF60:61`, no Report ID and 32-byte frames. |
| Vial connection | PENDING | Vial opens the supplied `vial.json` and reads the keymap. |
| Eight editable layers | PENDING | A key edit and an encoder edit on each layer persist across reconnect. |
| OAI frame isolation | PENDING | An OAI frame prefixed `0xA6` returns its expected acknowledgement; ordinary Vial editing still works afterwards. |
| OAI task/LED path | PENDING | `rgbcfg`, `thstatus` and `device.status` update task LEDs and report acknowledgements. |
| Restore normal firmware | PENDING | Approved normal Vial firmware re-enumerates normally. |

## Suggested observation order

1. Confirm the published UF2, `firmware/evidence/vial-oai-emulator.json` and
   `firmware/evidence/vial-oai-current-manifest.json` agree on hash and size.
2. Confirm USB enumeration, then load
   `firmware/loudest_micro/keymaps/vial_oai/vial.json` in Vial and read the
   default map. This is the first check that Vial traffic is not intercepted.
3. Edit and persist one key and one encoder mapping on every layer; restore the
   shipped map before proceeding.
4. Exercise the OAI channel with only `0xA6`-prefixed frames, then re-read the
   Vial keymap to confirm the two protocols remain isolated.
5. Restore normal firmware only under its own explicit approval and record the
   result.

All physical rows remain **PENDING** until a person observes the behavior on
the board. No automatic installation is performed by this runbook.
