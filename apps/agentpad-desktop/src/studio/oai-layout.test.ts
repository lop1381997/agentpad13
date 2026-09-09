import { describe, expect, it } from "vitest";
import { arrangeOai, swapOai, OAI_VERTICAL, OAI_HORIZONTAL } from "./oai-layout";
import { emptyDraftState } from "./editor-state";
import type { EditorSnapshot } from "../model";

const snapshot: EditorSnapshot = {
  layers: Array.from({length:8}, (_,layer) => Array.from({length:4}, (_,r) =>
    Array.from({length:4}, (_,c) => layer === 0 ? 0x7e02+r*4+c : 0x29))),
  encoders: [], unlockStatus:{unlocked:false,in_progress:false,required_keys:[]},
};
describe("coupled OAI layout", () => {
  it("moves the agent and displaced action together from SW1 to SW7", () => {
    const next = swapOai(snapshot, emptyDraftState(), 0, 6);
    expect(next.keyChanges).toEqual([
      {layer:0,row:0,column:0,keycode:0x7e08},
      {layer:0,row:1,column:2,keycode:0x7e02},
    ]);
    expect(swapOai(snapshot, next, 0, 6).keyChanges).toEqual([]);
  });
  it("places agents down columns and keeps changes scoped to L0 SW1–SW13", () => {
    const next = arrangeOai(snapshot, emptyDraftState(), OAI_VERTICAL);
    expect(next.keyChanges).toContainEqual({layer:0,row:1,column:0,keycode:0x7e03});
    expect(next.keyChanges.every(c=>c.layer===0 && c.row<3)).toBe(true);
    expect(arrangeOai(snapshot,next,OAI_HORIZONTAL).keyChanges).toEqual([]);
  });
  it("rejects duplicate and out-of-range destinations", () => {
    expect(()=>arrangeOai(snapshot,emptyDraftState(),Array(13).fill(0))).toThrow();
    expect(()=>swapOai(snapshot,emptyDraftState(),0,13)).toThrow();
  });
});
