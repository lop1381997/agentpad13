export type MatrixPosition = {
  row: number;
  column: number;
};

export type KeyChange = MatrixPosition & {
  layer: number;
  keycode: number;
};

export type EncoderDirection = "counterClockwise" | "clockwise";

export type StudioPage =
  | "home"
  | "keymap"
  | "lighting"
  | "macros"
  | "profiles"
  | "diagnostics"
  | "settings";

export type EncoderChange = {
  layer: number;
  direction: EncoderDirection;
  keycode: number;
};

export type EncoderBinding = {
  layer: number;
  counter_clockwise: number;
  clockwise: number;
};

export type MatrixPositionLabel = MatrixPosition;

export type UnlockStatus = {
  unlocked: boolean;
  in_progress: boolean;
  required_keys: MatrixPositionLabel[];
};

export type UnlockProgress = {
  unlocked: boolean;
  in_progress: boolean;
  remaining_polls: number;
};

export type VialRgbState = {
  mode: number;
  speed: number;
  hue: number;
  saturation: number;
  brightness: number;
};

export type VialRgbInfo = {
  protocol_version: number;
  maximum_brightness: number;
  supported_modes: number[];
};

export type VialRgbSnapshot = {
  info: VialRgbInfo;
  state: VialRgbState;
};

export type LedRgb = {
  red: number;
  green: number;
  blue: number;
};

export type LiveMonitorInfo = {
  major: number;
  minor: number;
  led_count: number;
  chunk_led_count: number;
  chunk_count: number;
  maximum_fps: number;
};

export type LiveLedFrame = {
  sequence: number;
  active_layer: number;
  flags: number;
  leds: LedRgb[];
};

export type MacroBuffer = {
  count: number;
  bytes: number[];
};

export type AgentPadProfile = {
  schemaVersion: 1;
  device: {
    vendorId: "303A";
    productId: "8360";
    matrixRows: 4;
    matrixColumns: 4;
    layerCount: 8;
  };
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layers: number[][][];
  encoders: EncoderBinding[];
  lighting?: VialRgbState;
  macroBuffer?: number[];
  layerNames: string[];
};

export type EditorSnapshot = {
  layers: number[][][];
  encoders: EncoderBinding[];
  unlockStatus: UnlockStatus;
  lighting?: VialRgbState;
};

export type DeviceSummary = {
  path: string;
  label: string;
};

export type KeycodeCategory =
  | "Basic"
  | "Modifiers"
  | "Navigation"
  | "Media"
  | "Layers"
  | "VialRGB"
  | "Macros"
  | "AgentPad";

export type KeycodeOption = {
  code: number;
  label: string;
  title: string;
  category: KeycodeCategory;
};

export type PhysicalControl = MatrixPosition & {
  id: string;
  label: string;
  kind: "key" | "encoderPress" | "touch";
  width: number;
};

export function positionKey(position: MatrixPosition): string {
  return `${position.row}:${position.column}`;
}

export function keycodeHex(keycode: number): string {
  return `0x${keycode.toString(16).toUpperCase().padStart(4, "0")}`;
}
