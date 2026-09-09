import { describe, expect, it } from "vitest";

import {
  compareProfile,
  listProfiles,
  parseImportedProfile,
  saveProfile,
} from "./profile-store";
import type { AgentPadProfile, EditorSnapshot } from "../model";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function layers(value = 0x0029): number[][][] {
  return Array.from({ length: 8 }, () =>
    Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => value)),
  );
}

function profile(): AgentPadProfile {
  return {
    schemaVersion: 1,
    device: {
      vendorId: "303A",
      productId: "8360",
      matrixRows: 4,
      matrixColumns: 4,
      layerCount: 8,
    },
    id: "codex-principal",
    name: "Codex Principal",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    layers: layers(),
    encoders: Array.from({ length: 8 }, (_, layer) => ({
      layer,
      counter_clockwise: 0x00ea,
      clockwise: 0x00e9,
    })),
    layerNames: ["Codex / OAI", "Trabajo", "Navegación", "Iluminación", "Personal", "Personal", "Personal", "Personal"],
  };
}

function snapshot(): EditorSnapshot {
  return {
    layers: layers(),
    encoders: Array.from({ length: 8 }, (_, layer) => ({
      layer,
      counter_clockwise: 0x00ea,
      clockwise: 0x00e9,
    })),
    unlockStatus: { unlocked: true, in_progress: false, required_keys: [] },
  };
}

describe("profile store", () => {
  it("recovers valid profiles when one stored entry is corrupt", () => {
    const storage = memoryStorage();
    storage.setItem("agentpad13.studio.profiles.v1", JSON.stringify([profile(), { schemaVersion: 99 }]));
    expect(listProfiles(storage)).toEqual([profile()]);
  });

  it("does not crash startup when storage access is denied", () => {
    const storage = memoryStorage();
    storage.getItem = () => { throw new Error("Storage denied"); };
    expect(listProfiles(storage)).toEqual([]);
  });
  it("does not report identical macro buffers as changes", () => {
    const next = profile();
    next.macroBuffer = Array(96).fill(0);
    expect(compareProfile(snapshot(), next, [...next.macroBuffer])).toEqual([]);
    const changed = [...next.macroBuffer];
    changed[0] = 65;
    expect(compareProfile(snapshot(), next, changed)).toEqual([
      expect.objectContaining({ scope: "macro" }),
    ]);
  });
  it("stores profiles under the versioned local key and round-trips all eight layers", () => {
    const storage = memoryStorage();
    const stored = saveProfile(storage, profile());

    expect(storage.getItem("agentpad13.studio.profiles.v1")).not.toBeNull();
    expect(stored).toEqual([profile()]);
    expect(listProfiles(storage)).toEqual([profile()]);
    expect(parseImportedProfile(JSON.stringify(profile()))).toEqual(profile());
  });

  it("rejects an imported profile for a different device contract", () => {
    const invalid = profile();
    (invalid.device as { vendorId: string }).vendorId = "FFFF";

    expect(() => parseImportedProfile(JSON.stringify(invalid))).toThrow(/303A:8360/i);
  });

  it("compares only controls that differ from the connected Vial snapshot", () => {
    const next = profile();
    next.layers[2][1][3] = 0x7e07;
    next.encoders[4].clockwise = 0x5cc3;

    expect(compareProfile(snapshot(), next)).toEqual([
      expect.objectContaining({
        scope: "key",
        label: "Capa 2 · [1, 3]",
        before: "0x0029",
        after: "0x7E07",
      }),
      expect.objectContaining({
        scope: "encoder",
        label: "Capa 4 · Encoder CW",
        before: "0x00E9",
        after: "0x5CC3",
      }),
    ]);
  });
});
