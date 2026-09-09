import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LightingWorkspace } from "./LightingWorkspace";
import type { VialRgbInfo, VialRgbState } from "../model";

const info: VialRgbInfo = {
  protocol_version: 1,
  maximum_brightness: 128,
  supported_modes: [0, 1, 2, 13],
};

const state: VialRgbState = {
  mode: 13,
  speed: 88,
  hue: 32,
  saturation: 64,
  brightness: 91,
};

describe("LightingWorkspace", () => {
  it("keeps Codex lighting read-only and stages VialRGB globally on editable layers", () => {
    const onStage = vi.fn();
    const { rerender } = render(
      <LightingWorkspace activeLayer={0} info={info} state={state} onStage={onStage} />,
    );

    expect(screen.getByRole("heading", { name: /Iluminación de Codex/i })).toBeVisible();
    expect(screen.getByText(/solo lectura/i)).toBeVisible();
    expect(screen.queryByLabelText(/^Brillo$/i)).toBeNull();

    rerender(<LightingWorkspace activeLayer={3} info={info} state={state} onStage={onStage} />);
    fireEvent.change(screen.getByLabelText(/^Brillo$/i), { target: { value: "82" } });

    expect(screen.getByText(/VialRGB global/i)).toBeVisible();
    expect(onStage).toHaveBeenCalledWith({ ...state, brightness: 82 });
  });
});
