import { describe, expect, it } from "vitest";

import definition from "../../../firmware/loudest_micro/keymaps/vial_oai/vial.json";

describe("AgentPad desktop project contract", () => {
  it("imports the canonical eight-layer AgentPad definition", () => {
    expect(definition.vendorId).toBe("0x303A");
    expect(definition.productId).toBe("0x8360");
    expect(definition.matrix).toEqual({ rows: 4, cols: 4 });
    expect(definition.customKeycodes).toHaveLength(20);
  });
});
