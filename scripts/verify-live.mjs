import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Compares every deployed public file with the local build over HTTPS and
// checks the mail endpoint's guards. Read-only: no mail is sent.
const site = process.env.SITE_URL ?? 'https://tayyipuenal.de';
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const files = [
  'index.html', 'audits/iso-9001/index.html', 'audits/iso-14001/index.html', 'audits/iso-45001/index.html',
  'impressum/index.html', 'datenschutz/index.html', 'sitemap.xml', 'robots.txt',
  ...readFileSync('dist/index.html', 'utf8').match(/assets\/index-[\w-]+\.(?:js|css)/g),
  'media/workflow-de.mp4', 'media/workflow-de.vtt', 'media/workflow-poster.png',
  'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192x192.png', 'icon-512x512.png', 'site.webmanifest',
];
let failed = 0;
for (const file of [...new Set(files)]) {
  const response = await fetch(`${site}/${file}`, { cache: 'no-store' });
  const remote = response.ok ? sha(Buffer.from(await response.arrayBuffer())) : null;
  const local = sha(readFileSync(`dist/${file}`));
  const ok = remote === local;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}${ok ? '' : ` (http ${response.status})`}`);
}
const get = await fetch(`${site}/api/inquiry.php`, { cache: 'no-store' });
console.log(`${get.status === 405 ? 'OK  ' : 'FAIL'} api/inquiry.php rejects GET (${get.status})`);
if (get.status !== 405) failed++;
const foreign = await fetch(`${site}/api/inquiry.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: '{}' });
console.log(`${foreign.status === 403 ? 'OK  ' : 'FAIL'} api/inquiry.php rejects foreign origin (${foreign.status})`);
if (foreign.status !== 403) failed++;
const quoteProbe = await fetch(`${site}/api/inquiry.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: site }, body: JSON.stringify({ kind: 'quote', standards: [], consent: 'yes', website: '', requestId: '00000000-0000-4000-8000-000000000000', name: 'x', email: 'x@example.com', company: '', phone: '', note: '', situation: '', size: '', timeframe: '' }) });
const quoteBody = await quoteProbe.json().catch(() => ({}));
const quoteOk = quoteProbe.status === 422 && /Norm/.test(quoteBody.message ?? '');
console.log(`${quoteOk ? 'OK  ' : 'FAIL'} api/inquiry.php understands kind=quote (${quoteProbe.status}: ${quoteBody.message ?? ''})`);
if (!quoteOk) failed++;
const template = await fetch(`${site}/api/quote-template.php`, { cache: 'no-store' });
console.log(`${template.status === 200 && (await template.text()).trim() === '' ? 'OK  ' : 'FAIL'} api/quote-template.php present and silent (${template.status})`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll live files match the local build.');
process.exit(failed ? 1 : 0);
