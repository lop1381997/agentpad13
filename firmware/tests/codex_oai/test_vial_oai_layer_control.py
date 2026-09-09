"""Behavioral tests for the SW1+SW4 physical return-to-OAI chord."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
TARGET = REPO / "firmware" / "loudest_micro" / "keymaps" / "vial_oai"
SHARED_KEYMAP = REPO / "firmware" / "loudest_micro" / "keymaps" / "codex_oai" / "keymap.c"
HARNESS_SOURCE = HERE / "physical_oai_return_harness.c"
STUBS = HERE / "stubs"


class PhysicalReturnHarness:
    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(prefix="agentpad13_return_chord_")
        self._binary = Path(self._tmp.name) / "physical_oai_return_harness"
        self.build = subprocess.run(
            [
                "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
                '-DQMK_KEYBOARD_H="physical_oai_return_qmk.h"',
                "-I", str(STUBS), "-I", str(TARGET), str(HARNESS_SOURCE),
                str(TARGET / "physical_oai_return.c"), "-o", str(self._binary),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        self._process: subprocess.Popen[str] | None = None
        if self.build.returncode == 0:
            self._process = subprocess.Popen(
                [str(self._binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
            )

    def close(self) -> None:
        if self._process is not None:
            if self._process.poll() is None:
                self._process.terminate()
                self._process.wait(timeout=5)
            assert self._process.stdin is not None
            assert self._process.stdout is not None
            self._process.stdin.close()
            self._process.stdout.close()
        self._tmp.cleanup()

    def set_matrix(
        self, *, now_ms: int, sw1: bool, sw4: bool, enabled: bool = True
    ) -> tuple[bool, int, list[tuple[int, int, bool]]]:
        if self.build.returncode != 0 or self._process is None:
            raise AssertionError(self.build.stderr)
        assert self._process.stdin is not None
        assert self._process.stdout is not None
        self._process.stdin.write(f"SET {now_ms} {int(enabled)} {int(sw1)} {int(sw4)}\n")
        self._process.stdin.flush()
        returning = False
        masked_row = -1
        events: list[tuple[int, int, bool]] = []
        for line in self._process.stdout:
            fields = line.split()
            if fields == ["---"]:
                return returning, masked_row, events
            if fields[0] == "RETURN":
                returning = fields[1] == "1"
            elif fields[0] == "MASK":
                masked_row = int(fields[1])
            elif fields[0] == "EVENT":
                events.append((int(fields[1]), int(fields[2]), fields[3] == "1"))
            else:
                raise AssertionError(f"invalid chord harness output: {line!r}")
        raise AssertionError("physical chord harness ended before response")


class VialOaiLayerControlTest(unittest.TestCase):
    def setUp(self) -> None:
        self.harness = PhysicalReturnHarness()

    def tearDown(self) -> None:
        self.harness.close()

    def test_chord_before_80ms_returns_once_and_consumes_both_keys(self) -> None:
        self.assertEqual(self.harness.set_matrix(now_ms=0, sw1=True, sw4=False), (False, 0, []))
        self.assertEqual(self.harness.set_matrix(now_ms=79, sw1=True, sw4=True), (True, 0, []))
        self.assertEqual(self.harness.set_matrix(now_ms=100, sw1=False, sw4=False), (False, 0, []))
        self.assertEqual(
            self.harness.set_matrix(now_ms=200, sw1=True, sw4=False),
            (False, 0, []),
        )
        self.assertEqual(
            self.harness.set_matrix(now_ms=250, sw1=False, sw4=False),
            (False, 0, [(0, 0, True), (0, 0, False)]),
        )

    def test_second_key_at_80ms_is_not_a_chord(self) -> None:
        self.assertEqual(self.harness.set_matrix(now_ms=0, sw1=True, sw4=False), (False, 0, []))
        self.assertEqual(
            self.harness.set_matrix(now_ms=80, sw1=True, sw4=True),
            (False, 0, [(0, 0, True), (0, 3, True)]),
        )
        self.assertEqual(
            self.harness.set_matrix(now_ms=90, sw1=False, sw4=False),
            (False, 0, [(0, 0, False), (0, 3, False)]),
        )

    def test_deadline_is_correct_across_the_32_bit_timer_wrap(self) -> None:
        self.assertEqual(
            self.harness.set_matrix(now_ms=0xFFFFFFF0, sw1=True, sw4=False),
            (False, 0, []),
        )
        self.assertEqual(
            self.harness.set_matrix(now_ms=0x0000003F, sw1=True, sw4=True),
            (True, 0, []),
        )
        self.assertEqual(self.harness.set_matrix(now_ms=0x00000050, sw1=False, sw4=False), (False, 0, []))

    def test_short_taps_replay_each_member_in_order(self) -> None:
        for sw1, sw4, event in (
            (True, False, (0, 0)),
            (False, True, (0, 3)),
        ):
            self.harness.close()
            self.harness = PhysicalReturnHarness()
            self.assertEqual(self.harness.set_matrix(now_ms=0, sw1=sw1, sw4=sw4), (False, 0, []))
            self.assertEqual(
                self.harness.set_matrix(now_ms=50, sw1=False, sw4=False),
                (False, 0, [(event[0], event[1], True), (event[0], event[1], False)]),
            )

    def test_unpaired_hold_replays_press_at_deadline_and_real_release(self) -> None:
        self.assertEqual(self.harness.set_matrix(now_ms=0, sw1=False, sw4=True), (False, 0, []))
        self.assertEqual(self.harness.set_matrix(now_ms=79, sw1=False, sw4=True), (False, 0, []))
        self.assertEqual(self.harness.set_matrix(now_ms=80, sw1=False, sw4=True), (False, 0, [(0, 3, True)]))
        self.assertEqual(self.harness.set_matrix(now_ms=300, sw1=False, sw4=False), (False, 0, [(0, 3, False)]))

    def test_vial_unlock_mode_leaves_sw1_visible_to_vial(self) -> None:
        self.assertEqual(
            self.harness.set_matrix(now_ms=0, sw1=True, sw4=False, enabled=False),
            (False, 1, []),
        )
        self.assertEqual(
            self.harness.set_matrix(now_ms=20, sw1=True, sw4=True, enabled=False),
            (False, 9, []),
        )

    def test_vial_target_wires_the_chord_before_key_lookup_and_preserves_unlock(self) -> None:
        source = SHARED_KEYMAP.read_text(encoding="utf-8")
        rules = (TARGET / "rules.mk").read_text(encoding="utf-8")

        self.assertIn("SRC += physical_oai_return.c", rules)
        self.assertIn('#    include "../vial_oai/physical_oai_return.h"', source)
        self.assertIn("#    include \"vial.h\"", source)
        self.assertIn("static void return_to_codex_layer(void)", source)
        self.assertIn("select_codex_layer(CODEX_OAI_LAYER);", source)
        self.assertIn(
            "physical_oai_return_matrix_scan(timer_read32(), !vial_unlock_in_progress)",
            source,
        )


if __name__ == "__main__":
    unittest.main()
