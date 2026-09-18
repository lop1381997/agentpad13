import { useEffect, useMemo, useRef, useState } from "react";

import {
  beginUnlock,
  connectAgentpad,
  disconnectAgentpad,
  getLiveLedFrame,
  getLiveMonitorInfo,
  getMacros,
  getVialRgb,
  listAgentpadDevices,
  lockDevice,
  pollUnlock,
  saveEncoderChange,
  saveKeymapChanges,
  saveMacros,
  saveVialRgb,
} from "./bridge";
import { ChangeBar } from "./components/ChangeBar";
import { LivePad, type LivePadMode } from "./components/LivePad";
import { OaiLayoutEditor } from "./components/OaiLayoutEditor";
import { arrangeOai, swapOai, OAI_HORIZONTAL, OAI_VERTICAL } from "./studio/oai-layout";
import { DeviceConnectPanel } from "./components/DeviceConnectPanel";
import { DiagnosticsWorkspace } from "./components/DiagnosticsWorkspace";
import { KeymapWorkspace } from "./components/KeymapWorkspace";
import { LightingWorkspace } from "./components/LightingWorkspace";
import { MacroWorkspace } from "./components/MacroWorkspace";
import { ProfilesWorkspace } from "./components/ProfilesWorkspace";
import { SettingsWorkspace } from "./components/SettingsWorkspace";
import { StudioShell } from "./components/StudioShell";
import { UnlockPanel } from "./components/UnlockPanel";
import { physicalControlsFromDefinition } from "./keycodes";
import type {
  AgentPadProfile,
  DeviceSummary,
  EditorSnapshot,
  EncoderBinding,
  EncoderChange,
  EncoderDirection,
  KeyChange,
  LiveLedFrame,
  LiveMonitorInfo,
  MacroBuffer,
  PhysicalControl,
  StudioPage,
  UnlockProgress,
  UnlockStatus,
  VialRgbSnapshot,
  VialRgbState,
} from "./model";
import {
  copyDraftState,
  emptyDraftHistory,
  emptyDraftState,
  pushDraft,
  redoDraft,
  stageEncoderChange,
  stageKeyChange,
  stageLightingChange,
  summarizeChanges,
  undoDraft,
} from "./studio/editor-state";
import type { DraftHistory, DraftState } from "./studio/editor-state";
import { listProfiles, removeProfile, saveProfile } from "./studio/profile-store";
import { LAYER_DETAILS } from "./studio/studio-data";
import { freshnessFor, LIVE_MONITOR_INTERVAL_MS, shouldPollLiveMonitor } from "./studio/live-monitor";

type Selection =
  | { kind: "key"; control: PhysicalControl }
  | { kind: "encoder"; direction: EncoderDirection };

const SETTINGS_STORAGE_KEY = "agentpad13.studio.settings.v1";

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function localStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function timestamp(): string {
  return new Date().toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function profileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "agentpad-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function copyLayers(layers: number[][][]): number[][][] {
  return layers.map((layer) => layer.map((row) => [...row]));
}

function applyKeyChanges(snapshot: EditorSnapshot, changes: KeyChange[]): EditorSnapshot {
  const layers = copyLayers(snapshot.layers);
  for (const change of changes) {
    layers[change.layer][change.row][change.column] = change.keycode;
  }
  return { ...snapshot, layers };
}

function replaceEncoderBinding(snapshot: EditorSnapshot, binding: EncoderBinding): EditorSnapshot {
  return {
    ...snapshot,
    encoders: snapshot.encoders.map((current) => (current.layer === binding.layer ? binding : current)),
  };
}

function sameBytes(left: number[] | undefined, right: number[] | undefined): boolean {
  return Boolean(left && right && left.length === right.length && left.every((byte, index) => byte === right[index]));
}

