#!/usr/bin/env python3
"""Stage and build the isolated AgentPad13 OAI QMK keymaps.

The script deliberately operates on a caller-provided, disposable QMK
worktree.  It proves the pinned Vial source and toolchain before linking the
AgentPad13 keyboard tree into that worktree, then removes only the link it
created. It publishes separate Direct-OAI and Vial-OAI UF2 artifacts in this
repository.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Mapping, Sequence


PINNED_QMK_COMMIT = "00fc4627cd038ac9b7e9b8bf2b40b50e9e88aecb"
KEYBOARD_NAME = "loudest_micro"
KEYMAPS = ("default", "vial", "codex_oai", "vial_oai")
REQUIRED_SUBMODULES = (
    "lib/chibios",
    "lib/chibios-contrib",
    "lib/lufa",
    "lib/pico-sdk",
    "lib/printf",
)
REPO_ROOT = Path(__file__).resolve().parents[2]
KEYBOARD_SOURCE = REPO_ROOT / "firmware" / KEYBOARD_NAME
OAI_ARTIFACT = REPO_ROOT / "release" / "firmware" / "prebuilt" / "agentpad13_codex_oai.uf2"
VIAL_OAI_ARTIFACT = REPO_ROOT / "release" / "firmware" / "prebuilt" / "agentpad13_vial_oai.uf2"
DUAL_OAI_VIAL_ARTIFACT = REPO_ROOT / "release" / "firmware" / "prebuilt" / "agentpad13_oai_vial_dual.uf2"
DUAL_OAI_VIAL_DEFINITION = REPO_ROOT / "release" / "firmware" / "prebuilt" / "agentpad13_oai_vial_dual.vial"
VIA_COMMAND_PATCH = REPO_ROOT / "firmware" / "patches" / "0001-via-command-kb-backport.patch"
OAI_DESCRIPTOR_PATCH = REPO_ROOT / "firmware" / "patches" / "0002-raw-hid-report-id-chibios.patch"
DUAL_RAW_HID_PATCH = REPO_ROOT / "firmware" / "patches" / "0003-dual-raw-hid-chibios.patch"
DETERMINISTIC_BUILD_ID_PATCH = REPO_ROOT / "firmware" / "patches" / "0004-deterministic-vial-build-id.patch"
RGB_MATRIX_OBSERVER_PATCH = REPO_ROOT / "firmware" / "patches" / "0005-rgb-matrix-color-observer.patch"
VIA_COMMAND_PATCH_SHA256 = "b12c375f7de6361fb2b26ecd003b0ffd717fb54d1441f37574866c86f473268c"
OAI_DESCRIPTOR_PATCH_SHA256 = "48eb5211383c8aa338e5b266b34cb3a90fc97cccc5586754f35d54a7bfdac002"
DUAL_RAW_HID_PATCH_SHA256 = "ab1d1f51d34c95cc40d0e9f5a2df46089dc02304500f3cc50958db3c31874ccb"
DETERMINISTIC_BUILD_ID_PATCH_SHA256 = "9b28d2b484b3536fe9c9bbb95ae7acbcebf566fedf99cb5a732cbcc62d333beb"
RGB_MATRIX_OBSERVER_PATCH_SHA256 = "1427d64e95053fd7db9c1b2b1f763dcf0ee5ced00ac125418427072ddbd07511"
QMK_PATCHED_FILE_SHA256 = {
    "quantum/via.c": "48291b5dceb67de7daf7caad9db5399c69f463485203476ae4586814f3ad46f5",
    "quantum/via.h": "0a8ef108af7114bbc1da252f2017d7a9dc502750e6d75bd6506e1513ef226e7d",
}
QMK_VIA_BASE_SHA256 = {
    "quantum/via.c": "f8d0220363b944b8826cefee178a825422e369e5cdf4f233a45a846a4eb40f63",
    "quantum/via.h": "82cfa43bbc57818509735c3c567fe1ea7ea28284ad9aebf1cfda3fe34206e8a9",
}
QMK_DESCRIPTOR_BASE_SHA256 = {
    "tmk_core/protocol/usb_descriptor.c": "b5921e5311d40e50c5e4f88b133ba3b7cf10d4faa5cbd9c8da4ef4da7ba048aa",
    "tmk_core/protocol/usb_descriptor.h": "a75bb9a088e37ec51d88b8143c2cfce076dc02865c528be7591f15e566c2d477",
}
QMK_DESCRIPTOR_PATCHED_SHA256 = {
    "tmk_core/protocol/usb_descriptor.c": "09f655faea016c21e2318d1f34d1345b2e8424f64f064f1a92ef6be7118cf5e3",
    "tmk_core/protocol/usb_descriptor.h": "2e8dc4cd1edf372b6ffd1308a1e9e7c42bda07642c0d373a7b3e124103b9339e",
}
QMK_DUAL_RAW_HID_PATCHED_SHA256 = {
    "quantum/main.c": "2f91287899fc26127ed05992e581c147cd8a8cbdb4b0d07b0ac57c752556604c",
    "quantum/raw_hid.c": "05522bc010be61be4fce1e4f4781834655ea1c166e6eb7260eef1232f030a233",
    "quantum/raw_hid.h": "693ab45fac1e309a575043cbb76e0044dd0c9ed35fd8979c124e41c5d7275583",
    "tmk_core/protocol/host.c": "7043fb7a9fcfcc64df69b532ebdd58767b143374ccbf5e54ce57c13a3d3b69c3",
    "tmk_core/protocol/host.h": "4c97227c8e409557f976d92f08bf92cb8431069f638e3baa37f63a61056af6b1",
    "tmk_core/protocol/usb_descriptor.c": "b188fcfd8773a1504c354e2ae2354105d2d57ca3dcd79725964163a06dd07f8f",
    "tmk_core/protocol/usb_descriptor.h": "d3fcbea56419f3b7956ce473c6bd8b3b5bb44cf0443f5c50bd8d659a52c5144a",
    "tmk_core/protocol/chibios/usb_endpoints.c": "93df2a79fc6f58c22602fe57e9d1b7fd8e30077f0756f23b842e5b3e9996f9f4",
    "tmk_core/protocol/chibios/usb_endpoints.h": "df744207eac81e21e17171caaa0a00cd203f58c7f0a66d811ba01fa87331f72a",
    "tmk_core/protocol/chibios/usb_main.c": "682fd218db2adbdbb67f63a224ec8a52352a6984f4b949365ea73986de215e61",
}
QMK_DETERMINISTIC_BUILD_ID_SHA256 = {
    "util/build_id.py": "5a44c90d723b07a45a54a4c7d6e60ba33fa236e93c6a3c0f322c3b4f0a4b7f90",
}
QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256 = {
    "quantum/rgb_matrix/rgb_matrix.c": "998c72b22336e0f7361270890f19e3e1984c9100e537d5e285f8a001e711f4f1",
    "quantum/rgb_matrix/rgb_matrix.h": "b3f6458475c030bc8c1e223df09085750a6f3d09e0594ffee187b8e690ab6f2b",
}
PINNED_GCC_VERSION = (
    "arm-none-eabi-gcc (Arm GNU Toolchain 15.2.Rel1 (Build arm-15.86)) "
    "15.2.1 20251203"
)
# QMK otherwise embeds the wall-clock build date in version.h.  Vial uses that
# value in its EEPROM magic, so pin all generated version metadata as well.
REPRODUCIBLE_VERSION_H_FLAGS = "--skip-all"
REPRODUCIBLE_QMK_BUILD_ID = "0xA13D13"


class BuildError(RuntimeError):
    """A precondition or build command did not meet the reproducibility contract."""


def _run(command: Sequence[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    """Run a checked child process without a shell."""
    try:
        subprocess.run(list(command), cwd=cwd, env=env, check=True)
    except FileNotFoundError as exc:
        raise BuildError(f"required command is unavailable: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        rendered = " ".join(command)
        raise BuildError(f"command failed ({exc.returncode}): {rendered}") from exc


def _git_head(qmk_home: Path) -> str:
    try:
        return subprocess.check_output(
            ("git", "-C", str(qmk_home), "rev-parse", "HEAD"), text=True
        ).strip()
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise BuildError(f"QMK home is not a readable git worktree: {qmk_home}") from exc


def _file_sha256(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        raise BuildError(f"required regular file is unavailable or unsafe: {path}")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_file_sha256(path: Path, expected: str, *, label: str) -> None:
    actual = _file_sha256(path)
    if actual != expected:
        raise BuildError(f"{label} content digest must be {expected}; found {actual}")


def validate_qmk_state(status: str, file_digests: Mapping[str, str]) -> str:
    """Accept only the exact repository-owned QMK patch states."""
    patch1_paths = frozenset(QMK_PATCHED_FILE_SHA256)
    patch2_paths = frozenset(QMK_DESCRIPTOR_PATCHED_SHA256)
    patch3_paths = frozenset(QMK_DUAL_RAW_HID_PATCHED_SHA256)
    patch4_paths = frozenset(QMK_DETERMINISTIC_BUILD_ID_SHA256)
    patch5_paths = frozenset(QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256)
    actual_status = frozenset(line for line in status.splitlines() if line)
    patch1_status = frozenset(f" M {path}" for path in patch1_paths)
    patch12_status = patch1_status | frozenset(f" M {path}" for path in patch2_paths)
    patch123_status = patch12_status | frozenset(f" M {path}" for path in patch3_paths)
    patch1234_status = patch123_status | frozenset(f" M {path}" for path in patch4_paths)
    patch12345_status = patch1234_status | frozenset(f" M {path}" for path in patch5_paths)
    if not actual_status:
        expected_digests = QMK_VIA_BASE_SHA256 | QMK_DESCRIPTOR_BASE_SHA256
        state = "clean"
    elif actual_status == patch1_status:
        expected_digests = QMK_PATCHED_FILE_SHA256 | QMK_DESCRIPTOR_BASE_SHA256
        state = "patch-0001"
    elif actual_status == patch12_status:
        expected_digests = QMK_PATCHED_FILE_SHA256 | QMK_DESCRIPTOR_PATCHED_SHA256
        state = "patch-0001+patch-0002"
    elif actual_status == patch123_status:
        expected_digests = (
            QMK_PATCHED_FILE_SHA256
            | QMK_DESCRIPTOR_PATCHED_SHA256
            | QMK_DUAL_RAW_HID_PATCHED_SHA256
        )
        state = "patch-0001+patch-0002+patch-0003"
    elif actual_status == patch1234_status:
        expected_digests = (
            QMK_PATCHED_FILE_SHA256
            | QMK_DESCRIPTOR_PATCHED_SHA256
            | QMK_DUAL_RAW_HID_PATCHED_SHA256
            | QMK_DETERMINISTIC_BUILD_ID_SHA256
        )
        state = "patch-0001+patch-0002+patch-0003+patch-0004"
    elif actual_status == patch12345_status:
        expected_digests = (
            QMK_PATCHED_FILE_SHA256
            | QMK_DESCRIPTOR_PATCHED_SHA256
            | QMK_DUAL_RAW_HID_PATCHED_SHA256
            | QMK_DETERMINISTIC_BUILD_ID_SHA256
            | QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256
        )
        state = "patch-0001+patch-0002+patch-0003+patch-0004+patch-0005"
    else:
        unexpected = ", ".join(sorted(actual_status ^ patch12345_status)) or "unknown state"
        raise BuildError(f"unexpected QMK modification set: {unexpected}")

    for path, expected in expected_digests.items():
        actual = file_digests.get(path)
        if actual != expected:
            raise BuildError(
                f"QMK content digest mismatch for {path}: expected {expected}; found {actual}"
            )
    if set(file_digests) != set(expected_digests):
        raise BuildError("unexpected QMK content digest inventory")
    return state


def verify_qmk_source_state(qmk_home: Path) -> str:
    try:
        status = subprocess.check_output(
            (
                "git",
                "-C",
                str(qmk_home),
                "status",
                "--porcelain=v1",
                "--untracked-files=all",
                "--ignore-submodules=none",
            ),
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise BuildError("could not read exact QMK worktree state") from exc
    actual_status = frozenset(line for line in status.splitlines() if line)
    patch1_status = frozenset(f" M {path}" for path in QMK_PATCHED_FILE_SHA256)
    patch12_status = patch1_status | frozenset(f" M {path}" for path in QMK_DESCRIPTOR_PATCHED_SHA256)
    patch123_status = patch12_status | frozenset(f" M {path}" for path in QMK_DUAL_RAW_HID_PATCHED_SHA256)
    patch1234_status = patch123_status | frozenset(
        f" M {path}" for path in QMK_DETERMINISTIC_BUILD_ID_SHA256
    )
    patch12345_status = patch1234_status | frozenset(
        f" M {path}" for path in QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256
    )
    if not actual_status:
        paths = QMK_VIA_BASE_SHA256 | QMK_DESCRIPTOR_BASE_SHA256
    elif actual_status == patch1_status:
        paths = QMK_PATCHED_FILE_SHA256 | QMK_DESCRIPTOR_BASE_SHA256
    elif actual_status == patch12_status:
        paths = QMK_PATCHED_FILE_SHA256 | QMK_DESCRIPTOR_PATCHED_SHA256
    elif actual_status == patch123_status:
        paths = (
            QMK_PATCHED_FILE_SHA256
            | QMK_DESCRIPTOR_PATCHED_SHA256
            | QMK_DUAL_RAW_HID_PATCHED_SHA256
        )
    elif actual_status == patch1234_status:
        paths = (
            QMK_PATCHED_FILE_SHA256
            | QMK_DESCRIPTOR_PATCHED_SHA256
            | QMK_DUAL_RAW_HID_PATCHED_SHA256
            | QMK_DETERMINISTIC_BUILD_ID_SHA256
        )
    elif actual_status == patch12345_status:
        paths = (
            QMK_PATCHED_FILE_SHA256
            | QMK_DESCRIPTOR_PATCHED_SHA256
            | QMK_DUAL_RAW_HID_PATCHED_SHA256
            | QMK_DETERMINISTIC_BUILD_ID_SHA256
            | QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256
        )
    else:
        paths = (
            QMK_PATCHED_FILE_SHA256
            | QMK_DESCRIPTOR_BASE_SHA256
            | QMK_DUAL_RAW_HID_PATCHED_SHA256
            | QMK_DETERMINISTIC_BUILD_ID_SHA256
            | QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256
        )
    digests = {path: _file_sha256(qmk_home / path) for path in paths}
    return validate_qmk_state(status, digests)


def validate_qmk_home(qmk_home: Path, *, head: str | None = None) -> str:
    """Validate the exact Vial source and the required core backport."""
    qmk_home = qmk_home.resolve()
    if not qmk_home.is_dir():
        raise BuildError(f"QMK home does not exist: {qmk_home}")

    actual_head = head or _git_head(qmk_home)
    if actual_head != PINNED_QMK_COMMIT:
        raise BuildError(
            f"QMK home must be at exact QMK commit {PINNED_QMK_COMMIT}; found {actual_head}"
        )
    _verify_file_sha256(
        VIA_COMMAND_PATCH, VIA_COMMAND_PATCH_SHA256, label="repository patch 0001"
    )
    _verify_file_sha256(
        OAI_DESCRIPTOR_PATCH, OAI_DESCRIPTOR_PATCH_SHA256, label="repository patch 0002"
    )
    _verify_file_sha256(
        DUAL_RAW_HID_PATCH, DUAL_RAW_HID_PATCH_SHA256, label="repository patch 0003"
    )
    _verify_file_sha256(
        RGB_MATRIX_OBSERVER_PATCH,
        RGB_MATRIX_OBSERVER_PATCH_SHA256,
        label="repository patch 0005",
    )
    verify_qmk_source_state(qmk_home)

    missing = [path for path in REQUIRED_SUBMODULES if not (qmk_home / path).is_dir()]
    if missing:
        raise BuildError("required QMK submodules are unavailable: " + ", ".join(missing))

    try:
        status = subprocess.check_output(
            ("git", "-C", str(qmk_home), "submodule", "status", "--recursive"), text=True
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise BuildError("could not read QMK submodule state") from exc
    uninitialised = [line for line in status.splitlines() if line.startswith(("-", "+", "U"))]
    if uninitialised:
        raise BuildError("QMK submodules are not at their recorded revisions")
    return actual_head


def _git_apply_check(qmk_home: Path, patch: Path, *, reverse: bool = False) -> bool:
    command = ["git", "-C", str(qmk_home), "apply", "--check"]
    if reverse:
        command.append("--reverse")
    command.append(str(patch))
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise BuildError("required command is unavailable: git") from exc
    return result.returncode == 0


def verify_oai_descriptor_support(qmk_home: Path) -> None:
    """Require Report-ID-aware Raw HID code in the pinned shared descriptor."""
    header = qmk_home / "tmk_core" / "protocol" / "usb_descriptor.h"
    source = qmk_home / "tmk_core" / "protocol" / "usb_descriptor.c"
    if not header.is_file() or not source.is_file():
        raise BuildError("QMK home is missing the shared USB descriptor sources")
    header_text = header.read_text(encoding="utf-8")
    source_text = source.read_text(encoding="utf-8")
    required_header = (
        "#ifndef RAW_EPSIZE",
        "#ifdef RAW_REPORT_ID",
        "#    define RAW_REPORT_PAYLOAD_SIZE (RAW_EPSIZE - 1)",
        "#    define RAW_REPORT_PAYLOAD_SIZE RAW_EPSIZE",
    )
    required_source = (
        "HID_RI_REPORT_ID(8, RAW_REPORT_ID)",
        "HID_RI_REPORT_COUNT(8, RAW_REPORT_PAYLOAD_SIZE)",
    )
    if not all(fragment in header_text for fragment in required_header) or not all(
        fragment in source_text for fragment in required_source
    ):
        raise BuildError("the required ChibiOS Raw HID Report-ID patch is not applied")


def verify_dual_raw_hid_support(qmk_home: Path) -> None:
    """Require every repository-owned symbol that makes the OAI HID interface usable."""
    source_paths = tuple(QMK_DUAL_RAW_HID_PATCHED_SHA256)
    try:
        combined_qmk_sources = "\n".join(
            (qmk_home / path).read_text(encoding="utf-8") for path in source_paths
        )
    except (OSError, UnicodeError) as exc:
        raise BuildError("QMK home is missing the dual Raw HID sources") from exc
    required = (
        "OAI_RAW_HID_ENABLE", "OAI_RAW_EPSIZE", "OAI_RAW_REPORT_ID",
        "OAI_RAW_REPORT_PAYLOAD_SIZE", "OAI_RAW_INTERFACE",
        "USB_ENDPOINT_IN_OAI_RAW", "USB_ENDPOINT_OUT_OAI_RAW",
        "oai_raw_hid_send", "oai_raw_hid_receive", "oai_raw_hid_task",
    )
    if not all(fragment in combined_qmk_sources for fragment in required):
        raise BuildError("the required dual Raw HID patch is not applied")


def _apply_or_verify_patch(qmk_home: Path, patch: Path, expected_sha256: str, *, label: str) -> None:
    if patch.is_symlink() or not patch.is_file():
        raise BuildError(f"{label} is unavailable or unsafe: {patch}")
    _verify_file_sha256(patch, expected_sha256, label=label)
    if _git_apply_check(qmk_home, patch):
        _run(("git", "-C", str(qmk_home), "apply", str(patch)), cwd=qmk_home)
    elif not _git_apply_check(qmk_home, patch, reverse=True):
        raise BuildError(f"{label} does not apply cleanly to pinned QMK")


def apply_qmk_patches(qmk_home: Path) -> None:
    """Apply or verify repository patches in their required dependency order."""
    state = verify_qmk_source_state(qmk_home)
    # Patch 0003 intentionally extends files patched by 0002.  Apply only the
    # missing suffix after validating the exact starting state; reversing 0002
    # in isolation is no longer meaningful once patch 0003 is present.
    if state == "patch-0001+patch-0002+patch-0003+patch-0004+patch-0005":
        return
    patches = (
        ("clean", VIA_COMMAND_PATCH, VIA_COMMAND_PATCH_SHA256, "repository patch 0001"),
        ("patch-0001", OAI_DESCRIPTOR_PATCH, OAI_DESCRIPTOR_PATCH_SHA256, "repository patch 0002"),
        ("patch-0001+patch-0002", DUAL_RAW_HID_PATCH, DUAL_RAW_HID_PATCH_SHA256, "repository patch 0003"),
        (
            "patch-0001+patch-0002+patch-0003",
            DETERMINISTIC_BUILD_ID_PATCH,
            DETERMINISTIC_BUILD_ID_PATCH_SHA256,
            "repository patch 0004",
        ),
        (
            "patch-0001+patch-0002+patch-0003+patch-0004",
            RGB_MATRIX_OBSERVER_PATCH,
            RGB_MATRIX_OBSERVER_PATCH_SHA256,
            "repository patch 0005",
        ),
    )
    expected_states = tuple(item[0] for item in patches)
    try:
        first_missing = expected_states.index(state)
    except ValueError as exc:
        raise BuildError(f"unexpected verified QMK patch state: {state}") from exc
    for _before_state, patch, digest, label in patches[first_missing:]:
        _apply_or_verify_patch(qmk_home, patch, digest, label=label)


def apply_oai_descriptor_patch(qmk_home: Path, patch: Path = OAI_DESCRIPTOR_PATCH) -> None:
    """Apply the repository-owned descriptor patch, or verify it is already applied."""
    if patch.is_symlink() or not patch.is_file():
        raise BuildError(f"Raw HID descriptor patch is unavailable or unsafe: {patch}")
    _verify_file_sha256(
        patch, OAI_DESCRIPTOR_PATCH_SHA256, label="repository patch 0002"
    )
    if _git_apply_check(qmk_home, patch):
        _run(("git", "-C", str(qmk_home), "apply", str(patch)), cwd=qmk_home)
    elif not _git_apply_check(qmk_home, patch, reverse=True):
        raise BuildError("Raw HID descriptor patch does not apply cleanly to pinned QMK")
    verify_oai_descriptor_support(qmk_home)


def _same_target(link: Path, expected_target: Path) -> bool:
    """Compare a symlink's destination without ever following arbitrary paths."""
    return link.is_symlink() and link.resolve(strict=False) == expected_target.resolve()


