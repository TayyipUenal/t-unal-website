import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Only targets the isolated local PHP test container (mail replaced by
// /bin/true). Run against a fresh container: the hourly per-IP limit is
// shared between the consultation form and the quote configurator.
const url = 'http://127.0.0.1:8086/api/inquiry.php';
const quote = {
  kind: 'quote',
  standards: ['ISO 14001', 'ISO 9001'],
  situation: 'Erstzertifizierung',
  size: '11–50 Mitarbeitende',
  timeframe: 'Innerhalb von 4 Wochen',
  name: 'Technischer Test',
  email: 'qa@example.com',
  company: 'Test GmbH',
  phone: '',
  note: 'Lokaler Funktionstest des Konfigurators.',
  website: '',
  consent: 'yes',
  requestId: randomUUID(),
};
const inquiry = { name: 'Technischer Test', email: 'qa@example.com', company: 'Test', phone: '', topic: 'ISO 9001', message: 'Dies ist ein lokaler technischer Funktionstest.', website: '', consent: 'yes' };
const post = async (data, origin = 'https://tayyipuenal.de') =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) });
const status = async (data) => (await post(data)).status;

assert.equal(await status({ ...quote, standards: [] }), 422, 'empty standards');
assert.equal(await status({ ...quote, standards: ['ISO 27001'] }), 422, 'unknown standard');
assert.equal(await status({ ...quote, standards: 'ISO 9001' }), 422, 'standards must be a list');
assert.equal(await status({ ...quote, timeframe: 'Morgen' }), 422, 'unknown timeframe');
assert.equal(await status({ ...quote, situation: 'Sonstiges' }), 422, 'unknown situation');
assert.equal(await status({ ...quote, size: '7' }), 422, 'unknown size');
assert.equal(await status({ ...quote, consent: '' }), 422, 'consent required');
assert.equal(await status({ ...quote, website: 'https://spam.example' }), 422, 'honeypot');
assert.equal(await status({ ...quote, name: 'A' }), 422, 'name too short');
assert.equal(await status({ ...quote, email: 'qa@example.com\r\nBcc: other@example.com' }), 422, 'header injection');
assert.equal(await status({ ...quote, note: 'x'.repeat(2001) }), 422, 'note too long');
assert.equal(await status({ ...quote, requestId: 'nope' }), 422, 'request id format');
assert.equal((await post(quote, 'https://foreign.example')).status, 403, 'origin');

const first = await post(quote);
assert.equal(first.status, 200);
const sent = await first.json();
assert.equal(sent.ok, true);
assert.match(sent.reference, /^TU-[A-F0-9]{8}$/);
const duplicate = await post(quote);
assert.equal(duplicate.status, 200, 'retry is idempotent');
assert.equal((await duplicate.json()).reference, sent.reference);
assert.equal(await status({ ...quote, note: 'Geänderte Angaben mit gleicher Anfragekennung.' }), 409, 'changed request conflicts');
assert.equal(await status({ ...quote, standards: ['ISO 9001', 'ISO 14001'], requestId: quote.requestId }), 200, 'standards are normalized to canonical order');

// Shared hourly limit: 1 quote + 4 inquiries = 5 successes, the sixth is rejected.
for (let i = 0; i < 4; i++) assert.equal(await status({ ...inquiry, requestId: randomUUID() }), 200, `inquiry ${i + 1}`);
assert.equal(await status({ ...quote, requestId: randomUUID() }), 429, 'shared rate limit');
console.log('PASS: quote validation, origin, honeypot, injection, success, idempotency, conflict, normalization, shared rate limit.');
