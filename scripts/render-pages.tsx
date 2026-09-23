import { renderToString } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import App from "../src/App";
import { SITE_URL, pageMeta, structuredData } from "../src/seo";

const template = readFileSync("dist/index.html", "utf8");
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
for (const page of pageMeta) {
  const url = SITE_URL + page.path;
  const head = `<title>${escape(page.title)}</title>\n<meta name="description" content="${escape(page.description)}" />\n<link rel="canonical" href="${url}" />\n<meta name="robots" content="index, follow, max-image-preview:large" />\n<meta property="og:type" content="website" />\n<meta property="og:locale" content="de_DE" />\n<meta property="og:site_name" content="Tayyip Ünal" />\n<meta property="og:title" content="${escape(page.title)}" />\n<meta property="og:description" content="${escape(page.description)}" />\n<meta property="og:url" content="${url}" />\n<meta property="og:image" content="${SITE_URL}/media/workflow-poster.png" />\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:title" content="${escape(page.title)}" />\n<meta name="twitter:description" content="${escape(page.description)}" />\n<meta name="twitter:image" content="${SITE_URL}/media/workflow-poster.png" />\n<script type="application/ld+json">${JSON.stringify(structuredData(page.path)).replaceAll("<", "\\u003c")}</script>`;
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, "")
    .replace("</head>", `${head}\n</head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderToString(React.createElement(App, { path: page.path }))}</div>`,
    );
  const directory = join("dist", page.path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "index.html"), html);
  console.log("Prerendered", page.path);
}
writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pageMeta.map((page) => `<url><loc>${SITE_URL}${page.path}</loc></url>`).join("")}</urlset>`,
);
writeFileSync(
  "dist/robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);
import React from "react";
