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
  it("declares valid platform icons for native installers", () => {
    const config = JSON.parse(readFromApp("src-tauri/tauri.conf.json"));
    const icons: string[] = config.bundle.icon ?? [];
    expect(icons).toEqual(expect.arrayContaining([
      "icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png",
      "icons/icon.icns", "icons/icon.ico",
    ]));
    for (const icon of icons) {
      const bytes = readFileSync(resolve(appRoot, "src-tauri", icon));
      if (icon.endsWith(".png")) {
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
        expect(bytes.readUInt32BE(16)).toBe(bytes.readUInt32BE(20));
      } else if (icon.endsWith(".ico")) {
        expect(bytes.readUInt16LE(0)).toBe(0);
        expect(bytes.readUInt16LE(2)).toBe(1);
        expect(bytes.readUInt16LE(4)).toBeGreaterThan(0);
      } else if (icon.endsWith(".icns")) {
        expect(bytes.subarray(0, 4).toString()).toBe("icns");
        expect(bytes.readUInt32BE(4)).toBe(bytes.length);
      }
    }
  });

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
