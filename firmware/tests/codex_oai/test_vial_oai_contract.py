"""Contract for the separate AgentPad13 Vial + OAI firmware target."""

from __future__ import annotations

import re
import subprocess
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
TARGET = REPO / "firmware" / "loudest_micro" / "keymaps" / "vial_oai"
SHARED_KEYMAP = REPO / "firmware" / "loudest_micro" / "keymaps" / "codex_oai" / "keymap.c"
OAI_SOURCE = REPO / "firmware" / "loudest_micro" / "keymaps" / "codex_oai" / "codex_oai.c"
KEYBOARD_SOURCE = REPO / "firmware" / "loudest_micro" / "loudest_micro.c"


def parse_rules(path: Path) -> dict[str, str]:
    return dict(re.findall(r"^([A-Z][A-Z0-9_]*)\s*=\s*([^\s#]+)", path.read_text(), re.MULTILINE))


class VialOaiTargetContractTest(unittest.TestCase):
    def test_vial_oai_target_declares_vial_and_eight_dynamic_layers(self) -> None:
        self.assertTrue(TARGET.is_dir(), "the dedicated Vial-OAI keymap must exist")
        config = (TARGET / "config.h").read_text()
        rules = parse_rules(TARGET / "rules.mk")

        self.assertIn("#define CODEX_OAI_VIAL", config)
        self.assertIn("#define OAI_VIAL_FRAME_PREFIX 0xA6", config)
        self.assertIn("#define RAW_EPSIZE 32", config)
        self.assertIn("#define DYNAMIC_KEYMAP_LAYER_COUNT 8", config)
        self.assertEqual(rules["RAW_ENABLE"], "yes")
        self.assertEqual(rules["VIA_ENABLE"], "yes")
        self.assertEqual(rules["VIAL_ENABLE"], "yes")
        self.assertEqual(rules["ENCODER_MAP_ENABLE"], "yes")


class VialOaiLayoutContractTest(unittest.TestCase):
    def test_vial_oai_has_eight_defaults_and_a_dynamic_encoder_map(self) -> None:
        source = SHARED_KEYMAP.read_text()
        rules = parse_rules(TARGET / "rules.mk")

        self.assertIn("#if defined(CODEX_OAI_VIAL)", source)
        for layer in (
            "L_CODEX",
            "L_FN",
            "L_USER2",
            "L_USER3",
            "L_USER4",
            "L_USER5",
            "L_USER6",
            "L_USER7",
        ):
            self.assertIn(f"[{layer}] = LAYOUT(", source)
        self.assertIn("ENCODER_CCW_CW(OAI_ENC_CCW, OAI_ENC_CW)", source)
        self.assertEqual(rules["ENCODER_MAP_ENABLE"], "yes")

    def test_every_oai_control_is_assignable_in_vial(self) -> None:
        vial = (TARGET / "vial.json").read_text()
        for keycode in (
            "OAI_AG00",
            "OAI_AG01",
            "OAI_AG02",
            "OAI_AG03",
            "OAI_AG04",
            "OAI_AG05",
            "OAI_ACT06",
            "OAI_ACT07",
            "OAI_ACT08",
            "OAI_ACT09",
            "OAI_ACT10",
            "OAI_ACT11",
            "OAI_ACT12",
            "OAI_ENC",
            "OAI_ENC_CW",
            "OAI_ENC_CCW",
            "CODEX_TOUCH_LAYER",
        ):
            self.assertIn(f'"name": "{keycode}"', vial)


class VialOaiProtocolContractTest(unittest.TestCase):
    def test_vial_oai_claims_only_its_prefix_and_fragments_notifications(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agentpad13_vial_oai_") as directory:
            binary = Path(directory) / "vial_oai_protocol_harness"
            build = subprocess.run(
                [
                    "cc",
                    "-std=c11",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-DCODEX_OAI_VIAL",
                    "-DOAI_VIAL_FRAME_PREFIX=0xA6",
                    "-DRAW_EPSIZE=32",
                    "-I",
                    str(HERE / "stubs"),
                    "-I",
                    str(OAI_SOURCE.parent),
                    str(HERE / "vial_oai_protocol_harness.c"),
                    str(OAI_SOURCE),
                    "-o",
                    str(binary),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(build.returncode, 0, build.stderr)
            run = subprocess.run([str(binary)], text=True, capture_output=True, check=False)
            self.assertEqual(run.returncode, 0, run.stderr)

    def test_keyboard_pre_hook_delegates_oai_before_legacy_status_frames(self) -> None:
        source = KEYBOARD_SOURCE.read_text()

        self.assertIn("bool via_command_kb(uint8_t *data, uint8_t length)", source)
        self.assertIn(
            "#if defined(CODEX_OAI_VIAL)\n    return codex_oai_vial_command(data, length);\n#endif",
            source,
        )


class VialOaiKeycodeContractTest(unittest.TestCase):
    def test_vial_oai_routes_custom_keycodes_without_the_legacy_oai_map(self) -> None:
        source = SHARED_KEYMAP.read_text()

        self.assertIn("static bool handle_vial_oai_keycode", source)
        self.assertIn("static int8_t codex_oai_physical_position", source)
        self.assertIn("case OAI_ENC_CW:", source)
        self.assertIn("case OAI_ENC_CCW:", source)
        self.assertIn("#if defined(CODEX_OAI_VIAL)\n    if (!handle_vial_oai_keycode(keycode, record))", source)
        self.assertIn("#if !defined(CODEX_OAI_VIAL)\n    codex_oai_reset_keymap();", source)


if __name__ == "__main__":
    unittest.main()
