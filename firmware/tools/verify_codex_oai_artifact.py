#!/usr/bin/env python3
"""Verify generated AgentPad13 Direct-OAI or Vial-OAI firmware offline.

This tool accepts only regular local files, invokes the ARM inspection tools,
and writes a reproducible JSON manifest beneath ``firmware/evidence``.  It has
no USB, volume-discovery, or device-write code.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping, NamedTuple, Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "firmware" / "evidence"


class HIDInterfaceProfile(NamedTuple):
    """One raw HID interface in descriptor and report-descriptor terms."""

    role: str
    usage: str
    report_id: int | None
    report_bytes: int
    interface_number: int = 1
    in_endpoint_address: int | None = None
    out_endpoint_address: int | None = None


class HIDVendorApplicationCollection(NamedTuple):
    """One complete vendor-defined HID Application collection in an ELF image."""

    offset: int
    report: bytes


class ArtifactProfile:
    """Verification expectations for one published OAI transport."""

    def __init__(
        self,
        *,
        target: str,
        vid_pid: str,
        usage: str,
        report_id: int | None,
        report_bytes: int,
        required_symbols: frozenset[str],
        required_evidence: tuple[str, ...] = (),
        default_k00: int | None = None,
        interfaces: tuple[HIDInterfaceProfile, ...] | None = None,
        keyboard_in_endpoint_address: int | None = None,
        manufacturer: str | None = None,
        product: str | None = None,
    ) -> None:
        self.target = target
        self.vid_pid = vid_pid
        self.usage = usage
        self.report_id = report_id
        self.report_bytes = report_bytes
        self.required_symbols = required_symbols
        self.required_evidence = required_evidence
        self.default_k00 = default_k00
        self.keyboard_in_endpoint_address = keyboard_in_endpoint_address
        self.manufacturer = manufacturer
        self.product = product
        self.interfaces = interfaces or (
            HIDInterfaceProfile(
                role="oai" if usage == "ff00:0061" else "vial",
                usage=usage,
                report_id=report_id,
                report_bytes=report_bytes,
                interface_number=1,
            ),
        )
        # Explicit alias for callers that describe these as raw interfaces.
        self.raw_interfaces = self.interfaces


DIRECT_PROFILE = ArtifactProfile(
    target="loudest_micro:codex_oai",
    vid_pid="303a:8360",
    usage="ff00:0061",
    report_id=6,
    report_bytes=64,
    required_symbols=frozenset(
        {"raw_hid_receive", "codex_oai_notify", "codex_led_render", "encoder_update_user"}
    ),
)
VIAL_PROFILE = ArtifactProfile(
    target="loudest_micro:vial_oai",
    vid_pid="feed:4c4d",
    usage="ff60:0061",
    report_id=None,
    report_bytes=32,
    required_symbols=frozenset(
        {"codex_oai_vial_command", "codex_oai_notify", "codex_led_render"}
    ),
    required_evidence=("vial_protocol_ack",),
    default_k00=0x7E02,
)
DUAL_PROFILE = ArtifactProfile(
    target="loudest_micro:vial_oai",
    vid_pid="303a:8360",
    usage="ff00:0061",
    report_id=6,
    report_bytes=64,
    required_symbols=frozenset(
        {"oai_raw_hid_receive", "codex_oai_notify", "codex_led_render", "encoder_update_user"}
    ),
    required_evidence=("vial_protocol_ack",),
    default_k00=None,
    interfaces=(
        HIDInterfaceProfile("vial", "ff60:0061", None, 32, 1, 0x81, 0x02),
        HIDInterfaceProfile("oai", "ff00:0061", 6, 64, 2, 0x83, 0x04),
    ),
    keyboard_in_endpoint_address=0x85,
    manufacturer="hirlu",
    product="Codex Micro Lab OAI LED",
)
PROFILES = {"direct": DIRECT_PROFILE, "vial": VIAL_PROFILE, "dual": DUAL_PROFILE}

# Backward-compatible names for existing direct-OAI consumers and tests.
TARGET = DIRECT_PROFILE.target
EXPECTED_VID_PID = DIRECT_PROFILE.vid_pid
EXPECTED_USAGE = DIRECT_PROFILE.usage
EXPECTED_REPORT_ID = DIRECT_PROFILE.report_id
EXPECTED_REPORT_BYTES = DIRECT_PROFILE.report_bytes
REQUIRED_SYMBOLS = DIRECT_PROFILE.required_symbols
REQUIRED_ACKS = ("rgbcfg_ack", "thstatus_ack", "device_status_ack")
DEFINED_SYMBOL_TYPES = frozenset("TtDdBbRrSsGgVW")
UF2_BLOCK_SIZE = 512
UF2_DATA_OFFSET = 32
UF2_DATA_LIMIT = 508
UF2_MAGIC_START0 = 0x0A324655
UF2_MAGIC_START1 = 0x9E5D5157
UF2_MAGIC_END = 0x0AB16F30
UF2_EXPECTED_FLAGS = 0x00002000
UF2_PAYLOAD_SIZE = 256
RP2040_FAMILY_ID = 0xE48BFF56
RP2040_FLASH_BASE = 0x10000000
RP2040_FLASH_LIMIT = 0x11000000


class VerificationError(RuntimeError):
    """The supplied artifact or emulator evidence does not meet the contract."""


def require_regular_file(path: Path, *, label: str) -> Path:
    """Return ``path`` only when it is an existing non-symlink regular file."""
    candidate = Path(path)
    if candidate.is_symlink() or not candidate.is_file():
        raise VerificationError(f"{label} must be an existing regular file: {candidate}")
    return candidate


def _run_text(command: Sequence[str]) -> str:
    try:
        return subprocess.check_output(list(command), text=True, stderr=subprocess.STDOUT)
    except FileNotFoundError as exc:
        raise VerificationError(f"required inspection tool is unavailable: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        raise VerificationError(
            f"inspection command failed ({exc.returncode}): {' '.join(command)}\n{exc.output}"
        ) from exc


def sha256_and_size(path: Path) -> tuple[str, int]:
    """Calculate the digest and byte size without following a symlink."""
    artifact = require_regular_file(path, label="UF2")
    digest = hashlib.sha256()
    size = 0
    with artifact.open("rb") as input_file:
        for block in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(block)
            size += len(block)
    return digest.hexdigest(), size


def file_sha256(path: Path, *, label: str) -> str:
    """Calculate a regular local file's SHA-256 digest."""
    source = require_regular_file(path, label=label)
    digest = hashlib.sha256()
    with source.open("rb") as input_file:
        for block in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def uf2_flash_image(path: Path) -> bytes:
    """Return flash bytes from canonical QMK RP2040 UF2 blocks."""
    source = require_regular_file(path, label="UF2")
    contents = source.read_bytes()
    if not contents or len(contents) % UF2_BLOCK_SIZE:
        raise VerificationError("UF2 size must be a non-zero multiple of 512 bytes")

    actual_block_count = len(contents) // UF2_BLOCK_SIZE
    image = bytearray()
    seen_numbers: set[int] = set()
    seen_targets: set[int] = set()

    for index in range(actual_block_count):
        block = contents[index * UF2_BLOCK_SIZE : (index + 1) * UF2_BLOCK_SIZE]
        (
            magic0,
            magic1,
            flags,
            target,
            payload_size,
            block_number,
            declared_block_count,
            family_id,
        ) = struct.unpack_from("<IIIIIIII", block, 0)
        (end_magic,) = struct.unpack_from("<I", block, UF2_DATA_LIMIT)

        if (magic0, magic1, end_magic) != (
            UF2_MAGIC_START0,
            UF2_MAGIC_START1,
            UF2_MAGIC_END,
        ):
            raise VerificationError(f"UF2 block {index} has invalid magic")
        if flags != UF2_EXPECTED_FLAGS:
            raise VerificationError(
                f"UF2 block {index} flags must be 0x{UF2_EXPECTED_FLAGS:08x}; "
                f"found 0x{flags:08x}"
            )
        if family_id != RP2040_FAMILY_ID:
            raise VerificationError(
                f"UF2 block {index} family ID must be 0x{RP2040_FAMILY_ID:08x}; "
                f"found 0x{family_id:08x}"
            )
        if payload_size != UF2_PAYLOAD_SIZE:
            raise VerificationError(
                f"UF2 block {index} payload must be {UF2_PAYLOAD_SIZE} bytes; "
                f"found {payload_size}"
            )
        if declared_block_count != actual_block_count:
            raise VerificationError(
                f"UF2 block {index} declares {declared_block_count} blocks; found {actual_block_count}"
            )
        if block_number in seen_numbers:
            raise VerificationError(f"duplicate UF2 block number: {block_number}")
        seen_numbers.add(block_number)
        if block_number != index:
            raise VerificationError(
                f"UF2 block order is invalid: position {index} contains block {block_number}"
            )
        if target in seen_targets:
            raise VerificationError(f"duplicate UF2 target address: 0x{target:08x}")
        seen_targets.add(target)
        target_end = target + UF2_PAYLOAD_SIZE
        if target < RP2040_FLASH_BASE or target_end > RP2040_FLASH_LIMIT:
            raise VerificationError(
                f"UF2 block {index} target is outside RP2040 flash range: "
                f"0x{target:08x}..0x{target_end:08x}"
            )
        expected_target = RP2040_FLASH_BASE + block_number * UF2_PAYLOAD_SIZE
        if target != expected_target:
            raise VerificationError(
                f"UF2 block {index} target must be contiguous at 0x{expected_target:08x}; "
                f"found 0x{target:08x}"
            )
        image.extend(block[UF2_DATA_OFFSET : UF2_DATA_OFFSET + UF2_PAYLOAD_SIZE])

    return bytes(image)


