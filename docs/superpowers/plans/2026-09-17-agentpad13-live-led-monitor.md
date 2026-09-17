# AgentPad13 Live LED Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar permanentemente en AgentPad13 Studio la imagen real de los 24 LEDs del pad, incluida L0/OAI, a un máximo de 20 fps sin tocar la colección HID de Codex.

**Architecture:** El fork QMK recibe un observer RGB débil que ve cada color final entregado al driver. Solo `loudest_micro:vial_oai` implementa ese observer y sirve una copia coherente de 24 LEDs en tres respuestas privadas de 32 bytes sobre Vial. Rust ensambla el marco; React lo muestra mediante `LivePad` y hace polling serial condicionado por visibilidad y operaciones exclusivas.

**Tech Stack:** QMK/Vial C, parche reproducible de QMK, Python `unittest` con arnés C, Rust/Tauri 2/HIDAPI, React 18/TypeScript, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-17-agentpad13-live-led-monitor-design.md`

## Global Constraints

- Mantener VID:PID `303A:8360`, exactamente tres interfaces HID y el canal OAI `FF00:0061`, Report ID 6, 64 bytes sin cambios.
- Studio abre exclusivamente Vial `FF60:0061`, sin Report ID, 32 bytes; no enumera ni abre OAI.
- Reservar el comando privado Vial `0x7D` para AgentPad Live Monitor; no reutilizar comandos VIA/Vial/VialRGB existentes.
- `GET_INFO` v1 anuncia 24 LEDs, 3 fragmentos de 8 y máximo 20 fps; Studio acepta exclusivamente major `1`.
- La telemetría es solo lectura, no requiere desbloqueo Vial, no toca EEPROM y nunca sintetiza pulsaciones.
- Los tres fragmentos de un marco deben tener el mismo `frame_sequence`, capa y flags; de lo contrario el cliente descarta todo el marco.
- Pausar el polling durante minimización/ocultación, desbloqueo, guardado y desconexión; no superar un ciclo por cada 50 ms.
- L0 se muestra y se puede seleccionar, pero la app no ofrece edición VialRGB en L0 ni acceso OAI.
- No flashear hardware sin una autorización de flash posterior, explícita y con hash.

## File structure

- `firmware/patches/0005-rgb-matrix-color-observer.patch`: añade un callback RGB débil y no invasivo al QMK fijado.
- `firmware/tools/build_codex_oai.py`: acepta y verifica la quinta modificación reproducible de QMK.
- `firmware/loudest_micro/keymaps/vial_oai/live_monitor.{h,c}`: snapshot, protocolo `0x7D` y `via_command_kb` del target combinado.
- `firmware/loudest_micro/keymaps/vial_oai/rules.mk`: compila el monitor solo en `vial_oai`.
- `firmware/tests/codex_oai/live_monitor_harness.c` y `test_live_monitor.py`: prueba host del protocolo, coherencia y mutabilidad nula.
- `apps/agentpad-desktop/src-tauri/src/{domain,client,commands}.rs`: tipos, decodificador, comando Tauri y errores tipados.
- `apps/agentpad-desktop/src-tauri/src/{client_tests,commands_tests}.rs`: transcripciones de los tres fragmentos y límites de error.
- `apps/agentpad-desktop/src/{model,bridge,App}.tsx`: estado y conexión entre Tauri, polling y selección de capa real/editada.
- `apps/agentpad-desktop/src/studio/live-monitor.{ts,test.ts}`: ensamblador puro, frescura y política de polling testeable con reloj simulado.
- `apps/agentpad-desktop/src/components/{LivePad,LivePad.test}.tsx`: teclado virtual accesible y LED periféricos.
- `apps/agentpad-desktop/src/components/{PadLayout,KeymapWorkspace}.tsx`: reutiliza la geometría existente sin renderizar dos teclados físicos.
- `apps/agentpad-desktop/src/{App.test.tsx,app.css}`: integración permanente, estilos y estados visibles.
- `README.md`, `apps/agentpad-desktop/README.md`, `docs/PHASE-3-STATUS.md`, `docs/dual-oai-vial-physical-runbook.md`: compatibilidad, UF2 y prueba física pendientes.

### Task 1: Add the final-RGB observer to the reproducible QMK fork

**Files:**
- Create: `firmware/patches/0005-rgb-matrix-color-observer.patch`
- Modify: `firmware/tools/build_codex_oai.py`
- Modify: `firmware/tests/codex_oai/test_build_tool.py`

**Interfaces:**
- Produces `rgb_matrix_color_observer_kb(uint8_t index, uint8_t red, uint8_t green, uint8_t blue)` and `rgb_matrix_color_all_observer_kb(uint8_t red, uint8_t green, uint8_t blue)` as weak QMK hooks.
- Consumes QMK `rgb_matrix_set_color` and `rgb_matrix_set_color_all`; later firmware task implements both hooks only in `vial_oai`.

- [ ] **Step 1: Write failing source-contract tests for the fifth patch and integrity inventory.**

  Add assertions that `build_codex_oai.py` contains a `RGB_MATRIX_OBSERVER_PATCH` constant, requires `0005-rgb-matrix-color-observer.patch`, includes exactly `quantum/rgb_matrix/rgb_matrix.c` and `.h` in a fifth digest inventory, and recognises the state suffix `+patch-0005`.

  ```python
  self.assertIn('RGB_MATRIX_OBSERVER_PATCH', source)
  self.assertIn('0005-rgb-matrix-color-observer.patch', source)
  self.assertIn('QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256', source)
  ```

- [ ] **Step 2: Run the focused build-tool test and verify the new assertions fail.**

  Run: `python3 -m unittest firmware.tests.codex_oai.test_build_tool -v`

  Expected: FAIL because patch 0005 and its state inventory do not exist yet.

- [ ] **Step 3: Write patch 0005 with the two no-op weak hooks and observer calls.**

  In `quantum/rgb_matrix/rgb_matrix.h`, declare:

  ```c
  void rgb_matrix_color_observer_kb(uint8_t index, uint8_t red, uint8_t green, uint8_t blue);
  void rgb_matrix_color_all_observer_kb(uint8_t red, uint8_t green, uint8_t blue);
  ```

  In `rgb_matrix.c`, add weak implementations and call them before the driver:

  ```c
  __attribute__((weak)) void rgb_matrix_color_observer_kb(uint8_t index, uint8_t red, uint8_t green, uint8_t blue) {}
  __attribute__((weak)) void rgb_matrix_color_all_observer_kb(uint8_t red, uint8_t green, uint8_t blue) {}

  void rgb_matrix_set_color(int index, uint8_t red, uint8_t green, uint8_t blue) {
      rgb_matrix_color_observer_kb((uint8_t)index, red, green, blue);
      rgb_matrix_driver.set_color(rgb_matrix_led_index(index), red, green, blue);
  }

  void rgb_matrix_set_color_all(uint8_t red, uint8_t green, uint8_t blue) {
      rgb_matrix_color_all_observer_kb(red, green, blue);
#if defined(RGB_MATRIX_SPLIT)
      for (uint8_t i = 0; i < RGB_MATRIX_LED_COUNT; i++)
          rgb_matrix_set_color(i, red, green, blue);
#else
      rgb_matrix_driver.set_color_all(red, green, blue);
#endif
  }
  ```

  Preserve the split path's per-LED driver behavior; the all-colors observer
  records the immutable monitor state before its individual calls repeat it.

- [ ] **Step 4: Extend the build tool’s patch application and strict hashes.**

  Apply patch 0005 after deterministic patch 0004. Add `QMK_RGB_MATRIX_OBSERVER_PATCHED_SHA256`, a `patch12345_status` branch in `validate_qmk_state` and `verify_qmk_source_state`, and require that the fifth patch is either already applied or applies cleanly. Generate actual SHA-256 values from the patched pinned QMK files; never hard-code guessed hashes.

- [ ] **Step 5: Re-run the focused test and patch application check.**

  Run:

  ```sh
  python3 -m unittest firmware.tests.codex_oai.test_build_tool -v
  git -C /Users/hirlu/Documents/Projects/agentpad13-qmk-layout-20260907 apply --check firmware/patches/0005-rgb-matrix-color-observer.patch
  ```

  Expected: tests PASS and the patch check succeeds on the pinned unmodified RGB Matrix files.

- [ ] **Step 6: Commit the isolated QMK observer change.**

  ```sh
  git add firmware/patches/0005-rgb-matrix-color-observer.patch firmware/tools/build_codex_oai.py firmware/tests/codex_oai/test_build_tool.py
  git commit -m "feat: observe final rgb matrix colors"
  ```

### Task 2: Implement and test the Vial-only live-monitor protocol

**Files:**
- Create: `firmware/loudest_micro/keymaps/vial_oai/live_monitor.h`
- Create: `firmware/loudest_micro/keymaps/vial_oai/live_monitor.c`
- Modify: `firmware/loudest_micro/keymaps/vial_oai/rules.mk`
- Create: `firmware/tests/codex_oai/live_monitor_harness.c`
- Create: `firmware/tests/codex_oai/test_live_monitor.py`

**Interfaces:**
- Produces `agentpad_live_monitor_capture_led`, `agentpad_live_monitor_capture_all`, `agentpad_live_monitor_set_layer`, `agentpad_live_monitor_set_flags`, and `agentpad_live_monitor_via_command`.
- Produces wire family `0x7D`, `GET_INFO = 0x01`, `GET_FRAME = 0x02`, three fixed 8-LED chunks.
- Consumes the observer hooks from Task 1 and QMK `raw_hid_send` only on Vial’s raw HID path.

- [ ] **Step 1: Create the host harness test cases before protocol code.**

  The C harness must stub `raw_hid_send`, seed LEDs `0..23` with distinct RGB triples, request info and chunks 0–2, and assert these bytes:

  ```c
  assert(reply[0] == AGENTPAD_LIVE_MONITOR_COMMAND);
  assert(reply[1] == AGENTPAD_LIVE_MONITOR_GET_FRAME);
  assert(reply[2] == sequence_low && reply[3] == sequence_high);
  assert(reply[4] == 0);                 /* active L0 */
  assert(reply[6] == chunk);             /* 0, then 1, then 2 */
  assert(reply[8] == chunk * 8 + 1);     /* red LED chunk*8 */
  ```

  Include malformed length, unknown operation, chunk 3, and a non-`0x7D` command. Each must return `false`, send no reply and leave the stored frame unchanged.

- [ ] **Step 2: Run the new Python test and verify it fails because the monitor sources are missing.**

  Run: `python3 -m unittest firmware.tests.codex_oai.test_live_monitor -v`

  Expected: FAIL during C compilation with missing `live_monitor.h`.

- [ ] **Step 3: Implement the fixed v1 data model and request handling.**

  Define the exact public constants and state:

  ```c
  #define AGENTPAD_LIVE_MONITOR_COMMAND 0x7DU
  #define AGENTPAD_LIVE_MONITOR_GET_INFO 0x01U
  #define AGENTPAD_LIVE_MONITOR_GET_FRAME 0x02U
  #define AGENTPAD_LIVE_MONITOR_LED_COUNT 24U
  #define AGENTPAD_LIVE_MONITOR_CHUNK_LEDS 8U
  #define AGENTPAD_LIVE_MONITOR_CHUNK_COUNT 3U

  typedef struct { uint8_t r, g, b; } agentpad_live_monitor_rgb_t;
  ```

  `GET_FRAME(0)` copies the mutable observer buffer into a separate frozen
  `served_frame[24]`, increments `uint16_t sequence`, and records layer/flags.
  Chunks 1 and 2 read only that frozen copy. Fill response bytes 0–7 exactly as
  the spec defines and RGB data at 8–31. `GET_INFO` is exactly
  `[0x7D, 0x01, 1, 0, 24, 8, 3, 20, capability_flags, 0, ...]`. Define flags
  `LIVE = 0x01`, `TRANSITION = 0x02`, `STARTUP = 0x04` and `RGB_OFF = 0x08`;
  preserve unknown flag bits in replies.

- [ ] **Step 4: Connect the source only to `vial_oai`.**

  Add `SRC += live_monitor.c` to `rules.mk`. Define the QMK observer functions
  in `live_monitor.c`:

  ```c
  void rgb_matrix_color_observer_kb(uint8_t led, uint8_t r, uint8_t g, uint8_t b) {
      agentpad_live_monitor_capture_led(led, r, g, b);
  }
  void rgb_matrix_color_all_observer_kb(uint8_t r, uint8_t g, uint8_t b) {
      agentpad_live_monitor_capture_all(r, g, b);
  }
  ```

  Bounds-check `led < 24`; ignore larger indexes instead of corrupting memory.

- [ ] **Step 5: Run the protocol test and the existing RGB cap test.**

  Run:

  ```sh
  python3 -m unittest firmware.tests.codex_oai.test_live_monitor -v
  python3 -m unittest firmware.tests.codex_oai.test_rgb_cap -v
  ```

  Expected: both PASS; the monitor returns three consistent chunks without
  changing the cap contract.

- [ ] **Step 6: Commit the monitor protocol.**

  ```sh
  git add firmware/loudest_micro/keymaps/vial_oai/live_monitor.c firmware/loudest_micro/keymaps/vial_oai/live_monitor.h firmware/loudest_micro/keymaps/vial_oai/rules.mk firmware/tests/codex_oai/live_monitor_harness.c firmware/tests/codex_oai/test_live_monitor.py
  git commit -m "feat: expose Vial live LED monitor frames"
  ```

### Task 3: Integrate layer metadata and prove OAI/Vial compatibility

**Files:**
- Modify: `firmware/loudest_micro/keymaps/codex_oai/keymap.c`
- Modify: `firmware/tests/codex_oai/test_vial_oai_contract.py`
- Modify: `firmware/tests/codex_oai/test_live_monitor.py`

**Interfaces:**
- Consumes Task 2 monitor setters.
- Produces `via_command_kb` dispatch for `0x7D` only under `CODEX_OAI_DYNAMIC_KEYMAP` and live `layer`/`flags` metadata.

- [ ] **Step 1: Extend contract tests for pre-hook delegation and metadata.**

  Assert that the shared keymap delegates the private command only for the
  dynamic target, leaves every other command for existing VIA/Vial handling,
  and records the active layer before rendering:

  ```python
  self.assertIn('if (agentpad_live_monitor_via_command(data, length))', source)
  self.assertIn('agentpad_live_monitor_set_layer(active_layer);', source)
  self.assertIn('CODEX_OAI_DYNAMIC_KEYMAP', source)
  self.assertNotIn('AGENTPAD_LIVE_MONITOR', oai_source)
  ```

- [ ] **Step 2: Run focused firmware contracts and observe failure.**

  Run:

  ```sh
  python3 -m unittest firmware.tests.codex_oai.test_vial_oai_contract firmware.tests.codex_oai.test_live_monitor -v
  ```

  Expected: FAIL because the shared keymap neither delegates `0x7D` nor sets
  metadata.

- [ ] **Step 3: Add guarded shared-keymap integration.**

  Include `../vial_oai/live_monitor.h` only under `CODEX_OAI_DYNAMIC_KEYMAP`.
  Implement the existing QMK hook as a strict delegation:

  ```c
  bool via_command_kb(uint8_t *data, uint8_t length) {
  #if defined(CODEX_OAI_DYNAMIC_KEYMAP)
      if (agentpad_live_monitor_via_command(data, length)) return true;
  #endif
      return false;
  }
  ```

  In the dynamic branch of `housekeeping_task_user`, call
  `agentpad_live_monitor_set_layer(active_layer)`. In the RGB hook call
  `agentpad_live_monitor_set_flags(...)` for transition, startup and RGB-off
  states before color writes. Do not add this include or code to Direct OAI.

- [ ] **Step 4: Extend the host harness with L0 redistribution and L1 marker cases.**

  Seed frame colors, execute `oai_led_layout_apply` swapping SW1/SW7, then
  capture and request chunk 0; assert LED 0 returns old logical LED 6. For L1,
  write a VialRGB base color then the layer-marker observer color at index 13;
  assert the returned marker is the later color. This proves the protocol sees
  final renderer writes rather than a Studio simulation.

- [ ] **Step 5: Run all relevant firmware host tests.**

  Run:

  ```sh
  python3 -m unittest firmware.tests.codex_oai.test_live_monitor firmware.tests.codex_oai.test_vial_oai_contract firmware.tests.codex_oai.test_leds firmware.tests.codex_oai.test_rgb_cap -v
  ```

  Expected: PASS, including existing one-second transition and layer-marker
  assertions.

- [ ] **Step 6: Commit the target integration.**

  ```sh
  git add firmware/loudest_micro/keymaps/codex_oai/keymap.c firmware/tests/codex_oai/test_vial_oai_contract.py firmware/tests/codex_oai/test_live_monitor.py
  git commit -m "feat: publish live LED layer state through Vial"
  ```

### Task 4: Add typed monitor decoding to the native Vial client

**Files:**
- Modify: `apps/agentpad-desktop/src-tauri/src/domain.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/client.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/commands.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/client_tests.rs`
- Modify: `apps/agentpad-desktop/src-tauri/src/commands_tests.rs`

**Interfaces:**
- Produces `LiveMonitorInfo { major, minor, led_count, chunk_led_count, chunk_count, maximum_fps }`.
- Produces `LiveLedFrame { sequence, active_layer, flags, leds: Vec<LedRgb> }`.
- Produces Tauri command `get_live_led_frame() -> Result<LiveLedFrame, AppError>` and `get_live_monitor_info()`.

- [ ] **Step 1: Add failing transcript tests for info, a complete frame and rejected responses.**

  Add helpers that construct a 32-byte `0x7D` reply. The happy-path test must
  enqueue info and chunks with identical `sequence = 0x1203`, `active_layer = 0`
  and distinct LED values, then assert all 24 values and exact writes:

  ```rust
  assert_eq!(&transport.writes[1][..3], &[0x7d, 0x02, 0]);
  assert_eq!(&transport.writes[3][..3], &[0x7d, 0x02, 2]);
  assert_eq!(frame.leds[23], LedRgb { red: 24, green: 25, blue: 26 });
  ```

  Add one test each for major 2, `led_count != 24`, wrong command/opcode,
  chunk index mismatch, sequence mismatch, layer mismatch and malformed RGB
  response.

- [ ] **Step 2: Run the focused Rust test target and verify compilation fails.**

  Run: `cargo test --manifest-path apps/agentpad-desktop/src-tauri/Cargo.toml client_tests -- --nocapture`

  Expected: FAIL because monitor types and client methods do not exist.

- [ ] **Step 3: Define protocol types and explicit client errors.**

  Add these Rust types with `Serialize`, `Deserialize`, `Clone`, `Debug`,
  `Eq`, and `PartialEq`:

  ```rust
  pub struct LedRgb { pub red: u8, pub green: u8, pub blue: u8 }
  pub struct LiveMonitorInfo { pub major: u8, pub minor: u8, pub led_count: u8, pub chunk_led_count: u8, pub chunk_count: u8, pub maximum_fps: u8 }
  pub struct LiveLedFrame { pub sequence: u16, pub active_layer: u8, pub flags: u8, pub leds: Vec<LedRgb> }
  ```

  Add `LiveMonitorUnsupported`, `UnsupportedLiveMonitorVersion`,
  `MalformedLiveMonitorResponse` and `InconsistentLiveMonitorFrame` to
  `ClientError`; their messages must say whether the UI should use preview or
  retry.

- [ ] **Step 4: Implement serial `read_live_monitor_info` and `read_live_led_frame`.**

  Send `[0x7d, 0x01]` for info, validate v1/24/8/3/20-or-lower, then request
  `[0x7d, 0x02, chunk]` for chunks 0–2. Decode bytes 8–31 into eight triples,
  require equal sequence/layer/flags, require reply chunk equals request, and
  return only an all-or-nothing 24-LED vector. Do not retry inside Rust; the
  UI coordinator owns the one permitted complete-cycle retry.

- [ ] **Step 5: Expose read-only Tauri commands and test session ownership.**

  Wire commands through `AppState::with_session`, register them in `lib.rs`,
  and prove `get_live_led_frame_impl` returns `NotConnected` without a selected
  Vial session and never opens an OAI candidate.

- [ ] **Step 6: Run Rust format, focused tests and full core suite.**

  Run:

  ```sh
  cargo fmt --manifest-path apps/agentpad-desktop/src-tauri/Cargo.toml --check
  cargo test --manifest-path apps/agentpad-desktop/src-tauri/Cargo.toml client_tests commands_tests -- --nocapture
  cargo test --manifest-path apps/agentpad-desktop/src-tauri/Cargo.toml
  ```

  Expected: PASS with the original VialRGB, unlock and OAI-rejection tests intact.

- [ ] **Step 7: Commit the native protocol client.**

  ```sh
  git add apps/agentpad-desktop/src-tauri/src/domain.rs apps/agentpad-desktop/src-tauri/src/client.rs apps/agentpad-desktop/src-tauri/src/commands.rs apps/agentpad-desktop/src-tauri/src/lib.rs apps/agentpad-desktop/src-tauri/src/client_tests.rs apps/agentpad-desktop/src-tauri/src/commands_tests.rs
  git commit -m "feat: read live LED monitor frames in Studio"
  ```

### Task 5: Build the testable frontend monitor state and permanent LivePad

**Files:**
- Create: `apps/agentpad-desktop/src/studio/live-monitor.ts`
- Create: `apps/agentpad-desktop/src/studio/live-monitor.test.ts`
- Create: `apps/agentpad-desktop/src/components/LivePad.tsx`
- Create: `apps/agentpad-desktop/src/components/LivePad.test.tsx`
- Modify: `apps/agentpad-desktop/src/model.ts`
- Modify: `apps/agentpad-desktop/src/bridge.ts`
- Modify: `apps/agentpad-desktop/src/components/PadLayout.tsx`
- Modify: `apps/agentpad-desktop/src/components/KeymapWorkspace.tsx`
- Modify: `apps/agentpad-desktop/src/app.css`

**Interfaces:**
- Produces TypeScript `LiveLedFrame`, `LiveMonitorInfo`, `LiveMonitorViewState`, `LiveMonitorSource` and bridge functions `getLiveMonitorInfo`, `getLiveLedFrame`.
- Produces pure `shouldPollLiveMonitor` and `nextLiveMonitorState` functions.
- Produces `LivePad` props accepting controls, frame, selected control, draft predicate, keycode resolver and `onSelect`.

- [ ] **Step 1: Write pure-state tests before React rendering.**

  Cover v1 supported, unsupported firmware, stale after 150 ms, disconnected,
  visibility false, saving true and unlock-in-progress true:

  ```ts
  expect(shouldPollLiveMonitor({ connected: true, visible: true, saving: false, unlocking: false, inFlight: false })).toBe(true);
  expect(shouldPollLiveMonitor({ connected: true, visible: false, saving: false, unlocking: false, inFlight: false })).toBe(false);
  expect(nextLiveMonitorState(liveFrame, 1_000).source).toBe("live");
  expect(nextLiveMonitorState(liveFrame, 1_151).freshness).toBe("stale");
  ```

- [ ] **Step 2: Run the pure test and verify failure.**

  Run: `pnpm --dir apps/agentpad-desktop vitest run src/studio/live-monitor.test.ts`

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add frontend monitor types, bridge and pure policy.**

  Mirror the Tauri camelCase fields in `model.ts`. `shouldPollLiveMonitor`
  returns true only for connected, visible, non-saving, non-unlocking,
  non-in-flight state. `nextLiveMonitorState` keeps the last complete frame on
  a transient error and selects `preview`, `unsupported` or `disconnected`
  explicitly; it must never fill missing LEDs with guessed values.

- [ ] **Step 4: Write failing LivePad component tests.**

  Render a 24-LED L0 frame with SW1 red, SW7 blue, indicator LED 13 green and
  a peripheral LED. Assert `En directo`, `L0`, accessible SW1 RGB description,
  a visible peripheral light, and that a click calls `onSelect` exactly once
  without calling any keyboard-action function. Re-render with `source:
  "unsupported"` and assert `Vista previa` plus firmware-required copy.

- [ ] **Step 5: Implement LivePad and remove the duplicate physical map.**

  Use `PadLayout` as the interactive 15-control geometry with a new optional
  `ledColorFor(control)` prop. Add a `live-pad-peripherals` layer for LEDs 13–23
  positioned around the pad; LED 13 has the explicit accessible name
  `Indicador de capa`. `LivePad` owns the header, layer-follow toggle, legend,
  status copy and aria-live freshness text. Remove the lower `PadLayout` from
  `KeymapWorkspace`; it retains layer tabs, encoder directions and palette.

- [ ] **Step 6: Run component and existing keymap tests.**

  Run:

  ```sh
  pnpm --dir apps/agentpad-desktop vitest run src/studio/live-monitor.test.ts src/components/LivePad.test.tsx src/keycodes.test.ts
  ```

  Expected: PASS; no test should dispatch a hardware key event.

- [ ] **Step 7: Commit the presentational monitor.**

  ```sh
  git add apps/agentpad-desktop/src/model.ts apps/agentpad-desktop/src/bridge.ts apps/agentpad-desktop/src/studio/live-monitor.ts apps/agentpad-desktop/src/studio/live-monitor.test.ts apps/agentpad-desktop/src/components/LivePad.tsx apps/agentpad-desktop/src/components/LivePad.test.tsx apps/agentpad-desktop/src/components/PadLayout.tsx apps/agentpad-desktop/src/components/KeymapWorkspace.tsx apps/agentpad-desktop/src/app.css
  git commit -m "feat: render permanent live AgentPad keyboard"
  ```

### Task 6: Coordinate polling, physical layer following and UI recovery in App

**Files:**
- Modify: `apps/agentpad-desktop/src/App.tsx`
- Modify: `apps/agentpad-desktop/src/App.test.tsx`
- Modify: `apps/agentpad-desktop/src/components/StudioShell.tsx`
- Modify: `apps/agentpad-desktop/src/components/StudioShell.test.tsx`

**Interfaces:**
- Consumes `getLiveMonitorInfo`, `getLiveLedFrame`, `LivePad` and Task 5 policy.
- Produces at most one outstanding full frame request per 50 ms and `displayLayer` derived from explicit edit/follow mode.

- [ ] **Step 1: Extend App bridge mocks and write fake-timer integration tests.**

  Mock a successful monitor info and a changing L0/L3 frame. Test 20 calls in
  one simulated second at most, zero calls while `document.visibilityState` is
  hidden, zero calls while save/unlock is active, and resume with a fresh call
  when visible again:

  ```ts
  vi.useFakeTimers();
  await connectEditor();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(bridge.getLiveLedFrame).toHaveBeenCalledTimes(20);
  ```

  Test the layer-follow switch: physical L3 changes the displayed live layer
  but does not mutate the user’s selected edit layer until the user chooses to
  follow it.

- [ ] **Step 2: Run App tests and verify failure due to missing polling integration.**

  Run: `pnpm --dir apps/agentpad-desktop vitest run src/App.test.tsx`

  Expected: FAIL because monitor commands are not called or LivePad is absent.

- [ ] **Step 3: Implement guarded polling and lifecycle cleanup.**

  On connect, read monitor info once after current VialRGB/macros reads. If it
  is unsupported, set `source: "unsupported"` without disconnecting. Use one
  `useEffect` with a 50 ms interval, `inFlight` ref and `visibilitychange`
  listener; invoke only when `shouldPollLiveMonitor` returns true. On complete
  frame, update physical layer and timestamp. On first incomplete/error cycle,
  keep old frame and set `syncing`; retry exactly once on the next interval.
  On disconnect or unmount, clear interval, remove listener and reset live
  state.

- [ ] **Step 4: Place LivePad permanently in Studio content.**

  Add an optional `monitor` slot to `StudioShell` immediately before `children`.
  Pass `LivePad` whenever a Vial snapshot exists, regardless of Keymap,
  Lighting, Macros, Profiles, Diagnostics or Settings page. Keep Home’s
  disconnected content unchanged. Wire LivePad selection to the existing
  `Selection` state and add an explicit layer mode control (`edit` vs `follow`).

- [ ] **Step 5: Run all frontend tests and production build.**

  Run:

  ```sh
  pnpm --dir apps/agentpad-desktop test
  pnpm --dir apps/agentpad-desktop build
  ```

  Expected: PASS; prior lock/disconnect, VialRGB and portable frontend checks remain green.

- [ ] **Step 6: Commit App coordination.**

  ```sh
  git add apps/agentpad-desktop/src/App.tsx apps/agentpad-desktop/src/App.test.tsx apps/agentpad-desktop/src/components/StudioShell.tsx apps/agentpad-desktop/src/components/StudioShell.test.tsx
  git commit -m "feat: synchronize Studio live monitor at 20 fps"
  ```

### Task 7: Rebuild deliverables, update documentation and run the full no-hardware gate

**Files:**
- Modify: `README.md`
- Modify: `apps/agentpad-desktop/README.md`
- Modify: `docs/PHASE-3-STATUS.md`
- Modify: `docs/dual-oai-vial-physical-runbook.md`
- Modify: `firmware/evidence/*live-monitor*` and current dual manifest paths generated by the build tool
- Modify: `release/firmware/prebuilt/agentpad13_oai_vial_layout.uf2`

**Interfaces:**
- Consumes the compiled `loudest_micro:vial_oai` artifact and all prior tests.
- Produces a documented firmware hash and a physical runbook that explicitly marks live-monitor hardware validation pending.

- [ ] **Step 1: Add failing documentation-contract assertions.**

  Extend the phase-3 contract tests to require the current candidate manifest
  name, monitor protocol `0x7D`, 24/8/3/20 facts, Studio’s Vial-only boundary,
  L0 support, and a physical runbook row for live LEDs, L0 agent state,
  VialRGB, layer transition and disconnect/reconnect.

- [ ] **Step 2: Run the phase-3 contract test and verify the documentation assertions fail.**

  Run: `python3 -m unittest firmware.tests.codex_oai.test_phase3_contract -v`

  Expected: FAIL until the candidate documentation contains live-monitor facts.

- [ ] **Step 3: Build clean artifacts without flashing hardware.**

  Run the project build command against the pinned QMK worktree after applying
  the five verified patches:

  ```sh
  python3 firmware/tools/build_codex_oai.py --qmk-home /Users/hirlu/Documents/Projects/agentpad13-qmk-layout-20260907 --clean
  ```

  Record only generated files whose target, hash, byte size and evidence agree.
  Do not copy the UF2 to a mounted RP2040 volume.

- [ ] **Step 4: Update user-facing documentation with exact generated values.**

  State that the new phase-3 UF2 is required for `En directo`; older firmware
  remains editable in `Vista previa`. Document that Studio opens only Vial and
  that L0 shows read-only OAI light state. In the runbook, add observations for
  all 24 LEDs, one-second transition, layer 0 redistribution and reconnect;
  keep every physical result `PENDING` until observed by the user.

- [ ] **Step 5: Run the complete non-hardware verification suite.**

  Run:

  ```sh
  python3 -m unittest discover -s firmware/tests/codex_oai -p 'test_*.py' -v
  pnpm --dir apps/agentpad-desktop test
  pnpm --dir apps/agentpad-desktop build
  cargo fmt --manifest-path apps/agentpad-desktop/src-tauri/Cargo.toml --check
  cargo clippy --manifest-path apps/agentpad-desktop/src-tauri/Cargo.toml -- -D warnings
  cargo test --manifest-path apps/agentpad-desktop/src-tauri/Cargo.toml
  git diff --check
  ```

  Expected: all tests and static checks PASS; no command enumerates, resets or
  flashes a physical AgentPad13.

- [ ] **Step 6: Commit generated deliverables and documentation.**

  ```sh
  git add README.md apps/agentpad-desktop/README.md docs/PHASE-3-STATUS.md docs/dual-oai-vial-physical-runbook.md firmware/tests/codex_oai/test_phase3_contract.py firmware/evidence release/firmware/prebuilt/agentpad13_oai_vial_layout.uf2
  git commit -m "docs: deliver live LED monitor firmware and runbook"
  ```

## Self-review

### Spec coverage

- Telemetría Vial de solo lectura, 24 LEDs, tres fragmentos coherentes,
  versionado y máximo 20 fps: Tasks 1–4.
- Salida RGB física final de VialRGB, OAI, transición e indicador de capa:
  Tasks 1–3.
- L0 incluida, distribución OAI tecla+LED y ninguna invasión de OAI: Tasks 3,
  5 and 6.
- Teclado virtual permanente, teclas seleccionables, periféricos, accesibilidad
  y estados live/preview/desconectado: Tasks 5 and 6.
- Pausa de polling, recuperación y exclusión con guardado/desbloqueo: Task 6.
- UF2, hashes, documentación y prueba física explícitamente pendiente: Task 7.

### Placeholder scan

No contiene marcadores de trabajo pendiente ni referencias a tareas previas
como sustituto de instrucciones concretas.

### Type consistency

Firmware usa `agentpad_live_monitor_*`; Rust usa `LiveMonitorInfo`, `LedRgb` y
`LiveLedFrame`; TypeScript conserva sus nombres camelCase equivalentes. El
comando de transporte es siempre `0x7D`, con info `0x01` y frame `0x02`.
