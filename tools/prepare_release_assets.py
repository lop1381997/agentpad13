#!/usr/bin/env python3
"""Verify a complete Actions run and stage its app/firmware release assets."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path


EXPECTED_GROUPS = (
    "AgentPad13-Windows-x64",
    "AgentPad13-macOS",
    "AgentPad13-Linux",
    "AgentPad13-Firmware",
)
FIRMWARE_FILES = (
    "agentpad13_reference.uf2",
    "agentpad13.uf2",
    "agentpad13_codex_oai.uf2",
    "agentpad13_oai_vial_dual.uf2",
    "agentpad13_oai_vial_dual.vial",
)
APP_SUFFIXES = {
    "AgentPad13-Windows-x64": ("-setup.exe", "_portable.zip"),
    "AgentPad13-macOS": (".dmg",),
    "AgentPad13-Linux": (".deb", ".AppImage"),
}


def _regular_files(directory: Path) -> list[Path]:
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"missing release artifact group: {directory.name}")
    files = sorted(directory.iterdir())
    if any(path.is_symlink() or not path.is_file() for path in files):
        raise ValueError(f"artifact group contains a non-regular file: {directory.name}")
    return files


def _verify_group_checksums(directory: Path, files: list[Path]) -> None:
    checksum_file = directory / "SHA256SUMS"
    if checksum_file not in files:
        raise ValueError(f"missing checksum file: {directory.name}/SHA256SUMS")
    payloads = {path.name: path for path in files if path.name != "SHA256SUMS"}
    expected: dict[str, str] = {}
    for line in checksum_file.read_text(encoding="utf-8").splitlines():
        digest, separator, name = line.partition("  ")
        if not separator or not re.fullmatch(r"[0-9a-f]{64}", digest) or name in expected:
            raise ValueError(f"invalid checksum entry: {directory.name}")
        expected[name] = digest
    if set(expected) != set(payloads):
        raise ValueError(f"checksum inventory mismatch: {set(expected) ^ set(payloads)}")
    for name, path in payloads.items():
        with path.open("rb") as source:
            actual = hashlib.file_digest(source, "sha256").hexdigest()
        if actual != expected[name]:
            raise ValueError(f"checksum mismatch: {directory.name}/{name}")


def _verify_version_tag(tag: str) -> None:
    app_root = Path(__file__).resolve().parents[1] / "apps" / "agentpad-desktop"
    package_version = json.loads((app_root / "package.json").read_text(encoding="utf-8"))["version"]
    native_version = json.loads((app_root / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))["version"]
    if package_version != native_version or tag != f"v{package_version}":
        raise ValueError(f"version tag {tag} must match desktop and native app version v{package_version}")


def prepare(downloads: Path, output: Path, tag: str) -> None:
    _verify_version_tag(tag)
    if output.exists() or output.is_symlink():
        raise ValueError(f"refusing to overwrite release output: {output}")
    if downloads.is_symlink() or not downloads.is_dir():
        raise ValueError(f"missing artifact downloads: {downloads}")
    groups = {path.name for path in downloads.iterdir()}
    if groups != set(EXPECTED_GROUPS):
        raise ValueError(f"release artifact groups mismatch: {groups ^ set(EXPECTED_GROUPS)}")

    assets: dict[str, Path] = {}
    for group in EXPECTED_GROUPS:
        for path in _regular_files(downloads / group):
            if path.name == "SHA256SUMS":
                continue
            if path.name in assets:
                raise ValueError(f"duplicate release filename: {path.name}")
            assets[path.name] = path

    for group in EXPECTED_GROUPS:
        _verify_group_checksums(downloads / group, _regular_files(downloads / group))

    firmware = {path.name for path in _regular_files(downloads / "AgentPad13-Firmware") if path.name != "SHA256SUMS"}
    if firmware != set(FIRMWARE_FILES):
        raise ValueError(f"firmware assets mismatch: {firmware ^ set(FIRMWARE_FILES)}")

    for group, suffixes in APP_SUFFIXES.items():
        names = [path.name for path in _regular_files(downloads / group) if path.name != "SHA256SUMS"]
        if len(names) != len(suffixes) or any(
            sum(name.endswith(suffix) for name in names) != 1 for suffix in suffixes
        ):
            raise ValueError(f"{group} must contain one asset for each of: {suffixes}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="agentpad13-release-", dir=output.parent) as temp:
        staging = Path(temp)
        lines = []
        for name, source in sorted(assets.items()):
            destination = staging / name
            shutil.copyfile(source, destination)
            with destination.open("rb") as copied:
                digest = hashlib.file_digest(copied, "sha256").hexdigest()
            lines.append(f"{digest}  {name}\n")
        (staging / "SHA256SUMS").write_text("".join(lines), encoding="utf-8")
        staging.rename(output)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: prepare_release_assets.py DOWNLOADS OUTPUT VERSION_TAG", file=sys.stderr)
        return 2
    try:
        prepare(Path(argv[0]), Path(argv[1]), argv[2])
    except (OSError, ValueError) as exc:
        print(f"release assets: {exc}", file=sys.stderr)
        return 1
    print(f"release assets ready: {argv[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
