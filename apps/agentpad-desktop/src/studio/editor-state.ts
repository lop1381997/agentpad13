import { keycodeHex } from "../model";
import type {
  EditorSnapshot,
  EncoderChange,
  KeyChange,
  VialRgbState,
} from "../model";

export type ChangeSummary = {
  id: string;
  scope: "key" | "encoder" | "lighting" | "macro";
  label: string;
  before: string;
  after: string;
};

export type DraftState = {
  keyChanges: KeyChange[];
  encoderChanges: EncoderChange[];
  lighting?: VialRgbState;
  macroBuffer?: number[];
};

export type DraftHistory<T> = {
  present: T;
  undo: T[];
  redo: T[];
};

export function emptyDraftState(): DraftState {
  return { keyChanges: [], encoderChanges: [] };
}

export function emptyDraftHistory(): DraftHistory<DraftState> {
  return { present: emptyDraftState(), undo: [], redo: [] };
}

function copyLighting(lighting: VialRgbState | undefined): VialRgbState | undefined {
  return lighting ? { ...lighting } : undefined;
}

export function copyDraftState(state: DraftState): DraftState {
  return {
    keyChanges: state.keyChanges.map((change) => ({ ...change })),
    encoderChanges: state.encoderChanges.map((change) => ({ ...change })),
    lighting: copyLighting(state.lighting),
    macroBuffer: state.macroBuffer ? [...state.macroBuffer] : undefined,
  };
}

function sameLighting(left: VialRgbState, right: VialRgbState): boolean {
  return (
    left.mode === right.mode &&
    left.speed === right.speed &&
    left.hue === right.hue &&
    left.saturation === right.saturation &&
    left.brightness === right.brightness
  );
}

function sameDraft(left: DraftState, right: DraftState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function stageKeyChange(state: DraftState, change: KeyChange, original: number): DraftState {
  const keyChanges = state.keyChanges.filter(
    (current) =>
      current.layer !== change.layer ||
      current.row !== change.row ||
      current.column !== change.column,
  );

  if (change.keycode !== original) {
    keyChanges.push({ ...change });
  }

  return { ...copyDraftState(state), keyChanges };
}

export function stageEncoderChange(
  state: DraftState,
  change: EncoderChange,
  original: number,
): DraftState {
  const encoderChanges = state.encoderChanges.filter(
    (current) => current.layer !== change.layer || current.direction !== change.direction,
  );

  if (change.keycode !== original) {
    encoderChanges.push({ ...change });
  }

  return { ...copyDraftState(state), encoderChanges };
}

export function stageLightingChange(
  state: DraftState,
  next: VialRgbState,
  original: VialRgbState,
): DraftState {
  return {
    ...copyDraftState(state),
    lighting: sameLighting(next, original) ? undefined : { ...next },
  };
}

export function pushDraft(
  history: DraftHistory<DraftState>,
  next: DraftState,
): DraftHistory<DraftState> {
  if (sameDraft(history.present, next)) {
    return history;
  }

  return {
    present: copyDraftState(next),
    undo: [...history.undo, copyDraftState(history.present)],
    redo: [],
  };
}

export function undoDraft(history: DraftHistory<DraftState>): DraftHistory<DraftState> {
  const previous = history.undo.at(-1);
  if (!previous) {
    return history;
  }

  return {
    present: copyDraftState(previous),
    undo: history.undo.slice(0, -1).map(copyDraftState),
    redo: [copyDraftState(history.present), ...history.redo.map(copyDraftState)],
  };
}

export function redoDraft(history: DraftHistory<DraftState>): DraftHistory<DraftState> {
  const next = history.redo.at(0);
  if (!next) {
    return history;
  }

  return {
    present: copyDraftState(next),
    undo: [...history.undo.map(copyDraftState), copyDraftState(history.present)],
    redo: history.redo.slice(1).map(copyDraftState),
  };
}

export function summarizeChanges(snapshot: EditorSnapshot, state: DraftState): ChangeSummary[] {
  const summaries: ChangeSummary[] = state.keyChanges.map((change) => ({
    id: `key:${change.layer}:${change.row}:${change.column}`,
    scope: "key",
    label: `Capa ${change.layer} · [${change.row}, ${change.column}]`,
    before: keycodeHex(snapshot.layers[change.layer][change.row][change.column]),
    after: keycodeHex(change.keycode),
  }));

  summaries.push(
    ...state.encoderChanges.map((change) => {
      const binding = snapshot.encoders.find((current) => current.layer === change.layer);
      const original =
        change.direction === "clockwise" ? binding?.clockwise ?? 0 : binding?.counter_clockwise ?? 0;
      return {
        id: `encoder:${change.layer}:${change.direction}`,
        scope: "encoder" as const,
        label: `Capa ${change.layer} · Encoder ${change.direction === "clockwise" ? "CW" : "CCW"}`,
        before: keycodeHex(original),
        after: keycodeHex(change.keycode),
      };
    }),
  );

  if (state.lighting && snapshot.lighting) {
    summaries.push({
      id: "lighting",
      scope: "lighting",
      label: "VialRGB global",
      before: `Brillo ${snapshot.lighting.brightness}`,
      after: `Brillo ${state.lighting.brightness}`,
    });
  }

  if (state.macroBuffer) {
    summaries.push({
      id: "macro",
      scope: "macro",
      label: "Macros Vial",
      before: "Buffer actual",
      after: "Borrador actualizado",
    });
  }

  return summaries;
}
