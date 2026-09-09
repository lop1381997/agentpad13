import type { EditorSnapshot } from "../model";
import { stageKeyChange, type DraftState } from "./editor-state";

export const OAI_HORIZONTAL = Array.from({ length: 13 }, (_, i) => i);
export const OAI_VERTICAL = [0, 4, 8, 1, 5, 9, 2, 6, 10, 3, 7, 11, 12];

export function arrangeOai(snapshot: EditorSnapshot, draft: DraftState, order: number[]): DraftState {
  if (order.length !== 13 || new Set(order).size !== 13 ||
      order.some((position) => !Number.isInteger(position) || position < 0 || position > 12)) {
    throw new Error("La distribución debe incluir SW1–SW13 una vez cada una.");
  }
  return order.reduce((next, position, action) => stageKeyChange(next, {
    layer: 0, row: Math.floor(position / 4), column: position % 4, keycode: 0x7e02 + action,
  }, snapshot.layers[0][Math.floor(position / 4)][position % 4]), draft);
}

export function swapOai(snapshot: EditorSnapshot, draft: DraftState, from: number, to: number): DraftState {
  if ([from, to].some((position) => !Number.isInteger(position) || position < 0 || position > 12)) {
    throw new Error("Solo se pueden intercambiar SW1–SW13.");
  }
  const read = (position: number) => draft.keyChanges.find(
    (change) => change.layer === 0 && change.row === Math.floor(position / 4) && change.column === position % 4,
  )?.keycode ?? snapshot.layers[0][Math.floor(position / 4)][position % 4];
  const codes = [read(to), read(from)];
  return [from, to].reduce((next, position, index) => stageKeyChange(next, {
    layer: 0, row: Math.floor(position / 4), column: position % 4, keycode: codes[index],
  }, snapshot.layers[0][Math.floor(position / 4)][position % 4]), draft);
}
