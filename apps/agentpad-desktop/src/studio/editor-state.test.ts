import { describe, expect, it } from "vitest";

import {
  emptyDraftHistory,
  emptyDraftState,
  pushDraft,
  redoDraft,
  stageEncoderChange,
  stageKeyChange,
  stageLightingChange,
  summarizeChanges,
  undoDraft,
} from "./editor-state";
import type { EditorSnapshot, VialRgbState } from "../model";

const lighting: VialRgbState = {
  mode: 2,
  speed: 86,
  hue: 120,
  saturation: 200,
  brightness: 70,
};

const snapshot: EditorSnapshot = {
  layers: Array.from({ length: 8 }, () =>
    Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0x0029)),
  ),
  encoders: Array.from({ length: 8 }, (_, layer) => ({
    layer,
    counter_clockwise: 0x00aa,
    clockwise: 0x00a9,
  })),
  unlockStatus: { unlocked: true, in_progress: false, required_keys: [] },
  lighting,
};

describe("Studio draft state", () => {
  it("removes a key draft when the selected action matches the device value", () => {
    const staged = stageKeyChange(
      emptyDraftState(),
      { layer: 2, row: 1, column: 3, keycode: 0x7e07 },
      0x0029,
    );

    const reverted = stageKeyChange(
      staged,
      { layer: 2, row: 1, column: 3, keycode: 0x0029 },
      0x0029,
    );

    expect(reverted.keyChanges).toEqual([]);
  });

  it("undoes and redoes an encoder assignment without mutating the device snapshot", () => {
    const history = pushDraft(
      emptyDraftHistory(),
      stageEncoderChange(
        emptyDraftState(),
        { layer: 3, direction: "clockwise", keycode: 0x5cc3 },
        0x00a9,
      ),
    );

    const undone = undoDraft(history);
    const redone = redoDraft(undone);

    expect(undone.present.encoderChanges).toEqual([]);
    expect(redone.present.encoderChanges).toEqual([
      { layer: 3, direction: "clockwise", keycode: 0x5cc3 },
    ]);
    expect(snapshot.encoders[3].clockwise).toBe(0x00a9);
  });

  it("labels VialRGB changes as global rather than layer-local", () => {
    const draft = stageLightingChange(
      emptyDraftState(),
      { ...lighting, brightness: 82 },
      lighting,
    );

    expect(summarizeChanges(snapshot, draft)).toContainEqual(
      expect.objectContaining({
        id: "lighting",
        scope: "lighting",
        label: "VialRGB global",
        before: "Brillo 70",
        after: "Brillo 82",
      }),
    );
  });
});
