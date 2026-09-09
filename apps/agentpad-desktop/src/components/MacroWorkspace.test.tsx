import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MacroWorkspace } from "./MacroWorkspace";
import { parseMacroSlots } from "../studio/macro-text";

function macroBuffer(entries: number[][], capacity = 96): number[] {
  const bytes = Array.from({ length: capacity }, () => 0);
  let offset = 0;
  for (const entry of entries) {
    bytes.splice(offset, entry.length, ...entry);
    offset += entry.length + 1;
  }
  return bytes;
}

describe("MacroWorkspace", () => {
  it("edits a printable slot locally and preserves advanced slots as read-only", () => {
    const onStage = vi.fn();
    const onSelectSlot = vi.fn();
    const buffer = {
      count: 16,
      bytes: macroBuffer([
        [...new TextEncoder().encode("hello")],
        [...new TextEncoder().encode("world")],
        [0x01, 0x02, 0x29],
      ]),
    };

    const { rerender } = render(
      <MacroWorkspace
        buffer={buffer}
        selectedSlot={1}
        onSelectSlot={onSelectSlot}
        onStage={onStage}
      />,
    );

    expect(screen.getByRole("heading", { name: /Macros y acciones/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /MACRO01/i })).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Texto de la macro/i), { target: { value: "review" } });
    expect(parseMacroSlots(onStage.mock.calls.at(-1)?.[0] ?? [], 16)[1]).toMatchObject({
      editable: true,
      text: "review",
    });

    rerender(
      <MacroWorkspace
        buffer={buffer}
        selectedSlot={2}
        onSelectSlot={onSelectSlot}
        onStage={onStage}
      />,
    );
    expect(screen.getByRole("heading", { name: /Secuencia avanzada/i })).toBeVisible();
    expect(screen.queryByLabelText(/Texto de la macro/i)).toBeNull();
  });
});
