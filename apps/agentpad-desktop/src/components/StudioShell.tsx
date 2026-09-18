import type { ReactNode } from "react";
import {
  IconAdjustments,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBulb,
  IconCode,
  IconDeviceFloppy,
  IconHome2,
  IconKeyboard,
  IconSettings,
  IconTerminal2,
} from "@tabler/icons-react";

import type { StudioPage } from "../model";

type StudioShellProps = {
  page: StudioPage;
  connected: boolean;
  changeCount: number;
  unlocked: boolean;
  saving?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onNavigate: (page: StudioPage) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  monitor?: ReactNode;
  children: ReactNode;
};

const routes = [
  { page: "home" as const, label: "Inicio", icon: IconHome2 },
  { page: "keymap" as const, label: "Mapa de teclas", icon: IconKeyboard },
  { page: "lighting" as const, label: "Iluminación", icon: IconBulb },
  { page: "macros" as const, label: "Macros y acciones", icon: IconCode },
  { page: "profiles" as const, label: "Perfiles", icon: IconAdjustments },
  { page: "diagnostics" as const, label: "Diagnóstico", icon: IconTerminal2 },
  { page: "settings" as const, label: "Ajustes", icon: IconSettings },
] as const;

export function StudioShell({
  page,
  connected,
  changeCount,
  unlocked,
  saving = false,
  canUndo = false,
  canRedo = false,
  onNavigate,
  onSave,
  onUndo,
  onRedo,
  monitor,
  children,
}: StudioShellProps) {
  const saveDisabled = !connected || !unlocked || changeCount === 0 || saving;

  const navigateByKeyboard = (current: number, key: string) => {
    let target = current;
    if (key === "ArrowDown") {
      target = (current + 1) % routes.length;
    } else if (key === "ArrowUp") {
      target = (current - 1 + routes.length) % routes.length;
    } else if (key === "Home") {
      target = 0;
    } else if (key === "End") {
      target = routes.length - 1;
    } else {
      return;
    }
    onNavigate(routes[target].page);
  };

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="studio-brand">
          <div className="brand-mark" aria-hidden="true">
            <IconKeyboard size={21} stroke={1.7} />
          </div>
          <div>
            <p className="eyebrow">AgentPad13 · Native Studio</p>
            <h1>AgentPad13 Studio</h1>
          </div>
        </div>

        <p className={connected ? "connection-indicator is-connected" : "connection-indicator"}>
          <span aria-hidden="true" />
          {connected ? "AgentPad13 conectado · Vial" : "Sin dispositivo · Vial"}
        </p>

        <div className="header-actions">
          {changeCount > 0 ? (
            <span className="change-indicator">{changeCount} cambios pendientes</span>
          ) : (
            <span className="change-indicator is-idle">Sin cambios pendientes</span>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Deshacer"
            disabled={!canUndo || saving}
            onClick={onUndo}
          >
            <IconArrowBackUp size={17} stroke={1.8} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Rehacer"
            disabled={!canRedo || saving}
            onClick={onRedo}
          >
            <IconArrowForwardUp size={17} stroke={1.8} />
          </button>
          <button type="button" className="primary-button header-save" disabled={saveDisabled} onClick={onSave}>
            <IconDeviceFloppy size={17} stroke={1.8} />
            {saving ? "Guardando…" : "Guardar en AgentPad"}
          </button>
        </div>
      </header>

      <div className="studio-body">
        <aside className="studio-sidebar">
          <nav aria-label="Secciones de AgentPad13 Studio" className="studio-nav">
            {routes.map((route, index) => {
              const Icon = route.icon;
              const active = page === route.page;
              return (
                <button
                  type="button"
                  key={route.page}
                  className={active ? "studio-nav-item is-active" : "studio-nav-item"}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(route.page)}
                  onKeyDown={(event) => {
                    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                      event.preventDefault();
                      navigateByKeyboard(index, event.key);
                    }
                  }}
                >
                  <Icon size={18} stroke={1.7} />
                  <span>{route.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="sidebar-contract">
            <p className="eyebrow">Contrato HID</p>
            <p>Solo Vial · 32 bytes</p>
            <small>OAI permanece reservado para Codex.</small>
          </div>
        </aside>
        <main className="studio-content">
          {monitor}
          {children}
        </main>
      </div>
    </div>
  );
}
