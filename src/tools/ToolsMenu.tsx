import { BadgeCheck, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACCREDITED_FROM, TOOLS, openTool, type ToolId } from "./tools";

function ToolList({ onPick }: { onPick: (id: ToolId) => void }) {
  return (
    <>
      {TOOLS.map(({ id, label, hint, icon: Icon }) => (
        <button key={id} type="button" className="tm-tool" onClick={() => onPick(id)}>
          <span className="tm-ico">
            <Icon size={19} aria-hidden="true" />
          </span>
          <span>
            <b>{label}</b>
            <small>{hint}</small>
          </span>
        </button>
      ))}
    </>
  );
}

/** "Werkzeuge" in the desktop navigation: opens on hover or click, lists every tool. */
export function ToolsNavItem() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const show = (on: boolean) => {
    window.clearTimeout(closeTimer.current);
    if (on) setOpen(true);
    else closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };
  return (
    <div ref={ref} className={`tm-item${open ? " is-open" : ""}`} onMouseEnter={() => show(true)} onMouseLeave={() => show(false)}>
      <button type="button" className="tm-trigger" aria-expanded={open} aria-haspopup="true" onClick={() => show(true)}>
        Werkzeuge <span className="tm-new">NEU</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div className="tm-menu" hidden={!open}>
        <div className="tm-head">
          <b>Selbst ausprobieren</b>
          <span>Kostenlos, ohne Anmeldung, in 2 Minuten</span>
        </div>
        <div className="tm-grid">
          <ToolList
            onPick={(id) => {
              setOpen(false);
              openTool(id);
            }}
          />
        </div>
        <button type="button" className="tm-foot" onClick={() => (setOpen(false), openTool("angebote"))}>
          <BadgeCheck size={16} aria-hidden="true" /> Akkreditierte ISO 9001 bereits ab {ACCREDITED_FROM}, mehrere Angebote im Vergleich →
        </button>
      </div>
    </div>
  );
}

/** The same tools as a list in the mobile menu. */
export function ToolsMobileList({ onPick }: { onPick: () => void }) {
  return (
    <div className="tm-mobile">
      <p>Werkzeuge</p>
      <ToolList
        onPick={(id) => {
          onPick();
          openTool(id);
        }}
      />
    </div>
  );
}