def elf_binary(path: Path) -> bytes:
    """Convert a regular local ELF to its loadable binary image with objcopy."""
    elf = require_regular_file(path, label="ELF")
    with tempfile.TemporaryDirectory(prefix="agentpad13_elf_binary_") as temporary_dir:
        output = Path(temporary_dir) / "firmware.bin"
        command = ("arm-none-eabi-objcopy", "-O", "binary", str(elf), str(output))
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
        except FileNotFoundError as exc:
            raise VerificationError("required inspection tool is unavailable: arm-none-eabi-objcopy") from exc
        except subprocess.CalledProcessError as exc:
            raise VerificationError(
                f"inspection command failed ({exc.returncode}): {' '.join(command)}\n"
                f"{exc.stdout}{exc.stderr}"
            ) from exc
        binary = require_regular_file(output, label="ELF-derived binary").read_bytes()
    if not binary:
        raise VerificationError("ELF-derived binary is empty")
    return binary


def verify_elf_uf2_equivalence(uf2: Path, elf: Path) -> dict[str, Any]:
    """Require UF2 flash bytes to equal the ELF binary plus zero-only UF2 padding."""
    uf2_image = uf2_flash_image(uf2)
    binary = elf_binary(elf)
    expected_padding_size = (-len(binary)) % UF2_PAYLOAD_SIZE
    expected_image_size = len(binary) + expected_padding_size
    if len(uf2_image) != expected_image_size:
        raise VerificationError(
            "UF2 flash image length does not match canonical ELF padding: "
            f"expected {expected_image_size}; found {len(uf2_image)}"
        )
    if uf2_image[: len(binary)] != binary:
        raise VerificationError("ELF binary does not match UF2 flash image")
    padding = uf2_image[len(binary) :]
    if len(padding) != expected_padding_size:
        raise VerificationError("UF2 trailing zero padding length is not canonical")
    if any(padding):
        raise VerificationError("UF2 contains non-zero bytes beyond the ELF binary")
    return {
        "status": "pass",
        "flash_base": f"0x{RP2040_FLASH_BASE:08x}",
        "elf_binary_size_bytes": len(binary),
        "uf2_flash_size_bytes": len(uf2_image),
        "trailing_zero_padding_bytes": len(padding),
    }


