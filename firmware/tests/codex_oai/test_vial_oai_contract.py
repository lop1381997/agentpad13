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
ENCODER_SOURCE = TARGET / "encoder_contract.c"
SHARED_KEYMAP = REPO / "firmware" / "loudest_micro" / "keymaps" / "codex_oai" / "keymap.c"
OAI_SOURCE = REPO / "firmware" / "loudest_micro" / "keymaps" / "codex_oai" / "codex_oai.c"
KEYBOARD_SOURCE = REPO / "firmware" / "loudest_micro" / "loudest_micro.c"


def parse_rules(path: Path) -> dict[str, str]:
    return dict(re.findall(r"^([A-Z][A-Z0-9_]*)\s*=\s*([^\s#]+)", path.read_text(), re.MULTILINE))


class VialOaiTargetContractTest(unittest.TestCase):
    def test_vial_oai_target_declares_dual_hid_and_eight_dynamic_layers(self) -> None:
        self.assertTrue(TARGET.is_dir(), "the dedicated Vial-OAI keymap must exist")
        config = (TARGET / "config.h").read_text()
        rules = parse_rules(TARGET / "rules.mk")

        self.assertIn("#define OAI_RAW_HID_ENABLE", config)
        self.assertIn("#define OAI_RAW_USAGE_PAGE 0xFF00", config)
        self.assertIn("#define OAI_RAW_USAGE_ID 0x61", config)
        self.assertIn("#define OAI_RAW_EPSIZE 64", config)
        self.assertIn("#define OAI_RAW_REPORT_ID 6", config)
        self.assertIn("#define CODEX_OAI_DUAL_HID", config)
        self.assertIn("#define CODEX_OAI_DYNAMIC_KEYMAP", config)
        self.assertIn("#define LOUDEST_CUSTOM_RAW_HID", config)
        self.assertIn("#define VENDOR_ID 0x303A", config)
        self.assertIn("#define PRODUCT_ID 0x8360", config)
        self.assertIn('#define MANUFACTURER "hirlu"', config)
        self.assertIn('#define PRODUCT "Codex Micro Lab OAI LED"', config)
        self.assertIn("#define RAW_USAGE_PAGE 0xFF60", config)
        self.assertIn("#define RAW_USAGE_ID 0x61", config)
        self.assertIn("#define RAW_EPSIZE 32", config)
        self.assertIn("#define DYNAMIC_KEYMAP_LAYER_COUNT 8", config)
        self.assertNotIn("#define RAW_REPORT_ID", config)
        self.assertNotIn("OAI_VIAL_FRAME_PREFIX", config)
        self.assertNotIn("CODEX_OAI_VIAL", config)
        vial = (TARGET / "vial.json").read_text()
        self.assertIn('"vendorId": "0x303A"', vial)
        self.assertIn('"productId": "0x8360"', vial)
        self.assertEqual(rules["RAW_ENABLE"], "yes")
        self.assertEqual(rules["VIA_ENABLE"], "yes")
        self.assertEqual(rules["VIAL_ENABLE"], "yes")
        self.assertEqual(rules["ENCODER_MAP_ENABLE"], "yes")

    def test_shared_endpoints_keep_three_interfaces_and_encoder_contract_compiles(self) -> None:
        rules = parse_rules(TARGET / "rules.mk")
        self.assertEqual(rules["KEYBOARD_SHARED_EP"], "yes")
        self.assertEqual(rules["JOYSTICK_SHARED_EP"], "yes")
        self.assertTrue(ENCODER_SOURCE.is_file())

        with tempfile.TemporaryDirectory(prefix="agentpad13_encoder_contract_") as directory:
            directory_path = Path(directory)
            (directory_path / "qmk_keyboard_stub.h").write_text(
                "#include <stdbool.h>\n#include <stdint.h>\n", encoding="utf-8"
            )
            object_file = directory_path / "encoder_contract.o"
            build = subprocess.run(
                [
                    "cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-c",
                    "-DQMK_KEYBOARD_H=\"qmk_keyboard_stub.h\"", "-I", str(directory_path),
                    str(ENCODER_SOURCE), "-o", str(object_file),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(build.returncode, 0, build.stderr)
            self.assertTrue(object_file.is_file())
            symbols = subprocess.run(
                ["nm", "-g", str(object_file)],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(symbols.returncode, 0, symbols.stderr)
            self.assertRegex(symbols.stdout, r"(?m)^\S+ T _?encoder_update_user$")


class VialOaiLayoutContractTest(unittest.TestCase):
    def test_vial_oai_has_eight_defaults_and_a_dynamic_encoder_map(self) -> None:
        source = SHARED_KEYMAP.read_text()
        rules = parse_rules(TARGET / "rules.mk")

        self.assertIn("#if defined(CODEX_OAI_DYNAMIC_KEYMAP)", source)
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

    def test_dynamic_target_uses_transition_then_releases_vialrgb_except_layer_marker(self) -> None:
        """VialRGB owns layers 1–7 except the fixed physical layer marker."""
        source = SHARED_KEYMAP.read_text(encoding="utf-8")
        keyboard = KEYBOARD_SOURCE.read_text(encoding="utf-8")
        layer_change = source[source.index("if (active_layer != oai_layer)"):source.index("if (handshake_changed)")]
        rgb_hook = source[source.index("bool rgb_matrix_indicators_advanced_user"):]

        self.assertIn("codex_led_start_layer_transition(active_layer, now_ms);", layer_change)
        self.assertIn("#if defined(CODEX_OAI_DYNAMIC_KEYMAP)", layer_change)
        self.assertIn("codex_led_render_layer_transition(now_ms, frame)", rgb_hook)
        self.assertIn("if (active_layer != CODEX_OAI_LAYER)", rgb_hook)
        self.assertIn("static void paint_capped_codex_led(", source)
        self.assertIn(
            "paint_capped_codex_led(CODEX_LAYER_INDICATOR_LED, codex_led_layer_color(), led_min, led_max, current_value);",
            rgb_hook,
        )
        self.assertLess(
            rgb_hook.index("codex_led_render_layer_transition(now_ms, frame)"),
            rgb_hook.index("if (active_layer != CODEX_OAI_LAYER)"),
        )
        self.assertLess(
            rgb_hook.index("if (active_layer != CODEX_OAI_LAYER)"),
            rgb_hook.index("codex_led_render(now_ms, frame)"),
        )
        self.assertIn("#    if !defined(CODEX_OAI_DYNAMIC_KEYMAP)", keyboard)

    def test_dynamic_target_publishes_live_monitor_layer_and_rgb_metadata(self) -> None:
        source = SHARED_KEYMAP.read_text(encoding="utf-8")
        oai_source = OAI_SOURCE.read_text(encoding="utf-8")

        self.assertIn("agentpad_live_monitor_set_layer(active_layer);", source)
        self.assertIn("agentpad_live_monitor_set_flags", source)
        self.assertIn("AGENTPAD_LIVE_MONITOR_FLAG_TRANSITION", source)
        self.assertIn("AGENTPAD_LIVE_MONITOR_FLAG_STARTUP", source)
        self.assertIn("AGENTPAD_LIVE_MONITOR_FLAG_RGB_OFF", source)
        self.assertIn("CODEX_OAI_DYNAMIC_KEYMAP", source)
        self.assertNotIn("AGENTPAD_LIVE_MONITOR", oai_source)

        housekeeping = source[source.index("void housekeeping_task_user"):source.index("static void paint_capped_codex_led")]
        self.assertLess(
            housekeeping.index("agentpad_live_monitor_set_layer(active_layer);"),
            housekeeping.index("codex_led_start_layer_transition(active_layer, now_ms);"),
        )

    def test_layer_three_defaults_to_full_vialrgb_controls(self) -> None:
        """A fresh Vial EEPROM exposes effect, hue, saturation, value and speed controls."""
        source = SHARED_KEYMAP.read_text(encoding="utf-8")
        expected_layout = """[L_USER3] = LAYOUT(
        RGB_TOG,  RGB_RMOD, RGB_MOD,  RGB_HUI,
        RGB_HUD,  RGB_SAI,  RGB_SAD,  RGB_VAI,
        RGB_VAD,  RGB_SPI,  RGB_SPD,  KC_MUTE,
        KC_TRNS,           OAI_ENC, CODEX_TOUCH_LAYER
    ),"""
        self.assertIn(expected_layout, source)
        self.assertIn("[L_USER3] = { ENCODER_CCW_CW(RGB_RMOD, RGB_MOD) },", source)


class VialOaiProtocolContractTest(unittest.TestCase):
    def test_dual_oai_uses_only_the_dedicated_report_id_six_transport(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agentpad13_vial_oai_") as directory:
            binary = Path(directory) / "vial_oai_protocol_harness"
            build = subprocess.run(
                [
                    "cc",
                    "-std=c11",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-DCODEX_OAI_DUAL_HID",
                    "-DCODEX_OAI_DYNAMIC_KEYMAP",
                    "-DOAI_RAW_EPSIZE=64",
                    "-DOAI_RAW_REPORT_ID=6",
                    "-I",
                    str(HERE / "stubs"),
                    "-I",
                    str(OAI_SOURCE.parent),
                    str(HERE / "dual_oai_protocol_harness.c"),
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
        self.assertIn("if (agentpad_live_monitor_via_command(data, length))", source)
        self.assertIn("#if defined(CODEX_OAI_DYNAMIC_KEYMAP)", source)
        self.assertNotIn("codex_oai_vial_command", source)
        self.assertNotIn("OAI_VIAL_FRAME_PREFIX", source)


class VialOaiKeycodeContractTest(unittest.TestCase):
    def test_vial_oai_routes_custom_keycodes_without_the_legacy_oai_map(self) -> None:
        source = SHARED_KEYMAP.read_text()

        self.assertIn("static bool handle_vial_oai_keycode", source)
        self.assertIn("static int8_t codex_oai_physical_position", source)
        self.assertIn("case OAI_ENC_CW:", source)
        self.assertIn("case OAI_ENC_CCW:", source)
        self.assertIn("#if defined(CODEX_OAI_DYNAMIC_KEYMAP)\n    if (!handle_vial_oai_keycode(keycode, record))", source)
        self.assertIn("#if !defined(CODEX_OAI_DYNAMIC_KEYMAP)\n    codex_oai_reset_keymap();", source)


if __name__ == "__main__":
    unittest.main()
