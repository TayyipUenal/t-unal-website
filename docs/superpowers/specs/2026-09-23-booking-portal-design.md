# Booking portal ("Terminbuchung & Kundenkonto"): design spec (2026-09-23)

## What was asked (user's words, condensed)

1. Find a calendar application for scheduling appointments that allows access and lets users be integrated into the booking system. It must suit professional use such as occupational safety or office administration.
2. Implement it with a robust architecture that handles the necessary operations in PHP.
3. Starting point: the "Termin vereinbaren" button in the SCC card, which today opens the enquiry form with the topic "Terminanfrage".

## Decisions (brainstorming answers, 2026-09-23)

| Question | Decision |
|---|---|
| Who are the users? | Customers: client companies and their contacts get accounts. |
| What can they book? | Both 1:1 appointments and seats in training dates, under one account. |
| Owner's calendar | Local Outlook desktop on the ALL-INKL IMAP mailbox. No API can reach it: MX is `w0212c46.kasserver.com` and no Microsoft 365 domain record exists. |
| How accounts come into existence | Book first. The account is the verified email address. Login is by one-time email code (no password). Colleagues join by invitation. |
| When is a booking confirmed? | A 1:1 appointment is confirmed once the code is entered. Training seats stay "reserviert" until the owner confirms. No online payment. |
| Approach | A: own booking module in PHP on the existing ALL-INKL hosting. |
| "Erstgespräch" buttons | Open the booking dialog, which links to the enquiry form as a fallback. |

## Why a purpose-built module (research, 2026-09-23)

Four requirements rule out every product checked: customer logins, companies with participants, both booking types, and PHP/German hosting without third-party scripts.

| Product | Blocking points |
|---|---|
| Easy!Appointments 1.6.0 (2026-05-27, GPL, PHP) | Customers cannot log in. There is no company or participant model. Its calendar sync (Google, CalDAV) cannot reach a local Outlook, and 1.6.0 has no reminders. |
| LibreBooking 5.3.0 (PHP) | Built for room and resource booking by registered staff. `composer install` needs SSH (Premium plan). |
| Cal.com | Code went private in April 2026. cal.eu closes on 2026-11-01. Platform and "managed users" take no new customers. Guest booking only. US company. |
| Microsoft Bookings | Needs a Microsoft 365 plan the owner does not have. No customer logins. |
| Zeeg, Terminland, TIMIFY, Calendly | Guest booking only. APIs only on higher plans (TIMIFY: Enterprise Plus). Calendly data is held in the US. |
| SimplyBook.me | Client login, classes and API are paid add-ons. Cyprus company. Its widget or a redirect would add a third party. |

