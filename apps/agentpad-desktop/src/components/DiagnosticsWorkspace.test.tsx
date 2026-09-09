import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DiagnosticsWorkspace } from "./DiagnosticsWorkspace";
import { exportText } from "../bridge";

vi.mock("../bridge", () => ({ exportText: vi.fn() }));
afterEach(cleanup);

it("exports the factual report through the native dialog and reports cancellation", async () => {
  vi.mocked(exportText).mockResolvedValue(false);
  render(<DiagnosticsWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("cancelada"));
  expect(exportText).toHaveBeenCalledWith("agentpad13-diagnostico.txt",
    expect.stringContaining("sin sesión Vial"));
});

it("shows a native export error rather than claiming success", async () => {
  vi.mocked(exportText).mockRejectedValue(new Error("Permission denied"));
  render(<DiagnosticsWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Permission denied"));
});
