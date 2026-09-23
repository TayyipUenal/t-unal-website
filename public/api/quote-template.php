<?php
declare(strict_types=1);

// Allowed values for the four-step quote configurator. They mirror
// src/quote.ts; keep both lists in sync when adding options.
const QUOTE_STANDARDS = ['ISO 9001', 'ISO 14001', 'ISO 45001'];
const QUOTE_SITUATIONS = ['Erstzertifizierung', 'Rezertifizierung', 'System optimieren'];
const QUOTE_SIZES = ['1–10 Mitarbeitende', '11–50 Mitarbeitende', '51–250 Mitarbeitende', 'Über 250 Mitarbeitende'];
const QUOTE_TIMEFRAMES = ['Innerhalb von 4 Wochen', 'In 1–3 Monaten', 'In mehr als 3 Monaten'];

/** Validates and normalizes a configurator submission. Returns the clean data or a German error message. */
function normalizeQuoteRequest(array $data): array|string {
    $strings = ['name', 'email', 'company', 'phone', 'note', 'situation', 'size', 'timeframe', 'website', 'consent', 'requestId'];
    foreach ($strings as $field) {
        if (!is_string($data[$field] ?? '')) return 'Bitte prüfen Sie Ihre Angaben.';
        $data[$field] = trim($data[$field] ?? '');
    }
    if ($data['website'] !== '' || $data['consent'] !== 'yes') return 'Bitte bestätigen Sie die Datenschutzhinweise.';
    if (!preg_match('/^[a-f0-9-]{36}$/i', $data['requestId'])) return 'Bitte laden Sie die Seite neu und versuchen Sie es erneut.';
    $standards = $data['standards'] ?? null;
    if (!is_array($standards) || $standards === [] || count($standards) > count(QUOTE_STANDARDS)) return 'Bitte wählen Sie mindestens eine Norm.';
    foreach ($standards as $standard) {
        if (!is_string($standard) || !in_array(trim($standard), QUOTE_STANDARDS, true)) return 'Bitte wählen Sie mindestens eine Norm.';
    }
    $chosen = array_map('trim', $standards);
    $data['standards'] = array_values(array_filter(QUOTE_STANDARDS, fn(string $standard) => in_array($standard, $chosen, true)));
    if (!in_array($data['situation'], QUOTE_SITUATIONS, true) || !in_array($data['size'], QUOTE_SIZES, true) || !in_array($data['timeframe'], QUOTE_TIMEFRAMES, true)) {
        return 'Bitte prüfen Sie Ihre Auswahl zu Ausgangslage, Unternehmensgröße und Zeitrahmen.';
    }
    if (strlen($data['name']) < 2 || strlen($data['name']) > 300) return 'Bitte geben Sie Ihren Namen an.';
    if (strlen($data['company']) > 480 || strlen($data['phone']) > 80 || strlen($data['note']) > 2000) return 'Bitte kürzen Sie Ihre Angaben (Anmerkung maximal 2.000 Zeichen).';
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL) || strlen($data['email']) > 254) return 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
    foreach (['name', 'email', 'company', 'phone'] as $field) {
        if (preg_match('/[\x00-\x1F\x7F]/', $data[$field])) return 'Bitte entfernen Sie Zeilenumbrüche aus den Kontaktdaten.';
    }
    return array_intersect_key($data, array_flip([...$strings, 'standards']));
}

function quoteStandardsLabel(array $data): string {
    return implode(' + ', $data['standards']);
}

function quoteSubjectLine(array $data, string $reference): string {
    return 'Angebotsanfrage: ' . quoteStandardsLabel($data) . ' [' . $reference . ']';
}

