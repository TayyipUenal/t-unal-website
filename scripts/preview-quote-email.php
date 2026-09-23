<?php
declare(strict_types=1);
require_once __DIR__ . '/../public/api/inquiry-template.php';
require_once __DIR__ . '/../public/api/quote-template.php';

function verify(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$input = ['kind' => 'quote', 'standards' => ['ISO 45001', 'ISO 9001'], 'situation' => 'Rezertifizierung', 'size' => '51–250 Mitarbeitende', 'timeframe' => 'Innerhalb von 4 Wochen', 'name' => 'Miriam Beispiel', 'email' => 'miriam@example.com', 'company' => 'Beispiel GmbH', 'phone' => '+49 231 123456', 'note' => "Unser Zertifikat läuft im Dezember aus.\nZwei Standorte in Dortmund und Bochum.", 'website' => '', 'consent' => 'yes', 'requestId' => '5f0c9c1e-6b7a-4d2f-9a4e-8b1c2d3e4f50'];
$data = normalizeQuoteRequest($input);
verify(is_array($data), 'Sample input rejected: ' . (is_string($data) ? $data : ''));
verify($data['standards'] === ['ISO 9001', 'ISO 45001'], 'Standards not normalized to canonical order');
verify(is_string(normalizeQuoteRequest(['standards' => []] + $input)), 'Empty standards accepted');
verify(is_string(normalizeQuoteRequest(['size' => 'viele'] + $input)), 'Unknown size accepted');
verify(is_string(normalizeQuoteRequest(['website' => 'x'] + $input)), 'Honeypot accepted');
$date = new DateTimeImmutable('2026-09-17T12:05:00Z');
verify(quoteSubjectLine($data, 'TU-VORSCHAU') === 'Angebotsanfrage: ISO 9001 + ISO 45001 [TU-VORSCHAU]', 'Unexpected subject');
$parts = renderQuoteEmail($data, 'TU-VORSCHAU', $date);
$message = buildQuoteMessage($data, 'TU-VORSCHAU', $date);
verify(str_contains($message['headers']['From'], '<info@tayyipuenal.de>'), 'Unexpected From address');
verify($message['headers']['Reply-To'] === $data['email'], 'Reply-To missing');
verify(str_starts_with($message['headers']['Content-Type'], 'multipart/alternative;'), 'Multipart type missing');
foreach (['plain' => $parts['text'], 'html' => $parts['html']] as $type => $content) {
    preg_match('~Content-Type: text/' . $type . '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--~', $message['body'], $matches);
    verify(isset($matches[1]) && base64_decode($matches[1], true) === $content, "Invalid $type MIME part");
}
foreach (['ISO 9001', 'ISO 45001', 'Rezertifizierung', '51–250 Mitarbeitende', 'Innerhalb von 4 Wochen', 'zeitnah', 'Schritt 5 · Kontaktdaten', 'Beispiel GmbH', 'Zwei Standorte'] as $needle) {
    verify(str_contains($parts['html'], $needle), "HTML is missing: $needle");
}
verify(str_contains($parts['text'], "1. Norm: ISO 9001, ISO 45001") && str_contains($parts['text'], "3. Unternehmensgröße: 51–250 Mitarbeitende") && str_contains($parts['text'], 'Zwei Standorte'), 'Plain text incomplete');
$unsafe = $input;
$unsafe['name'] = '<script>alert(1)</script>';
$unsafe['company'] = 'A & B <b>test</b>';
$unsafe['note'] = "<img src=x onerror=alert(1)>\nZweite Zeile & Details";
$escaped = renderQuoteEmail(normalizeQuoteRequest($unsafe), 'TU-ESCAPE', $date);
verify(!str_contains($escaped['html'], '<script>') && !str_contains($escaped['html'], '<img src=x'), 'HTML injection');
verify(str_contains($escaped['html'], '&lt;script&gt;') && str_contains($escaped['html'], 'Zweite Zeile &amp; Details'), 'Escaping or line breaks lost');
verify(str_contains($escaped['text'], $unsafe['note']), 'Plain-text content was altered');
$sparse = normalizeQuoteRequest(['company' => '', 'phone' => '', 'note' => '', 'timeframe' => 'In 1–3 Monaten'] + $input);
$sparseParts = renderQuoteEmail($sparse, 'TU-EMPTY', $date);
verify(substr_count($sparseParts['html'], 'Nicht angegeben') === 2, 'Optional field fallback missing');
verify(!str_contains($sparseParts['html'], 'Anmerkung') && !str_contains($sparseParts['html'], 'zeitnah'), 'Empty note or non-urgent badge rendered');
$directory = __DIR__ . '/../preview';
if (!is_dir($directory)) mkdir($directory, 0755, true);
file_put_contents($directory . '/quote-email.html', $parts['html']);
$headers = "To: info@tayyipuenal.de\r\nSubject: " . quoteSubjectLine($data, 'TU-VORSCHAU') . "\r\n";
foreach ($message['headers'] as $name => $value) $headers .= "$name: $value\r\n";
file_put_contents($directory . '/quote-email.eml', $headers . "\r\n" . $message['body']);
echo "PASS: normalization, subject, MIME parts, step summary, escaping, optional fields. Local preview generated; no email sent.\n";
