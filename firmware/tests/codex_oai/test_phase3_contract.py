"""Release-contract checks for the AgentPad13 Direct OAI phase-3 snapshot."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
EMULATOR = REPO / "firmware" / "tests" / "emulator"
PACKAGE = EMULATOR / "package.json"
BOOTROM_SCRIPT = EMULATOR / "get-bootrom.sh"
RELEASE_MANIFEST_CHECK = REPO / "manifest_selfverify.py"
EVIDENCE = REPO / "firmware" / "evidence" / "codex-oai-emulator.json"
VIAL_EVIDENCE = REPO / "firmware" / "evidence" / "vial-oai-emulator.json"
DUAL_EVIDENCE = REPO / "firmware" / "evidence" / "dual-oai-vial-emulator.json"
EVIDENCE_README = REPO / "firmware" / "evidence" / "README.md"
CURRENT_MANIFEST = REPO / "firmware" / "evidence" / "codex-oai-current-manifest.json"
VIAL_CURRENT_MANIFEST = REPO / "firmware" / "evidence" / "vial-oai-current-manifest.json"
DUAL_CURRENT_MANIFEST = REPO / "firmware" / "evidence" / "dual-oai-vial-current-manifest.json"
RUNBOOK = REPO / "docs" / "codex-oai-physical-runbook.md"
DUAL_RUNBOOK = REPO / "docs" / "dual-oai-vial-physical-runbook.md"
UF2 = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_codex_oai.uf2"
VIAL_UF2 = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_vial_oai.uf2"
DUAL_UF2 = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_oai_vial_dual.uf2"
DUAL_VIAL = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_oai_vial_dual.vial"
RECOVERY_UF2 = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_reference.uf2"

BOOTROM_COMMIT = "7701ee065f50a04380f81361befd754810cb9e28"
BOOTROM_SHA256 = "99f8a1f813ce3aa9415884de3fb6c5b962d3c6fa0394b05413ad3c7b3c39ec62"


class Phase3ReleaseContractTest(unittest.TestCase):
    def test_release_manifest_self_verifies(self) -> None:
        result = subprocess.run(
            [sys.executable, "-B", str(RELEASE_MANIFEST_CHECK)],
            cwd=REPO,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_npm_ci_declares_the_bootrom_postinstall(self) -> None:
        package = json.loads(PACKAGE.read_text(encoding="utf-8"))
        self.assertEqual(package["scripts"].get("postinstall"), "./get-bootrom.sh")
        self.assertEqual(
            package["scripts"].get("smoke:codex-oai"),
            "node oai_runner.cjs ../../../release/firmware/prebuilt/agentpad13_codex_oai.uf2 "
            "--json ../../evidence/codex-oai-emulator.json",
        )
        self.assertEqual(
            package["scripts"].get("smoke:vial-oai"),
            "node vial_oai_runner.cjs ../../../release/firmware/prebuilt/agentpad13_vial_oai.uf2 "
            "--json ../../evidence/vial-oai-emulator.json",
        )
        self.assertEqual(
            package["scripts"].get("smoke:dual-oai-vial"),
            "node dual_oai_vial_watchdog.cjs ../../../release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2 "
            "--json ../../evidence/dual-oai-vial-emulator.json --deadline-ms 20000",
        )

    def test_default_and_vial_smokes_preserve_protocol_v1_release_contract(self) -> None:
        package = json.loads(PACKAGE.read_text(encoding="utf-8"))
        protocol_v1_caps = "04424c440118081f000000000000000000000000000000000000000000000000"
        self.assertEqual(
            package["scripts"].get("smoke:default"),
            "node runner.cjs ../../../release/firmware/prebuilt/agentpad13_reference.uf2 "
            + protocol_v1_caps,
        )
        self.assertEqual(
            package["scripts"].get("smoke:vial"),
            "node runner.cjs ../../../release/firmware/prebuilt/agentpad13.uf2 "
            + protocol_v1_caps,
        )

    def test_bootrom_source_is_pinned_and_digest_checked(self) -> None:
        script = BOOTROM_SCRIPT.read_text(encoding="utf-8")
        self.assertIn(BOOTROM_COMMIT, script)
        self.assertIn(BOOTROM_SHA256, script)
        self.assertNotIn("refs/heads/main", script)
        self.assertIn("mktemp", script)
        self.assertIn("bootrom.cjs", script)

    def test_current_manifest_and_emulator_evidence_match_the_checked_in_uf2(self) -> None:
        self.assertTrue(UF2.is_file(), f"missing release artifact: {UF2}")
        self.assertTrue(EVIDENCE.is_file(), f"missing emulator evidence: {EVIDENCE}")
        self.assertTrue(CURRENT_MANIFEST.is_file(), f"missing current manifest: {CURRENT_MANIFEST}")
        evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
        manifest = json.loads(CURRENT_MANIFEST.read_text(encoding="utf-8"))
        digest = hashlib.sha256(UF2.read_bytes()).hexdigest()
        self.assertEqual(evidence["uf2_size_bytes"], UF2.stat().st_size)
        self.assertEqual(evidence["uf2_sha256"], digest)
        self.assertEqual(manifest["size_bytes"], UF2.stat().st_size)
        self.assertEqual(manifest["sha256"], digest)
        self.assertEqual(manifest["emulator_evidence"]["uf2_size_bytes"], UF2.stat().st_size)
        self.assertEqual(manifest["emulator_evidence"]["uf2_sha256"], digest)

    def test_dual_manifest_and_evidence_match_the_checked_in_uf2(self) -> None:
        if not DUAL_UF2.is_file() or not DUAL_EVIDENCE.is_file() or not DUAL_CURRENT_MANIFEST.is_file():
            self.skipTest(
                "pre-hardware build gate: dual UF2/evidence/manifest are not available; "
                "run the Task-5 dual hardware build first"
            )
        evidence = json.loads(DUAL_EVIDENCE.read_text(encoding="utf-8"))
        manifest = json.loads(DUAL_CURRENT_MANIFEST.read_text(encoding="utf-8"))
        digest = hashlib.sha256(DUAL_UF2.read_bytes()).hexdigest()
        self.assertEqual(evidence["uf2_size_bytes"], DUAL_UF2.stat().st_size)
        self.assertEqual(evidence["uf2_sha256"], digest)
        self.assertEqual(evidence["oai_interface"], {"usage": "ff00:0061", "report_id": 6, "report_bytes": 64})
        self.assertEqual(evidence["vial_interface"], {"usage": "ff60:0061", "report_id": None, "report_bytes": 32})
        self.assertTrue(evidence["oai_hid_enumerated"])
        self.assertTrue(evidence["vial_protocol_ack"])
        self.assertTrue(evidence["channels_isolated"])
        self.assertEqual(evidence["device_identity"], {"manufacturer": "hirlu", "product": "Codex Micro Lab OAI LED"})
        self.assertEqual(evidence["shared_keyboard_joystick_endpoint"], {"keyboard_endpoint": 5, "joystick_endpoint": 5})
        self.assertTrue(evidence["keyboard_report_behavior"]["press_seen"])
        self.assertTrue(evidence["keyboard_report_behavior"]["release_seen"])
        self.assertTrue(evidence["joystick_report_behavior"]["axes_swung"])
        self.assertTrue(evidence["report_descriptors_verified"])
        self.assertFalse(evidence["configuration_descriptor_verified"])
        self.assertFalse(evidence["descriptor_verified"])
        self.assertEqual(manifest["target"], "loudest_micro:vial_oai")
        self.assertEqual(manifest["sha256"], digest)
        self.assertEqual(manifest["emulator_evidence"]["uf2_sha256"], digest)
        self.assertEqual(manifest["device_identity"], {"manufacturer": "hirlu", "product": "Codex Micro Lab OAI LED"})
        self.assertEqual(manifest["usb_descriptor_contract"]["endpoint_addresses"], [2, 4, 129, 131, 133])
        self.assertTrue(manifest["emulator_evidence"]["report_descriptors_verified"])
        self.assertFalse(manifest["emulator_evidence"]["configuration_descriptor_verified"])
        self.assertFalse(manifest["emulator_evidence"]["descriptor_verified"])

    def test_dual_candidate_definition_and_runbook_are_ready_for_manual_test(self) -> None:
        self.assertTrue(DUAL_UF2.is_file(), f"missing dual release artifact: {DUAL_UF2}")
        self.assertTrue(DUAL_VIAL.is_file(), f"missing dual Vial definition: {DUAL_VIAL}")
        self.assertTrue(DUAL_RUNBOOK.is_file(), f"missing dual physical runbook: {DUAL_RUNBOOK}")
        runbook = DUAL_RUNBOOK.read_text(encoding="utf-8")
        for fragment in (
            "FF60:61",
            "FF00:61",
            "Vial layer persistence",
            "custom OAI assignment",
            "Codex Desktop detection",
            "event/LED",
            "recovery UF2",
            "1c8b9d5a716f24373477fd2368df1e41a122242d406c2adb332f4e12cd24a212",
            "Recovery requires a separate authorization",
            "independent of any candidate authorization",
        ):
            self.assertIn(fragment, runbook)
        self.assertEqual(RECOVERY_UF2.stat().st_size, 93696)
        self.assertIn(hashlib.sha256(RECOVERY_UF2.read_bytes()).hexdigest(), runbook)

    def test_older_vial_oai_capture_is_named_historical_not_current(self) -> None:
        self.assertTrue(VIAL_EVIDENCE.is_file(), f"missing historical evidence: {VIAL_EVIDENCE}")
        self.assertTrue(VIAL_CURRENT_MANIFEST.is_file(), f"missing historical manifest: {VIAL_CURRENT_MANIFEST}")
        historical_evidence = json.loads(VIAL_EVIDENCE.read_text(encoding="utf-8"))
        historical_manifest = json.loads(VIAL_CURRENT_MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(historical_manifest["target"], "loudest_micro:vial_oai")
        self.assertNotIn("oai_interface", historical_evidence)
        self.assertNotIn("channels_isolated", historical_evidence)

    def test_physical_runbook_names_the_current_uf2_candidate(self) -> None:
        runbook = RUNBOOK.read_text(encoding="utf-8")
        digest = hashlib.sha256(UF2.read_bytes()).hexdigest()
        self.assertIn(f"UF2 `{UF2.stat().st_size}` bytes", runbook)
        self.assertIn(digest, runbook)
        self.assertNotIn("11ee3ed649cf198186fc1e3c190fcaf6a7a1cfbdb18f68ebbead974b09a1712b", runbook)

    def test_evidence_readme_labels_the_old_manifest_as_historical(self) -> None:
        evidence_readme = EVIDENCE_README.read_text(encoding="utf-8").lower()
        self.assertIn("historical", evidence_readme)
        self.assertIn("not a claim about the current", evidence_readme)


if __name__ == "__main__":
    unittest.main()
