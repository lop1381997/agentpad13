import { describe, expect, it } from "vitest";

import { parseMacroSlots, replaceTextMacro } from "./macro-text";

function macroBuffer(entries: number[][], capacity = 96): number[] {
  const bytes = Array.from({ length: capacity }, () => 0);
  let offset = 0;
  for (const entry of entries) {
    bytes.splice(offset, entry.length, ...entry);
    offset += entry.length + 1;
  }
  bytes[capacity - 1] = 0;
  return bytes;
}

describe("macro text codec", () => {
  it("recognises printable text slots and preserves advanced Vial macro bytes", () => {
    const bytes = macroBuffer([
      [...new TextEncoder().encode("hello")],
      [...new TextEncoder().encode("world")],
      [0x01, 0x02, 0x29],
    ]);

    const slots = parseMacroSlots(bytes, 16);

    expect(slots[0]).toMatchObject({ index: 0, editable: true, text: "hello" });
    expect(slots[1]).toMatchObject({ index: 1, editable: true, text: "world" });
    expect(slots[2]).toMatchObject({ index: 2, editable: false, rawHex: "010229" });
  });

  it("replaces one text slot without touching raw slots and keeps the valid byte clear", () => {
    const bytes = macroBuffer([
      [...new TextEncoder().encode("hello")],
      [...new TextEncoder().encode("world")],
      [0x01, 0x02, 0x29],
    ]);

    const next = replaceTextMacro(bytes, 1, "review", 16);
    const slots = parseMacroSlots(next, 16);

    expect(slots[0]).toMatchObject({ editable: true, text: "hello" });
    expect(slots[1]).toMatchObject({ editable: true, text: "review" });
    expect(slots[2]).toMatchObject({ editable: false, rawHex: "010229" });
    expect(next.at(-1)).toBe(0);
  });

  it("rejects non-ASCII or NUL text before it can be written to a macro buffer", () => {
    const bytes = macroBuffer([[...new TextEncoder().encode("hello")]]);

    expect(() => replaceTextMacro(bytes, 0, "hola\u0000mundo", 16)).toThrow(/NUL/i);
    expect(() => replaceTextMacro(bytes, 0, "mañana", 16)).toThrow(/ASCII/i);
  });
});