def elf_size(path: Path) -> dict[str, int]:
    """Inspect ELF text/data/bss through the pinned ARM-size compatible tool."""
    elf = require_regular_file(path, label="ELF")
    output = _run_text(("arm-none-eabi-size", "-B", str(elf)))
    rows = [row.split() for row in output.splitlines() if row.split()]
    for row in reversed(rows):
        if len(row) >= 4 and all(value.isdigit() for value in row[:4]):
            return {"text": int(row[0]), "data": int(row[1]), "bss": int(row[2])}
    raise VerificationError("arm-none-eabi-size output did not contain text/data/bss metrics")


def elf_symbols(path: Path) -> dict[str, str]:
    """Return defined and undefined ELF symbol names with their nm type letters."""
    elf = require_regular_file(path, label="ELF")
    output = _run_text(("arm-none-eabi-nm", "--defined-only", str(elf)))
    symbols: dict[str, str] = {}
    for line in output.splitlines():
        fields = line.split()
        if len(fields) >= 2:
            symbols[fields[-1]] = fields[-2]
    return symbols


def verify_symbols(
    symbols: Mapping[str, str] | Iterable[str], *, required_symbols: Iterable[str] = REQUIRED_SYMBOLS
) -> None:
    """Require profile-owned defined code/data symbols, never undefined imports."""
    available = dict(symbols) if isinstance(symbols, Mapping) else {name: "T" for name in symbols}
    for required in sorted(required_symbols):
        if required not in available:
            raise VerificationError(f"required ELF symbol missing: {required}")
        if available[required] not in DEFINED_SYMBOL_TYPES:
            raise VerificationError(
                f"required ELF symbol is not defined code/data: {required} ({available[required]})"
            )


def _descriptor_stream(binary: bytes, offset: int, total_length: int) -> list[bytes]:
    """Parse one USB descriptor stream without reading past its declared length."""
    end = offset + total_length
    if offset < 0 or end > len(binary) or total_length < 9:
        raise VerificationError("USB descriptor contract has an invalid configuration length")
    descriptors: list[bytes] = []
    cursor = offset
    while cursor < end:
        if cursor + 2 > end:
            raise VerificationError("USB descriptor contract has a truncated descriptor header")
        length = binary[cursor]
        if length < 2 or cursor + length > end:
            raise VerificationError("USB descriptor contract has an invalid descriptor length")
        descriptors.append(binary[cursor : cursor + length])
        cursor += length
    if cursor != end or not descriptors or descriptors[0][1] != 2:
        raise VerificationError("USB descriptor contract does not contain a configuration descriptor")
    return descriptors


def _configuration_descriptors(binary: bytes) -> list[list[bytes]]:
    """Find valid configuration descriptor streams in an ELF-derived image."""
    configurations: list[list[bytes]] = []
    for offset in range(max(0, len(binary) - 8)):
        if binary[offset] != 9 or binary[offset + 1] != 2:
            continue
        total_length = binary[offset + 2] | (binary[offset + 3] << 8)
        try:
            configurations.append(_descriptor_stream(binary, offset, total_length))
        except VerificationError:
            continue
    return configurations


