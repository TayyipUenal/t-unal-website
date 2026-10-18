type BrandLogoProps = { className?: string };

/** Wordmark with a gold monogram, set in the page's own type. */
export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <span className={`brand-mark ${className}`} role="img" aria-label="Tayyip Ünal – Audit, Zertifizierung, Schulung">
      <span className="brand-monogram" aria-hidden="true">
        TÜ
      </span>
      <span className="brand-word" aria-hidden="true">
        <b>TAYYİP ÜNAL</b>
        <i>Audit · Zertifizierung · Schulung</i>
      </span>
    </span>
  );
}
