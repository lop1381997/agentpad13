import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = process.cwd();
const repositoryRoot = resolve(appRoot, "../..");

function readFromApp(path: string): string {
  return readFileSync(resolve(appRoot, path), "utf8");
}

function readFromRepository(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

describe("AgentPad13 packaging contract", () => {
  it("limits Linux HID access to the AgentPad13 Vial VID/PID", () => {
    const rule = readFromApp("packaging/99-agentpad13-vial.rules");

    expect(rule).toContain('SUBSYSTEM=="hidraw"');
    expect(rule).toContain('ATTRS{idVendor}=="303a"');
    expect(rule).toContain('ATTRS{idProduct}=="8360"');
  });

  it("keeps CI local, non-publishing, and free of physical-HID execution", () => {
    const workflow = readFromRepository(".github/workflows/agentpad-desktop.yml");

    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm test --run");
    expect(workflow).toContain("cargo test");
    expect(workflow).toContain("pnpm tauri build --debug");
    expect(workflow.toLowerCase()).not.toMatch(/publish|release|flash|bootloader|hidapi::hidapi::new/);
  });
});
