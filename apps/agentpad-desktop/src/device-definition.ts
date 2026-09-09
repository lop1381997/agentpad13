import rawDefinition from "../../../firmware/loudest_micro/keymaps/vial_oai/vial.json";

export type CustomKeycodeDefinition = {
  name: string;
  title: string;
  shortName: string;
};

export type LayoutToken = string | { w?: number; x?: number };

export type AgentPadDefinition = {
  name: string;
  vendorId: string;
  productId: string;
  matrix: { rows: number; cols: number };
  customKeycodes: CustomKeycodeDefinition[];
  layouts: { keymap: LayoutToken[][] };
};

export const agentpadDefinition = rawDefinition as AgentPadDefinition;
