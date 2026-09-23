# Production deployment

## Pending: story-driven redesign — 2026-09-23

Built and verified locally, not uploaded. See `RELEASE-2026-09-23.md` (paper intro on every load, layered hero, pinned "03 · Zusammenarbeit" story, SCC Dok. 017/018 training section with quote and appointment buttons, new palette, reduced-motion fix). `api/inquiry.php` changed (topics SCC-Schulung and Terminanfrage). Before building it, revision 3 of 2026-09-17 was confirmed live: `node scripts/verify-live.mjs` matched every public file on 2026-09-23. Publish with `FTP_USER=w0212c46 sh scripts/deploy-2026-09-17.sh`, then run `node scripts/verify-live.mjs`.

## Quote configurator release — 2026-09-17

Published to `/tayyipuenal.de/` on 2026-09-17 at 15:48 UTC over FTPS with `scripts/deploy-2026-09-17.sh` (curl, main FTP user, password entered interactively by the site owner; nothing stored). See `RELEASE-2026-09-17.md` for the four-step "Angebot" configurator, the motion system, the 1.25× hero video and the extended mail endpoint (`kind: "quote"`, new `public/api/quote-template.php`). The upload also delivered the favicons and `site.webmanifest` from 2026-09-16, which had been referenced by the live pages but were missing on the server.

Verified with `node scripts/verify-live.mjs`: all six pages, both hashed bundles, all media, all icons, sitemap and robots match the local build by SHA-256; the endpoint rejects GET (405) and foreign origins (403), understands `kind=quote` (422 with the German validation message for an empty selection) and `quote-template.php` is present and silent. The live page loads the new bundle with no console errors; the video plays at 1.25×. One labelled test (`Technischer Test`, reply address `qa@example.com`, ISO 9001 + ISO 14001, Erstzertifizierung, 11–50, 1–3 Monate) was sent through the live configurator; the endpoint accepted it with reference `TU-824821AC`. Receipt in `info@tayyipuenal.de` is to be confirmed by the owner.

Operational notes: with the macOS curl the encrypted FTPS data channel stalled on the second transfer and left a 0-byte file, so the script uses `--ftp-ssl-control` (TLS login, plain data). This curl build knows neither `--server-response-timeout` nor `--ftp-response-timeout`. The `/tayyipuenal.com/` folder still holds the older 2026-09-13 build and was not touched.

Rollback: `deployment-backups/2026-09-17-before/` contains the previous HTML pages, the previously referenced bundles `index-c83VwNJI.js` / `index-Dja3RXLY.css` (still present on the server), sitemap, robots and the two PHP files as they were before this release; `manifest.txt` lists what changed. Re-upload those files to revert; `quote-template.php` can stay.

## Reviewed layout and email release — 2026-09-15

Published via Kasserver WebFTP to `/tayyipuenal.de/` after explicit approval. Package: `deployment-backups/tayyipuenal-reviewed-layout-email-2026-09-15.zip`; previous release HTML saved in `deployment-backups/2026-09-15-reviewed-before/`. The previous complete release archive remains available for rollback.

Includes the revised 28-second video with a held handshake ending, a full-width matching header/hero background, the scroll-driven learning timeline, dark collaboration section, higher-contrast contact details and the multipart HTML/plain-text inquiry email. Media URLs have content-based version parameters to refresh cached videos, posters and captions.

Verified: six live pages, current JS/CSS, all hero media, sitemap and robots matched local hashes. The production video decoded without errors, header width matched the viewport and the timeline advanced to step 02 while the ASZ link remained below the viewport. The confirmation reference `TU-B0CE1068` was received in the destination mailbox and the HTML template rendered correctly, including its reply link. No DNS or email-account settings were changed for this release.

## Current release — 2026-09-15

The `.de` site now includes the German hero video, three pre-rendered audit pages, an ASZ training stepper, and PHP-backed inquiry forms. See `RELEASE-2026-09-15.md` for build, mail protections, verification and rollback details. Production form delivery to `info@tayyipuenal.de` was verified with test reference `TU-95DEE5C7`.

