"""Pre-hardware contract for the AgentPad13 direct-OAI rp2040js smoke.

The test consumes only the generated OAI UF2 and its emulator JSON evidence;
it intentionally never discovers or opens a USB device.  Until Task 5 can
produce the isolated target UF2, this is a documented pre-hardware gate.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
EMULATOR = REPO / "firmware" / "tests" / "emulator"
UF2 = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_codex_oai.uf2"
VIAL_OAI_UF2 = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_vial_oai.uf2"
DUAL_OAI_VIAL_UF2 = REPO / "release" / "firmware" / "prebuilt" / "agentpad13_oai_vial_dual.uf2"


def run_oai_emulator(uf2: Path) -> dict[str, object]:
    """Run the isolated emulator and return its recorded, JSON-safe evidence."""
    with tempfile.TemporaryDirectory(prefix="agentpad13_oai_emulator_") as directory:
        evidence_path = Path(directory) / "evidence.json"
        subprocess.run(
            ["node", "oai_runner.cjs", str(uf2), "--json", str(evidence_path)],
            cwd=EMULATOR,
            check=True,
            text=True,
            capture_output=True,
        )
        return json.loads(evidence_path.read_text(encoding="utf-8"))


def run_vial_oai_emulator(uf2: Path) -> dict[str, object]:
    """Run the shared OAI runner in its Vial transport mode."""
    with tempfile.TemporaryDirectory(prefix="agentpad13_vial_oai_emulator_") as directory:
        evidence_path = Path(directory) / "evidence.json"
        subprocess.run(
            ["node", "vial_oai_runner.cjs", str(uf2), "--json", str(evidence_path)],
            cwd=EMULATOR,
            check=True,
            text=True,
            capture_output=True,
        )
        return json.loads(evidence_path.read_text(encoding="utf-8"))


def run_dual_oai_vial_emulator(uf2: Path) -> dict[str, object]:
    """Run the dual-interface emulator and return its recorded evidence."""
    with tempfile.TemporaryDirectory(prefix="agentpad13_dual_oai_vial_emulator_") as directory:
        evidence_path = Path(directory) / "evidence.json"
        subprocess.run(
            [
                "node", "dual_oai_vial_watchdog.cjs", str(uf2),
                "--json", str(evidence_path), "--deadline-ms", "30000",
            ],
            cwd=EMULATOR,
            check=True,
            text=True,
            capture_output=True,
        )
        return json.loads(evidence_path.read_text(encoding="utf-8"))


class OaiEmulatorContractTest(unittest.TestCase):
    def test_node_timer_cannot_interrupt_a_synchronous_simulation_loop(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node is unavailable")
        result = subprocess.run(
            [
                "node", "-e",
                "const started=Date.now(); setTimeout(() => console.log(Date.now()-started), 1); "
                "while (Date.now()-started < 50) {}",
            ],
            check=True,
            text=True,
            capture_output=True,
        )
        self.assertGreaterEqual(int(result.stdout.strip()), 45)

    def test_dual_smoke_completes_without_emulator_hang(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("pre-hardware emulator gate: node is unavailable")
        if not DUAL_OAI_VIAL_UF2.is_file():
            self.skipTest(
                "pre-hardware build gate: agentpad13_oai_vial_dual.uf2 is not "
                "available; run firmware/tools/build_codex_oai.py first"
            )
        with tempfile.TemporaryDirectory(prefix="agentpad13_dual_oai_vial_bounded_") as directory:
            evidence_path = Path(directory) / "evidence.json"
            try:
                result = subprocess.run(
                    ["npm", "run", "smoke:dual-oai-vial"],
                    cwd=EMULATOR,
                    check=False,
                    text=True,
                    capture_output=True,
                    timeout=25,
                )
            except subprocess.TimeoutExpired as exc:
                self.fail(f"dual emulator hung for 25 seconds: {exc}")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_dual_recovery_never_claims_configuration_descriptor_proof(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("pre-hardware emulator gate: node is unavailable")
        if not DUAL_OAI_VIAL_UF2.is_file():
            self.skipTest("dual UF2 is unavailable")
        evidence = run_dual_oai_vial_emulator(DUAL_OAI_VIAL_UF2)
        self.assertTrue(evidence["config_descriptor_recovery_used"])
        self.assertFalse(evidence["configuration_descriptor_verified"])
        self.assertFalse(evidence["descriptor_verified"])
        self.assertTrue(evidence["report_descriptors_verified"])

    def test_dual_runner_deadline_is_enforced_as_a_failure(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("pre-hardware emulator gate: node is unavailable")
        if not DUAL_OAI_VIAL_UF2.is_file():
            self.skipTest("dual UF2 is unavailable")
        with tempfile.TemporaryDirectory(prefix="agentpad13_dual_oai_vial_deadline_") as directory:
            evidence_path = Path(directory) / "evidence.json"
            result = subprocess.run(
                [
                    "node", "dual_oai_vial_runner.cjs", str(DUAL_OAI_VIAL_UF2),
                    "--json", str(evidence_path), "--deadline-ms", "1",
                ],
                cwd=EMULATOR,
                check=False,
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("deadline", (result.stdout + result.stderr).lower())
            self.assertFalse(evidence_path.exists())

    def test_dual_npm_path_enforces_short_process_deadline(self) -> None:
        if shutil.which("npm") is None:
            self.skipTest("pre-hardware emulator gate: npm is unavailable")
        if not DUAL_OAI_VIAL_UF2.is_file():
            self.skipTest("dual UF2 is unavailable")
        package = json.loads((EMULATOR / "package.json").read_text(encoding="utf-8"))
        self.assertIn("dual_oai_vial_watchdog.cjs", package["scripts"]["smoke:dual-oai-vial"])
        evidence_path = EMULATOR.parent.parent / "evidence" / "dual-oai-vial-emulator.json"
        evidence_before = evidence_path.read_bytes()
        try:
            result = subprocess.run(
                ["npm", "run", "smoke:dual-oai-vial", "--", "--deadline-ms", "1"],
                cwd=EMULATOR,
                check=False,
                text=True,
                capture_output=True,
                timeout=3,
            )
        except subprocess.TimeoutExpired as exc:
            self.fail(f"npm dual smoke exceeded its 1ms deadline: {exc}")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("watchdog deadline exceeded", (result.stdout + result.stderr).lower())
        self.assertEqual(evidence_path.read_bytes(), evidence_before)

    def test_dual_runner_runtime_failure_exits_after_simulator_error(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("pre-hardware emulator gate: node is unavailable")
        if not DUAL_OAI_VIAL_UF2.is_file():
            self.skipTest("dual UF2 is unavailable")
        process = subprocess.Popen(
            [
                "node", "dual_oai_vial_watchdog.cjs", str(DUAL_OAI_VIAL_UF2),
                "--json", "/dev/full", "--deadline-ms", "15000",
            ],
            cwd=EMULATOR,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            stdout, stderr = process.communicate(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            self.fail("dual runner stayed alive after a runtime failure")
        self.assertNotEqual(process.returncode, 0, stdout + stderr)
        self.assertIn("FAIL", (stdout + stderr).upper())

    def test_evidence_requires_oai_descriptor_and_handshake(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("pre-hardware emulator gate: node is unavailable")
        if not UF2.is_file():
            self.skipTest(
                "pre-hardware build gate: agentpad13_codex_oai.uf2 is not "
                "available; run firmware/tools/build_codex_oai.py first"
            )
        evidence = run_oai_emulator(UF2)
        self.assertTrue(evidence["usb_enumerated"])
        self.assertEqual(evidence["vid_pid"], "303a:8360")
        self.assertEqual(evidence["usage"], "ff00:0061")
        self.assertEqual(evidence["report_id"], 6)
        self.assertEqual(evidence["report_bytes"], 64)
        self.assertTrue(evidence["keyboard_hid_enumerated"])
        self.assertTrue(evidence["oai_hid_enumerated"])
        self.assertTrue(evidence["descriptor_verified"])
        self.assertTrue(evidence["rgbcfg_ack"])
        self.assertTrue(evidence["thstatus_ack"])
        self.assertTrue(evidence["device_status_ack"])
        self.assertEqual(evidence["key_event"], {"k": "AG00", "act": 1})
        self.assertGreater(evidence["task_status_fragment_count"], 1)
        self.assertEqual(evidence["task_status"]["e"], 4)
        self.assertEqual(evidence["task_status"]["b"], 1)
        self.assertTrue(evidence["ws2812_activity"])
        self.assertEqual(evidence["uf2_size_bytes"], UF2.stat().st_size)
        self.assertEqual(evidence["uf2_sha256"], hashlib.sha256(UF2.read_bytes()).hexdigest())

    def test_runner_has_exact_single_frame_wrapper_and_endpoint_contract(self) -> None:
        runner = (EMULATOR / "oai_runner.cjs").read_text(encoding="utf-8")
        for fragment in (
            "const OAI_VIAL = process.env.AGENTPAD_OAI_VIAL === '1';",
            "const OAI_FRAME_PREFIX = OAI_VIAL ? 0xa6 : OAI_REPORT_ID;",
            "const OAI_REPORT_BYTES = OAI_VIAL ? 32 : 64;",
            "const payload = Buffer.from(json, 'utf8');",
            "if (payload.length > OAI_MAX_PAYLOAD) throw new Error('single-frame fixture too large');",
            "const report = Buffer.alloc(OAI_REPORT_BYTES);",
            "report[0] = OAI_FRAME_PREFIX;",
            "report[1] = 2;",
            "report[2] = payload.length;",
            "payload.copy(report, 3);",
            "const OAI_USAGE_PAGE = OAI_VIAL ? 0xff60 : 0xff00;",
            "const OAI_USAGE = 0x0061;",
            "const OAI_EXPECTED_VID_PID = OAI_VIAL ? 'feed:4c4d' : '303a:8360';",
            "wValue: 0x2200,",
            "wIndex: raw.number,",
            "function keyboardHid(interfaces)",
            "iface.sub === 1 && iface.proto === 1",
            "const reports = oaiReports(json);",
            "task_status_fragment_count: thstatusResult.fragmentCount",
            "uf2_size_bytes: uf2Data.length",
            "uf2_sha256: uf2Sha256",
            "mcu.gpio[12].setInputValue(false);",
            "edgesAfterStatus > edgesBeforeStatus",
        ):
            self.assertIn(fragment, runner)
        watchdog = (EMULATOR / "dual_oai_vial_watchdog.cjs").read_text(encoding="utf-8")
        self.assertIn("--deadline-ms", watchdog)
        wrapper = (EMULATOR / "vial_oai_runner.cjs").read_text(encoding="utf-8")
        self.assertIn("AGENTPAD_OAI_VIAL", wrapper)
        self.assertIn("runner.main()", wrapper)

    def test_fragmenter_and_keyboard_interface_detection_execute_on_host(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node is unavailable")
        script = r'''
const runner = require('./oai_runner.cjs');
const json = '{"method":"v.oai.thstatus","id":2,"params":[{"id":0,"c":3162110,"e":4,"b":1,"s":0.5}]}';
const reports = runner.oaiReports(json);
const rebuilt = Buffer.concat(reports.map((report) => report.subarray(3, 3 + report[2]))).toString('utf8');
const keyboard = runner.keyboardHid([
  { number: 0, cls: 3, sub: 1, proto: 1, inEp: 1, inBytes: 8 },
  { number: 1, cls: 3, sub: 0, proto: 0, inEp: 2, inBytes: 64, outEp: 3, outBytes: 64 },
]);
if (reports.length < 2 || reports.some((report) => report.length !== 64 || report[0] !== 6) || rebuilt !== json || !keyboard || keyboard.number !== 0) process.exit(1);
'''
        subprocess.run(["node", "-e", script], cwd=EMULATOR, check=True)

    def test_vial_fragmenter_uses_the_standard_vial_raw_hid_frame(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node is unavailable")
        script = r'''
const runner = require('./oai_runner.cjs');
const json = '{"method":"v.oai.hid","params":{"k":"AG00","act":1}}\r\n';
const reports = runner.oaiReports(json);
const messages = runner.readOaiMessages(reports);
if (reports.length < 2 || reports.some((report) => report.length !== 32 || report[0] !== 0xa6) || messages.length !== 1 || messages[0] !== json) process.exit(1);
'''
        environment = {**__import__("os").environ, "AGENTPAD_OAI_VIAL": "1"}
        subprocess.run(["node", "-e", script], cwd=EMULATOR, env=environment, check=True)

    def test_vial_oai_evidence_requires_vial_and_oai_coexistence(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("pre-hardware emulator gate: node is unavailable")
        if not VIAL_OAI_UF2.is_file():
            self.skipTest(
                "pre-hardware build gate: agentpad13_vial_oai.uf2 is not "
                "available; run firmware/tools/build_codex_oai.py first"
            )
        evidence = run_vial_oai_emulator(VIAL_OAI_UF2)
        self.assertTrue(evidence["usb_enumerated"])
        self.assertEqual(evidence["vid_pid"], "feed:4c4d")
        self.assertEqual(evidence["usage"], "ff60:0061")
        self.assertIsNone(evidence["report_id"])
        self.assertEqual(evidence["report_bytes"], 32)
        self.assertTrue(evidence["descriptor_verified"])
        self.assertTrue(evidence["vial_protocol_ack"])
        self.assertEqual(evidence["vial_default_k00"], 0x7E02)
        self.assertTrue(evidence["rgbcfg_ack"])
        self.assertTrue(evidence["thstatus_ack"])
        self.assertTrue(evidence["device_status_ack"])
        self.assertEqual(evidence["key_event"], {"k": "AG00", "act": 1})
        self.assertTrue(evidence["ws2812_activity"])
        self.assertEqual(evidence["uf2_size_bytes"], VIAL_OAI_UF2.stat().st_size)
        self.assertEqual(evidence["uf2_sha256"], hashlib.sha256(VIAL_OAI_UF2.read_bytes()).hexdigest())

    def test_dual_host_fixture_selects_descriptors_and_routes_frames_by_owner(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node is unavailable")
        script = r'''
const runner = require('./dual_oai_vial_runner.cjs');
const hidDescriptors = [
  {
    number: 1, inEp: 2, outEp: 3, inBytes: 32, outBytes: 32,
    report: Buffer.from([0x06, 0x60, 0xff, 0x09, 0x61, 0xa1, 1, 0x95, 32, 0xc0]),
  },
  {
    number: 2, inEp: 4, outEp: 5, inBytes: 64, outBytes: 64,
    report: Buffer.from([0x06, 0x00, 0xff, 0x09, 0x61, 0xa1, 1, 0x85, 6, 0x95, 63, 0xc0]),
  },
];
const oai = runner.hidByReportDescriptor(hidDescriptors, { usagePage: 0xff00, reportBytes: 64 });
const vial = runner.hidByReportDescriptor(hidDescriptors, { usagePage: 0xff60, reportBytes: 32 });
const vialSetup = runner.reportDescriptorSetup(vial.number, vial.reportBytes);
const oaiSetup = runner.reportDescriptorSetup(oai.number, oai.reportBytes);
const vialFrame = Buffer.alloc(32); vialFrame[0] = 0x01;
const vialDynamicKeymapFrame = Buffer.alloc(32); vialDynamicKeymapFrame[0] = 0x05;
const oaiFrame = Buffer.alloc(64); oaiFrame[0] = 6; oaiFrame[1] = 2;
const reports = new Map([[oai.number, oai.report]]);
const sharedOutOai = { ...oai, outEp: vial.outEp };
if (!oai || !vial || !runner.hasDistinctRawEndpointPairs(vial, oai) ||
    runner.hasDistinctRawEndpointPairs(vial, sharedOutOai) ||
    vial.reportId !== null || oai.reportId !== 6 ||
    vialSetup.wIndex !== 1 || oaiSetup.wIndex !== 2 ||
    !runner.reportDescriptorMatches(vial.report, { usage: 'ff60:0061', report_id: null, report_bytes: 32 }) ||
    !runner.reportDescriptorMatches(oai.report, { usage: 'ff00:0061', report_id: 6, report_bytes: 64 }) ||
    !runner.oaiHidEnumerated(oai, reports, [1, 2]) ||
    runner.oaiHidEnumerated(oai, reports, [1]) ||
    runner.oaiHidEnumerated({ ...oai, number: 1 }, reports, [1, 2]) ||
    runner.routeFrame(vialFrame, { vial, oai }) !== 'vial' ||
    runner.routeFrame(vialDynamicKeymapFrame, { vial, oai }) !== 'vial' ||
    runner.routeFrame(oaiFrame, { vial, oai }) !== 'oai') process.exit(1);
'''
        subprocess.run(["node", "-e", script], cwd=EMULATOR, check=True)

    def test_dual_config_prefix_gates_recovery_without_overwriting_parsed_data(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node is unavailable")
        script = r'''
const runner = require('./dual_oai_vial_runner.cjs');
const prefix = Buffer.from([
  9, 2, 0x70, 0, 3, 1, 0, 0x80, 50,
  9, 4, 0, 0, 1, 3, 1, 1, 0, 9, 0x21, 0x11, 1, 0, 1, 0x22, 0x44, 0,
  7, 5, 0x85, 3, 8, 0, 10,
  9, 4, 1, 0, 2, 3, 0, 0, 0, 9, 0x21, 0x11, 1, 0, 1, 0x22, 0x20, 0,
  7, 5, 0x81, 3, 32, 0, 1,
]);
const invalidHeader = Buffer.from(prefix); invalidHeader[4] = 2;
const invalidVial = Buffer.from(prefix); invalidVial[57] = 64;
const interfaces = runner.parseConfig(prefix);
const recovery = runner.recoverTruncatedConfig(interfaces, { complete: false, prefixValidated: true });
const parsed = [
  { number: 0, cls: 3, sub: 1, proto: 1, inEp: 5, outEp: -1, inBytes: 8, outBytes: 0, reportBytes: 68 },
  { number: 1, cls: 3, sub: 0, proto: 0, inEp: 2, outEp: 3, inBytes: 32, outBytes: 32, reportBytes: 32 },
  { number: 2, cls: 3, sub: 0, proto: 0, inEp: 9, outEp: 10, inBytes: 64, outBytes: 64, reportBytes: 38 },
];
const snapshot = JSON.stringify(parsed);
const preserved = runner.recoverTruncatedConfig(parsed, { complete: false, prefixValidated: true });
const blocked = runner.recoverTruncatedConfig(runner.parseConfig(prefix), { complete: false, prefixValidated: false });
if (!runner.hasValidatedDualConfigPrefix(prefix) || runner.hasValidatedDualConfigPrefix(invalidHeader) ||
    runner.hasValidatedDualConfigPrefix(invalidVial) || !recovery.used ||
    !recovery.syntheticOaiEndpoint || recovery.syntheticOaiEndpoint.interface_number !== 2 ||
    recovery.syntheticOaiEndpoint.in_endpoint !== 3 || recovery.syntheticOaiEndpoint.out_endpoint !== 4 ||
    !recovery.syntheticOaiEndpoint.not_descriptor_proof || preserved.used ||
    JSON.stringify(parsed) !== snapshot || blocked.used) process.exit(1);
'''
        subprocess.run(["node", "-e", script], cwd=EMULATOR, check=True)

    def test_dual_evidence_requires_both_exact_report_descriptors_and_isolation(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("pre-hardware emulator gate: node is unavailable")
        if not DUAL_OAI_VIAL_UF2.is_file():
            self.skipTest(
                "pre-hardware build gate: agentpad13_oai_vial_dual.uf2 is not "
                "available; run the Task-5 dual hardware build first"
            )
        evidence = run_dual_oai_vial_emulator(DUAL_OAI_VIAL_UF2)
        self.assertEqual(evidence["vid_pid"], "303a:8360")
        self.assertEqual(
            evidence["vial_interface"],
            {"usage": "ff60:0061", "report_id": None, "report_bytes": 32},
        )
        self.assertEqual(
            evidence["oai_interface"],
            {"usage": "ff00:0061", "report_id": 6, "report_bytes": 64},
        )
        self.assertTrue(evidence["vial_protocol_ack"])
        self.assertTrue(evidence["oai_hid_enumerated"])
        self.assertTrue(evidence["rgbcfg_ack"])
        self.assertTrue(evidence["thstatus_ack"])
        self.assertTrue(evidence["device_status_ack"])
        self.assertEqual(evidence["key_event"], {"k": "AG00", "act": 1})
        self.assertTrue(evidence["channels_isolated"])
        keyboard_behavior = evidence["keyboard_report_behavior"]
        self.assertEqual(keyboard_behavior["report_bytes"], 8)
        self.assertGreater(keyboard_behavior["report_count"], 0)
        self.assertGreater(keyboard_behavior["reports_after_key"], 0)
        self.assertTrue(keyboard_behavior["press_seen"])
        self.assertTrue(keyboard_behavior["release_seen"])
        joystick_behavior = evidence["joystick_report_behavior"]
        self.assertEqual(joystick_behavior["report_id"], 7)
        self.assertGreaterEqual(joystick_behavior["report_count"], 2)
        self.assertTrue(joystick_behavior["axes_swung"])
        self.assertEqual(
            evidence["shared_keyboard_joystick_endpoint"]["keyboard_endpoint"],
            evidence["shared_keyboard_joystick_endpoint"]["joystick_endpoint"],
        )
        self.assertNotEqual(
            evidence["vial_endpoint"]["in_endpoint"], evidence["oai_endpoint"]["in_endpoint"]
        )
        self.assertNotEqual(
            evidence["vial_endpoint"]["out_endpoint"], evidence["oai_endpoint"]["out_endpoint"]
        )
        self.assertIn("config_descriptor_recovery_used", evidence)
        self.assertIn("synthetic_oai_endpoint", evidence)
        if evidence["config_descriptor_recovery_used"]:
            self.assertEqual(
                evidence["synthetic_oai_endpoint"],
                {
                    "interface_number": 2,
                    "in_endpoint": 3,
                    "out_endpoint": 4,
                    "in_endpoint_address": 0x83,
                    "out_endpoint_address": 0x04,
                    "not_descriptor_proof": True,
                },
            )
        else:
            self.assertIsNone(evidence["synthetic_oai_endpoint"])
        self.assertEqual(evidence["uf2_size_bytes"], DUAL_OAI_VIAL_UF2.stat().st_size)
        self.assertEqual(
            evidence["uf2_sha256"], hashlib.sha256(DUAL_OAI_VIAL_UF2.read_bytes()).hexdigest()
        )

    def test_dual_emulator_proves_vial_dynamic_encoder_map_at_runtime(self) -> None:
        evidence = run_dual_oai_vial_emulator(DUAL_OAI_VIAL_UF2)
        encoder = evidence["encoder_rotation_behavior"]
        self.assertTrue(encoder["initial_map_readback_verified"])
        self.assertTrue(encoder["initial_rotation_emitted_oai_event"])
        self.assertEqual(
            encoder["initial_rotation_oai_events"],
            ['{"method":"v.oai.hid","params":{"k":"ENC_CW","act":2}}\r\n'],
        )
        self.assertTrue(encoder["initial_rotation_emitted_exactly_one_oai_event"])
        self.assertTrue(encoder["dynamic_map_write_ack"])
        self.assertEqual(encoder["programmed_clockwise_keycode"], 0x52)
        self.assertEqual(encoder["map_readback_after_write"], 0x52)
        self.assertTrue(encoder["rotation_after_map_write_seen"])
        self.assertTrue(encoder["rotation_used_programmed_keycode"])


if __name__ == "__main__":
    unittest.main()
