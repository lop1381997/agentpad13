import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import * as bridge from "./bridge";
import type { EditorSnapshot } from "./model";

vi.mock("./bridge", () => ({
  beginUnlock: vi.fn(),
  connectAgentpad: vi.fn(),
  disconnectAgentpad: vi.fn(),
  getMacros: vi.fn(),
  getVialRgb: vi.fn(),
  listAgentpadDevices: vi.fn(),
  lockDevice: vi.fn(),
  pollUnlock: vi.fn(),
  saveEncoderChange: vi.fn(),
  saveKeymapChanges: vi.fn(),
  saveMacros: vi.fn(),
  saveVialRgb: vi.fn(),
}));

const snapshot: EditorSnapshot = {
  layers: Array.from({ length: 8 }, () =>
    Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0x0029)),
  ),
  encoders: Array.from({ length: 8 }, (_, layer) => ({
    layer,
    counter_clockwise: 0x00aa,
    clockwise: 0x00a9,
  })),
  unlockStatus: {
    unlocked: true,
    in_progress: false,
    required_keys: [
      { row: 0, column: 0 },
      { row: 3, column: 0 },
    ],
  },
};

const lighting = {
  info: { protocol_version: 1, maximum_brightness: 128, supported_modes: [0, 1, 2, 13] },
  state: { mode: 13, speed: 88, hue: 32, saturation: 64, brightness: 91 },
};

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

async function connectEditor(nextSnapshot: EditorSnapshot = snapshot) {
  vi.mocked(bridge.listAgentpadDevices).mockResolvedValue([
    { path: "agentpad-vial", label: "AgentPad13 · Vial" },
  ]);
  vi.mocked(bridge.connectAgentpad).mockResolvedValue(nextSnapshot);
  vi.mocked(bridge.getVialRgb).mockResolvedValue(lighting);
  vi.mocked(bridge.getMacros).mockResolvedValue({ count: 16, bytes: Array.from({ length: 96 }, () => 0) });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Buscar AgentPad13/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Conectar" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
  await waitFor(() => expect(screen.getByText(/AgentPad13 conectado · Vial/i)).toBeVisible());
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  document.documentElement.classList.remove("high-contrast");
});

afterEach(() => {
  cleanup();
});

