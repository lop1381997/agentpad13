import type { VialRgbInfo, VialRgbState } from "../model";
import { vialRgbEffectName } from "../studio/studio-data";

type LightingWorkspaceProps = {
  activeLayer: number;
  info?: VialRgbInfo;
  state?: VialRgbState;
  draft?: VialRgbState;
  onStage: (next: VialRgbState) => void;
};

type LightingField = "speed" | "hue" | "saturation" | "brightness";

function asNumber(value: string): number {
  return Number.parseInt(value, 10);
}

export function LightingWorkspace({
  activeLayer,
  info,
  state,
  draft,
  onStage,
}: LightingWorkspaceProps) {
  if (activeLayer === 0) {
    return (
      <section className="lighting-workspace" aria-labelledby="codex-lighting-title">
        <div className="workspace-heading">
          <p className="eyebrow">Capa L0 · protegida</p>
          <h2 id="codex-lighting-title">Iluminación de Codex</h2>
          <p>
            Esta capa conserva la formación LED de Codex/OAI y no admite edición desde
            AgentPad13 Studio para no interferir con el canal reservado a Codex.
          </p>
        </div>
        <div className="lighting-notice" role="note">
          <strong>Solo lectura.</strong> Cambia a una capa de trabajo para configurar el efecto
          compartido de VialRGB.
        </div>
        <div className="lighting-facts" aria-label="Comportamiento de iluminación del firmware">
          <article>
            <h3>Transición de capa</h3>
            <p>Todos los LEDs muestran el color de la capa durante 1 segundo.</p>
          </article>
          <article>
            <h3>Indicador de capa</h3>
            <p>El LED que marca la capa activa permanece fijo fuera del efecto.</p>
          </article>
        </div>
      </section>
    );
  }

  if (!info || !state) {
    return (
      <section className="lighting-workspace" aria-labelledby="lighting-title">
        <div className="workspace-heading">
          <p className="eyebrow">VialRGB · capas L1–L7</p>
          <h2 id="lighting-title">Iluminación</h2>
          <p>Conecta AgentPad13 para leer los efectos que declara su firmware VialRGB.</p>
        </div>
      </section>
    );
  }

  const current = draft ?? state;
  const updateField = (field: LightingField, rawValue: string) => {
    const value = asNumber(rawValue);
    if (!Number.isFinite(value)) {
      return;
    }
    onStage({ ...current, [field]: value });
  };

  return (
    <section className="lighting-workspace" aria-labelledby="lighting-title">
      <div className="workspace-heading workspace-heading-row">
        <div>
          <p className="eyebrow">Capa L{activeLayer} · VialRGB</p>
          <h2 id="lighting-title">Iluminación de la capa L{activeLayer}</h2>
          <p>
            VialRGB es global: estos ajustes se comparten en las capas 1–7 y se guardan junto al
            resto de cambios pendientes.
          </p>
        </div>
        <span className="global-badge">VialRGB global</span>
      </div>

      <div className="lighting-controls">
        <label className="field-group">
          <span>Efecto</span>
          <select
            aria-label="Efecto VialRGB"
            value={current.mode}
            onChange={(event) => onStage({ ...current, mode: asNumber(event.target.value) })}
          >
            {info.supported_modes.map((mode) => (
              <option key={mode} value={mode}>
                {vialRgbEffectName(mode)} · {mode}
              </option>
            ))}
          </select>
        </label>

        <RangeField
          label="Velocidad"
          value={current.speed}
          maximum={255}
          onChange={(value) => updateField("speed", value)}
        />
        <RangeField
          label="Tono"
          value={current.hue}
          maximum={255}
          onChange={(value) => updateField("hue", value)}
        />
        <RangeField
          label="Saturación"
          value={current.saturation}
          maximum={255}
          onChange={(value) => updateField("saturation", value)}
        />
        <RangeField
          label="Brillo"
          value={current.brightness}
          maximum={info.maximum_brightness}
          onChange={(value) => updateField("brightness", value)}
        />
      </div>

      <div className="lighting-facts" aria-label="Comportamiento de iluminación del firmware">
        <article>
          <h3>Transición de capa</h3>
          <p>El color de la capa se muestra durante 1 segundo antes de recuperar VialRGB.</p>
        </article>
        <article>
          <h3>Indicador de capa</h3>
          <p>El LED que marca la capa activa permanece fijo, incluso con el efecto en marcha.</p>
        </article>
      </div>
    </section>
  );
}

type RangeFieldProps = {
  label: string;
  value: number;
  maximum: number;
  onChange: (value: string) => void;
};

function RangeField({ label, value, maximum, onChange }: RangeFieldProps) {
  const id = `lighting-${label.toLocaleLowerCase("es").replaceAll(" ", "-")}`;
  return (
    <div className="range-field">
      <span>
        <label htmlFor={id}>{label}</label>
        <output aria-label={`Valor de ${label}`}>{value}</output>
      </span>
      <input
        id={id}
        type="range"
        min="0"
        max={maximum}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
