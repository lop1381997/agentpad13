import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioShell } from "./StudioShell";

afterEach(cleanup);

describe("StudioShell", () => {
  it("moves keyboard focus with sidebar navigation so repeated arrow keys remain usable", () => {
    const onNavigate = vi.fn();
    render(
      <StudioShell page="home" connected={false} changeCount={0} unlocked={false}
        onNavigate={onNavigate} onSave={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()}>
        <p>Contenido</p>
      </StudioShell>,
    );

    const home = screen.getByRole("button", { name: "Inicio" });
    const keymap = screen.getByRole("button", { name: "Mapa de teclas" });
    const lighting = screen.getByRole("button", { name: "Iluminación" });
    home.focus();
    fireEvent.keyDown(home, { key: "ArrowDown" });
    expect(keymap).toHaveFocus();
    fireEvent.keyDown(keymap, { key: "ArrowDown" });
    expect(lighting).toHaveFocus();
    expect(onNavigate).toHaveBeenLastCalledWith("lighting");
  });

  it("shows factual connection state, routes with keyboard navigation, and a guarded save action", () => {
    const onNavigate = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(
      <StudioShell
        page="home"
        connected
        changeCount={0}
        unlocked={false}
        onNavigate={onNavigate}
        onSave={onSave}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      >
        <p>Contenido</p>
      </StudioShell>,
    );

    expect(screen.getByText(/AgentPad13 conectado · Vial/i)).toBeVisible();
    for (const route of [
      "Inicio",
      "Mapa de teclas",
      "Iluminación",
      "Macros y acciones",
      "Perfiles",
      "Diagnóstico",
      "Ajustes",
    ]) {
      expect(screen.getByRole("button", { name: route })).toBeVisible();
    }
    fireEvent.keyDown(screen.getByRole("button", { name: "Inicio" }), { key: "ArrowDown" });
    expect(onNavigate).toHaveBeenCalledWith("keymap");
    expect(screen.getByRole("button", { name: /Guardar en AgentPad/i })).toBeDisabled();

    rerender(
      <StudioShell
        page="keymap"
        connected
        changeCount={2}
        unlocked
        onNavigate={onNavigate}
        onSave={onSave}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      >
        <p>Contenido</p>
      </StudioShell>,
    );
    expect(screen.getByRole("button", { name: /Guardar en AgentPad/i })).toBeEnabled();
  });
});
