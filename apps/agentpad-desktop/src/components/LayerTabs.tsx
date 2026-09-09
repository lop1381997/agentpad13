type LayerTabsProps = {
  activeLayer: number;
  onSelect: (layer: number) => void;
};

export function LayerTabs({ activeLayer, onSelect }: LayerTabsProps) {
  return (
    <div aria-label="Vial layers" className="layer-tabs" role="tablist">
      {Array.from({ length: 8 }, (_, layer) => (
        <button
          aria-selected={layer === activeLayer}
          className={layer === activeLayer ? "layer-tab active" : "layer-tab"}
          key={layer}
          onClick={() => onSelect(layer)}
          role="tab"
          type="button"
        >
          {layer === 0 ? "Layer 0 · Codex" : `Layer ${layer}`}
        </button>
      ))}
    </div>
  );
}
