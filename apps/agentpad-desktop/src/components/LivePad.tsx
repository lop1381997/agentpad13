import { layerDetail } from "../studio/studio-data";
import type { LedRgb, LiveLedFrame, PhysicalControl } from "../model";

export type LivePadMode = "live" | "preview" | "syncing" | "unsupported";
export type LivePadFreshness = "fresh" | "stale" | "unknown";

type LivePadProps = {
  activeLayer: number;
  controls: PhysicalControl[];
  frame?: LiveLedFrame;
  freshness: LivePadFreshness;
  mode: LivePadMode;
  followPhysicalLayer?: boolean;
  selectedId?: string;
  onSelectControl: (control: PhysicalControl) => void;
  onFollowPhysicalLayerChange?: (follow: boolean) => void;
};

function rgbCss(color: LedRgb | undefined): string {
  if (!color) {
    return "rgb(25, 39, 49)";
  }
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

function ledIndexForControl(control: PhysicalControl): number | undefined {
  if (control.kind !== "key") {
    return undefined;
  }
  if (control.row === 3 && control.column === 0) {
    return 12;
  }
  return control.row < 3 ? control.row * 4 + control.column : undefined;
}

function modeLabel(mode: LivePadMode): string {
  switch (mode) {
    case "live":
      return "LEDs físicos en tiempo real · 20 FPS máx.";
    case "preview":
      return "Vista previa · firmware sin monitor en tiempo real";
    case "syncing":
      return "Sincronizando el último estado físico…";
    case "unsupported":
      return "Monitor LED no disponible · vista previa segura";
  }
}

export function LivePad({
  activeLayer,
  controls,
  frame,
  freshness,
  mode,
  followPhysicalLayer = true,
  selectedId,
  onSelectControl,
  onFollowPhysicalLayerChange,
}: LivePadProps) {
  const physicalLayer = frame?.active_layer;
  const shownLayer = physicalLayer ?? activeLayer;
  const detail = layerDetail(shownLayer);
  const className = `live-pad ${freshness === "stale" ? "is-stale" : ""}`;

  return (
    <section aria-label="Estado de LEDs del teclado virtual" className={className}>
      <div className="live-pad-heading">
        <div>
          <p className="eyebrow">Teclado virtual · estado físico</p>
          <h2>{shownLayer === 0 ? "L0 · OAI / Codex" : `L${shownLayer} · ${detail.name}`}</h2>
        </div>
        <p className="live-pad-status" aria-live="polite">
          <span className={`live-pad-dot ${mode}`} aria-hidden="true" />
          {modeLabel(mode)}
        </p>
      </div>
      {frame ? (
        <div className="live-pad-layer-mode">
          <span>
            Capa física: <strong>L{frame.active_layer}</strong>
            {followPhysicalLayer ? " · siguiendo para editar" : ` · editando L${activeLayer}`}
          </span>
          <button
            className="text-button"
            onClick={() => onFollowPhysicalLayerChange?.(!followPhysicalLayer)}
            type="button"
          >
            {followPhysicalLayer ? "Fijar capa de edición" : "Seguir capa física"}
          </button>
        </div>
      ) : null}

      <div className="live-pad-board">
        <div className="live-pad-peripherals" aria-label="LEDs periféricos">
          {Array.from({ length: 11 }, (_, offset) => {
            const ledIndex = offset + 13;
            return (
              <span
                aria-label={`LED periférico ${ledIndex + 1}`}
                className={ledIndex === 13 ? "live-pad-led layer-indicator" : "live-pad-led"}
                key={ledIndex}
                role="img"
                style={{ backgroundColor: rgbCss(frame?.leds[ledIndex]) }}
              />
            );
          })}
        </div>
        <div className="live-pad-controls">
          {controls.map((control) => {
            const ledIndex = ledIndexForControl(control);
            const selected = control.id === selectedId;
            return (
              <button
                aria-label={control.label}
                className={`live-pad-control ${control.kind} ${selected ? "selected" : ""}`}
                key={control.id}
                onClick={() => onSelectControl(control)}
                style={{
                  backgroundColor: rgbCss(ledIndex === undefined ? undefined : frame?.leds[ledIndex]),
                  gridColumn: control.row === 3 && control.column === 0 ? "2 / span 2" : undefined,
                  gridRow: control.row + 1,
                }}
                type="button"
              >
                <span>{control.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="live-pad-hint">
        Pulsa una tecla virtual para editar su asignación. Nunca ejecuta una acción ni envía eventos OAI.
      </p>
    </section>
  );
}
