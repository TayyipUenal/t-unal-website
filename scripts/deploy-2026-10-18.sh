#!/bin/sh
# Lädt das Release 2026-10-18 per FTPS (curl) in den ALL-INKL Webspace.
#
#   FTP_USER=w0212c46 sh scripts/deploy-2026-10-18.sh   -> fragt das Passwort einmal ab
#   sh scripts/deploy-2026-10-18.sh                     -> nutzt ~/.netrc
#
# Optional: FTP_HOST (Standard w0212c46.kasserver.com), REMOTE_ROOT (Standard
# tayyipuenal.de), DRY_RUN=1 zeigt nur den Plan. Es wird nichts gelöscht.
set -eu
cd "$(dirname "$0")/.."
FTP_HOST="${FTP_HOST:-w0212c46.kasserver.com}"
REMOTE_ROOT="${REMOTE_ROOT:-tayyipuenal.de}"
BASE="ftp://$FTP_HOST/$REMOTE_ROOT"
[ -d dist/assets ] || { echo "dist/ fehlt: zuerst npm run build ausführen" >&2; exit 1; }

# Reihenfolge für eine laufende Website: zuerst alle Assets (Bundles, Lazy-Chunks, Schriften; alte bleiben),
# dann der abwärtskompatible PHP-Endpunkt, zuletzt das HTML, das sie verweist.
set --
for f in dist/assets/*; do set -- "$@" -T "$f" "$BASE/assets/$(basename "$f")"; done
for f in favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png icon-192x192.png icon-512x512.png site.webmanifest; do set -- "$@" -T "dist/$f" "$BASE/$f"; done
for f in inquiry-template.php quote-template.php inquiry.php; do set -- "$@" -T "dist/api/$f" "$BASE/api/$f"; done
for p in audits/iso-9001 audits/iso-14001 audits/iso-45001 impressum datenschutz; do set -- "$@" -T "dist/$p/index.html" "$BASE/$p/index.html"; done
set -- "$@" -T dist/sitemap.xml "$BASE/sitemap.xml" -T dist/robots.txt "$BASE/robots.txt" -T dist/index.html "$BASE/index.html"

if [ "${DRY_RUN:-0}" = "1" ]; then
  printf '%s\n' "$@" | paste - - - | awk -F'\t' '{print "würde hochladen: " $2 "  ->  " $3}'
  exit 0
fi
if [ -n "${FTP_USER:-}" ]; then set -- --user "$FTP_USER" "$@"; else set -- -n "$@"; fi
echo "Verbinde mit $FTP_HOST (FTPS) …"
# Login verschlüsselt (AUTH TLS), Datenkanal unverschlüsselt: die TLS-Datenverbindung
# blieb mit dem macOS-curl beim zweiten Transfer hängen (0-Byte-Datei, Timeout).
curl -sS --fail --fail-early --ftp-ssl-control --ftp-create-dirs -w 'hochgeladen: %{url_effective}\n' "$@"
echo "Fertig: $(date -u +%Y-%m-%dT%H:%M:%SZ) – alle Dateien übertragen."
