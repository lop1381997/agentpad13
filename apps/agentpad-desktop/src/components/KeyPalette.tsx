import { useMemo, useState } from "react";

import { keycodeOptions, parseAdvancedKeycode } from "../keycodes";
import { keycodeHex } from "../model";
import type { KeycodeCategory } from "../model";

type KeyPaletteProps = {
  selectedLabel?: string;
  selectedKeycode?: number;
  onAssign: (keycode: number) => void;
};

const categories: KeycodeCategory[] = [
  "AgentPad",
  "Macros",
  "VialRGB",
  "Layers",
  "Basic",
  "Modifiers",
  "Navigation",
  "Media",
];

export function KeyPalette({ selectedLabel, selectedKeycode, onAssign }: KeyPaletteProps) {
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const options = useMemo(
    () =>
      keycodeOptions().filter(
        (option) =>
          !normalizedQuery ||
          option.label.toLowerCase().includes(normalizedQuery) ||
          option.title.toLowerCase().includes(normalizedQuery) ||
          keycodeHex(option.code).toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  );
  const advancedCode = parseAdvancedKeycode(advanced);

  return (
    <section aria-labelledby="palette-title" className="panel key-palette">
      <p className="eyebrow">Asignación</p>
      <h2 id="palette-title">{selectedLabel ?? "Selecciona un control"}</h2>
      <p className="selected-keycode">
        {selectedKeycode === undefined ? "Elige una tecla o un sentido del encoder." : keycodeHex(selectedKeycode)}
      </p>
      <label className="search-field">
        Buscar acciones
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="AG00, RGB, media…"
          type="search"
          value={query}
        />
      </label>
      <div className="palette-options">
        {categories.map((category) => {
          const categoryOptions = options.filter((option) => option.category === category);
          if (categoryOptions.length === 0) {
            return null;
          }
          return (
            <div className="palette-category" key={category}>
              <h3>{category}</h3>
              <div className="palette-grid">
                {categoryOptions.map((option) => (
                  <button
                    aria-label={option.label}
                    className={option.code === selectedKeycode ? "palette-option active" : "palette-option"}
                    disabled={!selectedLabel}
                    key={`${option.category}-${option.code}`}
                    onClick={() => onAssign(option.code)}
                    title={option.title}
                    type="button"
                  >
                    <span>{option.label}</span>
                    <small>{keycodeHex(option.code)}</small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="advanced-keycode">
        <label>
          Código avanzado
          <input
            aria-label="Advanced keycode"
            inputMode="text"
            maxLength={6}
            onChange={(event) => setAdvanced(event.target.value)}
            placeholder="7E02"
            value={advanced}
          />
        </label>
        <button
          className="button button-secondary"
          disabled={!selectedLabel || advancedCode === undefined}
          onClick={() => advancedCode !== undefined && onAssign(advancedCode)}
          type="button"
        >
          Asignar hexadecimal
        </button>
      </div>
    </section>
  );
}