def _report_items(
    report: bytes,
) -> tuple[
    list[int],
    list[int],
    list[int],
    list[tuple[int | None, int | None]],
    list[tuple[int | None, int | None]],
]:
    """Return usages, IDs, and the report-size/count pair for every main item."""
    usage_pages: list[int] = []
    usages: list[int] = []
    report_ids: list[int] = []
    input_fields: list[tuple[int | None, int | None]] = []
    output_fields: list[tuple[int | None, int | None]] = []
    report_count: int | None = None
    report_size: int | None = None
    collection_depth = 0
    cursor = 0
    while cursor < len(report):
        prefix = report[cursor]
        cursor += 1
        if prefix == 0xFE:
            if cursor + 2 > len(report):
                raise ValueError("truncated long HID item")
            length = report[cursor]
            cursor += 2
            if cursor + length > len(report):
                raise ValueError("truncated long HID item payload")
            cursor += length
            continue
        size_code = prefix & 0x03
        size = 4 if size_code == 3 else size_code
        if cursor + size > len(report):
            raise ValueError("truncated HID item")
        value = int.from_bytes(report[cursor : cursor + size], "little")
        cursor += size
        item_type = (prefix >> 2) & 0x03
        item_tag = (prefix >> 4) & 0x0F
        if item_type == 1 and item_tag == 0:
            usage_pages.append(value)
        elif item_type == 2 and item_tag == 0:
            usages.append(value)
        elif item_type == 1 and item_tag == 8:
            report_ids.append(value)
        elif item_type == 1 and item_tag == 9:
            report_count = value
        elif item_type == 1 and item_tag == 7:
            report_size = value
        elif item_type == 0 and item_tag == 10:
            collection_depth += 1
        elif item_type == 0 and item_tag == 12:
            collection_depth -= 1
            if collection_depth < 0:
                raise ValueError("unbalanced HID collection")
        elif item_type == 0 and item_tag == 8:
            input_fields.append((report_size, report_count))
        elif item_type == 0 and item_tag == 9:
            output_fields.append((report_size, report_count))
    if collection_depth:
        raise ValueError("unbalanced HID collection")
    return usage_pages, usages, report_ids, input_fields, output_fields


def _hid_item(data: bytes, cursor: int) -> tuple[int | None, int | None, int, int]:
    """Parse one HID item and return its type, tag, unsigned value, and end."""
    if cursor >= len(data):
        raise ValueError("truncated HID item")
    prefix = data[cursor]
    cursor += 1
    if prefix == 0xFE:
        if cursor + 2 > len(data):
            raise ValueError("truncated long HID item")
        length = data[cursor]
        cursor += 2
        if cursor + length > len(data):
            raise ValueError("truncated long HID item payload")
        return None, None, 0, cursor + length
    size_code = prefix & 0x03
    size = 4 if size_code == 3 else size_code
    if cursor + size > len(data):
        raise ValueError("truncated HID item")
    value = int.from_bytes(data[cursor : cursor + size], "little")
    return (prefix >> 2) & 0x03, (prefix >> 4) & 0x0F, value, cursor + size


def _vendor_application_collections(binary: bytes) -> list[HIDVendorApplicationCollection]:
    """Find every complete vendor-defined HID Application collection in ``binary``."""
    collections: list[HIDVendorApplicationCollection] = []
    for offset in range(len(binary)):
        try:
            item_type, item_tag, usage_page, cursor = _hid_item(binary, offset)
        except ValueError:
            continue
        if item_type != 1 or item_tag != 0 or not 0xFF00 <= usage_page <= 0xFFFF:
            continue
        try:
            item_type, item_tag, _usage, cursor = _hid_item(binary, cursor)
            if item_type != 2 or item_tag != 0:
                continue
            item_type, item_tag, collection_type, cursor = _hid_item(binary, cursor)
            if item_type != 0 or item_tag != 10 or collection_type != 1:
                continue
            depth = 1
            while depth:
                item_type, item_tag, _value, cursor = _hid_item(binary, cursor)
                if item_type == 0 and item_tag == 10:
                    depth += 1
                elif item_type == 0 and item_tag == 12:
                    depth -= 1
                    if depth < 0:
                        raise ValueError("unbalanced HID collection")
        except ValueError as exc:
            raise VerificationError(
                "USB descriptor contract has a malformed vendor HID Application collection"
            ) from exc
        report = binary[offset:cursor]
        try:
            _report_items(report)
        except ValueError as exc:
            raise VerificationError(
                "USB descriptor contract has a malformed vendor HID Application collection"
            ) from exc
        collections.append(HIDVendorApplicationCollection(offset, report))
    return collections


def _application_collection_root(report: bytes) -> tuple[int, int]:
    """Return the Usage Page and Usage that identify an Application collection."""
    item_type, item_tag, usage_page, cursor = _hid_item(report, 0)
    if item_type != 1 or item_tag != 0 or not 0xFF00 <= usage_page <= 0xFFFF:
        raise ValueError("vendor Application collection has no vendor Usage Page")
    item_type, item_tag, usage, cursor = _hid_item(report, cursor)
    if item_type != 2 or item_tag != 0:
        raise ValueError("vendor Application collection has no Usage")
    item_type, item_tag, collection_type, _cursor = _hid_item(report, cursor)
    if item_type != 0 or item_tag != 10 or collection_type != 1:
        raise ValueError("vendor collection is not an Application collection")
    return usage_page, usage


