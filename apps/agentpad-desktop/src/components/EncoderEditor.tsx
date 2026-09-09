import { keycodeLabel } from "../keycodes";
import { keycodeHex } from "../model";
import type { EncoderDirection } from "../model";

type EncoderEditorProps = {
  counterClockwise: number;
  clockwise: number;
  selectedDirection?: EncoderDirection;
  counterClockwiseDraft: boolean;
  clockwiseDraft: boolean;
  onSelect: (direction: EncoderDirection) => void;
};

export function EncoderEditor({
  counterClockwise,
  clockwise,
  selectedDirection,
  counterClockwiseDraft,
  clockwiseDraft,
  onSelect,
}: EncoderEditorProps) {
  const directions: Array<{ direction: EncoderDirection; label: string; keycode: number; draft: boolean }> = [
    {
      direction: "counterClockwise",
      label: "Encoder CCW",
      keycode: counterClockwise,
      draft: counterClockwiseDraft,
    },
    { direction: "clockwise", label: "Encoder CW", keycode: clockwise, draft: clockwiseDraft },
  ];

  return (
    <section aria-labelledby="encoder-title" className="panel encoder-editor">
      <p className="eyebrow">Rotary</p>
      <h2 id="encoder-title">Encoder map</h2>
      <div className="encoder-directions">
        {directions.map(({ direction, label, keycode, draft }) => (
          <button
            aria-label={label}
            className={`encoder-direction ${selectedDirection === direction ? "selected" : ""} ${draft ? "draft" : ""}`}
            key={direction}
            onClick={() => onSelect(direction)}
            type="button"
          >
            <span>{label}</span>
            <strong>{keycodeLabel(keycode)}</strong>
            <small>{keycodeHex(keycode)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
