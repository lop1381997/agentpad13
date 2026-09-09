import { agentpadDefinition, type LayoutToken } from "./device-definition";
import type { KeycodeOption, PhysicalControl } from "./model";

export const CUSTOM_KEYCODE_BASE = 0x7e00;

const CURATED_KEYCODES: KeycodeOption[] = [
  { code: 0x0000, label: "NO", title: "No key action", category: "Basic" },
  { code: 0x0001, label: "TRNS", title: "Transparent to the lower layer", category: "Basic" },
  ...Array.from({ length: 26 }, (_, index) => ({
    code: 0x0004 + index,
    label: String.fromCharCode(65 + index),
    title: String.fromCharCode(65 + index),
    category: "Basic" as const,
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    code: 0x001e + index,
    label: String((index + 1) % 10),
    title: String((index + 1) % 10),
    category: "Basic" as const,
  })),
  ...Array.from({ length: 12 }, (_, index) => ({
    code: 0x003a + index,
    label: "F" + (index + 1),
    title: "Function " + (index + 1),
    category: "Basic" as const,
  })),
  ...Array.from({ length: 12 }, (_, index) => ({
    code: 0x0068 + index,
    label: "F" + (index + 13),
    title: "Function " + (index + 13),
    category: "Basic" as const,
  })),
  { code: 0x002a, label: "Backspace", title: "Backspace", category: "Basic" },
  { code: 0x002b, label: "Tab", title: "Tab", category: "Basic" },
  { code: 0x0039, label: "Caps Lock", title: "Caps Lock", category: "Basic" },
  { code: 0x0049, label: "Insert", title: "Insert", category: "Navigation" },
  { code: 0x004c, label: "Delete", title: "Delete", category: "Navigation" },
  { code: 0x00e4, label: "RCTL", title: "Right Control", category: "Modifiers" },
  { code: 0x00e5, label: "RSFT", title: "Right Shift", category: "Modifiers" },
  { code: 0x00e6, label: "RALT", title: "Right Alt / AltGr", category: "Modifiers" },
  { code: 0x00e7, label: "RGUI", title: "Right GUI / Command", category: "Modifiers" },
  { code: 0x0028, label: "Enter", title: "Enter", category: "Basic" },
  { code: 0x0029, label: "Esc", title: "Escape", category: "Basic" },
  { code: 0x002c, label: "Space", title: "Space", category: "Basic" },
  { code: 0x00e0, label: "LCTL", title: "Left Control", category: "Modifiers" },
  { code: 0x00e1, label: "LSFT", title: "Left Shift", category: "Modifiers" },
  { code: 0x00e2, label: "LALT", title: "Left Alt", category: "Modifiers" },
  { code: 0x00e3, label: "LGUI", title: "Left GUI / Command", category: "Modifiers" },
  { code: 0x004a, label: "Home", title: "Home", category: "Navigation" },
  { code: 0x004b, label: "PgUp", title: "Page Up", category: "Navigation" },
  { code: 0x004d, label: "End", title: "End", category: "Navigation" },
  { code: 0x004e, label: "PgDn", title: "Page Down", category: "Navigation" },
  { code: 0x004f, label: "Right", title: "Right Arrow", category: "Navigation" },
  { code: 0x0050, label: "Left", title: "Left Arrow", category: "Navigation" },
  { code: 0x0051, label: "Down", title: "Down Arrow", category: "Navigation" },
  { code: 0x0052, label: "Up", title: "Up Arrow", category: "Navigation" },
  { code: 0x00a8, label: "Mute", title: "Audio mute", category: "Media" },
  { code: 0x00a9, label: "Vol+", title: "Audio volume up", category: "Media" },
  { code: 0x00aa, label: "Vol−", title: "Audio volume down", category: "Media" },
  { code: 0x00ae, label: "Play", title: "Play / pause", category: "Media" },
  { code: 0x5000, label: "TO(0)", title: "Switch to layer 0", category: "Layers" },
  { code: 0x5001, label: "TO(1)", title: "Switch to layer 1", category: "Layers" },
  { code: 0x5002, label: "TO(2)", title: "Switch to layer 2", category: "Layers" },
  { code: 0x5003, label: "TO(3)", title: "Switch to layer 3", category: "Layers" },
  { code: 0x5004, label: "TO(4)", title: "Switch to layer 4", category: "Layers" },
  { code: 0x5005, label: "TO(5)", title: "Switch to layer 5", category: "Layers" },
  { code: 0x5006, label: "TO(6)", title: "Switch to layer 6", category: "Layers" },
  { code: 0x5007, label: "TO(7)", title: "Switch to layer 7", category: "Layers" },
  { code: 0x5cc2, label: "RGB Tog", title: "Toggle VialRGB", category: "VialRGB" },
  { code: 0x5cc3, label: "RGB Next", title: "Next VialRGB effect", category: "VialRGB" },
  { code: 0x5cc4, label: "RGB Prev", title: "Previous VialRGB effect", category: "VialRGB" },
  { code: 0x5cc5, label: "Hue+", title: "Increase VialRGB hue", category: "VialRGB" },
  { code: 0x5cc6, label: "Hue−", title: "Decrease VialRGB hue", category: "VialRGB" },
  { code: 0x5cc9, label: "Bright+", title: "Increase VialRGB brightness", category: "VialRGB" },
  { code: 0x5cca, label: "Bright−", title: "Decrease VialRGB brightness", category: "VialRGB" },
  ...Array.from({ length: 16 }, (_, index) => ({
    code: 0x5f12 + index,
    label: `MACRO${index.toString().padStart(2, "0")}`,
    title: `Run Vial dynamic macro ${index + 1}`,
    category: "Macros" as const,
  })),
];

