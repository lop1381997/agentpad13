# Studio acceptance — 2026-09-08

## Proven locally

- React/Vitest: 34 tests in 13 files pass.
- Rust: 28 protocol/session tests plus two real-filesystem export tests pass.
- TypeScript/Vite production build passes.
- Clippy: all targets, warnings denied, passes.
- Tauri macOS debug bundle builds.
- Native macOS Diagnostics export verified through the actual Save dialog on
  2026-09-08, while disconnected. The saved file at
  `/Users/hirlu/Documents/agentpad13-native-export-check-20260908.txt`
  was read back and contains the expected UTF-8 diagnostic report.
- Rust's 30 tests and Clippy with warnings denied rechecked on 2026-09-08.
- Fresh macOS bundle launch succeeds via Launch Services; the new process
  (PID 61014) remains running. An existing instance was left untouched.
  This is a startup smoke check, not evidence of rendered UI correctness.
- Storage tests cover denied reads and recovery of valid entries beside a corrupt profile.
- Export filesystem tests verify UTF-8 round trip, replacement of existing content
  and reporting an invalid destination, using isolated temporary directories.
- New coverage: lighting staging and explicit save, partial key/macro save failure,
  undo followed by redo, continuation of an existing unlock, identical macro
  profile comparison, native export cancellation and error feedback.

## Required acceptance still open

- WebKit flows now pass after explicit Playwright authorization: unlock,
  local drafts, undo/redo, save, OAI layout, lighting, macros, profiles, exports,
  diagnostics, preferences after reload and minimum window width. HID and native
  export are mocked. Source-to-render visual comparison remains incomplete.
- Native window capture was attempted for the new app instance (window 1155);
  macOS returned "could not create image from window". No screenshot was obtained.
- Connected keyboard: save/readback across USB reconnect, encoder behavior,
  LED effects, macro execution and simultaneous Codex OAI operation.
- Windows and Linux CI/build execution. The matrix workflow exists locally;
  it has not been published or run as part of this task.
  Docker exists outside PATH in Docker.app; Linux execution has not been verified.

The automated UI tests mock the export boundary. The separate native macOS
Diagnostics export check establishes the real dialog and file-write path;
Windows and Linux dialogs remain unverified.
Protocol tests use fake transports; they do not establish hardware behavior.
The goal must not be marked complete while these acceptance items remain open.

## Coupled OAI layout

The new firmware compiles to the separate UF2 documented in OAI-LAYOUT.md.
Its dual-channel emulator and ELF/UF2 descriptor verifier pass; evidence is in
firmware/evidence/oai-layout-20260907-{emulator,manifest}.json.
174 existing firmware tests passed; the new compiled-C layout test also passes
as part of test_rgb_cap.py (169 swaps and fixed reserved LEDs).
