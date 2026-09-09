import { useState } from "react";

export function OaiLayoutEditor({ disabled, onArrange, onSwap }: {
  disabled: boolean;
  onArrange: (vertical: boolean) => void;
  onSwap: (from: number, to: number) => void;
}) {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(6);
  const options = Array.from({length: 13}, (_, i) => <option key={i} value={i}>SW{i + 1}</option>);
  return <section className="panel" aria-label="Distribución OAI">
    <h3>Distribución OAI · tecla y LED unidos</h3>
    <p>El estado del agente y el feedback de su acción siguen la tecla asignada. Requiere el firmware con distribución LED dinámica.</p>
    <p>Horizontal y vertical restauran las 13 acciones OAI en SW1–SW13. Intercambiar conserva tus asignaciones. Todo queda en borrador hasta guardar.</p>
    <div className="workspace-actions">
      <button className="secondary-button" disabled={disabled} onClick={() => onArrange(false)}>Orden horizontal</button>
      <button className="secondary-button" disabled={disabled} onClick={() => onArrange(true)}>Orden vertical</button>
      <label>Origen<select aria-label="Tecla OAI de origen" value={from} disabled={disabled} onChange={e => setFrom(Number(e.target.value))}>{options}</select></label>
      <label>Destino<select aria-label="Tecla OAI de destino" value={to} disabled={disabled} onChange={e => setTo(Number(e.target.value))}>{options}</select></label>
      <button className="secondary-button" disabled={disabled || from === to} onClick={() => onSwap(from, to)}>Intercambiar tecla y LED</button>
    </div>
  </section>;
}