function matrixAddress(token: string): { row: number; column: number } | undefined {
  const match = /^(\d+),(\d+)/.exec(token);
  if (!match) {
    return undefined;
  }

  return { row: Number(match[1]), column: Number(match[2]) };
}

function controlMetadata(row: number, column: number): Pick<PhysicalControl, "label" | "kind"> {
  if (row === 3 && column === 0) {
    return { label: "SW13 · 2U", kind: "key" };
  }
  if (row === 3 && column === 1) {
    return { label: "Encoder press", kind: "encoderPress" };
  }
  if (row === 3 && column === 2) {
    return { label: "TP5 touch", kind: "touch" };
  }

  return { label: `SW${row * 4 + column + 1}`, kind: "key" };
}

function controlsInKleRow(tokens: LayoutToken[]): PhysicalControl[] {
  let nextWidth = 1;
  const controls: PhysicalControl[] = [];

  for (const token of tokens) {
    if (typeof token !== "string") {
      if (token.w !== undefined) {
        nextWidth = token.w;
      }
      continue;
    }

    const position = matrixAddress(token);
    if (!position) {
      continue;
    }
    const metadata = controlMetadata(position.row, position.column);
    controls.push({
      id: `key-${position.row}-${position.column}`,
      ...position,
      ...metadata,
      width: nextWidth,
    });
    nextWidth = 1;
  }

  return controls;
}

export function physicalControlsFromDefinition(): PhysicalControl[] {
  return agentpadDefinition.layouts.keymap
    .slice(0, 4)
    .flatMap(controlsInKleRow);
}

export function customKeycodesFromDefinition(): KeycodeOption[] {
  return agentpadDefinition.customKeycodes.map((customKeycode, index) => ({
    code: CUSTOM_KEYCODE_BASE + index,
    label: customKeycode.shortName,
    title: customKeycode.title,
    category: "AgentPad" as const,
  }));
}

export function keycodeOptions(): KeycodeOption[] {
  return [...CURATED_KEYCODES, ...customKeycodesFromDefinition()];
}

export function keycodeLabel(keycode: number): string {
  return keycodeOptions().find((option) => option.code === keycode)?.label ?? `0x${keycode.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function parseAdvancedKeycode(value: string): number | undefined {
  const normalized = value.trim().replace(/^0x/i, "");
  if (!/^[\da-f]{4}$/i.test(normalized)) {
    return undefined;
  }

  return Number.parseInt(normalized, 16);
}
