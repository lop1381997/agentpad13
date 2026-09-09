import { keycodeHex } from "../model";
import type {
  AgentPadProfile,
  EditorSnapshot,
  EncoderBinding,
  VialRgbState,
} from "../model";
import type { ChangeSummary } from "./editor-state";

export const PROFILE_STORAGE_KEY = "agentpad13.studio.profiles.v1";

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(label + " debe ser un objeto.");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail(label + " debe ser texto no vacío.");
  }
  return value;
}

function integer(value: unknown, label: string, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    return fail(label + " debe ser un entero válido.");
  }
  return value as number;
}

function layers(value: unknown): number[][][] {
  if (!Array.isArray(value) || value.length !== 8) {
    return fail("El perfil debe contener exactamente ocho capas.");
  }
  return value.map((layer, layerIndex) => {
    if (!Array.isArray(layer) || layer.length !== 4) {
      return fail("La capa " + layerIndex + " debe tener cuatro filas.");
    }
    return layer.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== 4) {
        return fail("La fila " + layerIndex + "," + rowIndex + " debe tener cuatro teclas.");
      }
      return row.map((keycode, columnIndex) =>
        integer(keycode, "La tecla " + layerIndex + "," + rowIndex + "," + columnIndex, 0xffff),
      );
    });
  });
}

function encoders(value: unknown): EncoderBinding[] {
  if (!Array.isArray(value) || value.length !== 8) {
    return fail("El perfil debe contener los ocho enlaces del encoder.");
  }
  return value.map((entry, layer) => {
    const data = record(entry, "El enlace del encoder");
    if (integer(data.layer, "La capa del encoder", 7) !== layer) {
      return fail("Los enlaces del encoder deben estar ordenados por capa.");
    }
    return {
      layer,
      counter_clockwise: integer(data.counter_clockwise, "Encoder antihorario", 0xffff),
      clockwise: integer(data.clockwise, "Encoder horario", 0xffff),
    };
  });
}

function lighting(value: unknown): VialRgbState | undefined {
  if (value === undefined) {
    return undefined;
  }
  const data = record(value, "La iluminación");
  return {
    mode: integer(data.mode, "Modo VialRGB", 0xffff),
    speed: integer(data.speed, "Velocidad VialRGB", 0xff),
    hue: integer(data.hue, "Tono VialRGB", 0xff),
    saturation: integer(data.saturation, "Saturación VialRGB", 0xff),
    brightness: integer(data.brightness, "Brillo VialRGB", 0xff),
  };
}

function macroBuffer(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    return fail("El buffer de macros debe contener bytes.");
  }
  const bytes = value.map((byte, index) => integer(byte, "Macro byte " + index, 0xff));
  if (bytes.at(-1) !== 0) {
    return fail("El último byte del buffer de macros debe ser cero.");
  }
  return bytes;
}

export function validateProfile(value: unknown): AgentPadProfile {
  const data = record(value, "El perfil");
  if (data.schemaVersion !== 1) {
    return fail("La versión del perfil no es compatible.");
  }

  const device = record(data.device, "El dispositivo del perfil");
  if (
    device.vendorId !== "303A" ||
    device.productId !== "8360" ||
    device.matrixRows !== 4 ||
    device.matrixColumns !== 4 ||
    device.layerCount !== 8
  ) {
    return fail("El perfil no corresponde al contrato AgentPad13 303A:8360.");
  }

  if (!Array.isArray(data.layerNames) || data.layerNames.length !== 8) {
    return fail("El perfil debe nombrar sus ocho capas.");
  }

  return {
    schemaVersion: 1,
    device: {
      vendorId: "303A",
      productId: "8360",
      matrixRows: 4,
      matrixColumns: 4,
      layerCount: 8,
    },
    id: string(data.id, "El identificador"),
    name: string(data.name, "El nombre"),
    createdAt: string(data.createdAt, "La fecha de creación"),
    updatedAt: string(data.updatedAt, "La fecha de actualización"),
    layers: layers(data.layers),
    encoders: encoders(data.encoders),
    lighting: lighting(data.lighting),
    macroBuffer: macroBuffer(data.macroBuffer),
    layerNames: data.layerNames.map((name, index) => string(name, "El nombre de capa " + index)),
  };
}

export function parseImportedProfile(input: string): AgentPadProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return fail("El archivo no contiene JSON válido.");
  }
  return validateProfile(parsed);
}

export function listProfiles(storage: Storage): AgentPadProfile[] {
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      try {
        return [validateProfile(entry)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function saveProfile(storage: Storage, profile: AgentPadProfile): AgentPadProfile[] {
  const nextProfile = validateProfile(profile);
  const current = listProfiles(storage).filter((entry) => entry.id !== nextProfile.id);
  const next = [nextProfile, ...current];
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeProfile(storage: Storage, id: string): AgentPadProfile[] {
  const next = listProfiles(storage).filter((profile) => profile.id !== id);
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
  return next;
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

export function compareProfile(snapshot: EditorSnapshot, profile: AgentPadProfile, currentMacros?: number[]): ChangeSummary[] {
  const validated = validateProfile(profile);
  const changes: ChangeSummary[] = [];

  for (let layer = 0; layer < 8; layer += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const before = snapshot.layers[layer][row][column];
        const after = validated.layers[layer][row][column];
        if (before !== after) {
          changes.push({
            id: "key:" + layer + ":" + row + ":" + column,
            scope: "key",
            label: "Capa " + layer + " · [" + row + ", " + column + "]",
            before: keycodeHex(before),
            after: keycodeHex(after),
          });
        }
      }
    }
  }

  for (const expected of validated.encoders) {
    const actual = snapshot.encoders.find((binding) => binding.layer === expected.layer);
    if (!actual || actual.counter_clockwise !== expected.counter_clockwise) {
      changes.push({
        id: "encoder:" + expected.layer + ":counterClockwise",
        scope: "encoder",
        label: "Capa " + expected.layer + " · Encoder CCW",
        before: keycodeHex(actual?.counter_clockwise ?? 0),
        after: keycodeHex(expected.counter_clockwise),
      });
    }
    if (!actual || actual.clockwise !== expected.clockwise) {
      changes.push({
        id: "encoder:" + expected.layer + ":clockwise",
        scope: "encoder",
        label: "Capa " + expected.layer + " · Encoder CW",
        before: keycodeHex(actual?.clockwise ?? 0),
        after: keycodeHex(expected.clockwise),
      });
    }
  }

  if (validated.lighting && snapshot.lighting && !sameLighting(validated.lighting, snapshot.lighting)) {
    changes.push({
      id: "lighting",
      scope: "lighting",
      label: "VialRGB global",
      before: "Brillo " + snapshot.lighting.brightness,
      after: "Brillo " + validated.lighting.brightness,
    });
  }

  if (validated.macroBuffer && (!currentMacros || validated.macroBuffer.length !== currentMacros.length || validated.macroBuffer.some((byte, index) => byte !== currentMacros[index]))) {
    changes.push({
      id: "macro",
      scope: "macro",
      label: "Macros Vial",
      before: "Buffer actual",
      after: "Perfil preparado",
    });
  }

  return changes;
}
