"""Host-only acceptance tests for the direct-OAI artifact verifier."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest import mock


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SCRIPT = REPO / "firmware" / "tools" / "verify_codex_oai_artifact.py"

UF2_BLOCK_SIZE = 512
UF2_PAYLOAD_SIZE = 256
UF2_FLASH_BASE = 0x10000000


def make_usb_string_descriptor(value: str) -> bytes:
    payload = value.encode("utf-16le")
    return bytes((len(payload) + 2, 3)) + payload


def make_usb_device_descriptor(
    *, vid: int = 0x303A, pid: int = 0x8360, manufacturer_index: int = 1,
    product_index: int = 2, serial_index: int = 3,
) -> bytes:
    return bytes((
        18, 1, 0, 2, 0, 0, 0, 64,
        vid & 0xFF, vid >> 8, pid & 0xFF, pid >> 8,
        0, 5, manufacturer_index, product_index, serial_index, 1,
    ))


def make_dual_usb_descriptor_fixture(
    *,
    vial_interface: bool = True,
    oai_interface: bool = True,
    vial_endpoints: bool = True,
    oai_endpoints: bool = True,
    vial_hid_report_type: int = 0x22,
    oai_hid_report_type: int = 0x22,
    vial_input_report_size: int = 8,
    vial_output_report_size: int = 8,
    vial_interface_number: int = 1,
    oai_interface_number: int | None = None,
    vial_alternate_setting: int = 0,
    oai_alternate_setting: int = 0,
    vial_root_usage: int = 0x61,
    oai_root_usage: int = 0x61,
    oai_report_id: int = 6,
    swap_raw_interface_order: bool = False,
    duplicate_vial_report: bool = False,
    unexpected_vendor_report: bool = False,
    declared_interfaces: int | None = None,
    extra_interface: bool = False,
    malformed_interface: bool = False,
    keyboard_in_endpoint: int = 0x85,
    vial_out_endpoint: int = 0x02,
    vial_in_endpoint: int = 0x81,
    oai_out_endpoint: int = 0x04,
    oai_in_endpoint: int = 0x83,
) -> bytes:
    """Return a compact ELF-derived image with the complete dual HID contract."""
    if oai_interface_number is None:
        oai_interface_number = 2 if vial_interface else 1
    vial_body_usage = (9, 0x61) if vial_root_usage != 0x61 else ()
    vial_report = bytes((
        6, 0x60, 0xFF, 9, vial_root_usage, 0xA1, 1, *vial_body_usage, 9, 0x62, 0x15, 0,
        0x26, 0xFF, 0, 0x95, 32, 0x75, vial_input_report_size, 0x81, 2, 9, 0x63,
        0x95, 32, 0x75, vial_output_report_size, 0x91, 2, 0xC0,
    ))
    oai_report = bytes((
        6, 0, 0xFF, 9, oai_root_usage, 0xA1, 1, 0x85, oai_report_id,
        *((9, 0x61) if oai_root_usage != 0x61 else ()), 9, 0x62, 0x15, 0,
        0x26, 0xFF, 0, 0x95, 63, 0x75, 8, 0x81, 2, 9, 0x63,
        0x95, 63, 0x75, 8, 0x91, 2, 0xC0,
    ))
    unexpected_report = bytes((
        6, 1, 0xFF, 9, 0x61, 0xA1, 1, 9, 0x62, 0x15, 0,
        0x26, 0xFF, 0, 0x95, 16, 0x75, 8, 0x81, 2, 9, 0x63,
        0x95, 16, 0x75, 8, 0x91, 2, 0xC0,
    ))
    keyboard = (
        bytes((9, 4, 0, 0, 1, 3, 1, 1, 0)),
        bytes((9, 0x21, 0x11, 0x01, 0, 1, 0x22, 0, 0)),
        bytes((7, 5, keyboard_in_endpoint, 3, 8, 0, 10)),
    )
    vial = (
        bytes((9, 4, vial_interface_number, vial_alternate_setting, 2, 3, 0, 0, 0)),
        bytes((9, 0x21, 0x11, 0x01, 0, 1, vial_hid_report_type, len(vial_report), 0)),
        bytes((7, 5, vial_out_endpoint, 3, 32, 0, 1)),
        bytes((7, 5, vial_in_endpoint, 3, 32, 0, 1)),
    )
    oai = (
        bytes((9, 4, oai_interface_number, oai_alternate_setting, 2, 3, 0, 0, 0)),
        bytes((9, 0x21, 0x11, 0x01, 0, 1, oai_hid_report_type, len(oai_report), 0)),
        bytes((7, 5, oai_out_endpoint, 3, 64, 0, 1)),
        bytes((7, 5, oai_in_endpoint, 3, 64, 0, 1)),
    )
    descriptors = list(keyboard)
    raw_descriptors = []
    if vial_interface:
        raw_descriptors.append(vial[:2] + (vial[2:] if vial_endpoints else ()))
    if oai_interface:
        raw_descriptors.append(oai[:2] + (oai[2:] if oai_endpoints else ()))
    if swap_raw_interface_order:
        raw_descriptors.reverse()
    for raw_interface in raw_descriptors:
        descriptors.extend(raw_interface)
    if extra_interface:
        descriptors.append(bytes((9, 4, 3, 0, 0, 0xFF, 0, 0, 0)))
    if malformed_interface:
        descriptors.append(bytes((5, 4, 3, 0, 0)))
    config_body = b"".join(descriptors)
    interface_count = declared_interfaces
    if interface_count is None:
        interface_count = (
            1
            + int(vial_interface)
            + int(oai_interface)
            + int(extra_interface)
            + int(malformed_interface)
        )
    configuration = bytes((9, 2)) + struct.pack("<H", 9 + len(config_body)) + bytes((interface_count, 1, 1, 0x80, 50))
    decoy = b"\x05\x01" + vial_report if duplicate_vial_report else b""
    reports = b""
    if vial_interface:
        reports += vial_report
    if oai_interface:
        reports += oai_report
    if unexpected_vendor_report:
        reports += unexpected_report
    return configuration + config_body + reports + decoy


def make_uf2(image: bytes) -> bytes:
    if len(image) % UF2_PAYLOAD_SIZE:
        raise ValueError("test UF2 image must contain complete payload blocks")
    block_count = len(image) // UF2_PAYLOAD_SIZE
    output = bytearray()
    for block_number in range(block_count):
        block = bytearray(UF2_BLOCK_SIZE)
        payload = image[
            block_number * UF2_PAYLOAD_SIZE : (block_number + 1) * UF2_PAYLOAD_SIZE
        ]
        struct.pack_into(
            "<IIIIIIII",
            block,
            0,
            0x0A324655,
            0x9E5D5157,
            0x00002000,
            UF2_FLASH_BASE + block_number * UF2_PAYLOAD_SIZE,
            UF2_PAYLOAD_SIZE,
            block_number,
            block_count,
            0xE48BFF56,
        )
        block[32 : 32 + UF2_PAYLOAD_SIZE] = payload
        struct.pack_into("<I", block, 508, 0x0AB16F30)
        output.extend(block)
    return bytes(output)


def load_verifier():
    spec = importlib.util.spec_from_file_location("codex_oai_artifact_verifier", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load artifact verifier")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ArtifactVerifierTest(unittest.TestCase):
    def setUp(self) -> None:
        self.work = tempfile.TemporaryDirectory(prefix="agentpad13_artifact_test_")
        self.root = Path(self.work.name)
        self.elf_binary = (
            bytes(range(256))
            + make_dual_usb_descriptor_fixture(vial_interface=False)
            + b"agentpad13 direct oai fixture\n"
        )
        self.vial_elf_binary = (
            bytes(range(256))
            + make_dual_usb_descriptor_fixture(oai_interface=False)
            + b"agentpad13 vial oai fixture\n"
        )
        self.dual_elf_binary = (
            bytes(range(256))
            + make_usb_device_descriptor()
            + make_dual_usb_descriptor_fixture()
            + make_usb_string_descriptor("hirlu")
            + make_usb_string_descriptor("Codex Micro Lab OAI LED")
            + b"agentpad13 dual oai fixture\n"
        )
        self.uf2_image = self.elf_binary + bytes(
            (-len(self.elf_binary)) % UF2_PAYLOAD_SIZE
        )
        self.good_uf2 = self.root / "loudest_micro_codex_oai.uf2"
        self.good_uf2.write_bytes(make_uf2(self.uf2_image))
        self.good_elf = self.root / "loudest_micro_codex_oai.elf"
        self.good_elf.write_bytes(b"ELF fixture\n")
        self.good_vial_uf2 = self.root / "loudest_micro_vial_oai.uf2"
        self.good_vial_uf2.write_bytes(
            make_uf2(
                self.vial_elf_binary
                + bytes((-len(self.vial_elf_binary)) % UF2_PAYLOAD_SIZE)
            )
        )
        self.good_dual_uf2 = self.root / "loudest_micro_vial_oai_dual.uf2"
        self.good_dual_uf2.write_bytes(
            make_uf2(
                self.dual_elf_binary
                + bytes((-len(self.dual_elf_binary)) % UF2_PAYLOAD_SIZE)
            )
        )
        uf2_bytes = self.good_uf2.read_bytes()
        vial_uf2_bytes = self.good_vial_uf2.read_bytes()
        dual_uf2_bytes = self.good_dual_uf2.read_bytes()
        self.good_evidence = {
            "usb_enumerated": True,
            "keyboard_hid_enumerated": True,
            "oai_hid_enumerated": True,
            "vid_pid": "303a:8360",
            "usage": "ff00:0061",
            "report_id": 6,
            "report_bytes": 64,
            "descriptor_verified": True,
            "rgbcfg_ack": True,
            "thstatus_ack": True,
            "device_status_ack": True,
            "key_event": {"k": "AG00", "act": 1},
            "ws2812_activity": True,
            "task_status": {"id": 0, "c": 3162110, "e": 4, "b": 1, "s": 0.5},
            "task_status_fragment_count": 2,
            "uf2_sha256": hashlib.sha256(uf2_bytes).hexdigest(),
            "uf2_size_bytes": len(uf2_bytes),
        }
        self.good_vial_evidence = {
            **self.good_evidence,
            "vid_pid": "feed:4c4d",
            "usage": "ff60:0061",
            "report_id": None,
            "report_bytes": 32,
            "vial_protocol_ack": True,
            "vial_default_k00": 0x7E02,
            "uf2_sha256": hashlib.sha256(vial_uf2_bytes).hexdigest(),
            "uf2_size_bytes": len(vial_uf2_bytes),
        }
        self.good_dual_evidence = {
            **self.good_evidence,
            "vid_pid": "303a:8360",
            "oai_interface": {
                "usage": "ff00:0061",
                "report_id": 6,
                "report_bytes": 64,
            },
            "vial_interface": {
                "usage": "ff60:0061",
                "report_id": None,
                "report_bytes": 32,
            },
            "vial_protocol_ack": True,
            "channels_isolated": True,
            "report_descriptors_verified": True,
            "configuration_descriptor_verified": False,
            "config_descriptor_recovery_used": True,
            "descriptor_verified": False,
            "device_identity": {
                "manufacturer": "hirlu", "product": "Codex Micro Lab OAI LED",
            },
            "keyboard_report_behavior": {
                "report_bytes": 8, "report_count": 2,
                "press_seen": True, "release_seen": True,
            },
            "joystick_report_behavior": {
                "report_id": 7, "report_count": 2, "axes_swung": True,
            },
            "shared_keyboard_joystick_endpoint": {
                "keyboard_endpoint": 5, "joystick_endpoint": 5,
            },
            "manufacturer": "hirlu",
            "product": "Codex Micro Lab OAI LED",
            "vial_default_k00": 0x7E02,
            "uf2_sha256": hashlib.sha256(dual_uf2_bytes).hexdigest(),
            "uf2_size_bytes": len(dual_uf2_bytes),
        }
        self.verifier = load_verifier()

    def tearDown(self) -> None:
        self.work.cleanup()

    def _tool_output(self, command, **_kwargs):
        if command[0].endswith("-size"):
            return "   text    data     bss     dec     hex filename\n   1000      20      30    1050     41a fixture.elf\n"
        if command[0].endswith("-nm"):
            return (
                "00000000 T raw_hid_receive\n"
                "00000000 T oai_raw_hid_receive\n"
                "00000000 T codex_oai_notify\n"
                "00000000 T codex_led_render\n"
                "00000000 T encoder_update_user\n"
                "00000000 T via_command_kb\n"
                "00000000 T codex_oai_vial_command\n"
                "00000000 T process_record_user\n"
            )
        raise AssertionError(f"unexpected tool command: {command}")

    def _verify(
        self,
        *,
        uf2: Path | None = None,
        elf: Path | None = None,
        evidence: dict | None = None,
        elf_binary: bytes | None = None,
        profile: str = "direct",
    ):
        defaults = {
            "direct": (self.good_uf2, self.elf_binary, self.good_evidence),
            "vial": (self.good_vial_uf2, self.vial_elf_binary, self.good_vial_evidence),
            "dual": (self.good_dual_uf2, self.dual_elf_binary, self.good_dual_evidence),
        }
        default_uf2, default_elf_binary, default_evidence = defaults[profile]
        with mock.patch.object(
            self.verifier.subprocess, "check_output", side_effect=self._tool_output
        ), mock.patch.object(
            self.verifier,
            "elf_binary",
            return_value=default_elf_binary if elf_binary is None else elf_binary,
            create=True,
        ):
            return self.verifier.verify(
                uf2 or default_uf2,
                elf or self.good_elf,
                evidence or default_evidence,
                profile=profile,
            )

    def _evidence_for(self, uf2: Path) -> dict:
        data = uf2.read_bytes()
        return {
            **self.good_evidence,
            "uf2_sha256": hashlib.sha256(data).hexdigest(),
            "uf2_size_bytes": len(data),
        }

    def test_accepts_exact_descriptor_symbols_and_hash(self) -> None:
        result = self._verify()
        self.assertEqual(result["target"], "loudest_micro:codex_oai")
        self.assertEqual(result["vid_pid"], "303a:8360")
        self.assertEqual(result["report_id"], 6)
        self.assertEqual(len(result["sha256"]), 64)
        self.assertEqual(result["size_bytes"], self.good_uf2.stat().st_size)
        self.assertEqual(result["elf_size"], {"text": 1000, "data": 20, "bss": 30})
        self.assertEqual(result["elf_sha256"], hashlib.sha256(self.good_elf.read_bytes()).hexdigest())
        self.assertEqual(
            result["elf_uf2_equivalence"],
            {
                "status": "pass",
                "flash_base": "0x10000000",
                "elf_binary_size_bytes": len(self.elf_binary),
                "uf2_flash_size_bytes": len(self.uf2_image),
                "trailing_zero_padding_bytes": len(self.uf2_image) - len(self.elf_binary),
            },
        )

    def test_accepts_vial_oai_profile_with_standard_raw_hid_transport(self) -> None:
        result = self._verify(evidence=self.good_vial_evidence, profile="vial")

        self.assertEqual(result["target"], "loudest_micro:vial_oai")
        self.assertEqual(result["vid_pid"], "feed:4c4d")
        self.assertEqual(result["usage"], "ff60:0061")
        self.assertIsNone(result["report_id"])
        self.assertEqual(result["report_bytes"], 32)
        self.assertIn("codex_oai_vial_command", result["required_symbols"])

    def test_vial_oai_profile_requires_vial_protocol_evidence(self) -> None:
        evidence = {**self.good_vial_evidence, "vial_protocol_ack": False}
        with self.assertRaisesRegex(self.verifier.VerificationError, "vial_protocol_ack"):
            self._verify(evidence=evidence, profile="vial")

    def test_accepts_dual_profile_with_both_raw_interfaces(self) -> None:
        result = self._verify(evidence=self.good_dual_evidence, profile="dual")

        self.assertEqual(result["target"], "loudest_micro:vial_oai")
        self.assertEqual(result["vid_pid"], "303a:8360")
        self.assertEqual(
            result["interfaces"],
            [
                {"role": "vial", "usage": "ff60:0061", "report_id": None, "report_bytes": 32},
                {"role": "oai", "usage": "ff00:0061", "report_id": 6, "report_bytes": 64},
            ],
        )
        self.assertEqual(
            result["usb_descriptor_contract"]["interfaces"],
            [
                {"role": "vial", "interface": 1, "endpoint_bytes": 32},
                {"role": "oai", "interface": 2, "endpoint_bytes": 64},
            ],
        )
        self.assertEqual(
            result["usb_descriptor_contract"]["endpoint_addresses"],
            [0x02, 0x04, 0x81, 0x83, 0x85],
        )
        self.assertEqual(
            result["device_identity"],
            {"manufacturer": "hirlu", "product": "Codex Micro Lab OAI LED"},
        )
        self.assertIn("keyboard_report_behavior", result["emulator_evidence"])
        self.assertIn("joystick_report_behavior", result["emulator_evidence"])
        self.assertEqual(
            result["emulator_evidence"]["shared_keyboard_joystick_endpoint"],
            {"keyboard_endpoint": 5, "joystick_endpoint": 5},
        )
        self.assertIn("oai_raw_hid_receive", result["required_symbols"])

    def test_dual_recovery_evidence_accepts_report_proof_but_not_configuration_proof(self) -> None:
        result = self._verify(evidence=self.good_dual_evidence, profile="dual")
        emulator = result["emulator_evidence"]
        self.assertTrue(emulator["report_descriptors_verified"])
        self.assertTrue(emulator["config_descriptor_recovery_used"])
        self.assertFalse(emulator["configuration_descriptor_verified"])
        self.assertFalse(emulator["descriptor_verified"])

        for field, value in (("report_descriptors_verified", False), ("descriptor_verified", True)):
            with self.subTest(field=field):
                evidence = {**self.good_dual_evidence, field: value}
                with self.assertRaisesRegex(self.verifier.VerificationError, field):
                    self._verify(evidence=evidence, profile="dual")

    def test_dual_profile_rejects_missing_or_mismatched_interface_evidence(self) -> None:
        cases = (
            ("missing vial interface", {"vial_interface": None}, "vial_interface"),
            ("missing oai interface", {"oai_interface": None}, "oai_interface"),
            (
                "swapped report sizes",
                {"vial_interface": {"usage": "ff60:0061", "report_id": None, "report_bytes": 64}},
                "report byte",
            ),
            (
                "vial report id",
                {"vial_interface": {"usage": "ff60:0061", "report_id": 6, "report_bytes": 32}},
                "report ID",
            ),
            (
                "wrong oai usage",
                {"oai_interface": {"usage": "ff01:0061", "report_id": 6, "report_bytes": 64}},
                "usage",
            ),
            ("channels not isolated", {"channels_isolated": False}, "channels_isolated"),
            (
                "wrong compiled identity evidence",
                {"device_identity": {"manufacturer": "other", "product": "Codex Micro Lab OAI LED"}},
                "device identity",
            ),
        )
        for name, changes, message in cases:
            with self.subTest(name=name):
                evidence = {**self.good_dual_evidence, **changes}
                with self.assertRaisesRegex(self.verifier.VerificationError, message):
                    self._verify(evidence=evidence, profile="dual")

    def test_dual_static_descriptor_contract_rejects_missing_interface_or_endpoint_pair(self) -> None:
        cases = (
            ("missing vial interface", {"vial_interface": False}),
            ("missing oai interface", {"oai_interface": False}),
            ("missing vial endpoint pair", {"vial_endpoints": False}),
            ("missing oai endpoint pair", {"oai_endpoints": False}),
        )
        for name, options in cases:
            with self.subTest(name=name):
                fixture = make_dual_usb_descriptor_fixture(**options)
                with mock.patch.object(self.verifier, "elf_binary", return_value=fixture):
                    with self.assertRaisesRegex(self.verifier.VerificationError, "USB descriptor"):
                        self.verifier.verify_usb_descriptor_contract(
                            self.good_elf, self.verifier.DUAL_PROFILE
                        )

    def test_dual_static_descriptor_contract_rejects_endpoint_collisions_and_wrong_addresses(self) -> None:
        cases = (
            ("Vial IN collides with keyboard IN", {"vial_in_endpoint": 0x85}),
            ("OAI OUT collides with Vial OUT", {"oai_out_endpoint": 0x02}),
            ("Vial IN uses the wrong address", {"vial_in_endpoint": 0x82}),
            ("OAI IN uses the wrong address", {"oai_in_endpoint": 0x84}),
            ("Vial OUT has the wrong direction", {"vial_out_endpoint": 0x82}),
        )
        for name, options in cases:
            with self.subTest(name=name):
                fixture = make_dual_usb_descriptor_fixture(**options)
                with mock.patch.object(self.verifier, "elf_binary", return_value=fixture):
                    with self.assertRaisesRegex(self.verifier.VerificationError, "USB descriptor"):
                        self.verifier.verify_usb_descriptor_contract(
                            self.good_elf, self.verifier.DUAL_PROFILE
                        )

    def test_dual_artifact_identity_rejects_wrong_compiled_device_strings(self) -> None:
        cases = (
            (
                "wrong manufacturer",
                make_usb_device_descriptor() + make_usb_string_descriptor("other")
                + make_usb_string_descriptor("Codex Micro Lab OAI LED"),
            ),
            (
                "wrong product",
                make_usb_device_descriptor() + make_usb_string_descriptor("hirlu")
                + make_usb_string_descriptor("other"),
            ),
            (
                "duplicate manufacturer",
                make_usb_device_descriptor() + make_usb_string_descriptor("hirlu")
                + make_usb_string_descriptor("hirlu")
                + make_usb_string_descriptor("Codex Micro Lab OAI LED"),
            ),
            (
                "swapped selected indices",
                make_usb_device_descriptor(manufacturer_index=2, product_index=1)
                + make_usb_string_descriptor("hirlu")
                + make_usb_string_descriptor("Codex Micro Lab OAI LED"),
            ),
            ("missing device descriptor", b""),
        )
        for name, identity in cases:
            with self.subTest(name=name):
                fixture = (
                    bytes(range(256))
                    + make_dual_usb_descriptor_fixture()
                    + identity
                )
                with self.assertRaisesRegex(self.verifier.VerificationError, "device|manufacturer|product"):
                    self.verifier.verify_device_identity(fixture, self.verifier.DUAL_PROFILE)

    def test_dual_static_descriptor_contract_rejects_ambiguous_or_mistyped_hid_reports(self) -> None:
        cases = (
            ("duplicate vial report", {"duplicate_vial_report": True}),
            ("unexpected vendor raw collection", {"unexpected_vendor_report": True}),
            ("wrong Vial application usage", {"vial_root_usage": 0x62}),
            ("wrong OAI application usage", {"oai_root_usage": 0x62}),
            ("wrong OAI report ID", {"oai_report_id": 7}),
            ("wrong vial report descriptor type", {"vial_hid_report_type": 0x23}),
            ("wrong oai report descriptor type", {"oai_hid_report_type": 0x23}),
        )
        for name, options in cases:
            with self.subTest(name=name):
                fixture = make_dual_usb_descriptor_fixture(**options)
                with mock.patch.object(self.verifier, "elf_binary", return_value=fixture):
                    with self.assertRaisesRegex(self.verifier.VerificationError, "USB descriptor"):
                        self.verifier.verify_usb_descriptor_contract(
                            self.good_elf, self.verifier.DUAL_PROFILE
                        )

    def test_dual_static_descriptor_contract_requires_exact_interface_ids_and_roles(self) -> None:
        cases = (
            ("Vial interface incorrectly uses keyboard ID 0", {"vial_interface_number": 0}),
            ("unexpected OAI interface 99", {"oai_interface_number": 99}),
            (
                "swapped Vial and OAI interface IDs",
                {"vial_interface_number": 2, "oai_interface_number": 1},
            ),
            ("duplicate raw interface ID", {"oai_interface_number": 1}),
            (
                "missing required raw interface ID 1",
                {"vial_interface_number": 2, "oai_interface_number": 3},
            ),
            ("swapped raw interface descriptor order", {"swap_raw_interface_order": True}),
            ("nonzero Vial alternate setting", {"vial_alternate_setting": 1}),
        )
        for name, options in cases:
            with self.subTest(name=name):
                fixture = make_dual_usb_descriptor_fixture(**options)
                with mock.patch.object(self.verifier, "elf_binary", return_value=fixture):
                    with self.assertRaisesRegex(self.verifier.VerificationError, "USB descriptor"):
                        self.verifier.verify_usb_descriptor_contract(
                            self.good_elf, self.verifier.DUAL_PROFILE
                        )

    def test_dual_static_descriptor_contract_rejects_non_byte_sized_input_or_output(self) -> None:
        cases = (
            ("one-bit vial input", {"vial_input_report_size": 1}),
            ("one-bit vial output", {"vial_output_report_size": 1}),
        )
        for name, options in cases:
            with self.subTest(name=name):
                fixture = make_dual_usb_descriptor_fixture(**options)
                with mock.patch.object(self.verifier, "elf_binary", return_value=fixture):
                    with self.assertRaisesRegex(self.verifier.VerificationError, "USB descriptor"):
                        self.verifier.verify_usb_descriptor_contract(
                            self.good_elf, self.verifier.DUAL_PROFILE
                        )

    def test_dual_static_descriptor_contract_requires_exact_interface_cardinality(self) -> None:
        cases = (
            ("wrong declared interface count", {"declared_interfaces": 2}),
            ("extra interface", {"extra_interface": True}),
            ("malformed interface", {"malformed_interface": True, "declared_interfaces": 3}),
        )
        for name, options in cases:
            with self.subTest(name=name):
                fixture = make_dual_usb_descriptor_fixture(**options)
                with mock.patch.object(self.verifier, "elf_binary", return_value=fixture):
                    with self.assertRaisesRegex(self.verifier.VerificationError, "USB descriptor"):
                        self.verifier.verify_usb_descriptor_contract(
                            self.good_elf, self.verifier.DUAL_PROFILE
                        )

    def test_dual_profile_requires_all_dual_symbols(self) -> None:
        symbols = {
            "oai_raw_hid_receive": "T",
            "codex_oai_notify": "T",
            "codex_led_render": "T",
        }
        with self.assertRaisesRegex(self.verifier.VerificationError, "encoder_update_user"):
            self.verifier.verify_symbols(
                symbols, required_symbols=self.verifier.DUAL_PROFILE.required_symbols
            )

    def test_rejects_unrelated_elf_even_when_symbols_and_emulator_evidence_pass(self) -> None:
        unrelated_elf = self.root / "unrelated.elf"
        unrelated_elf.write_bytes(b"unrelated ELF fixture\n")
        with self.assertRaisesRegex(self.verifier.VerificationError, "ELF binary does not match UF2"):
            self._verify(elf=unrelated_elf, elf_binary=bytes([0xA5]) * len(self.elf_binary))

    def test_rejects_a_full_extra_zero_payload_beyond_the_elf(self) -> None:
        candidate = self.root / "extra-zero-block.uf2"
        candidate.write_bytes(make_uf2(self.uf2_image + bytes(UF2_PAYLOAD_SIZE)))
        with self.assertRaisesRegex(self.verifier.VerificationError, "padding"):
            self._verify(uf2=candidate, evidence=self._evidence_for(candidate))

    def test_rejects_short_gapped_block_when_omitted_elf_bytes_are_zero(self) -> None:
        elf_binary = bytes(range(248)) + bytes(8) + b"second block fixture\n"
        uf2_image = elf_binary + bytes((-len(elf_binary)) % UF2_PAYLOAD_SIZE)
        contents = bytearray(make_uf2(uf2_image))
        struct.pack_into("<I", contents, 16, 248)
        candidate = self.root / "short-gapped-block.uf2"
        candidate.write_bytes(contents)

        with self.assertRaisesRegex(self.verifier.VerificationError, "payload"):
            self._verify(
                uf2=candidate,
                evidence=self._evidence_for(candidate),
                elf_binary=elf_binary,
            )

    def test_rejects_expanded_last_payload_even_when_extra_bytes_are_zero(self) -> None:
        contents = bytearray(self.good_uf2.read_bytes())
        final_block = len(contents) - UF2_BLOCK_SIZE
        struct.pack_into("<I", contents, final_block + 16, UF2_PAYLOAD_SIZE + 4)
        candidate = self.root / "expanded-last-payload.uf2"
        candidate.write_bytes(contents)

        with self.assertRaisesRegex(self.verifier.VerificationError, "payload"):
            self._verify(uf2=candidate, evidence=self._evidence_for(candidate))

    def test_rejects_noncanonical_family_flags_and_id(self) -> None:
        mutations = (
            ("missing-family-flag", 0x00000000, 0xE48BFF56, "flags"),
            ("wrong-family-id", 0x00002000, 0xE48BFF57, "family ID"),
            ("missing-family-id", 0x00002000, 0x00000000, "family ID"),
            ("unexpected-flag", 0x00006000, 0xE48BFF56, "flags"),
        )
        for name, flags, family_id, message in mutations:
            with self.subTest(name=name):
                contents = bytearray(self.good_uf2.read_bytes())
                struct.pack_into("<I", contents, 8, flags)
                struct.pack_into("<I", contents, 28, family_id)
                candidate = self.root / f"{name}.uf2"
                candidate.write_bytes(contents)
                with self.assertRaisesRegex(self.verifier.VerificationError, message):
                    self._verify(uf2=candidate, evidence=self._evidence_for(candidate))

    def test_rejects_uf2_with_bad_magic_or_payload_bounds(self) -> None:
        cases: list[tuple[str, bytearray, str]] = []
        bad_magic = bytearray(self.good_uf2.read_bytes())
        struct.pack_into("<I", bad_magic, 0, 0)
        cases.append(("magic", bad_magic, "magic"))
        oversized_payload = bytearray(self.good_uf2.read_bytes())
        struct.pack_into("<I", oversized_payload, 16, 477)
        cases.append(("payload", oversized_payload, "payload"))

        for name, contents, message in cases:
            with self.subTest(name=name):
                candidate = self.root / f"{name}.uf2"
                candidate.write_bytes(contents)
                with self.assertRaisesRegex(self.verifier.VerificationError, message):
                    self._verify(uf2=candidate, evidence=self._evidence_for(candidate))

    def test_rejects_uf2_target_outside_rp2040_flash(self) -> None:
        contents = bytearray(self.good_uf2.read_bytes())
        struct.pack_into("<I", contents, 12, UF2_FLASH_BASE - UF2_PAYLOAD_SIZE)
        candidate = self.root / "outside-flash.uf2"
        candidate.write_bytes(contents)
        with self.assertRaisesRegex(self.verifier.VerificationError, "flash range"):
            self._verify(uf2=candidate, evidence=self._evidence_for(candidate))

    def test_rejects_out_of_order_or_duplicate_uf2_blocks(self) -> None:
        original = self.good_uf2.read_bytes()
        out_of_order = original[UF2_BLOCK_SIZE:] + original[:UF2_BLOCK_SIZE]
        duplicate_target = bytearray(original)
        struct.pack_into("<I", duplicate_target, UF2_BLOCK_SIZE + 12, UF2_FLASH_BASE)
        duplicate_number = bytearray(original)
        struct.pack_into("<I", duplicate_number, UF2_BLOCK_SIZE + 20, 0)

        for name, contents, message in (
            ("out-of-order", out_of_order, "order"),
            ("duplicate-target", duplicate_target, "target"),
            ("duplicate-number", duplicate_number, "block number"),
        ):
            with self.subTest(name=name):
                candidate = self.root / f"{name}.uf2"
                candidate.write_bytes(contents)
                with self.assertRaisesRegex(self.verifier.VerificationError, message):
                    self._verify(uf2=candidate, evidence=self._evidence_for(candidate))

    def test_rejects_wrong_report_id(self) -> None:
        evidence = {**self.good_evidence, "report_id": 0}
        with self.assertRaisesRegex(self.verifier.VerificationError, "report ID"):
            self.verifier.verify(self.good_uf2, self.good_elf, evidence)

    def test_rejects_missing_oai_symbol(self) -> None:
        with self.assertRaisesRegex(self.verifier.VerificationError, "codex_oai_notify"):
            self.verifier.verify_symbols({"raw_hid_receive", "codex_led_render"})

    def test_rejects_required_symbol_that_is_only_undefined(self) -> None:
        symbols = {
            "raw_hid_receive": "T",
            "codex_oai_notify": "U",
            "codex_led_render": "T",
            "encoder_update_user": "T",
        }
        with self.assertRaisesRegex(self.verifier.VerificationError, "not defined code/data"):
            self.verifier.verify_symbols(symbols)

    def test_rejects_lowercase_undefined_weak_symbol_types(self) -> None:
        for weak_type in ("w", "v"):
            with self.subTest(weak_type=weak_type):
                symbols = {
                    "raw_hid_receive": "T",
                    "codex_oai_notify": weak_type,
                    "codex_led_render": "T",
                    "encoder_update_user": "T",
                }
                with self.assertRaisesRegex(
                    self.verifier.VerificationError, "not defined code/data"
                ):
                    self.verifier.verify_symbols(symbols)

    def test_nm_parser_does_not_turn_undefined_symbol_into_proof(self) -> None:
        output = (
            "00000000 T raw_hid_receive\n"
            "         U codex_oai_notify\n"
            "00000000 T codex_led_render\n"
            "00000000 T encoder_update_user\n"
        )
        with mock.patch.object(self.verifier.subprocess, "check_output", return_value=output):
            symbols = self.verifier.elf_symbols(self.good_elf)
        self.assertEqual(symbols["codex_oai_notify"], "U")
        with self.assertRaisesRegex(self.verifier.VerificationError, "codex_oai_notify"):
            self.verifier.verify_symbols(symbols)

    def test_nm_parser_keeps_defined_local_symbols_from_lto_builds(self) -> None:
        globals_only = (
            "10000000 T raw_hid_receive\n"
            "10000020 T codex_led_render\n"
            "10000040 T encoder_update_user\n"
        )

        def fake_nm(command):
            defined = globals_only + "10000060 t codex_oai_notify\n"
            if "--defined-only" in command:
                return defined
            return defined + "         w undefined_weak\n"

        with mock.patch.object(self.verifier, "_run_text", side_effect=fake_nm):
            symbols = self.verifier.elf_symbols(self.good_elf)
        self.assertIn("codex_oai_notify", symbols)
        self.assertNotIn("undefined_weak", symbols)
        self.verifier.verify_symbols(symbols)

    def test_rejects_evidence_from_different_uf2_hash_or_size(self) -> None:
        wrong_hash = {**self.good_evidence, "uf2_sha256": "0" * 64}
        with self.assertRaisesRegex(self.verifier.VerificationError, "SHA-256"):
            self.verifier.verify(self.good_uf2, self.good_elf, wrong_hash)
        wrong_size = {**self.good_evidence, "uf2_size_bytes": self.good_uf2.stat().st_size + 1}
        with self.assertRaisesRegex(self.verifier.VerificationError, "byte size"):
            self.verifier.verify(self.good_uf2, self.good_elf, wrong_size)

    def test_rejects_symlink_inputs(self) -> None:
        linked_uf2 = self.root / "linked.uf2"
        linked_uf2.symlink_to(self.good_uf2)
        with self.assertRaisesRegex(self.verifier.VerificationError, "regular file"):
            self.verifier.verify(linked_uf2, self.good_elf, self.good_evidence)

    def test_writes_manifest_atomically_only_in_evidence_directory(self) -> None:
        evidence_dir = self.root / "firmware" / "evidence"
        evidence_dir.mkdir(parents=True)
        output = evidence_dir / "codex-oai-manifest.json"
        result = self._verify()
        self.verifier.write_manifest(output, result, evidence_root=evidence_dir)
        self.assertEqual(json.loads(output.read_text(encoding="utf-8")), result)
        self.assertFalse(any(path.name.startswith(".codex-oai-manifest.json.") for path in evidence_dir.iterdir()))
        with self.assertRaisesRegex(self.verifier.VerificationError, "firmware/evidence"):
            self.verifier.write_manifest(self.root / "outside.json", result, evidence_root=evidence_dir)

    def test_rejects_dotdot_output_without_creating_an_outside_file(self) -> None:
        evidence_dir = self.root / "firmware" / "evidence"
        evidence_dir.mkdir(parents=True)
        escaped = evidence_dir / ".." / "escaped.json"
        with self.assertRaisesRegex(self.verifier.VerificationError, "path traversal"):
            self.verifier.write_manifest(escaped, {"status": "pass"}, evidence_root=evidence_dir)
        self.assertFalse((self.root / "firmware" / "escaped.json").exists())

    def test_static_contract_has_no_device_or_volume_access(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        for forbidden in ("hidapi", "pyusb", "/Volumes/", "BOOTSEL", "qmk flash"):
            self.assertNotIn(forbidden, source)
        self.assertNotIn("import hid", source)


if __name__ == "__main__":
    unittest.main()