/** Owner notification for a configurator request. Mirrors the four steps of the website flow. */
function renderQuoteEmail(array $data, string $reference, DateTimeImmutable $receivedAt): array {
    $escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $name = $escape($data['name']);
    $email = $escape($data['email']);
    $ref = $escape($reference);
    $date = $receivedAt->setTimezone(new DateTimeZone('Europe/Berlin'))->format('d.m.Y · H:i');
    $standardsLabel = quoteStandardsLabel($data);
    $replyUrl = $escape('mailto:' . $data['email'] . '?subject=' . rawurlencode('Ihr Angebot: ' . $standardsLabel . ' [' . $reference . ']'));
    $urgent = $data['timeframe'] === QUOTE_TIMEFRAMES[0];

    $pills = '';
    foreach ($data['standards'] as $standard) {
        $pills .= '<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:#e3f2fa;border:1px solid #bddcec;color:#0f5f86;font:700 13px/1.3 Arial,sans-serif;">' . $escape($standard) . '</span>';
    }
    $timeframe = '<span style="font:700 16px/1.6 Arial,sans-serif;color:#173e55;">' . $escape($data['timeframe']) . '</span>';
    if ($urgent) $timeframe .= ' <span style="display:inline-block;margin-left:6px;padding:4px 9px;border-radius:999px;background:#fff4dc;border:1px solid #f0d49a;color:#8a5a00;font:700 11px/1.3 Arial,sans-serif;letter-spacing:.4px;text-transform:uppercase;">zeitnah</span>';
    $strong = static fn(string $value): string => '<span style="font:700 16px/1.6 Arial,sans-serif;color:#173e55;">' . $escape($value) . '</span>';
    $steps = [
        ['Norm', $pills, 'Schritt 1'],
        ['Ausgangslage', $strong($data['situation']), 'Schritt 2'],
        ['Unternehmensgröße', $strong($data['size']), 'Schritt 3'],
        ['Zeitrahmen', $timeframe, 'Schritt 4'],
    ];
    $stepRows = '';
    foreach ($steps as $index => [$label, $value, $step]) {
        $number = $index + 1;
        $border = $index < count($steps) - 1 ? 'border-bottom:1px solid #dbe8ef;' : '';
        $stepRows .= '<tr><td valign="top" width="46" style="padding:16px 0;' . $border . '"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="32" height="32" bgcolor="#0784b8" style="width:32px;height:32px;border-radius:16px;background:#0784b8;color:#ffffff;font:700 13px/32px Arial,sans-serif;">' . $number . '</td></tr></table></td>'
            . '<td valign="top" style="padding:16px 0 16px 6px;' . $border . '"><p style="margin:0 0 5px;font:700 11px/1.5 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#4d6b7a;">' . $step . ' · ' . $label . '</p><div style="word-break:break-word;overflow-wrap:anywhere;">' . $value . '</div></td></tr>';
    }

    $fields = ['Name' => $data['name'], 'E-Mail' => $data['email'], 'Unternehmen' => $data['company'] ?: 'Nicht angegeben', 'Telefon' => $data['phone'] ?: 'Nicht angegeben'];
    $rows = '';
    foreach ($fields as $label => $value) {
        $safeValue = $escape($value);
        if ($label === 'E-Mail') $safeValue = '<a href="mailto:' . $email . '" style="color:#12698f;text-decoration:underline;word-break:break-word;">' . $email . '</a>';
        $rows .= '<tr><th class="field-label" align="left" valign="top" width="130" style="padding:13px 12px 13px 0;border-bottom:1px solid #e0eaf0;color:#526d7d;font:normal 13px/1.6 Arial,sans-serif;">' . $label . '</th><td class="field-value" valign="top" style="padding:13px 0;border-bottom:1px solid #e0eaf0;color:#173e55;font:16px/1.6 Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere;">' . $safeValue . '</td></tr>';
    }
    $noteBlock = '';
    if ($data['note'] !== '') {
        $note = nl2br($escape($data['note']), false);
        $noteBlock = '<tr><td class="email-pad" style="padding:0 36px 30px;"><h2 style="margin:0 0 14px;font:700 18px/1.4 Arial,sans-serif;color:#173e55;">Anmerkung</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:22px;background:#f5f9fc;border:1px solid #dce8ef;border-radius:9px;color:#234c63;font:16px/1.8 Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere;">' . $note . '</td></tr></table></td></tr>';
    }
    $safeStandards = $escape($standardsLabel);
    $html = <<<HTML
<!doctype html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Angebotsanfrage · {$safeStandards}</title>
<style>@media only screen and (max-width:520px){.email-pad{padding:24px 20px!important}.email-title{font-size:27px!important}.field-label{width:95px!important}.email-outer{padding:16px 8px!important}.email-logo{width:90px!important;height:90px!important}}</style></head>
<body style="margin:0;padding:0;background:#edf4f8;color:#173e55;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#edf4f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Angebotsanfrage von {$name}: {$safeStandards}. Referenz {$ref}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edf4f8;"><tr><td class="email-outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #d4e3ec;border-top:5px solid #0784b8;border-radius:12px;">
<tr><td class="email-pad" style="padding:24px 36px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><p style="margin:0 0 7px;font:700 21px/1.3 Arial,sans-serif;letter-spacing:.3px;color:#174a64;">Tayyip Ünal</p><p style="margin:0;font:13px/1.6 Arial,sans-serif;color:#526e80;">Audits · Qualifikation · Beratung</p></td><td width="112" align="right"><img class="email-logo" src="https://tayyipuenal.de/brand-logo.png" width="112" height="112" alt="Tayyip Ünal" style="display:block;border:0;width:112px;height:112px;"></td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:28px 36px;background:#edf7fc;border-top:1px solid #d7e9f2;border-bottom:1px solid #d7e9f2;">
<p style="margin:0 0 12px;font:700 12px/1.5 Arial,sans-serif;letter-spacing:1.1px;text-transform:uppercase;color:#1b7096;">Angebots-Konfigurator · {$safeStandards}</p>
<h1 class="email-title" style="margin:0 0 16px;font:700 32px/1.2 Arial,sans-serif;color:#173e55;">Neue Angebotsanfrage</h1>
<p style="margin:0;font:14px/1.8 Arial,sans-serif;color:#416477;">Referenz <strong style="color:#173e55;">{$ref}</strong><br>Eingegangen am {$date} Uhr (Europe/Berlin)<br>Alle fünf Schritte des Konfigurators abgeschlossen.</p>
</td></tr>
<tr><td class="email-pad" style="padding:30px 36px 14px;">
<h2 style="margin:0 0 4px;font:700 18px/1.4 Arial,sans-serif;color:#173e55;">Auswahl im Konfigurator</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">{$stepRows}</table>
</td></tr>
<tr><td class="email-pad" style="padding:16px 36px 30px;">
<h2 style="margin:0 0 10px;font:700 18px/1.4 Arial,sans-serif;color:#173e55;">Schritt 5 · Kontaktdaten</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;">{$rows}</table>
</td></tr>
{$noteBlock}
<tr><td class="email-pad" style="padding:0 36px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#076f9b" style="border-radius:7px;background:#076f9b;mso-padding-alt:15px 24px;"><a href="{$replyUrl}" style="display:inline-block;padding:15px 24px;color:#ffffff;font:700 15px/1.3 Arial,sans-serif;text-decoration:none;border:1px solid #076f9b;border-radius:7px;">Angebot vorbereiten &amp; antworten</a></td></tr></table>
<p style="margin:15px 0 0;font:13px/1.7 Arial,sans-serif;color:#526d7d;">Auch die Antworten-Funktion Ihres E-Mail-Programms erreicht direkt die anfragende Person.</p>
</td></tr>
<tr><td class="email-pad" style="padding:22px 36px;background:#f6fafc;border-top:1px solid #dce8ef;border-radius:0 0 12px 12px;">
<p style="margin:0 0 9px;font:13px/1.7 Arial,sans-serif;color:#456578;">Die Datenschutzhinweise und die Verarbeitung der Angaben zur Erstellung eines Angebots wurden im Konfigurator bestätigt.</p>
<p style="margin:0;font:12px/1.7 Arial,sans-serif;color:#526d7d;">Übermittelt durch <a href="https://tayyipuenal.de/#angebot" style="color:#17698c;text-decoration:underline;">tayyipuenal.de</a> an <a href="mailto:info@tayyipuenal.de" style="color:#17698c;text-decoration:underline;">info@tayyipuenal.de</a>.</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>
HTML;

    $text = "Neue Angebotsanfrage (Angebots-Konfigurator)\n\nNorm: {$standardsLabel}\nReferenz: {$reference}\nEingegangen: {$date} Uhr (Europe/Berlin)\n\nAUSWAHL IM KONFIGURATOR\n";
    $text .= "1. Norm: " . implode(', ', $data['standards']) . "\n";
    $text .= "2. Ausgangslage: {$data['situation']}\n";
    $text .= "3. Unternehmensgröße: {$data['size']}\n";
    $text .= "4. Zeitrahmen: {$data['timeframe']}" . ($urgent ? ' (zeitnah)' : '') . "\n\nSCHRITT 5 · KONTAKTDATEN\n";
    foreach ($fields as $label => $value) $text .= "$label: $value\n";
    if ($data['note'] !== '') $text .= "\nANMERKUNG\n{$data['note']}\n";
    $text .= "\nAntworten an: {$data['email']}\n\nDatenschutzhinweise und Verarbeitung der Angaben zur Angebotserstellung bestätigt: ja\nÜbermittelt durch tayyipuenal.de/#angebot an info@tayyipuenal.de.\n";
    return ['html' => $html, 'text' => $text];
}

function buildQuoteMessage(array $data, string $reference, DateTimeImmutable $receivedAt): array {
    return buildMultipartMessage(renderQuoteEmail($data, $reference, $receivedAt), $data['email']);
}
