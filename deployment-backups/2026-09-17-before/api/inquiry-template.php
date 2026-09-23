<?php
declare(strict_types=1);

/** Email-safe markup and a complete plain-text alternative. No external CSS. */
function renderInquiryEmail(array $data, string $reference, DateTimeImmutable $receivedAt): array {
    $escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $name = $escape($data['name']);
    $email = $escape($data['email']);
    $topic = $escape($data['topic']);
    $ref = $escape($reference);
    $date = $receivedAt->setTimezone(new DateTimeZone('Europe/Berlin'))->format('d.m.Y · H:i');
    $message = nl2br($escape($data['message']), false);
    $replyUrl = $escape('mailto:' . $data['email'] . '?subject=' . rawurlencode('Ihre Anfrage: ' . $data['topic'] . ' [' . $reference . ']'));
    $fields = ['Name' => $data['name'], 'E-Mail' => $data['email'], 'Unternehmen' => $data['company'] ?: 'Nicht angegeben', 'Telefon' => $data['phone'] ?: 'Nicht angegeben'];
    $rows = '';
    foreach ($fields as $label => $value) {
        $safeValue = $escape($value);
        if ($label === 'E-Mail') $safeValue = '<a href="mailto:' . $email . '" style="color:#12698f;text-decoration:underline;word-break:break-word;">' . $email . '</a>';
        $rows .= '<tr><th class="field-label" align="left" valign="top" width="130" style="padding:13px 12px 13px 0;border-bottom:1px solid #e0eaf0;color:#526d7d;font:normal 13px/1.6 Arial,sans-serif;">' . $label . '</th><td class="field-value" valign="top" style="padding:13px 0;border-bottom:1px solid #e0eaf0;color:#173e55;font:16px/1.6 Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere;">' . $safeValue . '</td></tr>';
    }
    $html = <<<HTML
<!doctype html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Neue Anfrage · {$topic}</title>
<style>@media only screen and (max-width:520px){.email-pad{padding:24px 20px!important}.email-title{font-size:27px!important}.field-label{width:95px!important}.email-outer{padding:16px 8px!important}.email-logo{width:90px!important;height:90px!important}}</style></head>
<body style="margin:0;padding:0;background:#edf4f8;color:#173e55;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#edf4f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Neue Anfrage von {$name} zu {$topic}. Referenz {$ref}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edf4f8;"><tr><td class="email-outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #d4e3ec;border-top:5px solid #0784b8;border-radius:12px;">
<tr><td class="email-pad" style="padding:24px 36px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><p style="margin:0 0 7px;font:700 21px/1.3 Arial,sans-serif;letter-spacing:.3px;color:#174a64;">Tayyip Ünal</p><p style="margin:0;font:13px/1.6 Arial,sans-serif;color:#526e80;">Audits · Qualifikation · Beratung</p></td><td width="112" align="right"><img class="email-logo" src="https://tayyipuenal.de/brand-logo.png" width="112" height="112" alt="Tayyip Ünal" style="display:block;border:0;width:112px;height:112px;"></td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:28px 36px;background:#edf7fc;border-top:1px solid #d7e9f2;border-bottom:1px solid #d7e9f2;">
<p style="margin:0 0 12px;font:700 12px/1.5 Arial,sans-serif;letter-spacing:1.1px;text-transform:uppercase;color:#1b7096;">{$topic}</p>
<h1 class="email-title" style="margin:0 0 16px;font:700 32px/1.2 Arial,sans-serif;color:#173e55;">Neue Website-Anfrage</h1>
<p style="margin:0;font:14px/1.8 Arial,sans-serif;color:#416477;">Referenz <strong style="color:#173e55;">{$ref}</strong><br>Eingegangen am {$date} Uhr (Europe/Berlin)</p>
</td></tr>
<tr><td class="email-pad" style="padding:30px 36px;">
<h2 style="margin:0 0 10px;font:700 18px/1.4 Arial,sans-serif;color:#173e55;">Kontaktdaten</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;">{$rows}</table>
</td></tr>
<tr><td class="email-pad" style="padding:0 36px 30px;">
<h2 style="margin:0 0 14px;font:700 18px/1.4 Arial,sans-serif;color:#173e55;">Das Anliegen</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:22px;background:#f5f9fc;border:1px solid #dce8ef;border-radius:9px;color:#234c63;font:16px/1.8 Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere;">{$message}</td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:0 36px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#076f9b" style="border-radius:7px;background:#076f9b;mso-padding-alt:15px 24px;"><a href="{$replyUrl}" style="display:inline-block;padding:15px 24px;color:#ffffff;font:700 15px/1.3 Arial,sans-serif;text-decoration:none;border:1px solid #076f9b;border-radius:7px;">Auf die Anfrage antworten</a></td></tr></table>
<p style="margin:15px 0 0;font:13px/1.7 Arial,sans-serif;color:#526d7d;">Auch die Antworten-Funktion Ihres E-Mail-Programms erreicht direkt die anfragende Person.</p>
</td></tr>
<tr><td class="email-pad" style="padding:22px 36px;background:#f6fafc;border-top:1px solid #dce8ef;border-radius:0 0 12px 12px;">
<p style="margin:0 0 9px;font:13px/1.7 Arial,sans-serif;color:#456578;">Die Datenschutzhinweise und die Verarbeitung der Angaben zur Bearbeitung dieser Anfrage wurden im Formular bestätigt.</p>
<p style="margin:0;font:12px/1.7 Arial,sans-serif;color:#526d7d;">Übermittelt durch <a href="https://tayyipuenal.de/" style="color:#17698c;text-decoration:underline;">tayyipuenal.de</a> an <a href="mailto:info@tayyipuenal.de" style="color:#17698c;text-decoration:underline;">info@tayyipuenal.de</a>.</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>
HTML;
    $text = "Neue Website-Anfrage\n\nThema: {$data['topic']}\nReferenz: {$reference}\nEingegangen: {$date} Uhr (Europe/Berlin)\n\nKONTAKTDATEN\n";
    foreach ($fields as $label => $value) $text .= "$label: $value\n";
    $text .= "\nDAS ANLIEGEN\n{$data['message']}\n\nAntworten an: {$data['email']}\n\nDatenschutzhinweise und Verarbeitung der Angaben zur Bearbeitung der Anfrage bestätigt: ja\nÜbermittelt durch tayyipuenal.de an info@tayyipuenal.de.\n";
    return ['html' => $html, 'text' => $text];
}

function buildInquiryMessage(array $data, string $reference, DateTimeImmutable $receivedAt): array {
    $parts = renderInquiryEmail($data, $reference, $receivedAt);
    $boundary = 'tu_alt_' . bin2hex(random_bytes(18));
    $body = '';
    foreach (['plain' => $parts['text'], 'html' => $parts['html']] as $type => $content) {
        $body .= "--$boundary\r\nContent-Type: text/$type; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($content)) . "\r\n";
    }
    $body .= "--$boundary--\r\n";
    $headers = [
        'From' => '=?UTF-8?B?' . base64_encode('Tayyip Ünal · Website') . '?= <info@tayyipuenal.de>',
        'Reply-To' => $data['email'],
        'MIME-Version' => '1.0',
        'Content-Type' => 'multipart/alternative; boundary="' . $boundary . '"',
    ];
    return ['body' => $body, 'headers' => $headers];
}