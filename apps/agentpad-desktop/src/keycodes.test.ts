import { describe, expect, it } from "vitest";

import {
  customKeycodesFromDefinition,
  physicalControlsFromDefinition,
} from "./keycodes";

describe("AgentPad13 keycode catalogue", () => {
  it("derives AgentPad actions from the canonical Vial definition", () => {
    const custom = customKeycodesFromDefinition();

    expect(custom[0]).toMatchObject({ code: 0x7e00, label: "JSMODE" });
    expect(custom[2]).toMatchObject({ code: 0x7e02, label: "AG00" });
    expect(custom.at(-1)).toMatchObject({ code: 0x7e13, label: "LAYER" });
  });

  it("preserves all fifteen physical controls and their special hardware roles", () => {
    const controls = physicalControlsFromDefinition();

    expect(controls).toHaveLength(15);
    expect(controls).toContainEqual(
      expect.objectContaining({ row: 3, column: 0, width: 2, label: "SW13 · 2U" }),
    );
    expect(controls).toContainEqual(
      expect.objectContaining({ row: 3, column: 1, kind: "encoderPress" }),
    );
    expect(controls).toContainEqual(
      expect.objectContaining({ row: 3, column: 2, kind: "touch" }),
    );
  });
});
