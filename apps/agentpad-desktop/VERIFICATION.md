# Studio acceptance — 2026-09-09

## Windows installer + portable — 2026-09-14

The icon-fix CI run [34353912792](https://github.com/lop1381997/agentpad13/actions/runs/34353912792)
completed successfully on macOS, Windows and Linux. That run predates portable mode.
The new local change retains an NSIS installer and adds a fixed-WebView2 x64 ZIP.
Portable mode is detected by an adjacent marker; its webview data directory is
adjacent `Data`, while installed mode keeps the existing user-specific location.
The runtime CAB is pinned by official URL and locally measured SHA-256; the
Windows packaging script also checks the extracted executable's Microsoft signature.

Local checks: 35 frontend tests, 34 Rust tests (four new portable-path cases),
TypeScript/Vite and Clippy pass. Windows setup code is type-checked in host test
builds, but this is not Windows execution. The PowerShell packager and real
installer/portable startup must still run on Windows. No Windows binaries for
this change have yet been delivered, and no push/merge is included in this step.
See [Windows packaging and acceptance](packaging/WINDOWS.md).

## Proven locally

### Icon packaging follow-up — 2026-09-09

CI run [34350440436](https://github.com/lop1381997/agentpad13/actions/runs/34350440436)
was inspected after the first publication. Frontend tests, frontend builds and
Rust tests passed on all three operating systems. macOS packaging passed;
Windows MSI failed to find an ICO and Linux AppImage failed to find a square
icon, after both applications compiled. The icons existed, but `bundle.icon`
was missing from Tauri configuration.

Platform assets have now been regenerated from `icons/agentpad.svg` and
explicitly configured locally. A regression test checks configured assets,
square PNG dimensions and ICO/ICNS headers; it failed before the configuration
fix and passes afterwards. The local frontend suite now passes 35 tests.
This fix has not yet been pushed or validated by a new remote CI run.
The earlier observations below retain their original verification dates.

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
- A macOS bundle launch via Launch Services succeeded in the recorded smoke test.
  An existing instance was left untouched; this is not a current process-status claim.
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
- Successful Windows/Linux packaging after the local icon fix. The original
  published workflow failed at the packaging steps documented above.
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
The complete firmware suite passed on 2026-09-09: 175 tests, including the
compiled-C layout test in test_rgb_cap.py (169 swaps and fixed reserved LEDs).
The same pre-push run passed 34 frontend tests, 30 Rust tests and TypeScript/Vite.
