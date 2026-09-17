"""Host proof for the Vial-only AgentPad Live Monitor protocol."""

from __future__ import annotations

import re
import subprocess
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
TARGET = REPO / "firmware" / "loudest_micro" / "keymaps" / "vial_oai"


class LiveMonitorProtocolTest(unittest.TestCase):
    def test_vial_live_monitor_harness(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agentpad13_live_monitor_") as directory:
            binary = Path(directory) / "live_monitor_harness"
            command = [
                "cc",
                "-std=c11",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-I",
                str(TARGET),
                "-I",
                str(HERE / "stubs"),
                str(HERE / "live_monitor_harness.c"),
                "-o",
                str(binary),
            ]
            # Keep the first TDD run focused on the missing public header;
            # once the monitor source exists, compile and link the real code.
            if (TARGET / "live_monitor.c").is_file():
                command.insert(-2, str(TARGET / "live_monitor.c"))
            build = subprocess.run(
                command,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(build.returncode, 0, build.stderr)
            run = subprocess.run([str(binary)], text=True, capture_output=True, check=False)
            self.assertEqual(run.returncode, 0, run.stderr)

    def test_z_monitor_source_is_wired_only_to_vial_oai(self) -> None:
        rules = (TARGET / "rules.mk").read_text(encoding="utf-8")
        codex_rules = (
            REPO / "firmware" / "loudest_micro" / "keymaps" / "codex_oai" / "rules.mk"
        ).read_text(encoding="utf-8")
        self.assertRegex(rules, r"(?m)^SRC\s*\+=\s*live_monitor\.c\s*$")
        self.assertNotRegex(codex_rules, r"(?m)^SRC\s*\+=\s*.*live_monitor\.c\s*$")


if __name__ == "__main__":
    unittest.main()