function removeKeyChanges(state: DraftState, confirmed: KeyChange[]): DraftState {
  const ids = new Set(
    confirmed.map((change) => change.layer + ":" + change.row + ":" + change.column),
  );
  const next = copyDraftState(state);
  next.keyChanges = next.keyChanges.filter(
    (change) => !ids.has(change.layer + ":" + change.row + ":" + change.column),
  );
  return next;
}

function removeEncoderChange(state: DraftState, confirmed: EncoderChange): DraftState {
  const next = copyDraftState(state);
  next.encoderChanges = next.encoderChanges.filter(
    (change) =>
      change.layer !== confirmed.layer ||
      change.direction !== confirmed.direction,
  );
  return next;
}

function removeLightingChange(state: DraftState): DraftState {
  const next = copyDraftState(state);
  next.lighting = undefined;
  return next;
}

function removeMacroChange(state: DraftState): DraftState {
  const next = copyDraftState(state);
  next.macroBuffer = undefined;
  return next;
}

function snapshotWithDraft(snapshot: EditorSnapshot, draft: DraftState): EditorSnapshot {
  let next = applyKeyChanges(snapshot, draft.keyChanges);
  for (const change of draft.encoderChanges) {
    const existing = next.encoders.find((binding) => binding.layer === change.layer);
    if (!existing) {
      continue;
    }
    const binding =
      change.direction === "clockwise"
        ? { ...existing, clockwise: change.keycode }
        : { ...existing, counter_clockwise: change.keycode };
    next = replaceEncoderBinding(next, binding);
  }
  return {
    ...next,
    lighting: draft.lighting ? { ...draft.lighting } : next.lighting ? { ...next.lighting } : undefined,
  };
}

function cloneProfile(profile: AgentPadProfile): AgentPadProfile {
  return {
    ...profile,
    layers: copyLayers(profile.layers),
    encoders: profile.encoders.map((binding) => ({ ...binding })),
    lighting: profile.lighting ? { ...profile.lighting } : undefined,
    macroBuffer: profile.macroBuffer ? [...profile.macroBuffer] : undefined,
    layerNames: [...profile.layerNames],
  };
}

function buildProfile(
  name: string,
  snapshot: EditorSnapshot,
  draft: DraftState,
  macros: MacroBuffer | undefined,
): AgentPadProfile {
  const now = new Date().toISOString();
  const effectiveSnapshot = snapshotWithDraft(snapshot, draft);
  const macroBuffer = draft.macroBuffer ?? macros?.bytes;
  return {
    schemaVersion: 1,
    device: {
      vendorId: "303A",
      productId: "8360",
      matrixRows: 4,
      matrixColumns: 4,
      layerCount: 8,
    },
    id: profileId(),
    name,
    createdAt: now,
    updatedAt: now,
    layers: copyLayers(effectiveSnapshot.layers),
    encoders: effectiveSnapshot.encoders.map((binding) => ({ ...binding })),
    lighting: effectiveSnapshot.lighting ? { ...effectiveSnapshot.lighting } : undefined,
    macroBuffer: macroBuffer ? [...macroBuffer] : undefined,
    layerNames: LAYER_DETAILS.map((layer) => layer.name),
  };
}

function prepareProfileDraft(
  snapshot: EditorSnapshot,
  profile: AgentPadProfile,
  macros: MacroBuffer | undefined,
): DraftState {
  let next = emptyDraftState();

  for (let layer = 0; layer < snapshot.layers.length; layer += 1) {
    for (let row = 0; row < snapshot.layers[layer].length; row += 1) {
      for (let column = 0; column < snapshot.layers[layer][row].length; column += 1) {
        next = stageKeyChange(
          next,
          {
            layer,
            row,
            column,
            keycode: profile.layers[layer][row][column],
          },
          snapshot.layers[layer][row][column],
        );
      }
    }
  }

  for (const expected of profile.encoders) {
    const actual = snapshot.encoders.find((binding) => binding.layer === expected.layer);
    if (!actual) {
      continue;
    }
    next = stageEncoderChange(
      next,
      {
        layer: expected.layer,
        direction: "counterClockwise",
        keycode: expected.counter_clockwise,
      },
      actual.counter_clockwise,
    );
    next = stageEncoderChange(
      next,
      {
        layer: expected.layer,
        direction: "clockwise",
        keycode: expected.clockwise,
      },
      actual.clockwise,
    );
  }

  if (profile.lighting && snapshot.lighting) {
    next = stageLightingChange(next, profile.lighting, snapshot.lighting);
  }

  if (profile.macroBuffer && !sameBytes(profile.macroBuffer, macros?.bytes)) {
    next = { ...next, macroBuffer: [...profile.macroBuffer] };
  }

  return next;
}

