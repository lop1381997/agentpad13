export const LAYER_DETAILS = [
  { number: 0, name: "Codex / OAI", color: "#A78BFA" },
  { number: 1, name: "Trabajo", color: "#45D6C1" },
  { number: 2, name: "Navegación", color: "#61B8FF" },
  { number: 3, name: "Iluminación", color: "#F4B860" },
  { number: 4, name: "Personal", color: "#69DB9B" },
  { number: 5, name: "Personal", color: "#FF7A30" },
  { number: 6, name: "Personal", color: "#FF6B7A" },
  { number: 7, name: "Personal", color: "#A78BFA" },
] as const;

const VIAL_RGB_EFFECT_NAMES: Record<number, string> = {
  0: "Apagado",
  1: "Directo",
  2: "Color sólido",
  6: "Respiración",
  13: "Ciclo completo",
  24: "Gotas de lluvia",
  30: "Mapa de calor",
  31: "Lluvia digital",
};

export function layerDetail(layer: number) {
  return LAYER_DETAILS[layer] ?? { number: layer, name: "Personal", color: "#9AA8B8" };
}

export function vialRgbEffectName(mode: number): string {
  return VIAL_RGB_EFFECT_NAMES[mode] ?? `Efecto ${mode}`;
}
