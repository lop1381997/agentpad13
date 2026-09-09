import { IconContrast, IconEye } from "@tabler/icons-react";

type SettingsWorkspaceProps = {
  highContrast: boolean;
  onHighContrastChange: (enabled: boolean) => void;
};

export function SettingsWorkspace({ highContrast, onHighContrastChange }: SettingsWorkspaceProps) {
  return (
    <section className="settings-workspace" aria-labelledby="settings-title">
      <div className="workspace-heading">
        <p className="eyebrow">Preferencias locales</p>
        <h2 id="settings-title">Ajustes</h2>
        <p>Estas preferencias se guardan solo en este ordenador; no modifican el firmware.</p>
      </div>

      <div className="settings-list">
        <label className="setting-row">
          <span className="setting-icon" aria-hidden="true">
            <IconContrast size={20} stroke={1.8} />
          </span>
          <span>
            <strong>Alto contraste</strong>
            <small>Aumenta la separación entre texto, paneles y controles del editor.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Alto contraste"
            checked={highContrast}
            onChange={(event) => onHighContrastChange(event.target.checked)}
          />
        </label>

        <article className="setting-row is-disabled">
          <span className="setting-icon" aria-hidden="true">
            <IconEye size={20} stroke={1.8} />
          </span>
          <span>
            <strong>Telemetría</strong>
            <small>Desactivada. AgentPad13 Studio no recopila telemetría de hardware.</small>
          </span>
          <span className="disabled-badge">Desactivada</span>
        </article>
      </div>
    </section>
  );
}
