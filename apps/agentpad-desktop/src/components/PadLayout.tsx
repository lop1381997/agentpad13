import { keycodeLabel } from "../keycodes";
import { keycodeHex } from "../model";
import type { PhysicalControl } from "../model";

type PadLayoutProps = {
  controls: PhysicalControl[];
  selectedId?: string;
  keycodeFor: (control: PhysicalControl) => number;
  isDraft: (control: PhysicalControl) => boolean;
  onSelect: (control: PhysicalControl) => void;
};

function physicalGridColumn(control: PhysicalControl): string {
  if (control.row !== 3) {
    return `${control.column + 1} / span ${control.width}`;
  }
  if (control.kind === "touch") {
    return "1";
  }
  if (control.kind === "encoderPress") {
    return "4";
  }
  return "2 / span 2";
}

export function PadLayout({ controls, selectedId, keycodeFor, isDraft, onSelect }: PadLayoutProps) {
  return (
    <section aria-label="Physical AgentPad13 controls" className="pad-layout">
      {controls.map((control) => {
        const keycode = keycodeFor(control);
        const draft = isDraft(control);
        const selected = control.id === selectedId;
        return (
          <button
            aria-label={control.label}
            className={`pad-control ${selected ? "selected" : ""} ${draft ? "draft" : ""} ${control.kind}`}
            key={control.id}
            onClick={() => onSelect(control)}
            style={{
              gridColumn: physicalGridColumn(control),
              gridRow: control.row + 1,
            }}
            type="button"
          >
            <span>{control.label}</span>
            <strong>{keycodeLabel(keycode)}</strong>
            <small>{keycodeHex(keycode)}</small>
          </button>
        );
      })}
    </section>
  );
}
