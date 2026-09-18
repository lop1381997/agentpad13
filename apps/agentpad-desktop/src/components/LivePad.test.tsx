import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LivePad } from "./LivePad";
import type { LiveLedFrame, PhysicalControl } from "../model";

const controls: PhysicalControl[] = [
  { id: "key-0-0", label: "SW1", kind: "key", row: 0, column: 0, width: 1 },
  { id: "key-1-2", label: "SW7", kind: "key", row: 1, column: 2, width: 1 },
  { id: "key-3-0", label: "SW13 · 2U", kind: "key", row: 3, column: 0, width: 2 },
  { id: "key-3-1", label: "Encoder press", kind: "encoderPress", row: 3, column: 1, width: 1 },
  { id: "key-3-2", label: "TP5 touch", kind: "touch", row: 3, column: 2, width: 1 },
];

const frame: LiveLedFrame = {
  sequence: 12,
  active_layer: 0,
  flags: 1,
  leds: Array.from({ length: 24 }, (_, index) => ({
    red: index === 0 ? 255 : 0,
    green: index === 6 ? 255 : 0,
    blue: index === 13 ? 255 : 0,
  })),
};

describe("LivePad", () => {
  afterEach(cleanup);

  it("renders the physical 24-LED frame, including L0, and selects without sending an action", () => {
    const onSelectControl = vi.fn();
    render(
      <LivePad
        activeLayer={0}
        controls={controls}
        frame={frame}
        freshness="fresh"
        mode="live"
        selectedId="key-0-0"
        onSelectControl={onSelectControl}
      />,
    );

    expect(screen.getByText("L0 · OAI / Codex")).toBeVisible();
    expect(screen.getByLabelText("LED periférico 14")).toHaveStyle({ backgroundColor: "rgb(0, 0, 255)" });
    expect(screen.getByRole("button", { name: "SW7" })).toHaveStyle({ backgroundColor: "rgb(0, 255, 0)" });

    fireEvent.click(screen.getByRole("button", { name: "SW7" }));
    expect(onSelectControl).toHaveBeenCalledWith(controls[1]);
  });

  it("keeps the last visual frame dimmed while synchronizing and labels preview safely", () => {
    render(
      <LivePad
        activeLayer={4}
        controls={controls}
        frame={frame}
        freshness="stale"
        mode="preview"
        onSelectControl={vi.fn()}
      />,
    );

    expect(screen.getByText("Vista previa · firmware sin monitor en tiempo real")).toBeVisible();
    expect(screen.getByLabelText("Estado de LEDs del teclado virtual")).toHaveClass("is-stale");
    expect(screen.getByText("L0 · OAI / Codex")).toBeVisible();
  });
});
