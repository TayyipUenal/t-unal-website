type BrandLogoProps = { className?: string };

/** Frames the supplied artwork without altering the original file. */
export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <span className={`brand-artwork ${className}`}>
      <img
        src="/brand-logo.png"
        alt="Tayyip Ünal — Digitale Lösungen. Echte Ergebnisse."
        width={1254}
        height={1254}
      />
    </span>
  );
}
