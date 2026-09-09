import { useState } from "react";
import type { MacroBuffer } from "../model";
import { parseMacroSlots, replaceTextMacro } from "../studio/macro-text";

type MacroWorkspaceProps = {
  buffer?: MacroBuffer;
  draft?: number[];
  selectedSlot: number;
  onSelectSlot: (slot: number) => void;
  onStage: (next: number[]) => void;
};

function macroLabel(index: number): string {
  return "MACRO" + index.toString().padStart(2, "0");
}

function macroKeycode(index: number): string | undefined {
  if (index >= 16) {
    return undefined;
  }
  return "0x" + (0x5f12 + index).toString(16).toUpperCase();
}

export function MacroWorkspace({
  buffer,
  draft,
  selectedSlot,
  onSelectSlot,
  onStage,
}: MacroWorkspaceProps) {
  const [editError, setEditError] = useState<string>();
  if (!buffer) {
    return (
      <section className="macro-workspace" aria-labelledby="macros-title">
        <div className="workspace-heading">
          <p className="eyebrow">Vial · macros dinámicas</p>
          <h2 id="macros-title">Macros y acciones</h2>
          <p>Conecta AgentPad13 para leer los slots de macro que expone el firmware.</p>
        </div>
      </section>
    );
  }

  const bytes = draft ?? buffer.bytes;
  let slots;
  try {
    slots = parseMacroSlots(bytes, buffer.count);
  } catch (error) {
    return (
      <section className="macro-workspace" aria-labelledby="macros-title">
        <div className="workspace-heading">
          <p className="eyebrow">Vial · macros dinámicas</p>
          <h2 id="macros-title">Macros y acciones</h2>
        </div>
        <p className="workspace-error" role="alert">
          No se puede interpretar este buffer de macros de forma segura: {String(error)}.
        </p>
      </section>
    );
  }

  const current = slots[Math.min(Math.max(selectedSlot, 0), slots.length - 1)];
  const currentKeycode = macroKeycode(current.index);

  return (
    <section className="macro-workspace" aria-labelledby="macros-title">
      <div className="workspace-heading workspace-heading-row">
        <div>
          <p className="eyebrow">Vial · macros dinámicas</p>
          <h2 id="macros-title">Macros y acciones</h2>
          <p>
            Estos {buffer.count} slots pertenecen al firmware. Los cambios quedan en borrador
            hasta que guardes explícitamente en AgentPad.
          </p>
        </div>
        <span className="global-badge">{buffer.count} slots Vial</span>
      </div>

      <div className="macro-layout">
        <nav className="macro-slot-list" aria-label="Slots de macro">
          {slots.map((slot) => (
            <button
              key={slot.index}
              type="button"
              className={slot.index === current.index ? "macro-slot is-selected" : "macro-slot"}
              aria-pressed={slot.index === current.index}
              onClick={() => onSelectSlot(slot.index)}
            >
              <span>{macroLabel(slot.index)}</span>
              <small>{slot.editable ? slot.text || "Vacía" : "Avanzada"}</small>
            </button>
          ))}
        </nav>

        <article className="macro-editor">
          <div className="macro-editor-heading">
            <div>
              <p className="eyebrow">{macroLabel(current.index)}</p>
              <h3>{current.editable ? "Texto de macro" : "Secuencia avanzada"}</h3>
            </div>
            {currentKeycode ? <code>{currentKeycode}</code> : null}
          </div>

          {current.editable ? (
            <>
              <label className="field-group" htmlFor="macro-text">
                <span>Texto de la macro</span>
                <textarea
                  id="macro-text"
                  value={current.text}
                  rows={7}
                  spellCheck={false}
                  onChange={(event) => {
                    try {
                      onStage(replaceTextMacro(bytes, current.index, event.target.value, buffer.count));
                      setEditError(undefined);
                    } catch (error) {
                      setEditError(error instanceof Error ? error.message : String(error));
                    }
                  }}
                />
              </label>
              {editError ? <p role="alert" className="workspace-error">{editError}</p> : null}
              <p className="field-hint">
                Solo texto ASCII imprimible. La capacidad se calcula contra los {bytes.length} bytes
                reales del firmware y conserva las demás macros sin cambios.
              </p>
            </>
          ) : (
            <div className="macro-raw-notice" role="note">
              <strong>Secuencia avanzada · solo lectura.</strong>
              <p>
                Este slot contiene instrucciones QMK/Vial no textuales. Studio lo conserva byte a
                byte y no lo reescribe desde el editor de texto.
              </p>
              <code>{current.rawHex || "—"}</code>
            </div>
          )}

          <p className="assignment-hint">
            Para activar este slot, asigna <code>{macroLabel(current.index)}</code> a una tecla o
            giro del encoder en el mapa de teclas.
          </p>
        </article>
      </div>
    </section>
  );
}
