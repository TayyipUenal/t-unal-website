<?php
declare(strict_types=1);
require_once __DIR__ . '/../public/api/inquiry-template.php';

function verify(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$data = ['name' => 'Miriam Beispiel', 'email' => 'miriam@example.com', 'company' => 'Beispiel GmbH', 'phone' => '+49 231 123456', 'topic' => 'ISO 9001', 'message' => "Guten Tag Herr Ünal,\n\nwir möchten unser Qualitätsmanagement auf die nächste Zertifizierung vorbereiten.\n\nBitte kontaktieren Sie uns für ein Erstgespräch zu Umfang, Unterlagen und Zeitplanung.\n\nFreundliche Grüße\nMiriam Beispiel"];
$date = new DateTimeImmutable('2026-09-15T08:30:00Z');
$parts = renderInquiryEmail($data, 'TU-VORSCHAU', $date);
$message = buildInquiryMessage($data, 'TU-VORSCHAU', $date);
verify(str_contains($message['headers']['From'], '<info@tayyipuenal.de>'), 'Unexpected From address');
verify($message['headers']['Reply-To'] === $data['email'], 'Reply-To missing');
verify(str_starts_with($message['headers']['Content-Type'], 'multipart/alternative;'), 'Multipart type missing');
foreach (['plain' => $parts['text'], 'html' => $parts['html']] as $type => $content) {
    preg_match('~Content-Type: text/' . $type . '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--~', $message['body'], $matches);
    verify(isset($matches[1]) && base64_decode($matches[1], true) === $content, "Invalid $type MIME part");
}
$unsafe = $data;
$unsafe['name'] = '<script>alert(1)</script>';
$unsafe['company'] = 'A & B <b>test</b>';
$unsafe['message'] = "<img src=x onerror=alert(1)>\nZweite Zeile & Details";
$escaped = renderInquiryEmail($unsafe, 'TU-ESCAPE', $date);
verify(!str_contains($escaped['html'], '<script>') && !str_contains($escaped['html'], '<img src=x'), 'HTML injection');
verify(str_contains($escaped['html'], '&lt;script&gt;') && str_contains($escaped['html'], '<br>'), 'Escaping or line breaks lost');
verify(str_contains($escaped['text'], $unsafe['message']), 'Plain-text content was altered');
$data['company'] = ''; $data['phone'] = '';
verify(substr_count(renderInquiryEmail($data, 'TU-EMPTY', $date)['html'], 'Nicht angegeben') === 2, 'Optional field fallback missing');
$directory = __DIR__ . '/../preview';
if (!is_dir($directory)) mkdir($directory, 0755, true);
file_put_contents($directory . '/inquiry-email.html', $parts['html']);
$headers = "To: info@tayyipuenal.de\r\nSubject: Website-Anfrage: ISO 9001 [TU-VORSCHAU]\r\n";
foreach ($message['headers'] as $name => $value) $headers .= "$name: $value\r\n";
file_put_contents($directory . '/inquiry-email.eml', $headers . "\r\n" . $message['body']);
echo "PASS: HTML escaping, multiline content, optional fields, sender, Reply-To, UTF-8 MIME parts. Local preview generated; no email sent.\n";
