import { BrandLogo } from "./BrandLogo";

export function Footer() {
  return (
    <footer className="footer">
      <a className="footer-logo" href="/" aria-label="Tayyip Ünal Startseite">
        <BrandLogo />
      </a>
      <p>Audit · Zertifizierung · Schulung</p>
      <div>
        <a href="/impressum/">Impressum</a>
        <a href="/datenschutz/">Datenschutz</a>
      </div>
      <span>© {new Date().getFullYear()}</span>
    </footer>
  );
}