function waitForUnlockPoll(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 115));
}

function browserDocumentIsVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function App() {
  const controls = useMemo(physicalControlsFromDefinition, []);
  const [page, setPage] = useState<StudioPage>("home");
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [snapshot, setSnapshot] = useState<EditorSnapshot>();
  const [lighting, setLighting] = useState<VialRgbSnapshot>();
  const [liveMonitorInfo, setLiveMonitorInfo] = useState<LiveMonitorInfo>();
  const [liveFrame, setLiveFrame] = useState<LiveLedFrame>();
  const [liveFrameReceivedAt, setLiveFrameReceivedAt] = useState<number>();
  const [liveMonitorMode, setLiveMonitorMode] = useState<LivePadMode>("preview");
  const [followPhysicalLayer, setFollowPhysicalLayer] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(browserDocumentIsVisible);
  const [macros, setMacros] = useState<MacroBuffer>();
  const [history, setHistory] = useState<DraftHistory<DraftState>>(emptyDraftHistory);
  const [activeLayer, setActiveLayer] = useState(0);
  const [selection, setSelection] = useState<Selection>();
  const [selectedMacroSlot, setSelectedMacroSlot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unlockProgress, setUnlockProgress] = useState<UnlockProgress>();
  const [error, setError] = useState<string>();
  const [lastSuccessfulRead, setLastSuccessfulRead] = useState<string>();
  const [lastSuccessfulSave, setLastSuccessfulSave] = useState<string>();
  const [profiles, setProfiles] = useState<AgentPadProfile[]>(() => {
    const storage = localStorageOrUndefined();
    return storage ? listProfiles(storage) : [];
  });
  const [highContrast, setHighContrast] = useState(() => {
    try {
      return localStorageOrUndefined()?.getItem(SETTINGS_STORAGE_KEY) === "high-contrast";
    } catch {
      return false;
    }
  });
  const liveRequestInFlight = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", highContrast);
  }, [highContrast]);

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(browserDocumentIsVisible());
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const draft = history.present;
  const summaries = snapshot ? summarizeChanges(snapshot, draft) : [];
  const changeCount = summaries.length;
  const unlocked = unlockProgress?.unlocked ?? snapshot?.unlockStatus.unlocked ?? false;
  const unlockInProgress = unlockProgress?.in_progress ?? snapshot?.unlockStatus.in_progress ?? false;
  const encoderBinding = snapshot?.encoders.find((binding) => binding.layer === activeLayer);

  const keycodeFor = (control: PhysicalControl): number => {
    if (!snapshot) {
      return 0;
    }
    const staged = draft.keyChanges.find(
      (change) =>
        change.layer === activeLayer &&
        change.row === control.row &&
        change.column === control.column,
    );
    return staged?.keycode ?? snapshot.layers[activeLayer][control.row][control.column];
  };

  const encoderKeycodeFor = (direction: EncoderDirection): number => {
    if (!encoderBinding) {
      return 0;
    }
    const staged = draft.encoderChanges.find(
      (change) => change.layer === activeLayer && change.direction === direction,
    );
    if (staged) {
      return staged.keycode;
    }
    return direction === "clockwise" ? encoderBinding.clockwise : encoderBinding.counter_clockwise;
  };

  const selectedKeycode =
    selection?.kind === "key"
      ? keycodeFor(selection.control)
      : selection?.kind === "encoder"
        ? encoderKeycodeFor(selection.direction)
        : undefined;
  const selectedLabel =
    selection?.kind === "key"
      ? selection.control.label
      : selection?.kind === "encoder"
        ? selection.direction === "clockwise"
          ? "Encoder CW"
          : "Encoder CCW"
        : undefined;

  const isKeyDraft = (control: PhysicalControl): boolean =>
    draft.keyChanges.some(
      (change) =>
        change.layer === activeLayer &&
        change.row === control.row &&
        change.column === control.column,
    );
  const isEncoderDraft = (direction: EncoderDirection): boolean =>
    draft.encoderChanges.some(
      (change) => change.layer === activeLayer && change.direction === direction,
    );

  function acceptLiveFrame(frame: LiveLedFrame): void {
    setLiveFrame(frame);
    setLiveFrameReceivedAt(Date.now());
    setLiveMonitorMode("live");
    if (followPhysicalLayer) {
      setActiveLayer(frame.active_layer);
      setSelection(undefined);
    }
  }

  async function initializeLiveMonitor(): Promise<void> {
    setLiveMonitorInfo(undefined);
    setLiveFrame(undefined);
    setLiveFrameReceivedAt(undefined);
    setLiveMonitorMode("syncing");
    try {
      const info = await getLiveMonitorInfo();
      setLiveMonitorInfo(info);
      acceptLiveFrame(await getLiveLedFrame());
    } catch {
      setLiveMonitorMode("unsupported");
    }
  }

  useEffect(() => {
    if (!snapshot || !liveMonitorInfo) {
      return;
    }

    let disposed = false;
    const poll = async () => {
      if (
        disposed ||
        !shouldPollLiveMonitor({
          connected: Boolean(snapshot),
          documentVisible,
          saving,
          unlockInProgress,
          requestInFlight: liveRequestInFlight.current,
        })
      ) {
        return;
      }
      liveRequestInFlight.current = true;
      try {
        const nextFrame = await getLiveLedFrame();
        if (!disposed) {
          acceptLiveFrame(nextFrame);
        }
      } catch {
        if (!disposed) {
          setLiveMonitorMode("syncing");
        }
      } finally {
        liveRequestInFlight.current = false;
      }
    };

    const interval = window.setInterval(() => void poll(), LIVE_MONITOR_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [snapshot, liveMonitorInfo, documentVisible, saving, unlockInProgress, followPhysicalLayer]);

  function confirmDraft(transform: (state: DraftState) => DraftState): void {
    setHistory((current) => ({
      present: transform(current.present),
      undo: [],
      redo: [],
    }));
  }

  async function loadDeviceExtras(baseSnapshot?: EditorSnapshot): Promise<void> {
    const issues: string[] = [];
    let rgbRead = false;
    let macroRead = false;

    try {
      const nextLighting = await getVialRgb();
      setLighting(nextLighting);
      setSnapshot((current) => {
        const base = current ?? baseSnapshot;
        return base ? { ...base, lighting: { ...nextLighting.state } } : current;
      });
      rgbRead = true;
    } catch (caughtError) {
      issues.push("no se pudo leer VialRGB: " + messageFrom(caughtError));
    }

    try {
      const nextMacros = await getMacros();
      setMacros(nextMacros);
      macroRead = true;
    } catch (caughtError) {
      issues.push("no se pudieron leer las macros: " + messageFrom(caughtError));
    }

    if (rgbRead && macroRead) {
      setLastSuccessfulRead(timestamp());
    }
    if (issues.length > 0) {
      setError("La sesión Vial se ha conectado, pero " + issues.join(" · "));
    }
  }

  async function findDevices(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const foundDevices = await listAgentpadDevices();
      setDevices(foundDevices);
      setSelectedPath((current) =>
        foundDevices.some((device) => device.path === current) ? current : foundDevices[0]?.path ?? "",
      );
      if (foundDevices.length === 0) {
        setError("No se ha encontrado una interfaz Vial compatible de AgentPad13.");
      }
    } catch (caughtError) {
      setError(messageFrom(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function connect(): Promise<void> {
    if (!selectedPath) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const nextSnapshot = await connectAgentpad(selectedPath);
      setSnapshot(nextSnapshot);
      setLighting(undefined);
      setMacros(undefined);
      setHistory(emptyDraftHistory());
      setActiveLayer(0);
      setSelection(undefined);
      setSelectedMacroSlot(0);
      setUnlockProgress(undefined);
      setPage("home");
      if (!nextSnapshot.unlockStatus.in_progress) {
        await loadDeviceExtras(nextSnapshot);
        await initializeLiveMonitor();
      }
    } catch (caughtError) {
      setError(messageFrom(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    if (unlockInProgress) {
      setError("Completa primero el desbloqueo físico Vial antes de desconectar AgentPad13 Studio.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await disconnectAgentpad();
      setSnapshot(undefined);
      setLighting(undefined);
      setMacros(undefined);
      setLiveMonitorInfo(undefined);
      setLiveFrame(undefined);
      setLiveFrameReceivedAt(undefined);
      setLiveMonitorMode("preview");
      setHistory(emptyDraftHistory());
      setSelection(undefined);
      setUnlockProgress(undefined);
      setPage("home");
    } catch (caughtError) {
      setError(messageFrom(caughtError));
    } finally {
      setBusy(false);
    }
  }

  function stageKeycode(keycode: number): void {
    if (!snapshot || !selection || saving) {
      return;
    }
    if (selection.kind === "key") {
      const { row, column } = selection.control;
      const next = stageKeyChange(
        draft,
        { layer: activeLayer, row, column, keycode },
        snapshot.layers[activeLayer][row][column],
      );
      setHistory((current) => pushDraft(current, next));
      return;
    }

    const original =
      selection.direction === "clockwise"
        ? encoderBinding?.clockwise
        : encoderBinding?.counter_clockwise;
    if (original === undefined) {
      return;
    }
    const next = stageEncoderChange(
      draft,
      { layer: activeLayer, direction: selection.direction, keycode },
      original,
    );
    setHistory((current) => pushDraft(current, next));
  }

  function stageLighting(nextLighting: VialRgbState): void {
    if (!lighting || saving) {
      return;
    }
    const next = stageLightingChange(draft, nextLighting, lighting.state);
    setHistory((current) => pushDraft(current, next));
  }

  function stageMacros(nextMacros: number[]): void {
    if (!macros || saving) {
      return;
    }
    const next = copyDraftState(draft);
    next.macroBuffer = sameBytes(nextMacros, macros.bytes) ? undefined : [...nextMacros];
    setHistory((current) => pushDraft(current, next));
  }

  async function saveChanges(): Promise<void> {
    if (!snapshot || !unlocked || unlockInProgress || busy || changeCount === 0 || saving) {
      return;
    }

    const pending = copyDraftState(draft);
    setSaving(true);
    setError(undefined);
    try {
      if (pending.keyChanges.length > 0) {
        await saveKeymapChanges(pending.keyChanges);
        setSnapshot((current) => (current ? applyKeyChanges(current, pending.keyChanges) : current));
        confirmDraft((current) => removeKeyChanges(current, pending.keyChanges));
        setLastSuccessfulSave(timestamp());
      }

      for (const change of pending.encoderChanges) {
        const binding = await saveEncoderChange(change);
        setSnapshot((current) => (current ? replaceEncoderBinding(current, binding) : current));
        confirmDraft((current) => removeEncoderChange(current, change));
        setLastSuccessfulSave(timestamp());
      }

      if (pending.lighting) {
        const savedLighting = await saveVialRgb(pending.lighting);
        setLighting((current) => (current ? { ...current, state: savedLighting } : current));
        setSnapshot((current) =>
          current ? { ...current, lighting: { ...savedLighting } } : current,
        );
        confirmDraft(removeLightingChange);
        setLastSuccessfulSave(timestamp());
      }

      if (pending.macroBuffer) {
        const savedMacros = await saveMacros(pending.macroBuffer);
        setMacros(savedMacros);
        confirmDraft(removeMacroChange);
        setLastSuccessfulSave(timestamp());
      }
    } catch (caughtError) {
      setError(
        "No se han confirmado todos los cambios en el teclado: " +
          messageFrom(caughtError) +
          ". El borrador que no se haya confirmado se conserva localmente.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function startUnlock(): Promise<void> {
    if (!snapshot || busy || saving) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (!unlockInProgress) {
        await beginUnlock();
        setUnlockProgress({ unlocked: false, in_progress: true, remaining_polls: 0 });
      }
      for (let attempt = 0; attempt < 55; attempt += 1) {
        await waitForUnlockPoll();
        const progress = await pollUnlock();
        setUnlockProgress(progress);
        if (!progress.in_progress) {
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  unlockStatus: {
                    ...current.unlockStatus,
                    unlocked: progress.unlocked,
                    in_progress: false,
                  },
                }
              : current,
          );
          await loadDeviceExtras(snapshot);
          await initializeLiveMonitor();
          break;
        }
      }
    } catch (caughtError) {
      setError(messageFrom(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function lockEditing(): Promise<void> {
    if (unlockInProgress || busy || saving) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const status: UnlockStatus = await lockDevice();
      setSnapshot((current) => (current ? { ...current, unlockStatus: status } : current));
      setUnlockProgress(undefined);
    } catch (caughtError) {
      setError(messageFrom(caughtError));
    } finally {
      setBusy(false);
    }
  }

  function selectLayer(layer: number): void {
    setFollowPhysicalLayer(false);
    setActiveLayer(layer);
    setSelection(undefined);
  }

  function saveLocalProfile(profile: AgentPadProfile): AgentPadProfile | undefined {
    const storage = localStorageOrUndefined();
    if (!storage) {
      setError("Este entorno no permite guardar perfiles locales.");
      return undefined;
    }
    try {
      const next = saveProfile(storage, profile);
      setProfiles(next);
      return profile;
    } catch (caughtError) {
      setError(messageFrom(caughtError));
      return undefined;
    }
  }

  function createProfile(name: string): AgentPadProfile | undefined {
    if (!snapshot) {
      setError("Conecta AgentPad13 antes de crear un perfil desde el teclado.");
      return undefined;
    }
    return saveLocalProfile(buildProfile(name, snapshot, draft, macros));
  }

  function duplicateProfile(profile: AgentPadProfile): AgentPadProfile | undefined {
    const now = new Date().toISOString();
    const duplicate = cloneProfile(profile);
    duplicate.id = profileId();
    duplicate.name = profile.name + " · copia";
    duplicate.createdAt = now;
    duplicate.updatedAt = now;
    return saveLocalProfile(duplicate);
  }

  function deleteProfile(id: string): void {
    const storage = localStorageOrUndefined();
    if (!storage) {
      setError("Este entorno no permite guardar perfiles locales.");
      return;
    }
    try {
      setProfiles(removeProfile(storage, id));
    } catch (caughtError) {
      setError("No se pudo eliminar el perfil: " + messageFrom(caughtError));
    }
  }

  function importProfile(profile: AgentPadProfile): void {
    saveLocalProfile(profile);
  }

  function prepareProfile(profile: AgentPadProfile): void {
    if (!snapshot || saving) {
      return;
    }
    if (profile.macroBuffer && (!macros || profile.macroBuffer.length !== macros.bytes.length)) {
      setError("El tamaño del buffer de macros del perfil no coincide con el teclado. No se ha preparado ningún cambio.");
      return;
    }
    if (profile.lighting && (!lighting || !lighting.info.supported_modes.includes(profile.lighting.mode) || profile.lighting.brightness > lighting.info.maximum_brightness)) {
      setError("La iluminación del perfil no es compatible con el firmware conectado. No se ha preparado ningún cambio.");
      return;
    }
    const prepared = prepareProfileDraft(snapshot, profile, macros);
    setHistory((current) => pushDraft(current, prepared));
    setPage("keymap");
    setActiveLayer(0);
    setSelection(undefined);
  }

  function updateHighContrast(enabled: boolean): void {
    setHighContrast(enabled);
    document.documentElement.classList.toggle("high-contrast", enabled);
    try {
      localStorageOrUndefined()?.setItem(
        SETTINGS_STORAGE_KEY,
        enabled ? "high-contrast" : "standard",
      );
    } catch (caughtError) {
      setError("El ajuste se aplica a esta sesión, pero no se pudo guardar: " + messageFrom(caughtError));
    }
  }

  const home = (
    <section className="home-workspace" aria-labelledby="home-title">
      <div className="workspace-heading">
        <p className="eyebrow">Configuración nativa para AgentPad13</p>
        <h2 id="home-title">Controla Vial sin tocar el canal OAI</h2>
        <p>
          Conecta el dispositivo, completa el desbloqueo físico de Vial y prepara los cambios
          localmente antes de guardarlos de forma explícita.
        </p>
      </div>

      <DeviceConnectPanel
        connected={Boolean(snapshot)}
        devices={devices}
        selectedPath={selectedPath}
        busy={busy || saving}
        disconnectDisabled={unlockInProgress}
        onFind={() => void findDevices()}
        onSelectPath={setSelectedPath}
        onConnect={() => void connect()}
        onDisconnect={() => void disconnect()}
      />

      {snapshot ? (
        <div className="home-status-grid">
          <UnlockPanel
            status={snapshot.unlockStatus}
            progress={unlockProgress}
            busy={busy || saving}
            onBegin={() => void startUnlock()}
            onLock={() => void lockEditing()}
          />
          <article className="home-status-card">
            <p className="eyebrow">Sesión actual</p>
            <h3>{unlocked ? "Lista para editar" : "Lectura disponible"}</h3>
            <p>
              {unlocked
                ? "Puedes preparar cambios y guardarlos en la interfaz Vial."
                : "El mapa sigue siendo consultable. El firmware exige el desbloqueo físico antes de escribir."}
            </p>
            <dl>
              <div>
                <dt>Capas</dt>
                <dd>{snapshot.layers.length} / 8</dd>
              </div>
              <div>
                <dt>Macros</dt>
                <dd>{macros ? macros.count + " slots" : "Pendiente"}</dd>
              </div>
              <div>
                <dt>VialRGB</dt>
                <dd>{lighting ? "Disponible" : "Pendiente"}</dd>
              </div>
            </dl>
          </article>
        </div>
      ) : (
        <div className="home-empty-state">
          <p>La aplicación solo enumera y abre la interfaz Vial de AgentPad13.</p>
          <small>VID:PID 303A:8360 · usage FF60:0061 · sin report ID · 32 bytes</small>
        </div>
      )}
    </section>
  );

  return (
    <StudioShell
      page={page}
      connected={Boolean(snapshot)}
      changeCount={changeCount}
      unlocked={unlocked && !busy && !unlockInProgress}
      saving={saving}
      canUndo={history.undo.length > 0}
      canRedo={history.redo.length > 0}
      onNavigate={setPage}
      onSave={() => void saveChanges()}
      onUndo={() => setHistory((current) => undoDraft(current))}
      onRedo={() => setHistory((current) => redoDraft(current))}
      monitor={
        snapshot ? (
          <LivePad
            activeLayer={activeLayer}
            controls={controls}
            frame={liveFrame}
            freshness={freshnessFor(liveFrameReceivedAt, Date.now())}
            mode={liveMonitorMode}
            followPhysicalLayer={followPhysicalLayer}
            selectedId={selection?.kind === "key" ? selection.control.id : undefined}
            onFollowPhysicalLayerChange={setFollowPhysicalLayer}
            onSelectControl={(control) => {
              setFollowPhysicalLayer(false);
              setSelection({ kind: "key", control });
              setPage("keymap");
            }}
          />
        ) : undefined
      }
    >
      {error ? (
        <p className="app-error" role="alert">
          {error}
        </p>
      ) : null}

      {page === "home" ? home : null}

      {page === "keymap" ? (
        snapshot ? (
          <>
          {activeLayer === 0 ? <OaiLayoutEditor disabled={saving}
            onArrange={(vertical) => setHistory(current => pushDraft(current, arrangeOai(snapshot, current.present, vertical ? OAI_VERTICAL : OAI_HORIZONTAL)))}
            onSwap={(from, to) => setHistory(current => pushDraft(current, swapOai(snapshot, current.present, from, to)))}
          /> : null}
          <KeymapWorkspace
            activeLayer={activeLayer}
            selectedEncoderDirection={
              selection?.kind === "encoder" ? selection.direction : undefined
            }
            selectedLabel={selectedLabel}
            selectedKeycode={selectedKeycode}
            encoderKeycodeFor={encoderKeycodeFor}
            isEncoderDraft={isEncoderDraft}
            onSelectLayer={selectLayer}
            onSelectEncoder={(direction) => setSelection({ kind: "encoder", direction })}
            onAssign={stageKeycode}
          />
          </>
        ) : (
          <section className="empty-workspace">
            <h2>Mapa de teclas</h2>
            <p>Conecta AgentPad13 para leer y editar sus ocho capas Vial.</p>
          </section>
        )
      ) : null}

      {page === "lighting" ? (
        <>
        <label className="field-group">
          Capa que quieres configurar
          <select aria-label="Capa de iluminación" value={activeLayer} onChange={(event) => selectLayer(Number(event.target.value))}>
            {LAYER_DETAILS.map((layer) => <option key={layer.number} value={layer.number}>L{layer.number} · {layer.name}</option>)}
          </select>
        </label>
        <LightingWorkspace
          activeLayer={activeLayer}
          info={lighting?.info}
          state={lighting?.state}
          draft={draft.lighting}
          onStage={stageLighting}
        />
        </>
      ) : null}

      {page === "macros" ? (
        <MacroWorkspace
          buffer={macros}
          draft={draft.macroBuffer}
          selectedSlot={selectedMacroSlot}
          onSelectSlot={setSelectedMacroSlot}
          onStage={stageMacros}
        />
      ) : null}

      {page === "profiles" ? (
        <ProfilesWorkspace
          snapshot={snapshot}
          currentMacros={macros?.bytes}
          profiles={profiles}
          onCreate={createProfile}
          onDuplicate={duplicateProfile}
          onDelete={deleteProfile}
          onImport={importProfile}
          onPrepare={prepareProfile}
        />
      ) : null}

      {page === "diagnostics" ? (
        <DiagnosticsWorkspace
          snapshot={snapshot}
          lighting={lighting}
          macros={macros}
          lastSuccessfulRead={lastSuccessfulRead}
          lastSuccessfulSave={lastSuccessfulSave}
        />
      ) : null}

      {page === "settings" ? (
        <SettingsWorkspace
          highContrast={highContrast}
          onHighContrastChange={updateHighContrast}
        />
      ) : null}

      {snapshot ? (
        <ChangeBar
          changes={summaries}
          saving={saving}
          unlocked={unlocked && !busy && !unlockInProgress}
          onDiscard={() => setHistory(emptyDraftHistory())}
          onSave={() => void saveChanges()}
        />
      ) : null}
    </StudioShell>
  );
}

export default App;
