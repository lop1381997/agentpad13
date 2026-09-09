import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProfilesWorkspace } from "./ProfilesWorkspace";
import type { AgentPadProfile, EditorSnapshot } from "../model";

function snapshot(): EditorSnapshot {
  return {
    layers: Array.from({ length: 8 }, () =>
      Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0x0029)),
    ),
    encoders: Array.from({ length: 8 }, (_, layer) => ({
      layer,
      counter_clockwise: 0x00ea,
      clockwise: 0x00e9,
    })),
    unlockStatus: { unlocked: true, in_progress: false, required_keys: [] },
  };
}

function profile(): AgentPadProfile {
  const layers = snapshot().layers.map((layer) => layer.map((row) => [...row]));
  layers[1][0][0] = 0x7e07;
  return {
    schemaVersion: 1,
    device: {
      vendorId: "303A",
      productId: "8360",
      matrixRows: 4,
      matrixColumns: 4,
      layerCount: 8,
    },
    id: "codex-principal",
    name: "Codex Principal",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    layers,
    encoders: snapshot().encoders,
    layerNames: ["Codex / OAI", "Trabajo", "Navegación", "Iluminación", "Personal", "Personal", "Personal", "Personal"],
  };
}

describe("ProfilesWorkspace", () => {
  it("creates a local profile and prepares its diff without writing to the keyboard", () => {
    const onCreate = vi.fn(() => profile());
    const onPrepare = vi.fn();
    const { rerender } = render(
      <ProfilesWorkspace
        snapshot={snapshot()}
        profiles={[]}
        onCreate={onCreate}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
        onPrepare={onPrepare}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Nuevo perfil/i }));
    fireEvent.change(screen.getByLabelText(/Nombre del perfil/i), {
      target: { value: "Codex Principal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Guardar perfil/i }));
    expect(onCreate).toHaveBeenCalledWith("Codex Principal");

    rerender(
      <ProfilesWorkspace
        snapshot={snapshot()}
        profiles={[profile()]}
        onCreate={onCreate}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
        onPrepare={onPrepare}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Codex Principal/i }));
    expect(screen.getByText(/1 cambio para revisar/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Preparar cambios/i }));
    expect(onPrepare).toHaveBeenCalledWith(profile());
  });
});
