export interface ModalOption {
  label: string;
  payload: string;
  color?: string;
}

export interface ActionButton {
  id: string;
  title: string;
  x: number; // 0-1 normalized field coordinate
  y: number; // 0-1 normalized field coordinate
  w: number; // 0-1 normalized width
  h: number; // 0-1 normalized height
  color: string;
  type: "direct" | "modal";
  action?: string; // For direct type or modal type
  payload?: string; // Optional payload for direct actions
  options?: ModalOption[]; // For modal type
  repeatable?: boolean; // If false, button can only be pressed once (default: true)
}

export interface TransformedButton {
  button: ActionButton;
  x: number; // Canvas pixel coordinate
  y: number; // Canvas pixel coordinate
  width: number; // Canvas pixel width
  height: number; // Canvas pixel height
}