The frontend remains static, with the single PHP mail endpoint at `/api/inquiry.php`. No Node service or database is used. All public pages have pre-rendered content and SEO metadata. The older sections below describe the original deployments and are retained as migration history; their mailto-only description does not apply to the current `.de` forms.

Published on 2026-09-13 at https://tayyipuenal.com/ using ALL-INKL WebFTP.

## Hosting layout

- Domain document root: `/tayyipuenal.com/` (confirmed in KAS).
- Upload only the contents of `dist/`, including `.htaccess`.
- No Node.js process, database, or server-side application is required.
- The same build is live in `/tayyipuenal.de/`. On 2026-09-13 its apex and www A records were changed from `185.158.133.1` to `85.13.148.238`; all email and verification records were preserved. The KAS-managed Let's Encrypt certificate is active for both hostnames.
- Consultation form and quote configurator post to the PHP endpoint `/api/inquiry.php`; contact links additionally open the visitor's email application.
- Legal pages are local `/impressum` and `/datenschutz` routes on both domains. Business email remains `info@tayyipuenal.de`.
- Font files are served from this hosting; there are no Google Fonts network requests.

## Rebuild and publish

```sh
npm ci
npm run build
npm run lint
```

Upload the generated `assets/` directory and `brand-logo.png` first, then `.htaccess` and `index.html`. Keep existing hashed assets during updates to support previously loaded pages.

The Apache configuration selects `index.html`, serves the two legal routes, redirects HTTP to HTTPS on the matching production domain, and enables compression and static asset caching. ACME challenge paths remain accessible for certificate issuance. The server was verified to serve Brotli-compressed HTML, CSS and JavaScript. HTML is revalidated, while hashed JavaScript and CSS use a one-year immutable cache.

## Backup and recovery

The previous hosting welcome page remains on the server as `/tayyipuenal.com/index.htm`. A local copy is stored at `deployment-backups/tayyipuenal-com-index-2026-09-13.htm`; the deployed release archive is `deployment-backups/tayyipuenal-release-2026-09-13.zip`.

The later legal-page release is `deployment-backups/tayyipuenal-legal-release-2026-09-13.zip`. Source legal-page text and the old `.de` application entry point were preserved alongside it. See `deployment-backups/de-dns-before-2026-09-13.md` for the DNS rollback. The previous website at the original provider was not removed.

The new legal pages retain the original business identity, address, qualifications and tax details. The obsolete TMG reference was updated to § 5 DDG. Privacy descriptions were adapted to this site's actual email links, in-memory selection, local fonts and ALL-INKL hosting; the previous site's contact form, newsletter and cookie descriptions are not presented as active features.

To restore the previous welcome page, change the first line of `.htaccess` to `DirectoryIndex index.htm index.html`. No files need to be deleted.

## Verification

### Legal-page release, 2026-09-13

- `.com` root and both legal routes, with and without trailing slash, returned 200 with the new application bundle.
- All 12 bundled assets on `.com` matched local SHA-256 hashes.
- All 14 public build files in the `.de` document root matched local SHA-256 hashes via the KAS transition hostname; both legal routes returned 200 there.
- Both authoritative nameservers and public resolvers returned `85.13.148.238` for `.de` and `www`. The MX record remained `10 w0212c46.kasserver.com.`.
- **Completed:** KAS's Let's Encrypt precheck initially cached the old address. Issuance succeeded after the cache refreshed; at 18:55 UTC both apex and www served the new build over verified TLS. Root, Impressum and Datenschutz were checked on both hostnames against the new origin, with certificate verification enabled. The www legal pages were also verified in a browser. Some clients may keep the previous apex address until their cached 7200-second TTL expires; the old hosting was preserved during propagation.
- The user explicitly approved the displayed ALL-INKL Let's Encrypt liability disclaimer and certificate activation. The approval remains applicable to retrying this same issuance request.

### Initial COM release

- Production build and lint passed.
- All four public build files returned HTTP 200 and matched local SHA-256 hashes.
- HTTPS worked for the apex and www domains; HTTP redirected to HTTPS.
- Desktop and mobile rendering, loaded logos, and training selection were checked live.
- The selected training appeared in the inquiry email subject; no email was sent.
- No browser console warnings or errors were observed during the live check.
