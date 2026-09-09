import type { ChangeSummary } from "../studio/editor-state";

type ChangeBarProps = {
  changes: ChangeSummary[];
  saving: boolean;
  unlocked: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

export function ChangeBar({ changes, saving, unlocked, onDiscard, onSave }: ChangeBarProps) {
  if (changes.length === 0) {
    return null;
  }

  const label = changes.length + " " + (changes.length === 1 ? "cambio pendiente" : "cambios pendientes");
  return (
    <section className="change-bar" aria-label="Cambios locales pendientes">
      <div>
        <p className="eyebrow">Borrador local</p>
        <strong>{label}</strong>
        <span>
          {changes.slice(0, 2).map((change) => change.label).join(" · ")}
          {changes.length > 2 ? " · …" : ""}
        </span>
      </div>
      <div className="workspace-actions">
        <button type="button" className="text-button" disabled={saving} onClick={onDiscard}>
          Descartar
        </button>
        <button type="button" className="primary-button" disabled={!unlocked || saving} onClick={onSave}>
          {saving ? "Guardando…" : "Guardar en AgentPad"}
        </button>
      </div>
    </section>
  );
}
