"""The joint app/firmware release must be complete and self-verifying."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "tools" / "prepare_release_assets.py"


class ReleaseAssetsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.downloads = self.root / "downloads"
        self.output = self.root / "release"
        self.files = {
            "AgentPad13-Windows-x64": (
                "AgentPad13_0.1.0_x64-setup.exe",
                "AgentPad13_0.1.0_windows_x64_portable.zip",
            ),
            "AgentPad13-macOS": ("AgentPad13_0.1.0_aarch64.dmg",),
            "AgentPad13-Linux": (
                "AgentPad13_0.1.0_amd64.deb",
                "AgentPad13_0.1.0_amd64.AppImage",
            ),
            "AgentPad13-Firmware": (
                "agentpad13_reference.uf2",
                "agentpad13.uf2",
                "agentpad13_codex_oai.uf2",
                "agentpad13_oai_vial_dual.uf2",
                "agentpad13_oai_vial_dual.vial",
            ),
        }
        for group, names in self.files.items():
            folder = self.downloads / group
            folder.mkdir(parents=True)
            checksums = []
            for name in names:
                payload = f"{group}/{name}".encode()
                (folder / name).write_bytes(payload)
                checksums.append(f"{hashlib.sha256(payload).hexdigest()}  {name}\n")
            (folder / "SHA256SUMS").write_text("".join(checksums))

    def run_script(self, tag: str | None = None) -> subprocess.CompletedProcess[str]:
        version = json.loads((REPO / "apps/agentpad-desktop/package.json").read_text())["version"]
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(self.downloads), str(self.output), tag or f"v{version}"],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_flattens_every_app_and_firmware_with_checksums(self) -> None:
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        expected = {name for names in self.files.values() for name in names}
        self.assertEqual({p.name for p in self.output.iterdir()}, expected | {"SHA256SUMS"})
        sums = (self.output / "SHA256SUMS").read_text().splitlines()
        self.assertEqual(len(sums), len(expected))
        for name in expected:
            digest = hashlib.sha256((self.output / name).read_bytes()).hexdigest()
            self.assertIn(f"{digest}  {name}", sums)

    def test_refuses_release_without_dual_firmware(self) -> None:
        (self.downloads / "AgentPad13-Firmware" / "agentpad13_oai_vial_dual.uf2").unlink()
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("agentpad13_oai_vial_dual.uf2", result.stderr)
        self.assertFalse(self.output.exists())

    def test_refuses_release_without_linux_appimage(self) -> None:
        (self.downloads / "AgentPad13-Linux" / "AgentPad13_0.1.0_amd64.AppImage").unlink()
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("AppImage", result.stderr)
        self.assertFalse(self.output.exists())

    def test_refuses_duplicate_release_filename(self) -> None:
        (self.downloads / "AgentPad13-macOS" / "agentpad13.uf2").write_bytes(b"collision")
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duplicate", result.stderr.lower())
        self.assertFalse(self.output.exists())

    def test_refuses_modified_asset_after_checksum_generation(self) -> None:
        (self.downloads / "AgentPad13-Firmware" / "agentpad13_oai_vial_dual.uf2").write_bytes(b"changed")
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum", result.stderr.lower())
        self.assertFalse(self.output.exists())

    def test_refuses_tag_that_does_not_match_app_version(self) -> None:
        result = self.run_script("v99.0.0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("version", result.stderr.lower())
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
