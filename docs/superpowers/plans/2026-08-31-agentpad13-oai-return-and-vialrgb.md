# AgentPad13 OAI return chord and VialRGB ownership Implementation Plan

## Actualización de alcance — 2026-09-09

Retorno físico SW1+SW4, RGB por propietario y transición de 1 segundo implementados. El indicador de capa queda fuera de VialRGB después de la transición. El contenido original se conserva como plan/especificación histórica; no se marcan como ejecutadas pruebas físicas que siguen pendientes. Estado de código: `24d9ebd` en `codex/phase-3`, sin merge.

Referencia: [estado vigente de fase 3](../../PHASE-3-STATUS.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User constraint:** execute this plan inline in this thread. Do not launch
> subagents, push, merge, flash, reset, enumerate or otherwise operate hardware.

**Goal:** Add a physical SW1+SW4 return to OAI layer 0 and make layer 0 use
the Codex renderer while layers 1–7 use VialRGB after a one-second layer-colour
transition.

**Architecture:** A small `vial_oai` component will observe and mask the two
physical matrix positions before the normal key pipeline sees them. It emits
normal non-chord events through `action_exec()` and returns a one-shot signal
for a successful chord; the shared keymap performs the RAM-only return to
layer 0. The shared Codex LED module will own the palette and timing overlay;
the RGB hook paints that overlay or the Codex frame, and otherwise leaves the
already-rendered VialRGB frame untouched.

**Tech Stack:** Vial-QMK pinned at `00fc4627cd038ac9b7e9b8bf2b40b50e9e88aecb`,
QMK dynamic keymaps and RGB Matrix, C11, Python `unittest`, Node/rp2040js.

**Spec:** `docs/superpowers/specs/2026-08-31-agentpad13-oai-layer-return-and-rgb-design.md`

## Global Constraints

- Preserve VID:PID `303A:8360`, manufacturer `hirlu`, product `Codex Micro Lab OAI LED`.
- Preserve three HID interfaces: keyboard, Vial `FF60:61` with no report ID and 32-byte reports, and OAI `FF00:61` with Report ID `6` and 64-byte reports.
- Preserve every OAI request, response, event, LED-task and timing byte contract; `0xA6` remains unreachable in the combined target.
- Preserve Vial ownership and EEPROM persistence of eight dynamic layers, macros, encoder mappings and VialRGB settings.
- SW1 is matrix `[0,0]`; SW4 is matrix `[0,3]`; their physical chord window is exactly 80 ms.
- Every genuine active-layer change uses the destination palette colour for 250 ms fade-in, 500 ms hold and 250 ms fade-out.
- The calibration overlay has priority over the transition and all ordinary RGB owners.
- Direct OAI must retain its present behavior; no `COMBO_ENABLE` keycode combo may be added.
- Build and verify locally only. Do not perform a physical operation, remote operation, merge or push.

---

## File structure

| File | Responsibility |
| --- | --- |
| `firmware/loudest_micro/keymaps/vial_oai/physical_oai_return.h` | Stable interface for the physical SW1+SW4 state machine. |
| `firmware/loudest_micro/keymaps/vial_oai/physical_oai_return.c` | Matrix masking, 80 ms detection, normal-event replay and chord-consumption state. |
| `firmware/loudest_micro/keymaps/vial_oai/rules.mk` | Builds the physical-chord component only into the combined target. |
| `firmware/loudest_micro/keymaps/codex_oai/keymap.c` | Calls the component, selects layer 0 in RAM, starts layer transitions and selects the RGB owner. |
| `firmware/loudest_micro/keymaps/codex_oai/codex_led.h` | Declares the one-second transition API. |
| `firmware/loudest_micro/keymaps/codex_oai/codex_led.c` | Stores transition state, uses the existing eight-colour palette and renders the full-chain overlay. |
| `firmware/tests/codex_oai/physical_oai_return_harness.c` | Host C harness that records injected matrix events and successful chords. |
| `firmware/tests/codex_oai/stubs/physical_oai_return_qmk.h` | Minimal QMK API and matrix declarations for the chord harness. |
| `firmware/tests/codex_oai/test_vial_oai_layer_control.py` | Deterministic tests for physical chord timing, dynamic-layer integration and RGB ownership. |
| `firmware/tests/codex_oai/led_harness.c` | Adds transition commands to the existing real-LED C harness. |
| `firmware/tests/codex_oai/led_oracle.py` | Independent Python oracle for the one-second transition frame. |
| `firmware/tests/codex_oai/test_leds.py` | Frame-for-frame transition timing and rapid-change tests. |
| `firmware/tests/emulator/dual_oai_vial_runner.cjs` | Runtime proof that a Vial remap cannot disable SW1+SW4 and that no chord key leaks. |
| `firmware/tests/codex_oai/test_emulator_contract.py` | Requires the new runtime evidence fields. |
| `firmware/tests/codex_oai/test_artifact_verifier.py`, `firmware/tools/verify_codex_oai_artifact.py` | Reject an OAI/Vial candidate whose encoder evidence does not prove exactly one OAI event per detent. |
| `docs/dual-oai-vial-physical-runbook.md` | Adds tester-facing chord, flash and post-transition checks. |
| `firmware/BUILD.md`, `release/MANIFEST.md`, `firmware/evidence/dual-oai-vial-current-manifest.json` | Record the rebuilt local candidate and its generated hash. |

### Pre-task (completed): ensure an OAI encoder detent emits one event

The Vial dynamic encoder map dispatches a virtual press and release for every
physical detent. The OAI encoder keycodes must notify the OAI transport only
on the press edge; otherwise a clockwise or counter-clockwise detent produces
two identical `ENC_CW` or `ENC_CC` messages. This is unrelated to the physical
encoder model and does not affect standard volume mappings.

- [x] Add a failing dual-emulator assertion that captures the OAI frames
  produced by an initial Vial encoder-map rotation and requires the exact
  one-element sequence `ENC_CW` with `act:2`.
- [x] Gate `OAI_ENC_CW` and `OAI_ENC_CCW` in `process_record_user()` on
  `record->event.pressed`, preserving direct OAI, Vial remapping and ordinary
  multimedia encoder behavior.
- [x] Require the same `initial_rotation_emitted_exactly_one_oai_event`
  evidence field in the offline artifact verifier, so a duplicate-event UF2
  cannot be accepted as a verified candidate.
- [x] Rebuild the dual candidate, regenerate emulator evidence and its static
  verifier manifest before beginning the layer-return and RGB work.

### Task 1: Build the physical SW1+SW4 state machine behind a host harness

**Files:**

- Create: `firmware/loudest_micro/keymaps/vial_oai/physical_oai_return.h`
- Create: `firmware/loudest_micro/keymaps/vial_oai/physical_oai_return.c`
- Modify: `firmware/loudest_micro/keymaps/vial_oai/rules.mk`
- Create: `firmware/tests/codex_oai/stubs/physical_oai_return_qmk.h`
- Create: `firmware/tests/codex_oai/physical_oai_return_harness.c`
- Create: `firmware/tests/codex_oai/test_vial_oai_layer_control.py`

**Interfaces:**

- Consumes: the debounced QMK `matrix[0]` row, `matrix_is_on()`,
  `action_exec(MAKE_KEYEVENT(...))` and `timer_read32()`.
- Produces: `void physical_oai_return_init(void)` and
  `bool physical_oai_return_matrix_scan(uint32_t now_ms, bool enabled)`. The scan call
  masks SW1/SW4 before QMK keycode lookup and returns `true` exactly once for
  a valid chord. `enabled` is false only while Vial actively polls its
  overlapping SW1+SW13 security-unlock combination, leaving that raw matrix
  state visible to Vial.

- [ ] **Step 1: Write the failing physical-event tests**

Create `test_vial_oai_layer_control.py` with a small process wrapper that
compiles the C harness using the local C compiler. The core assertions must
exercise both coordinates, the 80 ms boundary, a short normal tap, a held
normal key and a consumed chord:

```python
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
TARGET = REPO / "firmware" / "loudest_micro" / "keymaps" / "vial_oai"
HARNESS_SOURCE = HERE / "physical_oai_return_harness.c"
STUBS = HERE / "stubs"

class PhysicalReturnHarness:
    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(prefix="agentpad13_return_chord_")
        self._binary = Path(self._tmp.name) / "physical_oai_return_harness"
        subprocess.run([
            "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
            '-DQMK_KEYBOARD_H="physical_oai_return_qmk.h"',
            "-I", str(STUBS), "-I", str(TARGET), str(HARNESS_SOURCE),
            str(TARGET / "physical_oai_return.c"), "-o", str(self._binary),
        ], check=True)
        self._process = subprocess.Popen(
            [str(self._binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
        )

    def set_matrix(self, *, now_ms: int, sw1: bool, sw4: bool) -> None:
        assert self._process.stdin is not None
        self._process.stdin.write(f"SET {now_ms} {int(sw1)} {int(sw4)}\n")
        self._process.stdin.flush()

    def read(self) -> tuple[bool, list[tuple[int, int, bool]]]:
        assert self._process.stdout is not None
        returning = False
        events: list[tuple[int, int, bool]] = []
        for line in self._process.stdout:
            fields = line.split()
            if fields == ["---"]:
                return returning, events
            if fields[0] == "RETURN":
                returning = fields[1] == "1"
            elif fields[0] == "EVENT":
                events.append((int(fields[1]), int(fields[2]), fields[3] == "1"))
        raise AssertionError("physical chord harness ended before ---")

def test_sw1_sw4_before_80ms_returns_once_and_emits_no_key_events(self) -> None:
    self.harness.set_matrix(now_ms=0, sw1=True, sw4=False)
    self.assertEqual(self.harness.read(), (False, []))
    self.harness.set_matrix(now_ms=79, sw1=True, sw4=True)
    self.assertEqual(self.harness.read(), (True, []))
    self.harness.set_matrix(now_ms=100, sw1=False, sw4=False)
    self.assertEqual(self.harness.read(), (False, []))

def test_unpaired_sw4_replays_a_press_at_80ms_and_its_real_release(self) -> None:
    self.harness.set_matrix(now_ms=0, sw1=False, sw4=True)
    self.assertEqual(self.harness.read(), (False, []))
    self.harness.set_matrix(now_ms=80, sw1=False, sw4=True)
    self.assertEqual(self.harness.read(), (False, [(0, 3, True)]))
    self.harness.set_matrix(now_ms=300, sw1=False, sw4=False)
    self.assertEqual(self.harness.read(), (False, [(0, 3, False)]))
```

Add symmetric SW1 coverage and assert that a second key arriving at `80 ms`
is not a chord. Add a short-tap assertion that a press at `0 ms` and release
at `50 ms` replays `[(0, 0, True), (0, 0, False)]` in that order.

- [ ] **Step 2: Run the tests to confirm the red state**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_vial_oai_layer_control -v
```

Expected: FAIL because `physical_oai_return.c`, its stub header and the
harness do not exist.

- [ ] **Step 3: Add the matrix-only public interface and state machine**

Create the header with this complete interface:

```c
#pragma once

#include <stdbool.h>
#include <stdint.h>

void physical_oai_return_init(void);
bool physical_oai_return_matrix_scan(uint32_t now_ms);
```

In `physical_oai_return.c`, define `RETURN_SW1_ROW 0U`,
`RETURN_SW1_COL 0U`, `RETURN_SW4_ROW 0U`, `RETURN_SW4_COL 3U` and
`RETURN_CHORD_TERM_MS 80U`. Sample both matrix positions before clearing both
bits from `matrix[0]` on every scan. Never compare a resolved keycode and
never call a dynamic-keymap getter or setter.

Use `return_member_t` with `RETURN_MEMBER_NONE`, `RETURN_MEMBER_SW1` and
`RETURN_MEMBER_SW4`; define `member_is_down()`, `other_member_is_down()` and
`emit_member_event()` as `static` helpers. Keep one pending member, one pending
timestamp, two delivered flags and one `chord_consumed` flag. The processing
order is fixed:

```c
if (chord_consumed) {
    if (!sw1_down && !sw4_down) chord_consumed = false;
    return false;
}
if (pending_member != RETURN_MEMBER_NONE &&
    other_member_is_down(pending_member, sw1_down, sw4_down) &&
    pending_member_is_down(pending_member, sw1_down, sw4_down) &&
    (uint32_t)(now_ms - pending_started_ms) < RETURN_CHORD_TERM_MS) {
    pending_member = RETURN_MEMBER_NONE;
    chord_consumed = true;
    return true;
}
```

When the pending member reaches 80 ms while still down, inject its press with
`action_exec(MAKE_KEYEVENT(0, column, true))` and mark that member delivered.
When it is released before the deadline, inject its press then its release in
the same scan. Once delivered, inject exactly one release when the sampled
physical position becomes up. If a member is pressed after the other member
was already delivered, inject it immediately: the first member's window has
already expired, so that pair must remain ordinary Vial input.

The `physical_oai_return_init()` function must zero every state field. Add
`SRC += physical_oai_return.c` to `vial_oai/rules.mk`; do not add that source
to the Direct OAI target.

- [ ] **Step 4: Implement the deterministic C harness**

The stub must define `matrix_row_t`, `matrix[MATRIX_ROWS]`, `keyevent_t`,
`MAKE_KEYEVENT`, `matrix_is_on()` and an `action_exec()` declaration. The
harness defines those objects, records every injected event and accepts this
line protocol:

```c
/* INPUT: SET <now_ms> <sw1_down> <sw4_down> */
matrix[0] = (sw1_down ? (1U << 0) : 0U) | (sw4_down ? (1U << 3) : 0U);
printf("RETURN %u\n", physical_oai_return_matrix_scan(now_ms) ? 1U : 0U);
for (uint8_t index = 0; index < event_count; ++index) {
    printf("EVENT %u %u %u\n", events[index].row, events[index].col,
           events[index].pressed ? 1U : 0U);
}
printf("---\n");
```

Clear the per-command event buffer after printing. The Python wrapper must
parse `RETURN`, `EVENT` and `---`, so failures report the exact emitted
physical event sequence.

- [ ] **Step 5: Run the state-machine tests and direct-target regression**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_vial_oai_layer_control -v
python3 -m unittest firmware.tests.codex_oai.test_keymap_contract -v
```

Expected: PASS. The first command proves the chord code; the second proves the
unchanged Direct OAI keymap contract.

- [ ] **Step 6: Commit the isolated chord component**

```bash
git add firmware/loudest_micro/keymaps/vial_oai/physical_oai_return.c firmware/loudest_micro/keymaps/vial_oai/physical_oai_return.h firmware/loudest_micro/keymaps/vial_oai/rules.mk firmware/tests/codex_oai/stubs/physical_oai_return_qmk.h firmware/tests/codex_oai/physical_oai_return_harness.c firmware/tests/codex_oai/test_vial_oai_layer_control.py
git commit -m "feat: add physical OAI return chord"
```

### Task 2: Connect the chord to the eight-layer Vial keymap without persisting a layer change

**Files:**

- Modify: `firmware/loudest_micro/keymaps/codex_oai/keymap.c`
- Modify: `firmware/tests/codex_oai/test_vial_oai_contract.py`
- Modify: `firmware/tests/codex_oai/test_vial_oai_layer_control.py`

**Interfaces:**

- Consumes: `physical_oai_return_init()` and
  `physical_oai_return_matrix_scan(uint32_t)` from Task 1.
- Produces: a successful physical chord invokes a RAM-only return to layer 0;
  standalone Direct OAI compiles no reference to the component.

- [ ] **Step 1: Extend the integration contract before editing the shared keymap**

Add these assertions to `test_vial_oai_layer_control.py`:

```python
def test_shared_keymap_uses_positions_before_vial_keycode_dispatch(self) -> None:
    source = SHARED_KEYMAP.read_text(encoding="utf-8")
    self.assertIn('#include "../vial_oai/physical_oai_return.h"', source)
    self.assertIn("physical_oai_return_matrix_scan(timer_read32())", source)
    self.assertIn("return_to_codex_layer();", source)
    self.assertNotIn("COMBO_ENABLE", source)

def test_ram_only_return_does_not_write_default_layer_eeprom(self) -> None:
    source = SHARED_KEYMAP.read_text(encoding="utf-8")
    body = source[source.index("static void return_to_codex_layer"):source.index("static void cycle_codex_layer")]
    self.assertIn("default_layer_set(1UL << CODEX_OAI_LAYER);", body)
    self.assertIn("select_codex_layer(CODEX_OAI_LAYER);", body)
    self.assertNotIn("eeconfig_update_default_layer", body)
```

Extend `test_vial_oai_contract.py` to require `SRC += physical_oai_return.c`
and `#define CODEX_OAI_DYNAMIC_KEYMAP`, then run the two test modules.

- [ ] **Step 2: Confirm the new integration assertions fail**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_vial_oai_layer_control firmware.tests.codex_oai.test_vial_oai_contract -v
```

Expected: FAIL because the shared keymap has not called the new component or
declared a `return_to_codex_layer()` helper.

- [ ] **Step 3: Wire the component only in the combined build**

In `codex_oai/keymap.c`, add this include only inside the existing dynamic
keymap compile guard:

```c
#if defined(CODEX_OAI_DYNAMIC_KEYMAP)
#    include "../vial_oai/physical_oai_return.h"
#endif
```

Add the following helper beside `select_codex_layer()`:

```c
static void return_to_codex_layer(void) {
    default_layer_set(1UL << CODEX_OAI_LAYER);
    select_codex_layer(CODEX_OAI_LAYER);
}
```

`default_layer_set()` changes only RAM; do not call
`set_single_persistent_default_layer()` or any `eeconfig_update_*` function.
This reset is required because the active layer is the highest bit of
`layer_state | default_layer_state`; `layer_move(0)` cannot override an
active runtime default layer by itself.

In `keyboard_post_init_user()`, immediately after `codex_led_init()`, call
`physical_oai_return_init()` inside the same dynamic-keymap guard. At the end
of the existing `matrix_scan_user()` body, use:

```c
#if defined(CODEX_OAI_DYNAMIC_KEYMAP)
    if (physical_oai_return_matrix_scan(timer_read32())) {
        return_to_codex_layer();
    }
#endif
```

Do not intercept the chord in `process_record_user()`: that hook receives the
Vial-resolved keycode too late to remain global after remapping.

- [ ] **Step 4: Make layer observation the single transition source**

Remove the eager `oai_layer = layer` and `codex_led_set_layer(...)` updates
from `select_codex_layer()`. Keep that helper limited to bounds-checking then
`layer_move(layer)`. The existing `housekeeping_task_user()` poll remains the
sole observer of `get_highest_layer(layer_state | default_layer_state)`, so it
catches touch, chord and all Vial-assigned layer keycodes consistently.

At this task, retain its present `codex_led_set_layer(active_layer, now_ms)`
call. Task 3 will append the transition start immediately after it.

- [ ] **Step 5: Run the chord and eight-layer contracts**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_vial_oai_layer_control firmware.tests.codex_oai.test_vial_oai_contract firmware.tests.codex_oai.test_keymap_contract -v
```

Expected: PASS. The source contract proves matrix-position interception and
RAM-only default-layer reset; the C harness proves the timing and suppression
behavior without relying on Vial keycodes.

- [ ] **Step 6: Commit the shared-keymap integration**

```bash
git add firmware/loudest_micro/keymaps/codex_oai/keymap.c firmware/tests/codex_oai/test_vial_oai_contract.py firmware/tests/codex_oai/test_vial_oai_layer_control.py
git commit -m "feat: return Vial layers to Codex with SW1 SW4"
```

### Task 3: Add the exact one-second full-chain layer transition to the Codex LED module

**Files:**

- Modify: `firmware/loudest_micro/keymaps/codex_oai/codex_led.h`
- Modify: `firmware/loudest_micro/keymaps/codex_oai/codex_led.c`
- Modify: `firmware/tests/codex_oai/led_harness.c`
- Modify: `firmware/tests/codex_oai/led_oracle.py`
- Modify: `firmware/tests/codex_oai/test_leds.py`

**Interfaces:**

- Consumes: the existing `layer_colors[]` palette and the existing 24-element
  `codex_led_rgb_t` frame shape.
- Produces: `void codex_led_start_layer_transition(uint8_t, uint32_t)` and
  `bool codex_led_render_layer_transition(uint32_t, codex_led_rgb_t[CODEX_LED_COUNT])`.

- [ ] **Step 1: Add failing oracle tests for the three transition phases**

Add this test to `test_leds.py`; use layer 4 because its non-equal green and
blue channels make interpolation errors visible:

```python
def test_layer_transition_is_full_chain_and_exactly_one_second(self) -> None:
    self.harness.transition(4, 1000)
    renderer = led_oracle.Renderer()
    renderer.start_layer_transition(4, 1000)
    for now_ms, color in (
        (1000, (0, 0, 0)),
        (1125, (0, 32, 128)),
        (1250, (0, 64, 255)),
        (1749, (0, 64, 255)),
        (1875, (0, 32, 128)),
        (1999, (0, 0, 1)),
    ):
        self.assertEqual(self.harness.transition_frame(now_ms), [color] * 24)
        self.assertEqual(renderer.render_layer_transition(now_ms), [color] * 24)
    self.assertIsNone(renderer.render_layer_transition(2000))
    self.assertIsNone(self.harness.transition_frame(2000))
```

Add tests for all eight destination colours, unsigned-32-bit rollover and a
rapid change: starting layer 2 at `1000`, then layer 7 at `1120`, must render
black at `1120` and rose at full intensity at `1370`; it must never resume the
old green transition.

- [ ] **Step 2: Run the LED test module and confirm the expected failure**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_leds -v
```

Expected: FAIL because neither the harness command nor the transition API
exists.

- [ ] **Step 3: Define timing constants and render the overlay in C**

In `codex_led.h`, add:

```c
#define CODEX_LAYER_TRANSITION_FADE_IN_MS 250U
#define CODEX_LAYER_TRANSITION_HOLD_MS 500U
#define CODEX_LAYER_TRANSITION_FADE_OUT_MS 250U
#define CODEX_LAYER_TRANSITION_TOTAL_MS 1000U

void codex_led_start_layer_transition(uint8_t layer, uint32_t now_ms);
bool codex_led_render_layer_transition(uint32_t now_ms, codex_led_rgb_t output[CODEX_LED_COUNT]);
```

In `codex_led.c`, add a context containing `started_ms`, `layer` and `active`.
`codex_led_init()` clears `active`. The start function stores
`layer % (sizeof(layer_colors) / sizeof(layer_colors[0]))`, stores `now_ms`
and sets `active = true`.
The render function returns `false` if inactive or
`(uint32_t)(now_ms - started_ms) >= CODEX_LAYER_TRANSITION_TOTAL_MS`;
when expired, it clears `active` before returning `false`.

Use this integer level calculation, which matches the expected values above:

```c
uint32_t elapsed = (uint32_t)(now_ms - layer_transition.started_ms);
uint8_t level = 255U;
if (elapsed < CODEX_LAYER_TRANSITION_FADE_IN_MS) {
    level = (uint8_t)((elapsed * 255U + (CODEX_LAYER_TRANSITION_FADE_IN_MS / 2U)) / CODEX_LAYER_TRANSITION_FADE_IN_MS);
} else if (elapsed >= CODEX_LAYER_TRANSITION_FADE_IN_MS + CODEX_LAYER_TRANSITION_HOLD_MS) {
    uint32_t remaining = CODEX_LAYER_TRANSITION_TOTAL_MS - elapsed;
    level = (uint8_t)((remaining * 255U + (CODEX_LAYER_TRANSITION_FADE_OUT_MS / 2U)) / CODEX_LAYER_TRANSITION_FADE_OUT_MS);
}
```

Scale the existing destination palette colour with
`(channel * level + 127U) / 255U`, assign that colour to every index `0`
through `CODEX_LED_COUNT - 1`, then return `true`. Keep
`codex_led_set_layer()` as the state used by the normal Codex indicator; it
does not start a transition. The boot diagnostic remains exclusively in
`codex_led_render()` and never calls the transition function.

- [ ] **Step 4: Extend the C harness and independent Python oracle**

Teach `led_harness.c` to parse `TRANSITION <layer> <now_ms>` and
`TRANSITION_RENDER <now_ms>`. For the second command, print `INACTIVE` when
the C API returns false; otherwise print the same 24 `LED` lines and `---`
used by ordinary render. Add parallel methods to `led_oracle.Renderer`:

```python
def start_layer_transition(self, layer: int, now_ms: int) -> None:
    self._transition = (layer % len(LAYER_COLORS), now_ms & UINT32_MASK)

def render_layer_transition(self, now_ms: int) -> list[tuple[int, int, int]] | None:
    # Return None at 1000 ms or later; otherwise return one scaled palette colour 24 times.
```

The Python calculation must be independent of the C source and use the same
phase boundaries stated in Step 3.

- [ ] **Step 5: Run the LED suite**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_leds -v
```

Expected: PASS, including all existing task, link, feedback and boot-diagnostic
parity cases.

- [ ] **Step 6: Commit the LED transition engine**

```bash
git add firmware/loudest_micro/keymaps/codex_oai/codex_led.c firmware/loudest_micro/keymaps/codex_oai/codex_led.h firmware/tests/codex_oai/led_harness.c firmware/tests/codex_oai/led_oracle.py firmware/tests/codex_oai/test_leds.py
git commit -m "feat: animate layer transitions across Codex LEDs"
```

### Task 4: Select the layer-specific RGB owner and prove Vial remaps at runtime

**Files:**

- Modify: `firmware/loudest_micro/keymaps/codex_oai/keymap.c`
- Modify: `firmware/tests/codex_oai/test_vial_oai_layer_control.py`
- Modify: `firmware/tests/emulator/dual_oai_vial_runner.cjs`
- Modify: `firmware/tests/codex_oai/test_emulator_contract.py`
- Modify: `firmware/tests/codex_oai/test_phase3_contract.py`

**Interfaces:**

- Consumes: Task 1 chord result, Task 3 transition renderer, existing
  `rgb_matrix_indicators_advanced_user()` hook and the Vial dynamic-keymap HID
  request path.
- Produces: layer 0 paints Codex state, a transition paints all 24 LEDs, and
  non-OAI layers write no custom LED colours after the transition.

- [ ] **Step 1: Add source-level owner and priority tests**

Add the following assertions to `test_vial_oai_layer_control.py`:

```python
def test_combined_rgb_owner_is_transition_then_codex_then_vialrgb(self) -> None:
    source = SHARED_KEYMAP.read_text(encoding="utf-8")
    rgb = source[source.index("bool rgb_matrix_indicators_advanced_user"):]
    self.assertLess(rgb.index("codex_led_render_layer_transition"), rgb.index("codex_led_render(now_ms, frame)"))
    self.assertIn("if (active_layer != CODEX_OAI_LAYER)", rgb)
    self.assertLess(rgb.index("if (active_layer != CODEX_OAI_LAYER)"), rgb.index("codex_led_render(now_ms, frame)"))

def test_keyboard_calibration_overlay_remains_after_user_rgb_hook(self) -> None:
    board = KEYBOARD_SOURCE.read_text(encoding="utf-8")
    start = board.index("bool rgb_matrix_indicators_advanced_kb")
    body = board[start:start + 1400]
    self.assertLess(body.index("rgb_matrix_indicators_advanced_user"), body.index("selfcal_rgb_overlay"))
```

Add a contract requiring `codex_led_start_layer_transition(active_layer,
now_ms)` immediately after `codex_led_set_layer(active_layer, now_ms)` only in
the dynamic-keymap branch. Verify the Direct target does not call the start
API.

- [ ] **Step 2: Run the owner tests to confirm they fail**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_vial_oai_layer_control firmware.tests.codex_oai.test_vial_oai_contract -v
```

Expected: FAIL because the current renderer always overwrites every layer with
a Codex frame and does not start a transition.

- [ ] **Step 3: Start transitions only for genuine combined-target layer changes**

In the existing active-layer-change branch of `housekeeping_task_user()`, keep
the state assignment and add this exact guarded call:

```c
oai_layer = active_layer;
codex_led_set_layer(active_layer, now_ms);
#if defined(CODEX_OAI_DYNAMIC_KEYMAP)
codex_led_start_layer_transition(active_layer, now_ms);
#endif
```

This branch runs only when the computed active layer differs from the previous
one, so the boot diagnostic and an SW1+SW4 chord already on layer 0 do not
create an overlay. A second layer change overwrites the transition context,
which is the specified restart behavior.

- [ ] **Step 4: Make the RGB hook release VialRGB on layers 1–7**

Refactor `rgb_matrix_indicators_advanced_user()` to compute `now_ms` and
`active_layer` once. Paint a capped custom frame only when the transition API
returns `true`; immediately return after that paint. In the combined target,
return before calling `codex_led_render()` when the transition is inactive and
`active_layer != CODEX_OAI_LAYER`. The base RGB Matrix/VialRGB effect has
already rendered by the time this hook runs, so returning without
`rgb_matrix_set_color()` retains Vial's current mode, hue, saturation, speed
and brightness.

The central flow must be:

```c
if (codex_led_render_layer_transition(now_ms, frame)) {
    paint_capped_codex_frame(frame, led_min, led_max, rgb_matrix_get_val());
    return true;
}
#if defined(CODEX_OAI_DYNAMIC_KEYMAP)
if (active_layer != CODEX_OAI_LAYER) {
    return true;
}
#endif
codex_led_render(now_ms, frame);
paint_capped_codex_frame(frame, led_min, led_max, rgb_matrix_get_val());
return true;
```

Keep the present `codex_rgb_cap_channel()` calls in the extracted
`paint_capped_codex_frame()` helper with this signature:

```c
static void paint_capped_codex_frame(
    const codex_led_rgb_t frame[CODEX_LED_COUNT], uint8_t led_min,
    uint8_t led_max, uint8_t current_value
);
```

Do not call a VialRGB setter, do not write EEPROM and do not alter Vial's
selected effect. The keyboard-level
`selfcal_rgb_overlay()` continues to run after this user hook and therefore
remains the final calibration overlay.

- [ ] **Step 5: Extend the dual emulator proof for physical remap resilience**

In `dual_oai_vial_runner.cjs`, add a `setVialKeycode(layer, row, col,
keycode)` helper next to the current K00 write and use the same raw request
layout already proven for `id_dynamic_keymap_set_keycode`. Program SW1 `[0,0]`
to `KC_B` (`0x0005`) and SW4 `[0,3]` to `KC_C` (`0x0006`) on every dynamic
layer 1 through 7. After the startup sweep, use TTP223 pin GP16 to enter each
target layer in turn, drive GP12 and GP2 low together for less than 80 ms,
then restore both high. Test layer 0 as well with its default physical
positions. After every chord, set layer-0 SW1 to `KC_ESC` and press it once;
the Escape report proves the chord selected layer 0.

Record this object in emulator evidence:

```js
return_chord_behavior: {
  remapped_sw1: 0x0005,
  remapped_sw4: 0x0006,
  tested_layers: [0, 1, 2, 3, 4, 5, 6, 7],
  chord_generated_no_keyboard_key: true,
  returned_to_layer_zero: true,
  standalone_sw1_after_chord_keycode: 0x0029,
}
```

Set layer 0 SW1 to `KC_ESC` (`0x0029`) and press it after the chord. Require
an Escape keyboard report after each tested layer, while requiring no `KC_B`,
`KC_C` or Escape report between every chord press and release. The explicit
post-chord Escape reports prove layer 0 is active; the absence of remapped
reports proves that no Vial remap can disable or leak through the chord.

Require every boolean in that object in both
`test_emulator_contract.py` and `test_phase3_contract.py`.

- [ ] **Step 6: Run focused non-hardware verification**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_vial_oai_layer_control firmware.tests.codex_oai.test_vial_oai_contract firmware.tests.codex_oai.test_leds firmware.tests.codex_oai.test_keymap_contract -v
```

Expected: PASS. The emulator assertions will remain red until the rebuilt dual
UF2 exists in Task 5; do not run that emulator test against the old artifact.

- [ ] **Step 7: Commit RGB ownership and runtime-proof changes**

```bash
git add firmware/loudest_micro/keymaps/codex_oai/keymap.c firmware/tests/codex_oai/test_vial_oai_layer_control.py firmware/tests/emulator/dual_oai_vial_runner.cjs firmware/tests/codex_oai/test_emulator_contract.py firmware/tests/codex_oai/test_phase3_contract.py
git commit -m "feat: use VialRGB outside the Codex layer"
```

### Task 5: Rebuild the local candidate, record evidence and update the physical runbook

**Files:**

- Modify: `release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2`
- Modify: `release/firmware/prebuilt/agentpad13_oai_vial_dual.vial` only if the builder produces a content change
- Modify: `firmware/evidence/dual-oai-vial-emulator.json`
- Modify: `firmware/evidence/dual-oai-vial-current-manifest.json`
- Modify: `docs/dual-oai-vial-physical-runbook.md`
- Modify: `firmware/BUILD.md`
- Modify: `release/MANIFEST.md`
- Modify: `firmware/tests/codex_oai/test_phase3_contract.py`

**Interfaces:**

- Consumes: Tasks 1–4, the repository build tool and a disposable pinned
  Vial-QMK worktree with the repository patches applied.
- Produces: one rebuilt, hash-recorded local UF2, paired Vial definition,
  emulator evidence and verifier manifest. No hardware or remote side effect.

- [ ] **Step 1: Add release-contract checks for the new evidence**

Extend `test_phase3_contract.py` so the dual candidate must contain
`return_chord_behavior` with these exact values:

```python
self.assertEqual(evidence["return_chord_behavior"]["remapped_sw1"], 0x0005)
self.assertEqual(evidence["return_chord_behavior"]["remapped_sw4"], 0x0006)
self.assertEqual(evidence["return_chord_behavior"]["standalone_sw1_after_chord_keycode"], 0x0029)
self.assertEqual(evidence["return_chord_behavior"]["tested_layers"], list(range(8)))
self.assertTrue(evidence["return_chord_behavior"]["chord_generated_no_keyboard_key"])
self.assertTrue(evidence["return_chord_behavior"]["returned_to_layer_zero"])
```

Keep every existing identity, three-HID-interface, OAI protocol, Vial encoder
and manifest/hash assertion unchanged.

- [ ] **Step 2: Run the release contract and observe the red evidence state**

Run:

```bash
python3 -m unittest firmware.tests.codex_oai.test_phase3_contract -v
```

Expected: FAIL because the checked-in evidence belongs to the prior UF2 and
does not yet contain `return_chord_behavior`.

- [ ] **Step 3: Build all targets in a clean pinned QMK worktree**

Create or select a disposable worktree at exact commit
`00fc4627cd038ac9b7e9b8bf2b40b50e9e88aecb` with every required submodule.
Do not use `/Users/hirlu/Documents/Projects/vial-qmk`, which contains unrelated
user changes. From the AgentPad13 worktree, run:

```bash
python3 firmware/tools/build_codex_oai.py --qmk-home /private/tmp/agentpad13-phase3-layer-rgb/qmk --clean
```

Expected: the build tool validates the pinned source and its four owned QMK
patches, compiles `default`, `vial`, `codex_oai` and `vial_oai`, atomically
publishes the local candidate and prints `flash operations 0`.

- [ ] **Step 4: Run emulation and static artifact verification**

Run these exact commands after the build:

```bash
cd firmware/tests/emulator && npm run smoke:default && npm run smoke:vial && npm run smoke:codex-oai && npm run smoke:vial-oai && npm run smoke:dual-oai-vial
cd ../../..
python3 firmware/tools/verify_codex_oai_artifact.py --profile dual --uf2 release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2 --elf /private/tmp/agentpad13-phase3-layer-rgb/qmk/.build/loudest_micro_vial_oai.elf --evidence firmware/evidence/dual-oai-vial-emulator.json --output firmware/evidence/dual-oai-vial-current-manifest.json
```

Expected: all five emulator smokes pass; the dual evidence includes the chord
object; the verifier records the same three HID interfaces, VID/PID, report
sizes and OAI Report ID 6 as before.

- [ ] **Step 5: Update generated hashes and tester-facing checks**

Run these read-only value commands:

```bash
sha256sum release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2 release/firmware/prebuilt/agentpad13_oai_vial_dual.vial
wc -c release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2 release/firmware/prebuilt/agentpad13_oai_vial_dual.vial
```

Replace every prior dual-UF2 size and SHA-256 in `release/MANIFEST.md`,
`firmware/BUILD.md` and `docs/dual-oai-vial-physical-runbook.md` with those
exact command outputs. Preserve the recovery artifact values unchanged.

Add these physical rows to the runbook, all marked pending until separately
authorized: from layers 1 through 7 press SW1+SW4 and confirm layer 0; confirm
no assigned SW1/SW4 action runs during the chord; verify the one-second destination
colour flash; verify Codex task/status output after returning to layer 0; and
verify a VialRGB effect resumes after the same transition on layers 1–7.

The runbook must retain the literal BOOTSEL authorization gate and must not
claim physical validation.

- [ ] **Step 6: Run the full non-hardware verification matrix**

Run:

```bash
python3 -m unittest discover -s firmware/tests/codex_oai -p 'test_*.py' -v
python3 -B manifest_selfverify.py
cd firmware/tests/emulator && npm run smoke:default && npm run smoke:vial && npm run smoke:codex-oai && npm run smoke:vial-oai && npm run smoke:dual-oai-vial
cd ../../..
git diff --check
git status --short
```

Expected: every test and smoke passes, the manifest self-check passes and the
status lists only the planned firmware, tests, generated candidate, evidence
and documentation. No command flashes, resets, enumerates or pushes hardware.

- [ ] **Step 7: Commit the local candidate without publishing it remotely**

```bash
git add firmware/loudest_micro/keymaps firmware/tests/codex_oai firmware/tests/emulator release/firmware/prebuilt/agentpad13_oai_vial_dual.uf2 release/firmware/prebuilt/agentpad13_oai_vial_dual.vial firmware/evidence/dual-oai-vial-emulator.json firmware/evidence/dual-oai-vial-current-manifest.json docs/dual-oai-vial-physical-runbook.md firmware/BUILD.md release/MANIFEST.md
git commit -m "build: refresh OAI Vial layer control candidate"
```

Hand the user the exact UF2 path, paired `.vial` path, generated hash and
runbook. Stop for their explicit physical-flash authorization; do not push or
merge this branch.

## Self-review

- Spec coverage: Task 1 implements physical detection, 80 ms timing,
  suppression and ordinary replay; Task 2 makes it a RAM-only global layer-0
  return; Task 3 implements all palette and one-second timing requirements; Task
  4 applies RGB ownership, calibration priority and runtime remap proof; Task
  5 rebuilds, verifies and records the local delivery package.
- Compatibility: every task preserves the three HID interfaces, OAI framing,
  Vial-owned EEPROM and Direct OAI conditional compilation. No task adds a
  keycode combo, USB interface, report format or physical operation.
- Consistency: `physical_oai_return_matrix_scan`,
  `return_to_codex_layer`, `codex_led_start_layer_transition` and
  `codex_led_render_layer_transition` use the same names and signatures in
  their producer and consumer tasks.
- Unresolved-marker scan: generated artifact values are obtained by the
  explicit commands in Task 5 before documentation is changed.
