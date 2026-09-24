import { useState } from "react";

type OaiLayoutEditorProps = {
  disabled: boolean;
  onArrange: (vertical: boolean) => void;
  onSwap: (from: number, to: number) => void;
};

export function OaiLayoutEditor({ disabled, onArrange, onSwap }: OaiLayoutEditorProps) {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(6);
  const options = Array.from({ length: 13 }, (_, index) => (
    <option key={index} value={index}>SW{index + 1}</option>
  ));

  return (
    <section className="panel oai-layout-editor" aria-labelledby="oai-layout-title">
      <div className="oai-layout-intro">
        <div>
          <p className="eyebrow">Exclusivo de la capa OAI</p>
          <h3 id="oai-layout-title">Distribución de agentes</h3>
          <p>La acción y su LED se mueven juntos. Elige una disposición o intercambia dos teclas; después revisa y guarda los cambios.</p>
        </div>
        <span className="global-badge">Tecla + LED</span>
      </div>
      <div className="oai-layout-controls">
        <div className="oai-preset-actions" aria-label="Disposiciones OAI">
          <button className="secondary-button" type="button" disabled={disabled} onClick={() => onArrange(false)}>Horizontal</button>
          <button className="secondary-button" type="button" disabled={disabled} onClick={() => onArrange(true)}>Vertical</button>
        </div>
        <div className="oai-swap-actions">
          <label htmlFor="oai-from">Origen</label>
          <select id="oai-from" aria-label="Tecla OAI de origen" value={from} disabled={disabled} onChange={(event) => setFrom(Number(event.target.value))}>{options}</select>
          <label htmlFor="oai-to">Destino</label>
          <select id="oai-to" aria-label="Tecla OAI de destino" value={to} disabled={disabled} onChange={(event) => setTo(Number(event.target.value))}>{options}</select>
          <button className="secondary-button" type="button" disabled={disabled || from === to} onClick={() => onSwap(from, to)}>Intercambiar</button>
        </div>
      </div>
    </section>
  );
}