def _report_matches(report: bytes, interface: HIDInterfaceProfile) -> bool:
    try:
        usage_page_text, usage_id_text = interface.usage.split(":", 1)
        usage_page = int(usage_page_text, 16)
        usage_id = int(usage_id_text, 16)
        root_page, root_usage = _application_collection_root(report)
        pages, usages, report_ids, input_fields, output_fields = _report_items(report)
    except (ValueError, UnicodeError):
        return False
    expected_count = interface.report_bytes - (1 if interface.report_id is not None else 0)
    if (
        expected_count < 1
        or root_page != usage_page
        or root_usage != usage_id
        or not report.endswith(bytes((0xC0,)))
        or pages != [usage_page]
        or usages.count(usage_id) < 1
    ):
        return False
    if interface.report_id is None:
        if report_ids:
            return False
    elif report_ids != [interface.report_id]:
        return False
    expected_fields = [(8, expected_count)]
    return input_fields == expected_fields and output_fields == expected_fields


def _interface_records(descriptors: Sequence[bytes]) -> list[tuple[bytes, list[bytes]]]:
    """Group each complete interface descriptor with its subordinate descriptors."""
    interface_indexes: list[int] = []
    for index, descriptor in enumerate(descriptors):
        if descriptor[1] == 4:
            if len(descriptor) != 9:
                raise VerificationError("USB descriptor contract has a malformed interface descriptor")
            interface_indexes.append(index)
    records: list[tuple[bytes, list[bytes]]] = []
    for record_index, index in enumerate(interface_indexes):
        descriptor = descriptors[index]
        end = (
            interface_indexes[record_index + 1]
            if record_index + 1 < len(interface_indexes)
            else len(descriptors)
        )
        records.append((descriptor, list(descriptors[index + 1 : end])))
    return records


def _validated_hid_report_length(hid_descriptor: bytes, *, require_report: bool) -> int:
    """Validate one HID descriptor and return its only report descriptor length."""
    if (
        len(hid_descriptor) != 9
        or hid_descriptor[0] != 9
        or hid_descriptor[1] != 0x21
        or hid_descriptor[5] != 1
        or hid_descriptor[6] != 0x22
    ):
        raise VerificationError("USB descriptor contract has a malformed HID report descriptor declaration")
    report_length = hid_descriptor[7] | (hid_descriptor[8] << 8)
    if require_report and report_length < 1:
        raise VerificationError("USB descriptor contract has an empty raw HID report descriptor")
    return report_length


def _validated_interface_records(
    descriptors: Sequence[bytes], profile: ArtifactProfile
) -> list[tuple[bytes, list[bytes]]]:
    """Require exactly one boot keyboard plus the profile's raw interface count."""
    configuration = descriptors[0]
    expected_count = 1 + len(profile.interfaces)
    expected_numbers = [0, *(interface.interface_number for interface in profile.interfaces)]
    if len(configuration) != 9 or configuration[0] != 9 or configuration[1] != 2:
        raise VerificationError("USB descriptor contract has a malformed configuration descriptor")
    records = _interface_records(descriptors)
    numbers = [interface[2] for interface, _following in records]
    if (
        configuration[4] != expected_count
        or len(records) != expected_count
        or numbers != expected_numbers
        or any(interface[3] != 0 for interface, _following in records)
    ):
        raise VerificationError("USB descriptor contract has the wrong interface cardinality")
    return records


