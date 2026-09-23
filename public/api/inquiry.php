<?php
declare(strict_types=1);
require_once __DIR__ . '/inquiry-template.php';
require_once __DIR__ . '/quote-template.php';

// Small same-origin mail endpoint for the existing ALL-INKL PHP hosting.
// Handles the consultation form (default) and the four-step quote
// configurator ("kind": "quote"); both share the same guards and limits.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['ok' => false, 'message' => 'Bitte verwenden Sie das Anfrageformular.']);
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = ['https://tayyipuenal.de', 'https://www.tayyipuenal.de', 'https://tayyipuenal.com', 'https://www.tayyipuenal.com'];
if (!in_array($origin, $allowedOrigins, true)) {
    respond(403, ['ok' => false, 'message' => 'Bitte öffnen Sie das Formular direkt auf unserer Website.']);
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    respond(415, ['ok' => false, 'message' => 'Ungültiges Anfrageformat.']);
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 20000) {
    respond(413, ['ok' => false, 'message' => 'Die Nachricht ist zu lang.']);
}
$raw = file_get_contents('php://input', false, null, 0, 20001);
if ($raw === false || strlen($raw) > 20000) respond(413, ['ok' => false, 'message' => 'Die Nachricht ist zu lang.']);
$data = json_decode($raw, true);
if (!is_array($data)) respond(400, ['ok' => false, 'message' => 'Die Anfrage konnte nicht gelesen werden.']);

$kind = ($data['kind'] ?? '') === 'quote' ? 'quote' : 'inquiry';
if ($kind === 'quote') {
    $normalized = normalizeQuoteRequest($data);
    if (is_string($normalized)) respond(422, ['ok' => false, 'message' => $normalized]);
    $data = $normalized;
    $contentFields = ['name', 'email', 'company', 'phone', 'standards', 'situation', 'size', 'timeframe', 'note'];
} else {
    $fields = ['name', 'email', 'company', 'phone', 'topic', 'message', 'website', 'consent', 'requestId'];
    foreach ($fields as $field) {
        if (!is_string($data[$field] ?? '')) respond(422, ['ok' => false, 'message' => 'Bitte prüfen Sie Ihre Angaben.']);
        $data[$field] = trim($data[$field] ?? '');
    }
    $topics = ['Erstgespräch', 'Terminanfrage', 'ISO 9001', 'ISO 14001', 'ISO 45001', 'SCC-Schulung', 'Arbeitssicherheit', 'Arbeitsmedizin', 'Schulungen', 'Beratung & Consulting', 'Factoring-Vermittlung'];
    if ($data['website'] !== '' || $data['consent'] !== 'yes' || !in_array($data['topic'], $topics, true)) {
        respond(422, ['ok' => false, 'message' => 'Bitte prüfen Sie Ihr Thema und die Datenschutzhinweise.']);
    }
    if (!preg_match('/^[a-f0-9-]{36}$/i', $data['requestId'])) respond(422, ['ok' => false, 'message' => 'Bitte laden Sie die Seite neu und versuchen Sie es erneut.']);
    if (strlen($data['name']) < 2 || strlen($data['name']) > 300 || strlen($data['company']) > 480 || strlen($data['phone']) > 80 || strlen($data['message']) < 10 || strlen($data['message']) > 12000) {
        respond(422, ['ok' => false, 'message' => 'Bitte geben Sie einen Namen und eine Nachricht zwischen 10 und 4.000 Zeichen ein.']);
    }
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL) || strlen($data['email']) > 254) {
        respond(422, ['ok' => false, 'message' => 'Bitte geben Sie eine gültige E-Mail-Adresse ein.']);
    }
    foreach (['name', 'email', 'company', 'phone'] as $field) {
        if (preg_match('/[\x00-\x1F\x7F]/', $data[$field])) respond(422, ['ok' => false, 'message' => 'Bitte entfernen Sie Zeilenumbrüche aus den Kontaktdaten.']);
    }
    $contentFields = ['name', 'email', 'company', 'phone', 'topic', 'message'];
}

// Only hashed IPs, request fingerprints and delivery status are kept for one
// hour, outside the public document root. No form content is written to disk.
$statePath = sys_get_temp_dir() . '/tu-inquiries-' . hash('sha256', __DIR__) . '.json';
$file = fopen($statePath, 'c+');
if ($file === false || !flock($file, LOCK_EX)) respond(503, ['ok' => false, 'message' => 'Der Versand ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.']);
chmod($statePath, 0600);
$state = json_decode(stream_get_contents($file) ?: '[]', true);
$now = time();
$entries = is_array($state) ? array_values(array_filter($state, fn($entry) => is_array($entry) && ($entry['time'] ?? 0) > $now - 3600)) : [];
$ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . __DIR__);
$fingerprint = hash('sha256', json_encode(array_intersect_key($data, array_flip($contentFields))));
foreach ($entries as $entry) {
    if (($entry['id'] ?? '') === $data['requestId']) {
        if (($entry['fingerprint'] ?? '') !== $fingerprint) respond(409, ['ok' => false, 'message' => 'Die Angaben wurden geändert. Bitte senden Sie das Formular erneut.']);
        if ($entry['sent'] ?? false) respond(200, ['ok' => true, 'reference' => $entry['reference']]);
    }
}
$recent = array_filter($entries, fn($entry) => ($entry['ip'] ?? '') === $ip);
if (count($recent) >= 5 || count($entries) >= 100) {
    header('Retry-After: 3600');
    respond(429, ['ok' => false, 'message' => 'Es wurden bereits mehrere Anfragen gesendet. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns telefonisch.']);
}
$reference = 'TU-' . strtoupper(bin2hex(random_bytes(4)));
$recipient = 'info@tayyipuenal.de';
$receivedAt = new DateTimeImmutable('now', new DateTimeZone('UTC'));
$subjectLine = $kind === 'quote' ? quoteSubjectLine($data, $reference) : 'Website-Anfrage: ' . $data['topic'] . ' [' . $reference . ']';
$subject = '=?UTF-8?B?' . base64_encode($subjectLine) . '?=';
$message = $kind === 'quote' ? buildQuoteMessage($data, $reference, $receivedAt) : buildInquiryMessage($data, $reference, $receivedAt);
$sent = mail($recipient, $subject, $message['body'], $message['headers'], '-f info@tayyipuenal.de');
$entries[] = ['time' => $now, 'id' => $data['requestId'], 'ip' => $ip, 'fingerprint' => $fingerprint, 'sent' => $sent, 'reference' => $reference];
rewind($file); ftruncate($file, 0); fwrite($file, json_encode($entries)); fflush($file); flock($file, LOCK_UN); fclose($file);
if (!$sent) respond(503, ['ok' => false, 'message' => 'Die Nachricht konnte nicht versendet werden. Bitte versuchen Sie es erneut oder schreiben Sie an info@tayyipuenal.de.']);
respond(200, ['ok' => true, 'reference' => $reference]);
