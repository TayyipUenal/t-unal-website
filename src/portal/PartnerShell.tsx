import type { ReactNode } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";

/**
 * Stand-alone frame for the partner world (login, portal, application). It has its own slim header and
 * footer and none of the homepage navigation, so partners work in a space that is clearly separate from the site.
 */
export function PartnerShell({ children }: { children: ReactNode }) {
  return (
    <div className="ps-shell">
      <header className="ps-header">
        <a className="ps-brand" href="/portal" aria-label="Partnerbereich Tayyip Ünal">
          <BrandLogo />
          <span className="ps-tag">Partnerbereich</span>
        </a>
        <div className="ps-actions">
          <a className="text-link" href="/" target="_blank" rel="noopener">
            Zur Website
          </a>
          <ThemeToggle />
        </div>
      </header>
      <main className="ps-main">{children}</main>
      <footer className="ps-footer">
        <span>© {new Date().getFullYear()} Tayyip Ünal · Partnerbereich</span>
        <span>
          <a href="/impressum/" target="_blank" rel="noopener">
            Impressum
          </a>
          <a href="/datenschutz/" target="_blank" rel="noopener">
            Datenschutz
          </a>
        </span>
      </footer>
    </div>
  );
}
