import { useSyncExternalStore } from "react";
import { currentPalette, palettes, setPalette } from "../palette";

const subscribe = (onChange: () => void) => {
  window.addEventListener("palettechange", onChange);
  return () => window.removeEventListener("palettechange", onChange);
};

/** Floating colour picker for trying the site in each palette. */
export function PalettePicker() {
  const active = useSyncExternalStore(subscribe, currentPalette, () => "blau");

  return (
    <div className="palette-picker" role="group" aria-label="Farbpalette wählen">
      <span>Farben</span>
      {palettes.map((palette) => (
        <button
          type="button"
          key={palette.id}
          className="palette-dot"
          data-label={palette.label}
          aria-label={palette.label}
          aria-pressed={active === palette.id}
          style={{ background: palette.swatch }}
          onClick={() => setPalette(palette.id)}
        />
      ))}
    </div>
  );
}
