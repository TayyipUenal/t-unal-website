import { ArrowRight, BadgeCheck } from "lucide-react";
import { ACCREDITED_FROM, openTool } from "./tools";

/** Hero card: accredited ISO 9001 from the entry price, through the network; opens the offers tool. */
export function OfferCard() {
  return (
    <button type="button" className="oc" onClick={() => openTool("angebote")}>
      <span className="oc-seal">
        <BadgeCheck size={30} aria-hidden="true" />
      </span>
      <span className="oc-text">
        <span className="oc-kicker">
          <i>NEU</i>Über mein Netzwerk
        </span>
        <span className="oc-title">Akkreditierte ISO 9001 Zertifizierung</span>
        <span className="oc-price">
          <small>bereits ab</small>
          {ACCREDITED_FROM}
        </span>
      </span>
      <span className="oc-go">
        Angebote vergleichen <ArrowRight size={17} aria-hidden="true" />
      </span>
    </button>
  );
}