Sources: [Easy!Appointments releases](https://github.com/alextselegidis/easyappointments/releases), [LibreBooking install](https://github.com/LibreBooking/librebooking/blob/v5.3.0/docs/source/INSTALLATION.rst), [Cal.com closed source](https://cal.com/blog/cal-com-goes-closed-source-why), [cal.eu migration](https://cal.com/blog/cal.eu-to-cal.com-migration), [Bookings licences](https://learn.microsoft.com/en-us/microsoft-365/bookings/bookings-overview), [TIMIFY pricing](https://www.timify.com/en/pricing/), [Calendly data storage](https://calendly.com/help/data-storage-and-international-data-transfers), [SimplyBook pricing](https://simplybook.me/en/pricing), [ALL-INKL plans](https://all-inkl.com/en/webhosting/plans), [ALL-INKL cron jobs](https://all-inkl.com/en/support/tutorials/kas/tools/cronjobs/setup_479.html).

ALL-INKL facts that shape the design:
- Every plan has MySQL.
- Cron jobs only call URLs, and they cost extra on the Privat plan.
- SSH is available from Premium up.
- PHP 8.1 to 8.5 is offered (third-party source; confirm in KAS).

## Goals

- Real booking behind "Termin vereinbaren" and "Erstgespräch": free slots, instant confirmation, a calendar invitation in the owner's Outlook.
- Customer accounts with passwordless login. A company's colleagues see and manage its bookings together.
- Training seats (phase 2): the owner publishes SCC Dok. 017 / Dok. 018 dates. Companies reserve seats and name, swap or remove participants. The owner confirms or declines.
- An admin area for the owner covering all operations, including appointments he takes by phone.
- Everything stays on the existing hosting. No new data processor, no external scripts, no consent banner.

## Non-goals

- Online payment, invoices, prices in the booking flow. The offer follows the reservation, as today.
- Several hosts or trainers with their own availability. The schema has one host, the owner.
- Reading the owner's Outlook busy times, which is impossible with a local calendar.
- Waiting lists, recurring appointments, SMS, video-meeting provisioning.
- Participants' date of birth (see open questions).
- Changes to the quote configurator, audit pages or the existing `inquiry.php` behaviour.

## Architecture

### Hosting layout (FTP root of `w0212c46`)

```
tayyipuenal.de/            document root (public)
  index.html, assets/ …    React site, built as today
  konto/index.html         customer-area shell (noindex)
  verwaltung/index.html    admin shell (noindex)
  api/inquiry.php          unchanged
  api/booking.php          front controller: requires ../../tu-booking/bootstrap.php
  .htaccess                + RewriteRule ^api/booking/ api/booking.php [L]
tu-booking/                outside the document root; no URL reaches it
  bootstrap.php            autoloader, config, error handler
  config.php               DB credentials and secrets; created once on the server, never overwritten
  src/Domain/              pure rules: slot calculation, seat capacity, state transitions, value objects
  src/Application/         one class per operation; each runs in one DB transaction
  src/Infrastructure/      PDO/MySQL repositories, mailer, iCalendar, rate limiter, clock, crypto
  src/Http/                router, JSON request/response, guards, controllers, error mapping
  migrations/              numbered SQL files
  templates/mail/          German HTML and plain-text emails
  var/                     log/ and lock/ (writable)
```

In the repository the PHP source lives in `booking/`: runtime code plus `tests/`, `composer.json` (dev only: PHPUnit, PHPStan) and `docker/`. `public/api/booking.php` is copied into `dist/` by Vite like the other PHP files. The deploy script uploads `booking/` without dev files to `/tu-booking/`. If ALL-INKL's `open_basedir` blocks the sibling folder, the fallback is `tayyipuenal.de/_booking/` with `Require all denied`.

### Runtime

- **Server:** PHP 8.3, with 8.2 as the minimum. The code uses no 8.3-only syntax, and PHPStan checks with `phpVersion: 80200`. MySQL 5.7+ or MariaDB 10.3+, InnoDB, utf8mb4.
- **No runtime dependencies:** a PSR-4 autoloader in `bootstrap.php`. Mail goes through `mail()` with `-f`, as the existing endpoint does, behind a `Mailer` interface so SMTP can replace it.
- **Request path:** React → `/api/booking/…` (JSON) → guards → controller → application operation → repositories. There are no framework layers.
- **Transactional outbox.** An operation writes its emails into `outbox` in the same transaction as the booking. After commit, the same request sends them. Failures stay pending and are retried by maintenance: 5 attempts with backoff over ~24 h, after which the email is flagged in the admin area. Each row has a unique `dedupe_key`, so retries never send an email twice.
- **Maintenance job**, runs at most once per minute:
  - retry the outbox
  - send 24 h reminders
  - delete expired holds, codes, sessions and rate-limit rows
  - apply retention rules

  How it is triggered:
  - An ALL-INKL cron job calls `GET /api/booking/maintenance?key=…` every 15 minutes. The key is checked with `hash_equals`. A leaked key only allows triggering idempotent housekeeping.
  - Without cron, the same job runs piggyback on normal booking requests when the last run is older than 15 minutes. It runs after `fastcgi_finish_request()` where available, otherwise inline with a 2-second budget.
- **Schema updates.** On the first request after an upload, the bootstrap compares `schema_migrations` with `migrations/`. It then applies the missing files under `GET_LOCK('tu_booking_migrate')`. Each release's migrations are additive, so the previous frontend keeps working. If a migration fails, the booking API answers 503 with a German maintenance message.

### Outlook integration (iMIP, RFC 5545/6047)

- **Invitations.** Every confirmed, rescheduled or cancelled appointment, and every created, changed or cancelled training session, produces an invitation email to the owner (default `info@tayyipuenal.de`).
  - Header fields: `METHOD:REQUEST` or `METHOD:CANCEL`, `ORGANIZER` `mailto:buchung@tayyipuenal.de`, `ATTENDEE` the owner with `RSVP=FALSE`.
  - `UID` is `<reference>@tayyipuenal.de`, and `SEQUENCE` increases with each change.
  - `DTSTART`/`DTEND` are in UTC.
  - "Annehmen" in Outlook stores the event in his local calendar. Updates move it, and cancellations remove it.
- **Customers** receive the same kind of invitation with their confirmations, changes and cancellations, with themselves as attendee.
- **MIME layout:** `multipart/mixed` containing `multipart/alternative` (text/plain, text/html, `text/calendar; method=…`) plus an `.ics` attachment. It must be tested in the owner's Outlook, because it cannot be verified locally.
- **Master for bookable time.** The system is the master. The owner maintains weekly hours and absences. 1:1 slots also avoid his training sessions.

## Data model

All times are stored as UTC `DATETIME`. Weekly hours are wall-clock times in Europe/Berlin. Public references are `TU-` plus 8 characters of Crockford base32, generated randomly and unique.

**Accounts and access**

| Table | Key columns |
|---|---|
| `companies` | id, name (nullable: a private person is a one-person company), created_at |
| `customers` | id, company_id NOT NULL, email UNIQUE, name, phone, created_at, last_login_at |
| `admins` | id, email UNIQUE, name, totp_secret_enc, created_at, last_login_at |
| `login_codes` | id, email, code_hash, purpose (customer, admin), expires_at, attempts, used_at, created_at. Booking and login codes are the same kind; only the email wording differs. |
| `sessions` | token_hash PK, customer_id or admin_id, created_at, last_seen_at, expires_at, second_factor_at |

**1:1 appointments (phase 1)**

| Table | Key columns |
|---|---|
| `appointment_types` | id, slug, title, description, duration_min, modes (set: phone, video, onsite), buffer_min, slot_step_min, lead_time_h, horizon_days, video_link (nullable), active, sort |
| `availability_rules` | id, appointment_type_id (null = all types), weekday 1–7, start_time, end_time |
| `absences` | id, starts_at, ends_at, note |
| `appointments` | id, reference UNIQUE, customer_id, appointment_type_id, starts_at, ends_at, mode, phone, address, customer_note, status, hold_expires_at, draft (JSON, holds only), sequence, reminder_sent_at, created_at, confirmed_at, cancelled_at, cancelled_by, cancel_reason |

**Trainings (phase 2)**

| Table | Key columns |
|---|---|
| `courses` | id, code (`SCC-017`, `SCC-018`), title, default_capacity, active |
| `training_sessions` | id, reference UNIQUE, course_id, starts_at, ends_at, location, capacity, registration_deadline, status (published, cancelled), sequence |
| `participants` | id, company_id, first_name, last_name, email (nullable), created_at |
| `seat_reservations` | id, reference UNIQUE, training_session_id, company_id, customer_id (booker; nullable, cleared when the booker deletes the account), status, hold_expires_at, draft (JSON), note, decline_reason, timestamps per state |
| `reservation_seats` | id, reservation_id, participant_id (nullable = "Name folgt"); one row per seat |

**Operations**

| Table | Key columns |
|---|---|
| `outbox` | id, dedupe_key UNIQUE, kind, payload JSON, status, attempts, next_attempt_at, last_error, created_at, sent_at |
| `rate_limits` | bucket_hash, window_start, hits (PK bucket_hash + window_start) |
| `idempotency_keys` | key_hash PK, scope, request_hash, response JSON, created_at |
| `audit_log` | id, actor_type, actor_id, action, subject_type, subject_id, created_at (no message content) |
| `resource_locks` | name PK (one row, `host`), locked for 1:1 booking writes |
| `schema_migrations` | version PK, applied_at |
| `maintenance_runs` | id, started_at, finished_at, stats JSON |

## States and rules

```
Appointment:       held ──code──► confirmed ──► cancelled
Seat reservation:  held ──code──► reserved ──owner──► confirmed ──► cancelled
                                     ├──owner──► declined
                                     └──customer/owner──► cancelled
```

**Holds**
- A hold lasts 15 minutes. It blocks the slot or seats and keeps the typed details in `draft`. A logged-in customer skips `held`.
- If the code arrives after the hold expired, the booking is still confirmed when the slot or seats are free at that moment. Otherwise the dialog keeps the details and asks for another time.
- Expired holds, including their `draft`, are deleted by maintenance. Queries treat them as absent immediately.

**Existing email.** A verified email that already has an account attaches the booking to that account. Its stored profile wins, and empty fields are filled in.

**Company membership.** A person joins a company only through an invitation from a member or the owner. A new booker always gets a new company. The owner can move a person between companies.

**Visibility.** All members of a company see and manage all its bookings. Any member can invite or remove members, and each action is audit-logged.

**Capacity.** Seats in unexpired `held`, `reserved` and `confirmed` reservations must not exceed the session capacity. `declined` and `cancelled` free the seats.

**Customer changes**
- Appointments can be cancelled or rescheduled until 24 h before the start. After that, the portal shows the phone number.
- Reservations can be cancelled, and seats removed or renamed, until the registration deadline.
- Rescheduling keeps the reference, `UID` and history, and increases `sequence`.

**Owner changes**
- The owner may cancel or reschedule anything at any time, with an optional message to the customer.
- Owner rescheduling ignores availability rules but shows conflicts.
- Cancelling a training session cancels all its active reservations and notifies each company.

**Slot calculation** (pure function in `Domain`)
1. For each local date in the requested range, take the weekly windows for that weekday. Type-specific rules replace the general ones when any exist for that type.
2. Subtract absences, training sessions, and existing unexpired held or confirmed appointments. Each existing appointment is widened by `buffer_min` on both sides.
3. Generate starts every `slot_step_min` from each window start, while start plus duration fits.
4. Drop starts before now plus `lead_time_h` or after today plus `horizon_days`.
5. Build local wall-clock times with `DateTimeImmutable` in Europe/Berlin and convert to UTC for comparisons. A wall time that does not exist on a clock-change day is skipped, never shifted.

**Double-booking protection**
- 1:1 writes lock `resource_locks('host')` with `SELECT … FOR UPDATE`, re-run the conflict check and insert inside the transaction.
- Seat writes lock the `training_sessions` row the same way.
- Creating or moving a training session also locks `host`, so its conflict warning is accurate.
- The loser of a race receives 409: "Dieser Termin wurde gerade vergeben – bitte wählen Sie einen anderen."

## HTTP API

All paths are under `/api/booking/`. Responses are JSON with `{ok, …}` and a German `message` on errors. Writes accept only `application/json` from an allowed origin and take a `requestId` (idempotency key).

**Public**

| Method and path | Purpose |
|---|---|
| `GET appointment-types` | Active types (slug, title, description, duration, modes) |
| `GET slots?type&from&to` | Free starts per local date; at most 14 days per request |
| `POST appointments` | Book. With a session the booking is `confirmed` (201). Without one it is `held` and a code is sent (202, with reference and expiry). |
| `POST verify` | `{email, code, reference?}`: creates the session cookie and returns the customer. With `reference` it also confirms that held booking, but only if the hold's email matches. |
| `POST login` | `{email}`: sends a login code; always 202 |
| `POST logout`, `POST logout-all` | End this session or all sessions of the customer |
| `GET trainings` (phase 2) | Published sessions with free seats |
| `POST reservations` (phase 2) | Like `POST appointments`, with seats and participants |

**Customer session**

| Method and path | Purpose |
|---|---|
| `GET me`, `PATCH me`, `DELETE me` | Profile, company, members; edit; delete account |
| `GET me/bookings` | The company's appointments and reservations, upcoming and past |
| `POST appointments/{ref}/cancel`, `POST appointments/{ref}/reschedule` | Change an appointment within the rules |
| `GET appointments/{ref}/calendar.ics` | Calendar file |
| `POST company/members`, `DELETE company/members/{id}` | Invite or remove colleagues |
| `GET/POST/PATCH company/participants` (phase 2) | Saved participants |
| `PATCH reservations/{ref}/seats`, `DELETE reservations/{ref}/seats/{id}`, `POST reservations/{ref}/cancel` (phase 2) | Name, swap or remove seats; cancel |

**Admin** (admin session with a verified second factor)

| Method and path | Purpose |
|---|---|
| `POST admin/login`, `POST admin/verify` | Email code, then authenticator code |
| `POST admin/setup` | One-time: only while no admin exists; requires the setup key from `config.php` |
| `GET admin/overview` | Upcoming items; reservations waiting for confirmation first |
| `GET/POST/PATCH admin/appointment-types`, `GET/PUT admin/availability`, `GET/POST/DELETE admin/absences` | Availability |
| `GET/POST admin/appointments`, `POST admin/appointments/{ref}/cancel`, `POST admin/appointments/{ref}/reschedule` | List, create for a customer, change |
| `GET admin/customers`, `GET admin/customers/{id}`, `POST admin/companies/{id}/members`, `PATCH admin/customers/{id}`, `DELETE admin/customers/{id}` | Customers and companies |
| `GET admin/outbox?status=failed`, `POST admin/outbox/{id}/retry` | Failed emails |
| `GET admin/audit`, `GET admin/export` | Audit log; full data export (JSON) |
| `GET/POST admin/admins` | Second admin by invitation |
| `GET/POST/PATCH admin/training-sessions`, `POST admin/training-sessions/{id}/cancel`, `GET admin/training-sessions/{id}/participants.csv`, `POST admin/reservations/{ref}/confirm`, `POST admin/reservations/{ref}/decline` (phase 2) | Trainings |

**Maintenance:** `GET maintenance?key=…`. It returns counts only.

## Frontend

- **Code location.** `src/booking/` holds the typed API client (same error style as `src/api.ts`), `BookingDialog`, `SlotPicker`, `CodeStep` and, in phase 2, `TrainingBooking`. `src/account/` and `src/admin/` hold the two apps. Each area has its own CSS file using the existing tokens.
- **Routing.** `App.tsx` renders `/konto` and `/verwaltung` through `React.lazy`. The booking dialog chunk loads on first click, so the home bundle barely grows. `render-pages.tsx` writes both shells with `noindex, nofollow`, leaves them out of the sitemap, and `robots.txt` disallows them. `.htaccess` adds `X-Robots-Tag: noindex` and a strict `Content-Security-Policy` for both paths.
- **Booking dialog.** It reuses the configurator's step pattern: progress bar only, no step labels or counters. Steps:
  1. Type, skipped when preset.
  2. Day and time.
  3. Details: name, email, company, phone (required for mode phone), address (required for mode onsite), note, consent.
  4. Code: 6-digit input with `autocomplete="one-time-code"`, resend after 60 s.

  The success screen shows the reference, an "In Kalender speichern" link and "Mein Konto". The dialog also offers "Kein passender Termin? Nachricht senden", which opens the existing enquiry form.
- **Button wiring.**
  - The SCC card's "Termin vereinbaren" opens the dialog with topic "SCC-Schulung" in the note.
  - "Erstgespräch" buttons (header, hero, contact) preselect "Kostenloses Erstgespräch".
  - "Angebot anfordern" is unchanged.
  - Phase 2: the SCC course cards get "Kurstermin buchen".
- **Customer area** (`/konto/`): login; overview; appointment and reservation details with actions; "Firma" (members, saved participants); "Profil" (edit, log out everywhere, delete account). The footer and every email link to "Mein Konto". The header stays unchanged.
  - An invited colleague receives an email with a link to `/konto/`. The customer row already exists with the company, so the normal code login works.
- **Admin area** (`/verwaltung/`): "Heute & demnächst", "Termine", "Verfügbarkeit", "Schulungen" (phase 2), "Kunden", "Einstellungen" (notification addresses, second admin, last maintenance run, failed emails).
  - Setup flow: setup link → email code → QR code plus manual key for the authenticator app → first authenticator code → done.
  - A second admin is created by email address. That person's first login runs the same pairing steps.

## Emails

German, formal Sie, HTML plus complete plain text, in the look of `inquiry-template.php`. Sender `buchung@tayyipuenal.de`; replies go to `info@tayyipuenal.de`.

- **To customers**
  - The code, with the code in the subject line for phones.
  - Appointment: confirmed, rescheduled, cancelled.
  - Reservation: received, confirmed, declined, cancelled.
  - Training session changed or cancelled.
  - Colleague invitation.
  - Reminder 24 h before.

  Every date email carries its invitation. Customer emails go to the person who booked. When a colleague changes or cancels a booking, the colleague gets a copy. Everyone else in the company sees the change in the customer area.
- **To the owner:** invitations for appointments and training sessions, "Neue Reservierung – bitte bestätigen" with a link to the admin area, and account deletions that cancelled future bookings.

## Security

- **Guards on every request:**
  - Method allow-list.
  - Origin must be `https://tayyipuenal.de` or `https://www.tayyipuenal.de` for writes.
  - `application/json` only for writes.
  - Body at most 32 KB.
  - `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
  - Honeypot field on public booking.
- **Session cookie:** `__Host-tu_session`, Secure, HttpOnly, SameSite=Lax, Path=/. A 32-byte random token, stored as SHA-256. It is rotated at login. Customers get 30 days sliding; admins 12 h absolute. Origin check plus JSON-only plus SameSite replaces CSRF tokens.
- **Codes and rate limits:**
  - 6 digits from `random_int`, stored as HMAC-SHA256 with a server secret.
  - Valid 10 minutes, 5 attempts per code.
  - At most 5 codes per email and 20 per IP per hour, and 10 booking attempts per IP per hour.
  - Responses never reveal whether an account exists. IPs are stored only as keyed hashes.
- **Admin:**
  - Email code plus TOTP (RFC 6238, 30 s, ±1 step). The TOTP secret is encrypted with libsodium using a key from `config.php`.
  - Every admin action is audit-logged.
  - Admin setup works only while no admin exists.
- **Authorisation:** every customer read and write is scoped to the session's `company_id` inside the repositories. Controllers cannot forget it.
- **Secrets:** `config.php` (DB, code pepper, TOTP key, maintenance key, setup key) is outside the document root. It is generated locally by a script, uploaded once, and never part of `dist/` or the deploy upload.

## Errors

- **Domain errors** (full, too late, invalid, conflict) map to 409 or 422 with a German message the UI shows unchanged.
- **Unexpected errors** return 500 with a generic German message and an error reference. The log in `var/log/` is rotated, kept 30 days, and holds reference, route and exception class only, no personal data.
- **Mail failures** never fail a booking (outbox).
- **Database unavailable or schema behind:** 503 with "Die Terminbuchung ist gerade nicht erreichbar. Bitte rufen Sie uns an: 0155 63084795."

## Privacy (DSGVO)

- **Hosting:** data stays at ALL-INKL in Germany, already named in the privacy notice. No new processor, no external scripts or fonts.
- **Cookie:** one technically necessary cookie, set only after login, so no consent is needed (§ 25 Abs. 2 Nr. 2 TDDDG).
- **Default retention periods** (owner to confirm):

  | Data | Deleted |
  |---|---|
  | Unconfirmed holds and their details | At expiry |
  | Login codes | After 24 h |
  | Sessions | At expiry |
  | Appointments | 12 months after the date |
  | Reservations and participant names | 24 months after the training |
  | Accounts without activity | After 24 months, following an email notice 30 days before |
  | Saved participants | With their company, or on removal by a member |

- **Account deletion** (self-service):
  - The person's future appointments are cancelled and the owner is informed. Their past appointments are deleted.
  - If colleagues remain, the company's reservations stay with the company and their booker field is cleared.
  - If no colleague remains, the company is deleted with its saved participants and all its reservations. Future reservations are cancelled first.
- **Privacy page.** New section "Terminbuchung & Kundenkonto": purposes, legal basis Art. 6 Abs. 1 lit. b DSGVO, data categories, retention, the cookie. The sentence about not using cookies is adjusted. It is legal text, so it is drafted by us and approved by the owner before publishing.

## Testing

- **Local stack:** `booking/docker/compose.yml` with `php:8.3-apache` (mod_rewrite, the real `.htaccess`, `public/` as document root, `booking/` as the sibling `tu-booking/`) and MariaDB 10.11. It listens on port 8086, where the Vite proxy already points. A sendmail stub writes every email as `.eml` into `booking/var/mail/`, so no real email is ever sent.
- **PHPUnit, unit level:**
  - Slot calculation, including 2026-10-25 and 2027-03-28, buffers, notice, horizon, absences and training overlap.
  - Seat capacity.
  - Every allowed and forbidden state transition.
  - iCalendar output: escaping, line folding at 75 octets, UID, SEQUENCE, METHOD.
  - TOTP against the RFC 6238 vectors.
  - Code hashing and limits.
- **PHPUnit, database level:**
  - Migrations from an empty database.
  - Repositories.
  - Company scoping: an attempt to read another company's booking fails.
  - Concurrency: 20 parallel requests for the last seat or slot, exactly one succeeds.
- **HTTP flows:** `scripts/test-booking.mjs`, in the style of `scripts/test-inquiry.mjs`. It covers:
  - 405, 403, 415 and 413 responses, and rate limits 429.
  - Book held → read the code from the mail sink → verify → confirmed.
  - Login, cancel, reschedule, member invite.
  - Admin setup and login with generated TOTP codes.
  - Maintenance key.
- **Static analysis:** PHPStan (level 8).
- **Frontend and browser:**
  - `tsc -b`, `npm run lint`, `npm run build`, with prerendered pages unchanged apart from the new shells.
  - Browser runs of dialog, customer area and admin at 390 px and 1440 px, keyboard-only, and reduced motion. No console errors.
  - Email previews with a script in the style of `scripts/preview-email.php`.

## Rollout

- **Deploy script** (new `scripts/deploy-booking.sh`, same curl/FTPS approach; the owner types the password). Upload order:
  1. `tu-booking/`: code, migrations, templates. Never `config.php` or `var/`.
  2. `api/booking.php` and `.htaccess`.
  3. Assets.
  4. HTML.
- **Rollback:** re-upload the previous HTML. The API stays, and its migrations are additive.
- **`verify-live.mjs`** gains checks for:
  - The hashes of the new files.
  - The guard responses of `/api/booking/`.
  - `/tu-booking/` must be unreachable.
  - `/konto/` and `/verwaltung/` must carry noindex.
- **Live test:** one labelled test booking ("Technischer Test") only with the owner's OK. It is accepted in his Outlook, then cancelled, and the event must disappear.

**One-time owner setup in KAS.** I write a German step-by-step guide.
1. Create a MySQL database and enter its password in the prepared `config.php`.
2. Set the domain's PHP version to 8.3.
3. Create `buchung@tayyipuenal.de`, as a mailbox or a forward to info@.
4. Check whether DKIM can be enabled, and add a DMARC record. Customer emails are a new outbound flow, and codes must reach inboxes at Gmail, Outlook.com, GMX and web.de.
5. Add the maintenance cron job every 15 minutes, if the plan includes cron.
6. Check what database backups the plan includes.
7. Open the setup link, create the admin login and pair the authenticator app.
8. Enter appointment types and weekly hours.
9. Approve the privacy text.

## Phases

Each phase is deployable on its own and gets its own implementation plan.

1. **Foundation and 1:1 appointments:**
   - Schema and migrations, bootstrap, guards, sessions, email codes, rate limits.
   - Outbox, maintenance, audit log, iCalendar and invitations.
   - Admin with setup and TOTP; appointment types, availability, absences, appointments, customers, outbox, export.
   - Booking dialog and button wiring.
   - Customer area: appointments, profile, colleagues.
   - Privacy text, deploy and verify scripts, all tests.
2. **Training seats:**
   - Courses, sessions, reservations, seats and participants; owner confirmation.
   - Participant changes and CSV export.
   - SCC card buttons and the "Schulungen" admin section.
   - Tests.

## Defaults until the owner decides (not blocking)

- **Appointment type:** "Kostenloses Erstgespräch", 30 minutes, phone or video, buffer 15 minutes, slot step 30 minutes, notice 24 h, horizon 60 days.
- **Weekly hours:** Monday to Friday 09:00 to 17:00.
- **Retention** as listed under Privacy.

## Open questions for the owner

1. Which appointment types, durations, modes and weekly hours should be offered? Is there a video-meeting link for video appointments?
2. Are the retention periods right? Does the owner need participant names of past trainings beyond 24 months, for example for certificates?
3. Does the exam registration with the certification body need participants' dates of birth? Not collected until he says so.
4. Which ALL-INKL plan is booked: cron, backups, PHP version?
5. Approval of the privacy text before go-live.