describe("AgentPad13 Studio", () => {
  it("stages an action locally, exposes undo, and writes only the selected key difference", async () => {
    await connectEditor();

    fireEvent.click(screen.getByRole("button", { name: "Mapa de teclas" }));
    fireEvent.click(screen.getByRole("button", { name: "SW7" }));
    fireEvent.click(screen.getByRole("button", { name: "ACT07" }));
    expect(screen.getByText(/^1 cambio pendiente$/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.queryByText(/^1 cambio pendiente$/i)).toBeNull();

    expect(screen.getByRole("button", { name: "Rehacer" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(screen.getByText(/^1 cambio pendiente$/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "ACT07" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Guardar en AgentPad/i })[0]);
    await waitFor(() =>
      expect(bridge.saveKeymapChanges).toHaveBeenCalledWith([
        { layer: 0, row: 1, column: 2, keycode: 0x7e09 },
      ]),
    );
  });

  it("keeps a local draft after a device readback error", async () => {
    await connectEditor();
    vi.mocked(bridge.saveKeymapChanges).mockRejectedValueOnce(new Error("Readback mismatch"));

    fireEvent.click(screen.getByRole("button", { name: "Mapa de teclas" }));
    fireEvent.click(screen.getByRole("button", { name: "SW7" }));
    fireEvent.click(screen.getByRole("button", { name: "ACT07" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Guardar en AgentPad/i })[0]);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Readback mismatch"));
    expect(screen.getByText(/^1 cambio pendiente$/i)).toBeVisible();
  });

  it("requires the firmware-reported physical unlock before enabling writes", async () => {
    await connectEditor({
      ...snapshot,
      unlockStatus: { ...snapshot.unlockStatus, unlocked: false },
    });

    fireEvent.click(screen.getByRole("button", { name: "Mapa de teclas" }));
    fireEvent.click(screen.getByRole("button", { name: "SW7" }));
    fireEvent.click(screen.getByRole("button", { name: "ACT07" }));

    expect(screen.getAllByRole("button", { name: /Guardar en AgentPad/i })[0]).toBeDisabled();
  });

  it("does not offer unsafe lock or disconnect controls while physical unlock is in progress", async () => {
    await connectEditor({
      ...snapshot,
      unlockStatus: { ...snapshot.unlockStatus, unlocked: false, in_progress: true },
    });

    expect(screen.getByText(/No desconectes ni bloquees/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Lock & disconnect/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Desconectar" })).toBeDisabled();
  });

  it("keeps diagnostics factual and persists local accessibility preferences", async () => {
    await connectEditor();

    fireEvent.click(screen.getByRole("button", { name: "Diagnóstico" }));
    expect(
      screen.getByText("Canal OAI reservado para Codex — AgentPad13 Studio no lo abre ni lo controla."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Alto contraste" }));
    expect(document.documentElement.classList.contains("high-contrast")).toBe(true);
  });

  it("resumes an existing physical unlock without restarting it or reading extras mid-unlock", async () => {
    await connectEditor({
      ...snapshot,
      unlockStatus: { ...snapshot.unlockStatus, unlocked: false, in_progress: true },
    });
    expect(bridge.getVialRgb).not.toHaveBeenCalled();
    expect(bridge.getMacros).not.toHaveBeenCalled();
    vi.mocked(bridge.pollUnlock).mockResolvedValue({
      unlocked: true, in_progress: false, remaining_polls: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar comprobación" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Bloquear edición" })).toBeEnabled());
    expect(bridge.beginUnlock).not.toHaveBeenCalled();
    expect(bridge.pollUnlock).toHaveBeenCalledTimes(1);
    expect(bridge.getVialRgb).toHaveBeenCalledTimes(1);
    expect(bridge.getMacros).toHaveBeenCalledTimes(1);
  });

  it("stages global lighting from its own layer selector and saves on explicit request", async () => {
    await connectEditor();
    await waitFor(() => expect(bridge.getMacros).toHaveBeenCalled());
    vi.mocked(bridge.saveVialRgb).mockResolvedValue({ ...lighting.state, brightness: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Iluminación" }));
    expect(screen.queryByRole("slider", { name: "Brillo" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Capa de iluminación" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("slider", { name: "Brillo" }), { target: { value: "40" } });
    expect(bridge.saveVialRgb).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: /Guardar en AgentPad/i })[0]);
    await waitFor(() => expect(bridge.saveVialRgb).toHaveBeenCalledWith({ ...lighting.state, brightness: 40 }));
    await waitFor(() => expect(screen.queryByText(/^1 cambio pendiente$/i)).toBeNull());
  });

  it("retains a failed macro draft after confirming an earlier key write", async () => {
    await connectEditor();
    await waitFor(() => expect(bridge.getMacros).toHaveBeenCalled());
    vi.mocked(bridge.saveMacros).mockRejectedValue(new Error("Macro readback mismatch"));
    fireEvent.click(screen.getByRole("button", { name: "Mapa de teclas" }));
    fireEvent.click(screen.getByRole("button", { name: "SW7" }));
    fireEvent.click(screen.getByRole("button", { name: "ACT07" }));
    fireEvent.click(screen.getByRole("button", { name: "Macros y acciones" }));
    fireEvent.change(screen.getByLabelText("Texto de la macro"), { target: { value: "hello" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Guardar en AgentPad/i })[0]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Macro readback mismatch"));
    expect(screen.getByText(/^1 cambio pendiente$/i)).toBeVisible();
    expect(screen.getByLabelText("Texto de la macro")).toHaveValue("hello");
    expect(bridge.saveKeymapChanges).toHaveBeenCalledTimes(1);
  });
});
