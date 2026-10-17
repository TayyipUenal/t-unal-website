import { ArrowUpRight, Globe as GlobeIcon, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { contact } from "../content";
import type { Globe } from "../globe";

/**
 * Night section with a rotating globe (see src/globe.ts). The button flies to
 * the office in Dortmund and shows the address. The globe code and its data
 * load on demand so they stay out of the first paint.
 */
export function NightGlobe() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const globe = useRef<Globe | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("../globe").then(({ startGlobe }) => {
      if (!cancelled && canvas.current) globe.current = startGlobe(canvas.current, { still });
    });
    return () => {
      cancelled = true;
      globe.current?.stop();
      globe.current = null;
    };
  }, []);

  const toggle = () => {
    globe.current?.focus(!focused);
    setFocused(!focused);
  };

  return (
    <section id="weltweit" className="night" aria-labelledby="night-title">
      <div className="night-inner">
        <div className="night-copy">
          <h2 id="night-title">Normen, die überall gelten.</h2>
          <p className="night-lead">
            ISO 9001, ISO 14001 und ISO 45001 sind internationale Standards. Ein
            Zertifikat danach verstehen Kunden und Partner auf der ganzen Welt.
          </p>
          <div className="night-home">
            <p>Ihr Ansprechpartner sitzt in Dortmund-Hörde.</p>
            <button type="button" className="night-fly" onClick={toggle} aria-pressed={focused}>
              {focused ? <GlobeIcon size={17} aria-hidden="true" /> : <MapPin size={17} aria-hidden="true" />}
              {focused ? "Zurück zur Weltkugel" : "Standort zeigen"}
            </button>
          </div>
        </div>
        <div className={focused ? "night-globe is-focused" : "night-globe"}>
          <canvas
            ref={canvas}
            role="img"
            aria-label="Erdkugel bei Nacht mit beleuchteten Städten, Dortmund ist markiert"
          />
          <address className="night-card" aria-hidden={!focused}>
            <strong>Antonio-Segni-Str. 4</strong>
            <span>44263 Dortmund-Hörde</span>
            <a href={contact.mapsHref} target="_blank" rel="noreferrer" tabIndex={focused ? 0 : -1}>
              Route in Google Maps öffnen <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </address>
          <p className="night-hint" aria-hidden="true">
            Zum Drehen ziehen
          </p>
        </div>
      </div>
    </section>
  );
}
