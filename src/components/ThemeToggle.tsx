import { Moon, Sun } from "lucide-react";
import { toggleTheme } from "../theme";

/** Day/night switch. Both icons are rendered; CSS shows the one for the active theme. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Zwischen Tag- und Nachtansicht wechseln"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        toggleTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
      }}
    >
      <Sun className="tt-sun" size={19} aria-hidden="true" />
      <Moon className="tt-moon" size={18} aria-hidden="true" />
    </button>
  );
}