def verify_usb_descriptor_contract(elf: Path, profile: ArtifactProfile) -> dict[str, Any]:
    """Verify the composite USB/HID shape and report collection inventory in ELF.

    HID configuration descriptors carry report lengths, not report-descriptor
    pointers. This static check therefore cannot prove which report descriptor
    a runtime GET_DESCRIPTOR request selects by ``wIndex``; that binding is a
    dynamic interface-index check.
    """
    binary = elf_binary(elf)
    configurations = _configuration_descriptors(binary)
    if not configurations:
        raise VerificationError("USB descriptor contract has no valid configuration descriptor")
    vendor_collections = _vendor_application_collections(binary)

    for descriptors in configurations:
        try:
            records = _validated_interface_records(descriptors, profile)
        except VerificationError:
            continue
        keyboard, keyboard_following = records[0]
        if keyboard[5:8] != bytes((3, 1, 1)):
            continue
        keyboard_hid_descriptors = [item for item in keyboard_following if item[1] == 0x21]
        if len(keyboard_hid_descriptors) != 1:
            continue
        try:
            _validated_hid_report_length(keyboard_hid_descriptors[0], require_report=False)
        except VerificationError:
            continue

        endpoint_addresses: set[int] = set()
        keyboard_endpoints = [item for item in keyboard_following if item[1] == 5 and len(item) >= 7]
        if len(profile.interfaces) > 1:
            if keyboard[4] != 1 or len(keyboard_endpoints) != 1:
                continue
            keyboard_endpoint = keyboard_endpoints[0]
            if not (keyboard_endpoint[2] & 0x80) or (keyboard_endpoint[2] == 0):
                continue
            if profile.keyboard_in_endpoint_address is not None and (
                keyboard_endpoint[2] != profile.keyboard_in_endpoint_address
            ):
                continue
            endpoint_addresses.add(keyboard_endpoint[2])

        raw_records = records[1:]
        if len(raw_records) != len(profile.interfaces):
            continue
        matched: list[tuple[str, int, int]] = []
        matched_offsets: set[int] = set()
        try:
            for expected, (interface_descriptor, following) in zip(profile.interfaces, raw_records):
                if (
                    interface_descriptor[2] != expected.interface_number
                    or interface_descriptor[5:8] != bytes((3, 0, 0))
                ):
                    raise VerificationError(
                        f"USB descriptor contract has a malformed {expected.role} raw interface"
                    )
                hid_descriptors = [item for item in following if item[1] == 0x21]
                if len(hid_descriptors) != 1:
                    raise VerificationError(
                        f"USB descriptor contract has no unique {expected.role} HID descriptor"
                    )
                report_length = _validated_hid_report_length(hid_descriptors[0], require_report=True)
                matching_collections = [
                    collection
                    for collection in vendor_collections
                    if len(collection.report) == report_length
                    and _report_matches(collection.report, expected)
                ]
                if (
                    len(matching_collections) != 1
                    or matching_collections[0].offset in matched_offsets
                ):
                    raise VerificationError(
                        f"USB descriptor contract has no unique {expected.role} report descriptor"
                    )
                matched_offsets.add(matching_collections[0].offset)
                endpoints = [item for item in following if item[1] == 5 and len(item) >= 7]
                if interface_descriptor[4] != 2 or len(endpoints) != 2:
                    raise VerificationError(
                        f"USB descriptor contract missing {expected.role} raw interface endpoint pair"
                    )
                directions = {bool(endpoint[2] & 0x80) for endpoint in endpoints}
                sizes = {endpoint[4] | (endpoint[5] << 8) for endpoint in endpoints}
                if directions != {False, True} or sizes != {expected.report_bytes}:
                    raise VerificationError(
                        f"USB descriptor contract has wrong {expected.role} raw interface endpoint pair"
                    )
                addresses = {endpoint[2] for endpoint in endpoints}
                if len(addresses) != len(endpoints):
                    raise VerificationError(
                        f"USB descriptor contract has duplicate {expected.role} endpoint addresses"
                    )
                expected_addresses = {
                    expected.in_endpoint_address,
                    expected.out_endpoint_address,
                }
                if None not in expected_addresses and addresses != expected_addresses:
                    raise VerificationError(
                        f"USB descriptor contract has wrong {expected.role} endpoint addresses"
                    )
                if endpoint_addresses.intersection(addresses):
                    raise VerificationError(
                        f"USB descriptor contract has globally colliding {expected.role} endpoint addresses"
                    )
                endpoint_addresses.update(addresses)
                matched.append((expected.role, interface_descriptor[2], expected.report_bytes))
        except VerificationError:
            continue
        if (
            len(matched) == len(profile.interfaces)
            and len(vendor_collections) == len(matched_offsets)
        ):
            return {
                "status": "pass",
                "configuration_total_length": sum(len(item) for item in descriptors),
                "keyboard_interface": keyboard[2],
                "interfaces": [
                    {"role": role, "interface": number, "endpoint_bytes": size}
                    for role, number, size in matched
                ],
                "endpoint_addresses": sorted(endpoint_addresses),
            }
    raise VerificationError("USB descriptor contract is missing the required composite HID interfaces")


def verify_device_identity(binary: bytes, profile: ArtifactProfile) -> dict[str, str]:
    """Require the expected compiled USB identity and its device-descriptor indices.

    A naked UTF-16 substring is not sufficient: it could be an unrelated log
    string or a stale descriptor.  The compiled image must contain one device
    descriptor for the profile VID/PID, with the locked manufacturer/product
    indices, and exactly one matching descriptor for each selected string.
    """
    if profile.manufacturer is None and profile.product is None:
        return {}

    try:
        expected_vid, expected_pid = (int(part, 16) for part in profile.vid_pid.split(":", 1))
    except ValueError as exc:
        raise VerificationError(f"invalid profile VID:PID: {profile.vid_pid}") from exc

    device_descriptors = []
    for offset in range(max(0, len(binary) - 17)):
        descriptor = binary[offset : offset + 18]
        if len(descriptor) != 18 or descriptor[:2] != bytes((18, 1)):
            continue
        vid = descriptor[8] | (descriptor[9] << 8)
        pid = descriptor[10] | (descriptor[11] << 8)
        if vid == expected_vid and pid == expected_pid:
            device_descriptors.append((offset, descriptor))
    if len(device_descriptors) != 1:
        raise VerificationError(
            f"compiled USB device descriptor must contain one {profile.vid_pid} identity; "
            f"found {len(device_descriptors)}"
        )
    _device_offset, device = device_descriptors[0]
    manufacturer_index = device[14]
    product_index = device[15]
    if profile.manufacturer is not None and manufacturer_index != 1:
        raise VerificationError(
            f"compiled USB manufacturer string index must be 1; found {manufacturer_index}"
        )
    if profile.product is not None and product_index != 2:
        raise VerificationError(
            f"compiled USB product string index must be 2; found {product_index}"
        )

    string_values: dict[str, int] = {}
    for offset in range(max(0, len(binary) - 1)):
        length = binary[offset]
        if length < 2 or length % 2 or offset + length > len(binary):
            continue
        if binary[offset + 1] != 3:
            continue
        payload = binary[offset + 2 : offset + length]
        try:
            value = payload.decode("utf-16le")
        except UnicodeDecodeError:
            continue
        if value:
            string_values[value] = string_values.get(value, 0) + 1

    expected = {
        "manufacturer": profile.manufacturer,
        "product": profile.product,
    }
    identity: dict[str, str] = {}
    for field, value in expected.items():
        if value is None:
            continue
        if string_values.get(value) != 1:
            raise VerificationError(
                f"compiled USB {field} string must have one exact descriptor {value!r}; "
                f"found {string_values.get(value, 0)}"
            )
        identity[field] = value
    return identity


