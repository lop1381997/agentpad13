import type { MatrixPosition, UnlockProgress, UnlockStatus } from "../model";

type UnlockPanelProps = {
  status: UnlockStatus;
  progress?: UnlockProgress;
  busy: boolean;
  onBegin: () => void;
  onLock: () => void;
};

function switchLabel(position: MatrixPosition): string {
  if (position.row === 3 && position.column === 0) {
    return "SW13";
  }
  if (position.row < 3) {
    return `SW${position.row * 4 + position.column + 1}`;
  }
  return `row ${position.row}, col ${position.column}`;
}

export function UnlockPanel({ status, progress, busy, onBegin, onLock }: UnlockPanelProps) {
  const requiredKeys = status.required_keys.map(switchLabel).join(" + ");
  const unlocked = progress?.unlocked ?? status.unlocked;
  const inProgress = progress?.in_progress ?? status.in_progress;
  const canLock = unlocked && !inProgress;

  return (
    <section aria-labelledby="unlock-title" className="panel unlock-panel">
      <p className="eyebrow">Seguridad Vial</p>
      <h2 id="unlock-title">{unlocked ? "Edición desbloqueada" : "Edición bloqueada"}</h2>
      <p>
        {inProgress
          ? `Mantén ${requiredKeys} hasta completar la comprobación física.`
          : requiredKeys
            ? `Para editar, mantén ${requiredKeys} en el teclado después de iniciar el desbloqueo.`
            : "El firmware no ha indicado una combinación de desbloqueo."}
      </p>
      {inProgress ? (
        <p className="unlock-warning" role="status">
          No desconectes ni bloquees mientras la comprobación física está en curso. Mantén la combinación
          hasta completarla.
        </p>
      ) : null}
      <div className="unlock-actions">
        <button
          className="button button-secondary"
          disabled={busy || unlocked}
          onClick={onBegin}
          type="button"
        >
          {busy ? "Comprobando…" : inProgress ? "Continuar comprobación" : "Iniciar desbloqueo físico"}
        </button>
        {canLock ? (
          <button className="button button-danger" disabled={busy} onClick={onLock} type="button">
            Bloquear edición
          </button>
        ) : null}
      </div>
    </section>
  );
}
