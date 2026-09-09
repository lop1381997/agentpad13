import { invoke } from "@tauri-apps/api/core";

import type {
  DeviceSummary,
  EditorSnapshot,
  EncoderBinding,
  EncoderDirection,
  KeyChange,
  MacroBuffer,
  UnlockStatus,
  UnlockProgress,
  VialRgbSnapshot,
  VialRgbState,
} from "./model";

type SaveResult = { applied: KeyChange[] };

export function exportText(filename: string, contents: string): Promise<boolean> {
  return invoke("export_text", { filename, contents });
}

export function listAgentpadDevices(): Promise<DeviceSummary[]> {
  return invoke("list_agentpad_devices");
}

export function connectAgentpad(path: string): Promise<EditorSnapshot> {
  return invoke("connect_agentpad", { path });
}

export function saveKeymapChanges(changes: KeyChange[]): Promise<SaveResult> {
  return invoke("save_keymap_changes", { changes });
}

export function saveEncoderChange(change: {
  layer: number;
  direction: EncoderDirection;
  keycode: number;
}): Promise<EncoderBinding> {
  return invoke("save_encoder_change", { change });
}

export function getVialRgb(): Promise<VialRgbSnapshot> {
  return invoke("get_vialrgb");
}

export function saveVialRgb(next: VialRgbState): Promise<VialRgbState> {
  return invoke("save_vialrgb", { next });
}

export function getMacros(): Promise<MacroBuffer> {
  return invoke("get_macros");
}

export function saveMacros(next: number[]): Promise<MacroBuffer> {
  return invoke("save_macros", { next });
}

export function beginUnlock(): Promise<void> {
  return invoke("begin_unlock");
}

export function pollUnlock(): Promise<UnlockProgress> {
  return invoke("poll_unlock");
}

export function lockDevice(): Promise<UnlockStatus> {
  return invoke("lock_device");
}

export function disconnectAgentpad(): Promise<void> {
  return invoke("disconnect_agentpad");
}