def verify_evidence(
    evidence: Mapping[str, Any], *, artifact_sha256: str, artifact_size: int,
    profile: ArtifactProfile = DIRECT_PROFILE,
) -> None:
    """Require the exact enumeration, descriptor, protocol, key and LED proof."""
    if evidence.get("vid_pid") != profile.vid_pid:
        raise VerificationError(f"unexpected VID:PID; expected {profile.vid_pid}")
    if len(profile.interfaces) == 1:
        interface = profile.interfaces[0]
        if evidence.get("usage") != interface.usage:
            raise VerificationError(f"unexpected Raw HID usage; expected {interface.usage}")
        if evidence.get("report_id") != interface.report_id:
            raise VerificationError(f"unexpected report ID; expected {interface.report_id}")
        if evidence.get("report_bytes") != interface.report_bytes:
            raise VerificationError(f"unexpected report byte count; expected {interface.report_bytes}")
    else:
        for interface in profile.interfaces:
            observed = evidence.get(f"{interface.role}_interface")
            if not isinstance(observed, Mapping):
                raise VerificationError(f"emulator evidence did not prove {interface.role}_interface")
            for field in ("usage", "report_id", "report_bytes"):
                if observed.get(field) != getattr(interface, field):
                    label = {
                        "report_bytes": "report byte count",
                        "report_id": "report ID",
                    }.get(field, field.replace("_", " "))
                    raise VerificationError(
                        f"unexpected {interface.role} interface {label}; "
                        f"expected {getattr(interface, field)}"
                    )
    required_fields = [
        "usb_enumerated", "keyboard_hid_enumerated", "oai_hid_enumerated",
        *REQUIRED_ACKS, "ws2812_activity", *profile.required_evidence,
    ]
    if len(profile.interfaces) > 1:
        required_fields.append("report_descriptors_verified")
    else:
        required_fields.append("descriptor_verified")
    for field in required_fields:
        if evidence.get(field) is not True:
            raise VerificationError(f"emulator evidence did not prove {field}")
    if len(profile.interfaces) > 1:
        recovery_used = evidence.get("config_descriptor_recovery_used") is True
        expected_identity = {
            field: value
            for field, value in (
                ("manufacturer", profile.manufacturer), ("product", profile.product)
            )
            if value is not None
        }
        if evidence.get("device_identity") != expected_identity:
            raise VerificationError("emulator evidence has an unexpected compiled device identity")
        if recovery_used:
            if evidence.get("configuration_descriptor_verified") is not False:
                raise VerificationError(
                    "recovery evidence cannot claim configuration_descriptor_verified"
                )
            if evidence.get("descriptor_verified") is not False:
                raise VerificationError("recovery evidence cannot claim descriptor_verified")
        else:
            for field in ("configuration_descriptor_verified", "descriptor_verified"):
                if evidence.get(field) is not True:
                    raise VerificationError(f"emulator evidence did not prove {field}")
    if evidence.get("uf2_sha256") != artifact_sha256:
        raise VerificationError("emulator evidence SHA-256 does not match the UF2")
    if evidence.get("uf2_size_bytes") != artifact_size:
        raise VerificationError("emulator evidence byte size does not match the UF2")
    if not isinstance(evidence.get("task_status_fragment_count"), int) or evidence["task_status_fragment_count"] < 2:
        raise VerificationError("emulator evidence did not prove fragmented task status")
    task_status = evidence.get("task_status")
    if not isinstance(task_status, Mapping) or not task_status.get("e") or not task_status.get("b"):
        raise VerificationError("emulator evidence did not prove visible task-driven RGB")
    if evidence.get("key_event") != {"k": "AG00", "act": 1}:
        raise VerificationError("emulator evidence did not prove the AG00 key event")
    if profile.default_k00 is not None and evidence.get("vial_default_k00") != profile.default_k00:
        raise VerificationError(
            f"emulator evidence did not prove default K00 keycode 0x{profile.default_k00:04x}"
        )
    if len(profile.interfaces) > 1 and evidence.get("channels_isolated") is not True:
        raise VerificationError("emulator evidence did not prove channels_isolated")