def keyboard_link(qmk_home: Path, source: Path) -> Path:
    """Create the sole disposable keyboard symlink, rejecting existing paths."""
    source = source.resolve()
    if not source.is_dir():
        raise BuildError(f"AgentPad13 keyboard source does not exist: {source}")
    destination = qmk_home / "keyboards" / KEYBOARD_NAME
    if destination.exists() or destination.is_symlink():
        if destination.is_symlink() and not _same_target(destination, source):
            raise BuildError(f"foreign symlink at {destination}; refusing to replace it")
        raise BuildError(f"keyboard path already exists: {destination}")
    if not destination.parent.is_dir():
        raise BuildError(f"QMK home is missing keyboard directory: {destination.parent}")
    destination.symlink_to(source, target_is_directory=True)
    return destination


def cleanup_keyboard_link(link: Path, *, expected_target: Path) -> None:
    """Remove only the exact symlink made by :func:`keyboard_link`."""
    if not _same_target(link, expected_target):
        raise BuildError(f"refusing cleanup: {link} is not an owned symlink")
    link.unlink()


def find_cross_compiler() -> str:
    """Return a compiler that demonstrably includes both headers and newlib."""
    compiler = shutil.which("arm-none-eabi-gcc")
    if compiler is None:
        raise BuildError("arm-none-eabi-gcc is not on PATH")
    required_binutils = (
        "arm-none-eabi-ar",
        "arm-none-eabi-objcopy",
        "arm-none-eabi-size",
        "arm-none-eabi-nm",
    )
    binutils = {tool: shutil.which(tool) for tool in required_binutils}
    missing_binutils = [tool for tool, path in binutils.items() if path is None]
    if missing_binutils:
        raise BuildError(
            "cross toolchain is missing required binutils: " + ", ".join(missing_binutils)
        )
    compiler_path = Path(compiler).resolve()
    if any(Path(path).resolve().parent != compiler_path.parent for path in binutils.values()):
        raise BuildError("compiler and binutils must resolve from the same toolchain bin directory")
    try:
        version = subprocess.check_output((compiler, "--version"), text=True).splitlines()[0]
    except (subprocess.CalledProcessError, IndexError) as exc:
        raise BuildError("could not inspect arm-none-eabi-gcc version") from exc
    if version != PINNED_GCC_VERSION:
        raise BuildError(
            "arm-none-eabi-gcc must be Arm GNU Toolchain 15.2.Rel1 with gcc 15.2.1; "
            f"found {version}"
        )
    for probe in ("include/stdint.h", "libc.a"):
        try:
            value = subprocess.check_output((compiler, f"-print-file-name={probe}"), text=True).strip()
        except subprocess.CalledProcessError as exc:
            raise BuildError(f"could not inspect cross compiler for {probe}") from exc
        if not value or value == probe or not Path(value).is_file():
            raise BuildError(f"cross compiler is missing newlib component: {probe}")
    return str(compiler_path)


