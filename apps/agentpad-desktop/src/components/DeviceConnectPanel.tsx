import { IconPlugConnected, IconSearch, IconUsb } from "@tabler/icons-react";

import type { DeviceSummary } from "../model";

type DeviceConnectPanelProps = {
  connected: boolean;
  devices: DeviceSummary[];
  selectedPath: string;
  busy: boolean;
  disconnectDisabled: boolean;
  onFind: () => void;
  onSelectPath: (path: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function DeviceConnectPanel({
  connected,
  devices,
  selectedPath,
  busy,
  disconnectDisabled,
  onFind,
  onSelectPath,
  onConnect,
  onDisconnect,
}: DeviceConnectPanelProps) {
  return (
    <section className="device-connect-panel" aria-labelledby="device-connect-title">
      <div className="device-illustration" aria-hidden="true">
        <IconUsb size={30} stroke={1.5} />
      </div>
      <div>
        <p className="eyebrow">Interfaz nativa · solo Vial</p>
        <h2 id="device-connect-title">{connected ? "AgentPad13 conectado" : "Conecta AgentPad13"}</h2>
        <p>
          Studio abre exclusivamente la colección Vial de 32 bytes. El canal OAI sigue reservado a
          Codex y no se enumera ni se controla desde esta app.
        </p>
      </div>

      {connected ? (
        <div className="device-connect-actions">
          <span className="connection-pill">
            <IconPlugConnected size={16} stroke={1.8} />
            Vial activo
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || disconnectDisabled}
            onClick={onDisconnect}
          >
            Desconectar
          </button>
        </div>
      ) : (
        <div className="device-connect-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={onFind}>
            <IconSearch size={17} stroke={1.8} />
            {busy ? "Buscando…" : "Buscar AgentPad13"}
          </button>
          {devices.length > 0 ? (
            <div className="device-picker">
              <label htmlFor="agentpad-device">Interfaz disponible</label>
              <select
                id="agentpad-device"
                value={selectedPath}
                disabled={busy}
                onChange={(event) => onSelectPath(event.target.value)}
              >
                {devices.map((device) => (
                  <option key={device.path} value={device.path}>
                    {device.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !selectedPath}
                onClick={onConnect}
              >
                Conectar
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