def verify(
    uf2: Path, elf: Path, evidence: Mapping[str, Any], *, profile: str = "direct"
) -> dict[str, Any]:
    """Return a JSON-safe manifest payload after all offline checks pass."""
    try:
        selected_profile = PROFILES[profile]
    except KeyError as exc:
        raise VerificationError(f"unknown artifact profile: {profile}") from exc
    digest, size = sha256_and_size(uf2)
    verify_evidence(
        evidence, artifact_sha256=digest, artifact_size=size, profile=selected_profile
    )
    equivalence = verify_elf_uf2_equivalence(uf2, elf)
    usb_contract = verify_usb_descriptor_contract(elf, selected_profile)
    device_identity = verify_device_identity(elf_binary(elf), selected_profile)
    metrics = elf_size(elf)
    verify_symbols(elf_symbols(elf), required_symbols=selected_profile.required_symbols)
    manifest: dict[str, Any] = {
        "status": "pass",
        "target": selected_profile.target,
        "vid_pid": selected_profile.vid_pid,
        "sha256": digest,
        "size_bytes": size,
        "elf_sha256": file_sha256(elf, label="ELF"),
        "elf_size": metrics,
        "elf_uf2_equivalence": equivalence,
        "usb_descriptor_contract": usb_contract,
        "device_identity": device_identity,
        "required_symbols": sorted(selected_profile.required_symbols),
        "emulator_evidence": {
            "usb_enumerated": evidence["usb_enumerated"],
            "descriptor_verified": evidence["descriptor_verified"],
            "report_descriptors_verified": evidence.get("report_descriptors_verified"),
            "configuration_descriptor_verified": evidence.get("configuration_descriptor_verified"),
            "config_descriptor_recovery_used": evidence.get("config_descriptor_recovery_used"),
            "keyboard_hid_enumerated": evidence["keyboard_hid_enumerated"],
            "oai_hid_enumerated": evidence["oai_hid_enumerated"],
            "uf2_sha256": evidence["uf2_sha256"],
            "uf2_size_bytes": evidence["uf2_size_bytes"],
            "rgbcfg_ack": evidence["rgbcfg_ack"],
            "thstatus_ack": evidence["thstatus_ack"],
            "device_status_ack": evidence["device_status_ack"],
            "key_event": evidence["key_event"],
            "ws2812_activity": evidence["ws2812_activity"],
            "task_status_fragment_count": evidence["task_status_fragment_count"],
            **(
                {
                    "vial_protocol_ack": evidence["vial_protocol_ack"],
                    "vial_default_k00": evidence["vial_default_k00"],
                }
                if selected_profile.default_k00 is not None
                else {}
            ),
        },
    }
    if len(selected_profile.interfaces) == 1:
        manifest.update(
            {
                "usage": selected_profile.usage,
                "report_id": selected_profile.report_id,
                "report_bytes": selected_profile.report_bytes,
            }
        )
    else:
        manifest["interfaces"] = [
            {
                "role": interface.role,
                "usage": interface.usage,
                "report_id": interface.report_id,
                "report_bytes": interface.report_bytes,
            }
            for interface in selected_profile.interfaces
        ]
        manifest["emulator_evidence"].update(
            {
                "vial_interface": evidence["vial_interface"],
                "oai_interface": evidence["oai_interface"],
                "vial_protocol_ack": evidence["vial_protocol_ack"],
                "channels_isolated": evidence["channels_isolated"],
                "device_identity": evidence.get("device_identity"),
                "keyboard_report_behavior": evidence.get("keyboard_report_behavior"),
                "joystick_report_behavior": evidence.get("joystick_report_behavior"),
                "shared_keyboard_joystick_endpoint": evidence.get(
                    "shared_keyboard_joystick_endpoint"
                ),
            }
        )
    return manifest


def _safe_manifest_destination(output: Path, evidence_root: Path) -> Path:
    """Ensure a manifest stays lexically and physically below evidence_root."""
    raw_output = Path(output)
    if ".." in raw_output.parts:
        raise VerificationError("manifest output path traversal is not permitted")
    root = Path(evidence_root).absolute()
    candidate = raw_output.absolute()
    if root.is_symlink() or not root.is_dir():
        raise VerificationError(f"firmware/evidence directory is unavailable or unsafe: {root}")
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise VerificationError(f"manifest output must be under firmware/evidence: {candidate}") from exc
    if candidate.is_symlink() or (candidate.exists() and not candidate.is_file()):
        raise VerificationError(f"manifest output must be a regular file path: {candidate}")
    current = candidate.parent
    while current != root.parent:
        if current.is_symlink():
            raise VerificationError(f"manifest output traverses a symlink: {current}")
        current = current.parent
    return candidate


def write_manifest(output: Path, manifest: Mapping[str, Any], *, evidence_root: Path = EVIDENCE_ROOT) -> None:
    """Atomically write a formatted manifest below the owned evidence directory."""
    destination = _safe_manifest_destination(output, evidence_root)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=destination.parent,
            prefix=f".{destination.name}.", suffix=".tmp", delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            json.dump(manifest, temporary, sort_keys=True, indent=2)
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, destination)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def load_evidence(path: Path) -> Mapping[str, Any]:
    """Load object-shaped JSON evidence from a regular file."""
    source = require_regular_file(path, label="emulator evidence")
    try:
        evidence = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise VerificationError(f"could not read emulator evidence JSON: {source}") from exc
    if not isinstance(evidence, dict):
        raise VerificationError("emulator evidence JSON must be an object")
    return evidence


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uf2", required=True, type=Path)
    parser.add_argument("--elf", required=True, type=Path)
    parser.add_argument("--emulator-evidence", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--profile", choices=tuple(PROFILES), default="direct")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        manifest = verify(
            args.uf2, args.elf, load_evidence(args.emulator_evidence), profile=args.profile
        )
        write_manifest(args.output, manifest)
    except VerificationError as exc:
        print(f"artifact verification failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(manifest, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
