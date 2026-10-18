export type PaletteId = "blau" | "smaragd" | "orange" | "indigo" | "bordeaux" | "wald";

export const palettes: { id: PaletteId; label: string; swatch: string }[] = [
  { id: "blau", label: "Blau (bisher)", swatch: "#0a6fa6" },
  { id: "smaragd", label: "Smaragd", swatch: "#0f766e" },
  { id: "orange", label: "Sicherheitsorange", swatch: "#e8541a" },
  { id: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { id: "bordeaux", label: "Bordeaux", swatch: "#a3203c" },
  { id: "wald", label: "Waldgrün", swatch: "#1f6f43" },
];

const KEY = "tu-palette";

export function currentPalette(): PaletteId {
  const id = document.documentElement.dataset.palette as PaletteId | undefined;
  return palettes.some((p) => p.id === id) ? (id as PaletteId) : "blau";
}

/** Applies a palette, remembers it and tells the 3D scene to re-read its colours. */
export function setPalette(id: PaletteId) {
  document.documentElement.dataset.palette = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage can be blocked */
  }
  window.dispatchEvent(new CustomEvent("palettechange", { detail: id }));
}
