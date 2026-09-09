import type { DeviceSummary } from "../model";

type ConnectionCardProps = {
  connected: boolean;
  devices: DeviceSummary[];
  selectedPath: string;
  busy: boolean;
  onFind: () => void;
  onSelectedPathChange: (path: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  disconnectDisabled?: boolean;
};

export function ConnectionCard({
  connected,
  devices,
  selectedPath,
  busy,
  onFind,
  onSelectedPathChange,
  onConnect,
  onDisconnect,
  disconnectDisabled = false,
}: ConnectionCardProps) {
  return (
    <section aria-labelledby="connection-title" className="panel connection-card">
      <p className="eyebrow">Native Vial editor</p>
      <h1 id="connection-title">AgentPad13</h1>
      {connected ? (
        <>
          <p className="connection-state connected">Vial session connected</p>
          <button
            className="button button-secondary"
            disabled={busy || disconnectDisabled}
            onClick={onDisconnect}
            type="button"
          >
            Desconectar
          </button>
        </>
      ) : (
        <>
          <p className="connection-state">Connect only the AgentPad13 Vial interface.</p>
          <button className="button" disabled={busy} onClick={onFind} type="button">
            {busy ? "Finding…" : "Find AgentPad13"}
          </button>
          {devices.length > 0 ? (
            <div className="connection-actions">
              <label>
                Available device
                <select
                  onChange={(event) => onSelectedPathChange(event.target.value)}
                  value={selectedPath}
                >
                  {devices.map((device) => (
                    <option key={device.path} value={device.path}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-secondary"
                disabled={busy || !selectedPath}
                onClick={onConnect}
                type="button"
              >
                Connect
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
