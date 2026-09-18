import { EncoderEditor } from "./EncoderEditor";
import { KeyPalette } from "./KeyPalette";
import { layerDetail } from "../studio/studio-data";
import type { EncoderDirection } from "../model";

type KeymapWorkspaceProps = {
  activeLayer: number;
  selectedEncoderDirection?: EncoderDirection;
  selectedLabel?: string;
  selectedKeycode?: number;
  encoderKeycodeFor: (direction: EncoderDirection) => number;
  isEncoderDraft: (direction: EncoderDirection) => boolean;
  onSelectLayer: (layer: number) => void;
  onSelectEncoder: (direction: EncoderDirection) => void;
  onAssign: (keycode: number) => void;
};

export function KeymapWorkspace({
  activeLayer,
  selectedEncoderDirection,
  selectedLabel,
  selectedKeycode,
  encoderKeycodeFor,
  isEncoderDraft,
  onSelectLayer,
  onSelectEncoder,
  onAssign,
}: KeymapWorkspaceProps) {
  return (
    <section className="keymap-workspace" aria-labelledby="keymap-title">
      <div className="workspace-heading">
        <p className="eyebrow">Vial · ocho capas persistentes</p>
        <h2 id="keymap-title">Mapa de teclas</h2>
        <p>Selecciona un control físico y asigna una acción. Nada se escribe hasta guardar.</p>
      </div>

      <div className="layer-strip" role="tablist" aria-label="Capas de Vial">
        {Array.from({ length: 8 }, (_, layer) => {
          const details = layerDetail(layer);
          const active = layer === activeLayer;
          return (
            <button
              type="button"
              key={layer}
              role="tab"
              aria-selected={active}
              className={active ? "layer-chip is-active" : "layer-chip"}
              onClick={() => onSelectLayer(layer)}
            >
              <span style={{ backgroundColor: details.color }} aria-hidden="true" />
              <strong>L{layer}</strong>
              <small>{details.name}</small>
              {layer === 0 ? <em>LED OAI</em> : null}
            </button>
          );
        })}
      </div>

      <div className="keymap-layout">
        <article className="hardware-deck">
          <div className="hardware-deck-heading">
            <div>
              <p className="eyebrow">Mapa físico</p>
              <h3>AgentPad13 · selecciona una tecla en el teclado virtual</h3>
            </div>
            <span>L{activeLayer}</span>
          </div>
          <EncoderEditor
            counterClockwise={encoderKeycodeFor("counterClockwise")}
            clockwise={encoderKeycodeFor("clockwise")}
            selectedDirection={selectedEncoderDirection}
            counterClockwiseDraft={isEncoderDraft("counterClockwise")}
            clockwiseDraft={isEncoderDraft("clockwise")}
            onSelect={onSelectEncoder}
          />
        </article>

        <KeyPalette
          selectedLabel={selectedLabel}
          selectedKeycode={selectedKeycode}
          onAssign={onAssign}
        />
      </div>
    </section>
  );
}