def _qmk_environment(qmk_home: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["QMK_HOME"] = str(qmk_home)
    env["VERSION_H_FLAGS"] = REPRODUCIBLE_VERSION_H_FLAGS
    env["QMK_BUILD_ID"] = REPRODUCIBLE_QMK_BUILD_ID
    return env


def run_lint(qmk_home: Path) -> None:
    """Run the QMK linter for each isolated OAI keymap."""
    for keymap in ("codex_oai", "vial_oai"):
        _run(
            ("qmk", "lint", "-kb", KEYBOARD_NAME, "-km", keymap, "--strict"),
            cwd=qmk_home,
            env=_qmk_environment(qmk_home),
        )
        print(f"lint {KEYBOARD_NAME}:{keymap} PASS")


def run_build(qmk_home: Path, keymap: str, *, clean: bool) -> Path:
    """Run a direct QMK make build and return the expected UF2 path."""
    if clean:
        _run(("make", "-f", "Makefile", "clean"), cwd=qmk_home, env=_qmk_environment(qmk_home))
    _run(
        ("make", "-f", "Makefile", f"{KEYBOARD_NAME}:{keymap}"),
        cwd=qmk_home,
        env=_qmk_environment(qmk_home),
    )
    artifact = qmk_home / f"{KEYBOARD_NAME}_{keymap}.uf2"
    if not artifact.is_file() or artifact.is_symlink():
        raise BuildError(f"expected regular build artifact was not produced: {artifact}")
    print(f"build {KEYBOARD_NAME}:{keymap} PASS")
    return artifact


def _publish_regular_file(source: Path, destination: Path, *, label: str) -> None:
    """Atomically replace one repository-owned published file."""
    if not source.is_file() or source.is_symlink():
        raise BuildError(f"refusing to publish a non-regular {label}: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=destination.parent, prefix=f".{destination.name}.", delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            with source.open("rb") as input_file:
                shutil.copyfileobj(input_file, temporary)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, destination)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def publish_oai_uf2(source: Path, destination: Path = OAI_ARTIFACT) -> None:
    """Atomically replace one generated OAI UF2 at its exact destination."""
    _publish_regular_file(source, destination, label="artifact")


def publish_oai_definition(source: Path, destination: Path = DUAL_OAI_VIAL_DEFINITION) -> None:
    """Atomically publish the Vial definition paired with the combined UF2."""
    _publish_regular_file(source, destination, label="definition")


def build_all(qmk_home: Path, *, clean: bool) -> None:
    """Validate, stage, lint, compile and publish without touching hardware."""
    validate_qmk_home(qmk_home)
    apply_qmk_patches(qmk_home)
    verify_qmk_source_state(qmk_home)
    verify_oai_descriptor_support(qmk_home)
    verify_dual_raw_hid_support(qmk_home)
    find_cross_compiler()
    link = keyboard_link(qmk_home, KEYBOARD_SOURCE)
    try:
        run_lint(qmk_home)
        artifacts = {keymap: run_build(qmk_home, keymap, clean=clean) for keymap in KEYMAPS}
        publish_oai_uf2(artifacts["codex_oai"])
        publish_oai_uf2(artifacts["vial_oai"], DUAL_OAI_VIAL_ARTIFACT)
        publish_oai_definition(
            KEYBOARD_SOURCE / "keymaps" / "vial_oai" / "vial.json",
            DUAL_OAI_VIAL_DEFINITION,
        )
    finally:
        cleanup_keyboard_link(link, expected_target=KEYBOARD_SOURCE)
    print("flash operations 0")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qmk-home", required=True, type=Path, help="isolated pinned Vial QMK worktree")
    parser.add_argument("--clean", action="store_true", help="request clean object builds")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        build_all(args.qmk_home, clean=args.clean)
    except BuildError as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
