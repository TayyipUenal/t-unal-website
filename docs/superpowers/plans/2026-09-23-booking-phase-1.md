# Booking portal, Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real 1:1 appointment booking on tayyipuenal.de. It covers:
- booking with a passwordless email code
- a customer area with company colleagues
- an owner admin area with email code plus authenticator app
- Outlook calendar invitations

All of it is served by a PHP 8.2+/MySQL module on the existing ALL-INKL hosting.

**Architecture:**
- **PHP code** lives in `booking/` in the repository and is uploaded to `/tu-booking/`, outside the document root. It is plain PHP with no runtime dependencies, in four layers: Domain (pure rules), Infrastructure (PDO, mail, iCalendar), Application (one service per area; each write in one DB transaction) and Http (router, guards, JSON).
- **Front controller:** `public/api/booking.php` receives every `/api/booking/…` request via `.htaccess`.
- **Email:** emails go through a transactional outbox.
- **React:** the site gets a lazy-loaded booking dialog, a customer area at `/konto/` and an admin area at `/verwaltung/`.

**Tech Stack:**
- PHP 8.3 (code compatible with 8.2), MariaDB 10.11 locally (MySQL 5.7+ or MariaDB 10.3+ in production), PDO, libsodium.
- PHPUnit 11 and PHPStan 2 (dev only), Docker Compose (php:8.3-apache, mariadb:10.11, composer:2).
- React 19.3, TypeScript 6, Vite 8, framer-motion 13, lucide-react 1.44, `qrcode-generator` 2.0.4 (new; admin chunk only).

**Spec:** `docs/superpowers/specs/2026-09-23-booking-portal-design.md`. Read it before starting; this plan implements its "Phases → 1".

## Global Constraints

- **PHP versions:** runtime code must run on PHP 8.2. No 8.3-only syntax (no typed class constants, no `json_validate`, no `#[\Override]`). PHPStan runs with `phpVersion: 80200`, level 8, on `booking/src`.
- **No PHP runtime dependencies.** `booking/bootstrap.php` has its own PSR-4 autoloader. Composer is only for PHPUnit/PHPStan, and `booking/vendor/` is never uploaded.
- **No extension beyond** PDO MySQL, sodium, mbstring, json. Specifically no intl: German dates are built by hand.
- **Language and tone:** all user-facing text (API messages, emails, UI) is German, formal "Sie". Code, comments and identifiers are English.
- **Time:** all times are stored as UTC `DATETIME`. Weekly hours are wall-clock `HH:MM` in `Europe/Berlin`.
- **References:** `TU-` plus 8 Crockford base32 characters (`0-9A-Z` without `I L O U`).
- **Writes** (`POST`/`PUT`/`PATCH`/`DELETE`) require:
  - Origin `https://tayyipuenal.de` or `https://www.tayyipuenal.de`
  - `Content-Type: application/json`
  - a body ≤ 32768 bytes

  Error bodies are always `{"ok": false, "message": "<German text>"}`.
- **Cookies:** production uses `__Host-tu_session` (customer) and `__Host-tu_admin` (admin), both `Secure; HttpOnly; SameSite=Lax; Path=/`. Local Docker uses `tu_session_dev`/`tu_admin_dev` without `Secure`.
- **Limits:**
  - Hold: 15 minutes.
  - Code validity: 10 minutes. Code attempts: 5.
  - Customer session: 30 days sliding. Admin session: 12 h absolute. Pending admin session: 15 minutes.
  - Customer change cutoff: 24 h before start.
- **Rate limits:**
  - Codes: 5 per email and 20 per IP per hour.
  - Verify: 30 per IP per hour.
  - Bookings: 10 per IP per hour.
  - Invites: 10 per customer per hour.
  - Admin authenticator code: 10 per admin per 15 minutes.
- **Outbox:** retry backoff after the failed attempts 1–4 is 600 s, 3600 s, 14400 s, 57600 s. The 5th failure marks the email `failed`.
- **Retention:** as in spec § Privacy.
  - Holds: at expiry.
  - Codes: 24 h.
  - Appointments: 12 months after the end.
  - Inactive accounts: notice after 23 months, erase 30 days after the notice.
  - Logs: 30 days. Audit log: 24 months. Sent outbox rows: 7 days. Failed outbox rows: 30 days.
- **Frontend:**
  - Must pass the repository's `eslint-plugin-react-hooks` 7 rules. That means no synchronous `setState` in an effect body, no `Date.now()` during render, no ref reads during render, and no components declared inside components.
  - Icons must exist in lucide-react 1.44. `Trash2` does not; use `Trash`.
  - Motion follows the configurator's step pattern: a progress bar only, no step labels.
- **Local port:** the PHP stack uses `127.0.0.1:8086`, the port `vite.config.ts` already proxies `/api` to. Stop the older `tu-php` container first if it runs.
- **Commits:** every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Mixed-case or padded emails** (`" Max@Firma.DE "`) must reach the same account and the same held booking. Every email is trimmed and lower-cased on input. Test: Task 11, `testVerifyNormalisesEmail`.
2. **Code entered after the 15-minute hold expired.** If the slot is still free, the booking is confirmed. If it was taken, the account is still created and `slotTaken: true` is returned. Tests: Task 11, `testExpiredHoldStillConfirmsWhenFree`, `testExpiredHoldTakenMeanwhileReportsSlotTaken`.
3. **Slots near midnight in Berlin** belong to the Berlin date, not the UTC date; for example 00:30 local is the previous day in UTC. Bookability must be checked for the Berlin date. Test: Task 11, `testBookingJustAfterMidnightBerlin`.
4. **Retried booking POST after a lost connection** (same `requestId`) must return the same held booking, with no second hold and no second code email. Test: Task 17, HTTP test "idempotent retry".
5. **A removed booker.** Once the booker is gone (colleague removed, `customer_id` NULL), cancellation and reminder emails must go to the remaining company members, never crash, and never go to nobody. Tests: Task 12, `testCancelNotifiesMembersWhenBookerRemoved`; Task 15, `testReminderGoesToMembersWhenBookerRemoved`.

---

## File map

```
booking/                                   PHP module (uploaded to /tu-booking/ without dev files)
  bootstrap.php                            autoloader, error handler
  config.example.php                       documented config template
  composer.json, phpunit.xml, phpstan.neon dev tooling
  .htaccess                                "Require all denied" (defence in depth)
  docker/compose.yml                       mariadb + php-apache on 127.0.0.1:8086
  docker/php/Dockerfile, php.ini, sendmail-stub.sh
  docker/config.docker.php                 local config (never uploaded)
  migrations/0001_foundation.sql           phase-1 schema + seed
  src/App.php                              composition root (lazy getters)
  src/Config.php                           typed config access
  src/Support/Clock.php, SystemClock.php
  src/Domain/…                             DomainError, Reference, Interval, Mode, AppointmentStatus,
                                           WeeklyWindow, SlotPolicy, SlotCalculator, Model/*
  src/Infrastructure/…                     Database, Time, Migrator, Crypto, Totp, RateLimiter, Outbox,
                                           AuditLog, Logger, Calendar/ICalendar, Mail/*, Repository/*
  src/Application/…                        Notifications, Codes, BookingRequest, Booking, CustomerAuth,
                                           AppointmentChanges, Accounts, AdminAuth, AdminSchedule,
                                           AdminAppointments, AdminCustomers, AdminSettings, Maintenance
  src/Http/…                               Request, Response, Router, Context, Input, SessionCookie,
                                           Presenter, Kernel, Routes/{Public,Customer,Admin,Maintenance}Routes
  tests/…                                  bootstrap, Support/*, Unit/*, Integration/*
public/api/booking.php                     front controller
public/.htaccess                           + rewrite rule for /api/booking/
public/konto/.htaccess, public/verwaltung/.htaccess   noindex + CSP
src/booking/                               api.ts, dates.ts, presets.ts, SlotPicker.tsx, BookingDialog.tsx, booking.css
src/account/                               AccountApp.tsx, AppointmentList.tsx, AccountSettings.tsx, account.css
src/admin/                                 api.ts, AdminApp.tsx, AdminLogin.tsx, Overview.tsx,
                                           AppointmentsSection.tsx, AvailabilitySection.tsx,
                                           CustomersSection.tsx, SettingsSection.tsx, admin.css
src/App.tsx, src/components/{SccJourney,Footer,LegalPage}.tsx   wiring, footer link, privacy text
scripts/render-pages.tsx                   + /konto/ and /verwaltung/ shells
scripts/test-booking.mjs                   HTTP flow tests against the Docker stack
scripts/make-booking-config.mjs            generates booking/config.php with secrets
scripts/deploy-booking.sh                  FTPS upload in the safe order
scripts/verify-live.mjs                    + booking checks
docs/booking/EINRICHTUNG.md                German owner setup guide
RELEASE-2026-09-23-booking.md              release notes
```

## Commands used throughout

| Command | What it does |
|---|---|
| `npm run booking:up` | Builds and starts the Docker stack (fresh in-memory DB on every start) |
| `npm run booking:down` | Stops it |
| `npm run booking:deps` | Installs PHPUnit/PHPStan into `booking/vendor/` |
| `npm run booking:test -- --filter X` | Runs PHPUnit inside the web container |
| `npm run booking:stan` | Runs PHPStan inside the web container |
| `npm run test:booking` | Runs the HTTP flow tests against `127.0.0.1:8086` |

---

### Task 0: Put the project under local git

The project is not a git repository yet. Each later task ends in a commit, so reviewers can read one diff per task. This adds git locally only; there is no remote.

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Check for an existing repository**

Run: `git -C /Users/veysiocak/Desktop/t-unal rev-parse --is-inside-work-tree`
Expected: `fatal: not a git repository`. If it prints `true`, skip to Step 4.

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
dist/
preview/
.playwright-mcp/
.DS_Store
booking/vendor/
booking/var/
booking/config.php
```

- [ ] **Step 3: Initialise and commit the current state as the baseline**

```bash
cd /Users/veysiocak/Desktop/t-unal
git init -b main
git add -A
git commit -m "chore: baseline before booking portal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Create the work branch**

```bash
git checkout -b feature/booking-phase-1
```

Expected: `Switched to a new branch 'feature/booking-phase-1'`.

---

### Task 1: Docker stack, PHP skeleton and configuration

**Files:**
- Create: `booking/bootstrap.php`, `booking/config.example.php`, `booking/.htaccess`, `booking/composer.json`, `booking/phpunit.xml`, `booking/phpstan.neon`
- Create: `booking/docker/compose.yml`, `booking/docker/php/Dockerfile`, `booking/docker/php/php.ini`, `booking/docker/php/sendmail-stub.sh`, `booking/docker/config.docker.php`
- Create: `booking/src/Config.php`, `booking/src/Support/Clock.php`, `booking/src/Support/SystemClock.php`
- Create: `booking/tests/bootstrap.php`, `booking/tests/Support/TestConfig.php`, `booking/tests/Support/FixedClock.php`, `booking/tests/Unit/ConfigTest.php`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `TuBooking\Config::load(?string $path = null): Config`, `Config::fromArray(array $values): Config`, `->string(string $path): string`, `->bool(string $path): bool`, `->strings(string $path): list<string>`
  - `TuBooking\Support\Clock` with `now(): \DateTimeImmutable` (always UTC); `SystemClock`
  - Test helpers:
    - `TuBooking\Tests\Support\FixedClock` (`__construct(string $iso = '2026-10-01T08:00:00Z')`, `now()`, `set(string $iso)`, `advance(string $interval)`, e.g. `'PT20M'`)
    - `TuBooking\Tests\Support\TestConfig::create(array $overrides = []): Config`

- [ ] **Step 1: Write `booking/bootstrap.php`**

```php
<?php
declare(strict_types=1);

// Loaded by every PHP entry point of the booking module (front controller,
// tests). Registers the autoloader and turns PHP warnings into exceptions so
// that nothing fails silently. Produces no output.
spl_autoload_register(static function (string $class): void {
    $prefix = 'TuBooking\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

ini_set('display_errors', '0');
error_reporting(E_ALL);
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if ((error_reporting() & $severity) === 0) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});
```

- [ ] **Step 2: Write `booking/config.example.php`**

```php
<?php
// Template for config.php. scripts/make-booking-config.mjs fills in fresh
// secrets and the database login; the result lives outside the document root
// and is uploaded once. Never commit or upload a filled-in copy elsewhere.
return [
    'db' => [
        'dsn' => 'mysql:host=localhost;dbname=DB_NAME;charset=utf8mb4',
        'user' => 'DB_USER',
        'password' => 'DB_PASSWORD',
    ],
    'secrets' => [
        'code_pepper' => 'HEX_64',     // HMAC key for login codes, IP and rate-limit hashes
        'totp_key' => 'HEX_64',        // encrypts authenticator secrets (libsodium secretbox)
        'maintenance_key' => 'TOKEN',  // ?key= for the cron URL
        'setup_key' => 'TOKEN',        // ?setup= for the one-time admin setup link
    ],
    'site' => [
        'origin' => 'https://tayyipuenal.de',
        'allowed_origins' => ['https://tayyipuenal.de', 'https://www.tayyipuenal.de'],
        'timezone' => 'Europe/Berlin',
        'phone_label' => '0155 63084795',
        'client_ip_header' => '',      // keep empty in production: rate limits use REMOTE_ADDR
    ],
    'mail' => [
        'from' => 'buchung@tayyipuenal.de',
        'from_name' => 'Tayyip Ünal · Terminbuchung',
        'reply_to' => 'info@tayyipuenal.de',
        'owner' => 'info@tayyipuenal.de',
        'owner_name' => 'Tayyip Ünal',
    ],
    'session' => [
        'customer_cookie' => '__Host-tu_session',
        'admin_cookie' => '__Host-tu_admin',
        'secure' => true,
    ],
];
```

- [ ] **Step 3: Write `booking/.htaccess`**

```apacheconf
# This folder is meant to live outside the document root. If it is ever placed
# inside it, nothing here may be served.
Require all denied
```

- [ ] **Step 4: Write `booking/src/Config.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking;

/** Typed read access to config.php; see config.example.php for every key. */
final class Config
{
    /** @param array<string, mixed> $values */
    private function __construct(private readonly array $values)
    {
    }

    public static function load(?string $path = null): self
    {
        $path ??= (getenv('TU_BOOKING_CONFIG') ?: dirname(__DIR__) . '/config.php');
        if (!is_file($path)) {
            throw new \RuntimeException('Booking configuration missing.');
        }
        $values = require $path;
        if (!is_array($values)) {
            throw new \RuntimeException('Booking configuration must return an array.');
        }
        /** @var array<string, mixed> $values */
        return new self($values);
    }

    /** @param array<string, mixed> $values */
    public static function fromArray(array $values): self
    {
        return new self($values);
    }

    public function string(string $path): string
    {
        $value = $this->get($path);
        if (!is_string($value)) {
            throw new \RuntimeException("Config $path must be a string.");
        }
        return $value;
    }

    public function bool(string $path): bool
    {
        $value = $this->get($path);
        if (!is_bool($value)) {
            throw new \RuntimeException("Config $path must be a boolean.");
        }
        return $value;
    }

    /** @return list<string> */
    public function strings(string $path): array
    {
        $value = $this->get($path);
        if (!is_array($value) || !array_is_list($value)) {
            throw new \RuntimeException("Config $path must be a list.");
        }
        $strings = [];
        foreach ($value as $item) {
            if (!is_string($item)) {
                throw new \RuntimeException("Config $path must only contain strings.");
            }
            $strings[] = $item;
        }
        return $strings;
    }

    private function get(string $path): mixed
    {
        $value = $this->values;
        foreach (explode('.', $path) as $key) {
            if (!is_array($value) || !array_key_exists($key, $value)) {
                throw new \RuntimeException("Config $path missing.");
            }
            $value = $value[$key];
        }
        return $value;
    }
}
```

- [ ] **Step 5: Write the clock**

`booking/src/Support/Clock.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Support;

/** Source of the current time. Always returns UTC. */
interface Clock
{
    public function now(): \DateTimeImmutable;
}
```

`booking/src/Support/SystemClock.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Support;

final class SystemClock implements Clock
{
    public function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }
}
```

- [ ] **Step 6: Write the test support files**

`booking/tests/bootstrap.php`:

```php
<?php
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/vendor/autoload.php';
```

`booking/tests/Support/FixedClock.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Support;

use TuBooking\Support\Clock;

final class FixedClock implements Clock
{
    private \DateTimeImmutable $now;

    public function __construct(string $iso = '2026-10-01T08:00:00Z')
    {
        $this->set($iso);
    }

    public function now(): \DateTimeImmutable
    {
        return $this->now;
    }

    public function set(string $iso): void
    {
        $this->now = (new \DateTimeImmutable($iso))->setTimezone(new \DateTimeZone('UTC'));
    }

    public function advance(string $interval): void
    {
        $this->now = $this->now->add(new \DateInterval($interval));
    }
}
```

`booking/tests/Support/TestConfig.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Support;

use TuBooking\Config;

final class TestConfig
{
    /** @param array<string, mixed> $overrides top-level sections replaced as a whole */
    public static function create(array $overrides = []): Config
    {
        $values = [
            'db' => [
                'dsn' => (getenv('TU_BOOKING_TEST_DSN') ?: 'mysql:host=db;charset=utf8mb4') . ';dbname=tu_booking_test',
                'user' => getenv('TU_BOOKING_TEST_USER') ?: 'root',
                'password' => getenv('TU_BOOKING_TEST_PASSWORD') ?: 'root-dev',
            ],
            'secrets' => [
                'code_pepper' => str_repeat('ab', 32),
                'totp_key' => str_repeat('cd', 32),
                'maintenance_key' => 'test-maintenance-key',
                'setup_key' => 'test-setup-key',
            ],
            'site' => [
                'origin' => 'https://tayyipuenal.de',
                'allowed_origins' => ['https://tayyipuenal.de', 'https://www.tayyipuenal.de'],
                'timezone' => 'Europe/Berlin',
                'phone_label' => '0155 63084795',
                'client_ip_header' => '',
            ],
            'mail' => [
                'from' => 'buchung@tayyipuenal.de',
                'from_name' => 'Tayyip Ünal · Terminbuchung',
                'reply_to' => 'info@tayyipuenal.de',
                'owner' => 'info@tayyipuenal.de',
                'owner_name' => 'Tayyip Ünal',
            ],
            'session' => [
                'customer_cookie' => 'tu_session_test',
                'admin_cookie' => 'tu_admin_test',
                'secure' => false,
            ],
        ];
        return Config::fromArray(array_replace($values, $overrides));
    }
}
```

- [ ] **Step 7: Write the failing config test**

`booking/tests/Unit/ConfigTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Config;
use TuBooking\Tests\Support\TestConfig;

final class ConfigTest extends TestCase
{
    public function testReadsNestedValues(): void
    {
        $config = TestConfig::create();
        self::assertSame('Europe/Berlin', $config->string('site.timezone'));
        self::assertFalse($config->bool('session.secure'));
        self::assertSame(['https://tayyipuenal.de', 'https://www.tayyipuenal.de'], $config->strings('site.allowed_origins'));
    }

    public function testMissingKeyThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Config::fromArray([])->string('db.dsn');
    }

    public function testWrongTypeThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Config::fromArray(['site' => ['timezone' => 5]])->string('site.timezone');
    }

    public function testExampleConfigHasEveryKey(): void
    {
        $config = Config::load(dirname(__DIR__, 2) . '/config.example.php');
        foreach (['db.dsn', 'db.user', 'db.password', 'secrets.code_pepper', 'secrets.totp_key', 'secrets.maintenance_key', 'secrets.setup_key', 'site.origin', 'site.timezone', 'site.phone_label', 'mail.from', 'mail.from_name', 'mail.reply_to', 'mail.owner', 'mail.owner_name', 'session.customer_cookie', 'session.admin_cookie'] as $key) {
            self::assertNotSame('', $config->string($key), $key);
        }
        self::assertTrue($config->bool('session.secure'));
    }
}
```

- [ ] **Step 8: Write the dev tooling files**

`booking/composer.json`:

```json
{
    "name": "tayyipuenal/booking",
    "description": "Terminbuchung und Kundenkonto für tayyipuenal.de",
    "type": "project",
    "license": "proprietary",
    "require": {
        "php": ">=8.2"
    },
    "require-dev": {
        "phpstan/phpstan": "^2.1",
        "phpunit/phpunit": "^11.5"
    },
    "autoload": {
        "psr-4": { "TuBooking\\": "src/" }
    },
    "autoload-dev": {
        "psr-4": { "TuBooking\\Tests\\": "tests/" }
    },
    "config": {
        "platform": { "php": "8.2.0" },
        "sort-packages": true
    }
}
```

`booking/phpunit.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/bootstrap.php"
         colors="true"
         failOnWarning="true"
         failOnRisky="true">
    <testsuites>
        <testsuite name="unit">
            <directory>tests/Unit</directory>
        </testsuite>
        <testsuite name="integration">
            <directory>tests/Integration</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory>src</directory>
        </include>
    </source>
</phpunit>
```

`booking/phpstan.neon`:

```neon
parameters:
    level: 8
    phpVersion: 80200
    paths:
        - src
```

- [ ] **Step 9: Write the Docker stack**

`booking/docker/compose.yml`:

```yaml
# Local stack for the booking module. The database lives in memory, so every
# `up` starts empty. The site's public/ folder is the document root and
# booking/ is mounted next to it as /var/www/tu-booking, like on ALL-INKL.
name: tu-booking
services:
  db:
    image: mariadb:10.11
    environment:
      MARIADB_ROOT_PASSWORD: root-dev
      MARIADB_DATABASE: tu_booking
      MARIADB_USER: tu_booking
      MARIADB_PASSWORD: tu-booking-dev
    tmpfs:
      - /var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 2s
      timeout: 5s
      retries: 30
  web:
    build: ./php
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:8086:80"
    environment:
      TU_BOOKING_CONFIG: /var/www/tu-booking/docker/config.docker.php
      TU_BOOKING_TEST_DSN: "mysql:host=db;charset=utf8mb4"
      TU_BOOKING_TEST_USER: root
      TU_BOOKING_TEST_PASSWORD: root-dev
    volumes:
      - ../../public:/var/www/site:ro
      - ..:/var/www/tu-booking
    working_dir: /var/www/tu-booking
```

`booking/docker/php/Dockerfile`:

```dockerfile
FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite headers \
 && sed -ri 's!/var/www/html!/var/www/site!g' /etc/apache2/sites-available/000-default.conf \
 && printf '<Directory /var/www/site>\n    AllowOverride All\n    Require all granted\n</Directory>\n' > /etc/apache2/conf-available/tu-site.conf \
 && a2enconf tu-site
COPY php.ini /usr/local/etc/php/conf.d/tu-booking.ini
COPY sendmail-stub.sh /usr/local/bin/sendmail-stub
RUN chmod 755 /usr/local/bin/sendmail-stub
```

`booking/docker/php/php.ini`:

```ini
sendmail_path = /usr/local/bin/sendmail-stub
display_errors = Off
log_errors = On
error_log = /dev/stderr
date.timezone = UTC
```

`booking/docker/php/sendmail-stub.sh`:

```sh
#!/bin/sh
# Local stand-in for sendmail: stores every message as a file, sends nothing.
dir=/var/www/tu-booking/var/mail
mkdir -p "$dir"
cat > "$dir/$(date +%s)-$$-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ').eml"
```

`booking/docker/config.docker.php`:

```php
<?php
// Local Docker configuration. Never uploaded.
return [
    'db' => [
        'dsn' => 'mysql:host=db;dbname=tu_booking;charset=utf8mb4',
        'user' => 'tu_booking',
        'password' => 'tu-booking-dev',
    ],
    'secrets' => [
        'code_pepper' => str_repeat('11', 32),
        'totp_key' => str_repeat('22', 32),
        'maintenance_key' => 'local-maintenance-key',
        'setup_key' => 'local-setup-key',
    ],
    'site' => [
        'origin' => 'https://tayyipuenal.de',
        'allowed_origins' => ['https://tayyipuenal.de', 'https://www.tayyipuenal.de'],
        'timezone' => 'Europe/Berlin',
        'phone_label' => '0155 63084795',
        // Local tests only: scripts/test-booking.mjs sends one address per simulated visitor.
        'client_ip_header' => 'X-Test-Client',
    ],
    'mail' => [
        'from' => 'buchung@tayyipuenal.de',
        'from_name' => 'Tayyip Ünal · Terminbuchung',
        'reply_to' => 'info@tayyipuenal.de',
        'owner' => 'info@tayyipuenal.de',
        'owner_name' => 'Tayyip Ünal',
    ],
    'session' => [
        'customer_cookie' => 'tu_session_dev',
        'admin_cookie' => 'tu_admin_dev',
        'secure' => false,
    ],
];
```

- [ ] **Step 10: Add the npm scripts**

In `package.json`, extend `"scripts"` (keep the existing entries):

```json
    "booking:up": "mkdir -p booking/var/mail booking/var/log && chmod -R a+rwX booking/var && docker compose -f booking/docker/compose.yml up -d --build --wait",
    "booking:down": "docker compose -f booking/docker/compose.yml down",
    "booking:deps": "docker run --rm -v \"$PWD/booking:/app\" -w /app composer:2 install --no-interaction --no-progress",
    "booking:test": "docker compose -f booking/docker/compose.yml exec -T web vendor/bin/phpunit",
    "booking:stan": "docker compose -f booking/docker/compose.yml exec -T web vendor/bin/phpstan analyse --no-progress --memory-limit=1G",
    "test:booking": "node scripts/test-booking.mjs"
```

- [ ] **Step 11: Start the stack and install the dev tools**

```bash
docker rm -f tu-php 2>/dev/null; npm run booking:deps && npm run booking:up
```

Expected: Composer installs `phpunit/phpunit` and `phpstan/phpstan`. Compose then prints `Container tu-booking-web-1 Healthy`/`Started` for both services.

- [ ] **Step 12: Run the tests**

Run: `npm run booking:test -- --filter ConfigTest`
Expected: `OK (4 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 13: Commit**

```bash
git add .gitignore package.json booking
git commit -m "feat(booking): docker stack, PHP skeleton and configuration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Domain primitives

**Files:**
- Create: `booking/src/Domain/DomainError.php`, `Reference.php`, `Interval.php`, `Mode.php`, `AppointmentStatus.php`, `WeeklyWindow.php`, `SlotPolicy.php`
- Test: `booking/tests/Unit/DomainPrimitivesTest.php`

**Interfaces:**
- Produces:
  - `DomainError`, which extends `\RuntimeException`:
    - readonly `int $status`, `?int $retryAfter`
    - static constructors: `invalid(string)` (422), `conflict(string)` (409), `notFound(string = 'Der Eintrag wurde nicht gefunden.')` (404), `unauthorized(string = 'Bitte melden Sie sich an.')` (401), `forbidden(string = 'Dafür fehlt die Berechtigung.')` (403), `tooMany(string, int $retryAfter)` (429), `status(int, string)`
  - `Reference::generate(): string`, `Reference::isValid(string): bool`
  - `Interval` (readonly `$start`, `$end`; `overlaps(Interval): bool`; `widen(int $minutes): Interval`)
  - `enum Mode: string` (`Phone='phone'`, `Video='video'`, `Onsite='onsite'`; `label(): string`; `static fromCsv(string): list<Mode>`; `static toCsv(list<Mode>): string`)
  - `enum AppointmentStatus: string` (`Held`, `Confirmed`, `Cancelled`; `canBecome(self): bool`)
  - `WeeklyWindow` (readonly `int $weekday` 1–7 ISO, `string $start`, `string $end`; `static isTime(string): bool`; `static minutes(string): int`)
  - `SlotPolicy` (readonly `int $durationMin`, `$bufferMin`, `$stepMin`, `$leadTimeHours`, `$horizonDays`)

- [ ] **Step 1: Write the failing test**

`booking/tests/Unit/DomainPrimitivesTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Interval;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Reference;
use TuBooking\Domain\WeeklyWindow;

final class DomainPrimitivesTest extends TestCase
{
    public function testReferencesUseCrockfordBase32(): void
    {
        for ($i = 0; $i < 200; $i++) {
            $reference = Reference::generate();
            self::assertMatchesRegularExpression('/^TU-[0-9A-HJKMNP-TV-Z]{8}$/', $reference);
            self::assertTrue(Reference::isValid($reference));
        }
        self::assertFalse(Reference::isValid('TU-ABCDEFGI'));
        self::assertFalse(Reference::isValid('tu-ABCDEFGH'));
        self::assertFalse(Reference::isValid('TU-ABCDEFG'));
    }

    public function testIntervalsOverlapOnlyWhenTheyShareTime(): void
    {
        $utc = new \DateTimeZone('UTC');
        $a = new Interval(new \DateTimeImmutable('2026-10-05 07:00', $utc), new \DateTimeImmutable('2026-10-05 07:30', $utc));
        $b = new Interval(new \DateTimeImmutable('2026-10-05 07:30', $utc), new \DateTimeImmutable('2026-10-05 08:00', $utc));
        self::assertFalse($a->overlaps($b));
        self::assertTrue($a->widen(1)->overlaps($b));
        self::assertSame('2026-10-05 06:45', $a->widen(15)->start->format('Y-m-d H:i'));
        self::assertSame('2026-10-05 07:45', $a->widen(15)->end->format('Y-m-d H:i'));
    }

    public function testIntervalRejectsEmptyRange(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $t = new \DateTimeImmutable('2026-10-05 07:00', new \DateTimeZone('UTC'));
        new Interval($t, $t);
    }

    public function testModesRoundTripThroughCsv(): void
    {
        self::assertSame([Mode::Phone, Mode::Video], Mode::fromCsv('phone,video'));
        self::assertSame('phone,onsite', Mode::toCsv([Mode::Phone, Mode::Onsite]));
        self::assertSame('Vor Ort', Mode::Onsite->label());
        self::assertSame([], Mode::fromCsv(''));
    }

    public function testStatusTransitions(): void
    {
        self::assertTrue(AppointmentStatus::Held->canBecome(AppointmentStatus::Confirmed));
        self::assertTrue(AppointmentStatus::Held->canBecome(AppointmentStatus::Cancelled));
        self::assertTrue(AppointmentStatus::Confirmed->canBecome(AppointmentStatus::Cancelled));
        self::assertFalse(AppointmentStatus::Confirmed->canBecome(AppointmentStatus::Held));
        self::assertFalse(AppointmentStatus::Cancelled->canBecome(AppointmentStatus::Confirmed));
    }

    public function testWeeklyWindowValidation(): void
    {
        $window = new WeeklyWindow(1, '09:00', '17:30');
        self::assertSame(540, WeeklyWindow::minutes($window->start));
        self::assertSame(1050, WeeklyWindow::minutes($window->end));
        self::assertFalse(WeeklyWindow::isTime('24:00'));
        self::assertFalse(WeeklyWindow::isTime('9:00'));
        foreach ([[0, '09:00', '10:00'], [8, '09:00', '10:00'], [1, '10:00', '10:00'], [1, '11:00', '10:00'], [1, '9:00', '10:00']] as [$day, $start, $end]) {
            try {
                new WeeklyWindow($day, $start, $end);
                self::fail("Accepted $day $start–$end");
            } catch (\InvalidArgumentException) {
                self::addToAssertionCount(1);
            }
        }
    }

    public function testDomainErrorsCarryStatus(): void
    {
        self::assertSame(422, DomainError::invalid('x')->status);
        self::assertSame(409, DomainError::conflict('x')->status);
        self::assertSame(404, DomainError::notFound()->status);
        self::assertSame(401, DomainError::unauthorized()->status);
        self::assertSame(403, DomainError::forbidden()->status);
        $tooMany = DomainError::tooMany('x', 120);
        self::assertSame([429, 120], [$tooMany->status, $tooMany->retryAfter]);
        self::assertSame(415, DomainError::status(415, 'x')->status);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter DomainPrimitivesTest`
Expected: FAIL. Error: `Class "TuBooking\Domain\Reference" not found`.

- [ ] **Step 3: Write the classes**

`booking/src/Domain/DomainError.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

/**
 * A rule the request broke. The message is German and shown to the visitor
 * unchanged; the status becomes the HTTP status.
 */
final class DomainError extends \RuntimeException
{
    private function __construct(string $message, public readonly int $status, public readonly ?int $retryAfter = null)
    {
        parent::__construct($message);
    }

    public static function invalid(string $message): self
    {
        return new self($message, 422);
    }

    public static function conflict(string $message): self
    {
        return new self($message, 409);
    }

    public static function notFound(string $message = 'Der Eintrag wurde nicht gefunden.'): self
    {
        return new self($message, 404);
    }

    public static function unauthorized(string $message = 'Bitte melden Sie sich an.'): self
    {
        return new self($message, 401);
    }

    public static function forbidden(string $message = 'Dafür fehlt die Berechtigung.'): self
    {
        return new self($message, 403);
    }

    public static function tooMany(string $message, int $retryAfter): self
    {
        return new self($message, 429, $retryAfter);
    }

    public static function status(int $status, string $message): self
    {
        return new self($message, $status);
    }
}
```

`booking/src/Domain/Reference.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

/** Booking references like TU-7K3M9Q2A: Crockford base32, easy to read aloud. */
final class Reference
{
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    public static function generate(): string
    {
        $reference = 'TU-';
        for ($i = 0; $i < 8; $i++) {
            $reference .= self::ALPHABET[random_int(0, 31)];
        }
        return $reference;
    }

    public static function isValid(string $value): bool
    {
        return preg_match('/^TU-[0-9A-HJKMNP-TV-Z]{8}$/', $value) === 1;
    }
}
```

`booking/src/Domain/Interval.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

/** Half-open time range [start, end). */
final class Interval
{
    public function __construct(public readonly \DateTimeImmutable $start, public readonly \DateTimeImmutable $end)
    {
        if ($end <= $start) {
            throw new \InvalidArgumentException('Interval end must be after its start.');
        }
    }

    public function overlaps(self $other): bool
    {
        return $this->start < $other->end && $other->start < $this->end;
    }

    public function widen(int $minutes): self
    {
        $delta = new \DateInterval('PT' . $minutes . 'M');
        return new self($this->start->sub($delta), $this->end->add($delta));
    }
}
```

`booking/src/Domain/Mode.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

enum Mode: string
{
    case Phone = 'phone';
    case Video = 'video';
    case Onsite = 'onsite';

    public function label(): string
    {
        return match ($this) {
            self::Phone => 'Telefon',
            self::Video => 'Video',
            self::Onsite => 'Vor Ort',
        };
    }

    /** @return list<self> */
    public static function fromCsv(string $csv): array
    {
        $modes = [];
        foreach (explode(',', $csv) as $value) {
            $mode = self::tryFrom(trim($value));
            if ($mode !== null) {
                $modes[] = $mode;
            }
        }
        return $modes;
    }

    /** @param list<self> $modes */
    public static function toCsv(array $modes): string
    {
        return implode(',', array_map(static fn(self $mode): string => $mode->value, $modes));
    }
}
```

`booking/src/Domain/AppointmentStatus.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

enum AppointmentStatus: string
{
    case Held = 'held';
    case Confirmed = 'confirmed';
    case Cancelled = 'cancelled';

    public function canBecome(self $next): bool
    {
        return match ($this) {
            self::Held => $next !== self::Held,
            self::Confirmed => $next === self::Cancelled,
            self::Cancelled => false,
        };
    }
}
```

`booking/src/Domain/WeeklyWindow.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

/** Recurring opening hours on one ISO weekday (1 = Monday), wall-clock HH:MM in the business time zone. */
final class WeeklyWindow
{
    public function __construct(public readonly int $weekday, public readonly string $start, public readonly string $end)
    {
        if ($weekday < 1 || $weekday > 7) {
            throw new \InvalidArgumentException('Weekday must be between 1 and 7.');
        }
        if (!self::isTime($start) || !self::isTime($end) || self::minutes($end) <= self::minutes($start)) {
            throw new \InvalidArgumentException('Window must run from an earlier to a later HH:MM time.');
        }
    }

    public static function isTime(string $value): bool
    {
        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) === 1;
    }

    public static function minutes(string $value): int
    {
        return (int) substr($value, 0, 2) * 60 + (int) substr($value, 3, 2);
    }
}
```

`booking/src/Domain/SlotPolicy.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

/** The scheduling rules of one appointment type. */
final class SlotPolicy
{
    public function __construct(
        public readonly int $durationMin,
        public readonly int $bufferMin,
        public readonly int $stepMin,
        public readonly int $leadTimeHours,
        public readonly int $horizonDays,
    ) {
        if ($durationMin < 5 || $stepMin < 5 || $bufferMin < 0 || $leadTimeHours < 0 || $horizonDays < 1) {
            throw new \InvalidArgumentException('Invalid slot policy.');
        }
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run booking:test -- --filter DomainPrimitivesTest`
Expected: `OK (7 tests, …)`.

- [ ] **Step 5: Commit**

```bash
git add booking/src/Domain booking/tests/Unit/DomainPrimitivesTest.php
git commit -m "feat(booking): domain primitives" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Slot calculation

**Files:**
- Create: `booking/src/Domain/SlotCalculator.php`
- Test: `booking/tests/Unit/SlotCalculatorTest.php`

**Interfaces:**
- Consumes: `SlotPolicy`, `WeeklyWindow`, `Interval` (Task 2)
- Produces:
  - `SlotCalculator::__construct(\DateTimeZone $zone)`
  - `->slots(SlotPolicy $policy, list<WeeklyWindow> $windows, list<Interval> $busy, \DateTimeImmutable $now, string $fromDate, string $toDate): array<string, list<\DateTimeImmutable>>`. Keys are every local date `Y-m-d` from `$fromDate` to `$toDate` inclusive; values are the sorted UTC start times.
  - `->isBookable(SlotPolicy, list<WeeklyWindow>, list<Interval> $busy, \DateTimeImmutable $now, \DateTimeImmutable $start): bool`

- [ ] **Step 1: Write the failing test**

`booking/tests/Unit/SlotCalculatorTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Domain\Interval;
use TuBooking\Domain\SlotCalculator;
use TuBooking\Domain\SlotPolicy;
use TuBooking\Domain\WeeklyWindow;

final class SlotCalculatorTest extends TestCase
{
    private SlotCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new SlotCalculator(new \DateTimeZone('Europe/Berlin'));
    }

    private static function utc(string $iso): \DateTimeImmutable
    {
        return (new \DateTimeImmutable($iso))->setTimezone(new \DateTimeZone('UTC'));
    }

    /**
     * @param list<\DateTimeImmutable> $slots
     * @return list<string>
     */
    private static function iso(array $slots): array
    {
        return array_map(static fn(\DateTimeImmutable $slot): string => $slot->format('Y-m-d\TH:i\Z'), $slots);
    }

    private static function policy(int $duration = 30, int $buffer = 0, int $step = 30, int $lead = 0, int $horizon = 60): SlotPolicy
    {
        return new SlotPolicy($duration, $buffer, $step, $lead, $horizon);
    }

    public function testGeneratesStartsInsideTheWindow(): void
    {
        $days = $this->calculator->slots(self::policy(), [new WeeklyWindow(1, '09:00', '11:00')], [], self::utc('2026-10-01T08:00:00Z'), '2026-10-05', '2026-10-05');
        self::assertSame(['2026-10-05T07:00Z', '2026-10-05T07:30Z', '2026-10-05T08:00Z', '2026-10-05T08:30Z'], self::iso($days['2026-10-05']));
    }

    public function testEveryDayOfTheRangeIsPresent(): void
    {
        $days = $this->calculator->slots(self::policy(), [new WeeklyWindow(1, '09:00', '10:00')], [], self::utc('2026-10-01T08:00:00Z'), '2026-10-04', '2026-10-06');
        self::assertSame(['2026-10-04', '2026-10-05', '2026-10-06'], array_keys($days));
        self::assertSame([], $days['2026-10-04']);
        self::assertCount(2, $days['2026-10-05']);
        self::assertSame([], $days['2026-10-06']);
    }

    public function testBufferKeepsDistanceToBusyTime(): void
    {
        // Busy 09:30–10:00 local; with 15 minutes buffer only 10:30 remains.
        $busy = [new Interval(self::utc('2026-10-05T07:30:00Z'), self::utc('2026-10-05T08:00:00Z'))];
        $days = $this->calculator->slots(self::policy(buffer: 15), [new WeeklyWindow(1, '09:00', '11:00')], $busy, self::utc('2026-10-01T08:00:00Z'), '2026-10-05', '2026-10-05');
        self::assertSame(['2026-10-05T08:30Z'], self::iso($days['2026-10-05']));
    }

    public function testLeadTimeHidesStartsTooSoon(): void
    {
        $days = $this->calculator->slots(self::policy(lead: 1), [new WeeklyWindow(1, '09:00', '11:00')], [], self::utc('2026-10-05T06:10:00Z'), '2026-10-05', '2026-10-05');
        self::assertSame(['2026-10-05T07:30Z', '2026-10-05T08:00Z', '2026-10-05T08:30Z'], self::iso($days['2026-10-05']));
    }

    public function testHorizonEndsTheBookableRange(): void
    {
        $windows = [new WeeklyWindow(1, '09:00', '10:00'), new WeeklyWindow(7, '09:00', '10:00')];
        $days = $this->calculator->slots(self::policy(horizon: 3), $windows, [], self::utc('2026-10-01T08:00:00Z'), '2026-10-04', '2026-10-05');
        self::assertCount(2, $days['2026-10-04']);
        self::assertSame([], $days['2026-10-05']);
    }

    public function testClockChangeInAutumnUsesWinterOffset(): void
    {
        $windows = [new WeeklyWindow(6, '09:00', '09:30'), new WeeklyWindow(7, '09:00', '09:30')];
        $days = $this->calculator->slots(self::policy(), $windows, [], self::utc('2026-10-20T08:00:00Z'), '2026-10-24', '2026-10-25');
        self::assertSame(['2026-10-24T07:00Z'], self::iso($days['2026-10-24']));
        self::assertSame(['2026-10-25T08:00Z'], self::iso($days['2026-10-25']));
    }

    public function testClockChangeInSpringSkipsMissingWallTimes(): void
    {
        $days = $this->calculator->slots(self::policy(), [new WeeklyWindow(7, '01:30', '04:00')], [], self::utc('2027-03-20T08:00:00Z'), '2027-03-28', '2027-03-28');
        self::assertSame(['2027-03-28T00:30Z', '2027-03-28T01:00Z', '2027-03-28T01:30Z'], self::iso($days['2027-03-28']));
    }

    public function testStepSmallerThanDuration(): void
    {
        $days = $this->calculator->slots(self::policy(duration: 60, step: 15), [new WeeklyWindow(1, '09:00', '10:30')], [], self::utc('2026-10-01T08:00:00Z'), '2026-10-05', '2026-10-05');
        self::assertSame(['2026-10-05T07:00Z', '2026-10-05T07:15Z', '2026-10-05T07:30Z'], self::iso($days['2026-10-05']));
    }

    public function testOverlappingWindowsAreMergedAndSorted(): void
    {
        $windows = [new WeeklyWindow(1, '13:00', '14:00'), new WeeklyWindow(1, '09:00', '10:00'), new WeeklyWindow(1, '09:00', '09:30')];
        $days = $this->calculator->slots(self::policy(), $windows, [], self::utc('2026-10-01T08:00:00Z'), '2026-10-05', '2026-10-05');
        self::assertSame(['2026-10-05T07:00Z', '2026-10-05T07:30Z', '2026-10-05T11:00Z', '2026-10-05T11:30Z'], self::iso($days['2026-10-05']));
    }

    public function testAbsenceCoveringTheDayRemovesEverything(): void
    {
        $busy = [new Interval(self::utc('2026-10-04T22:00:00Z'), self::utc('2026-10-05T22:00:00Z'))];
        $days = $this->calculator->slots(self::policy(), [new WeeklyWindow(1, '09:00', '17:00')], $busy, self::utc('2026-10-01T08:00:00Z'), '2026-10-05', '2026-10-05');
        self::assertSame([], $days['2026-10-05']);
    }

    public function testIsBookableUsesTheBerlinDate(): void
    {
        // Tuesday 00:30 in Berlin is Monday 22:30 UTC.
        $windows = [new WeeklyWindow(2, '00:00', '01:00')];
        $now = self::utc('2026-10-01T08:00:00Z');
        self::assertTrue($this->calculator->isBookable(self::policy(), $windows, [], $now, self::utc('2026-10-05T22:30:00Z')));
        self::assertFalse($this->calculator->isBookable(self::policy(), $windows, [], $now, self::utc('2026-10-05T22:40:00Z')));
        self::assertFalse($this->calculator->isBookable(self::policy(), $windows, [], $now, self::utc('2026-10-06T22:30:00Z')));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter SlotCalculatorTest`
Expected: FAIL. Error: `Class "TuBooking\Domain\SlotCalculator" not found`.

- [ ] **Step 3: Write the calculator**

`booking/src/Domain/SlotCalculator.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

/**
 * Free start times of one appointment type.
 *
 * Weekly windows are wall-clock times in the business time zone. Each
 * candidate start is built from the local date plus a wall time. A wall time
 * that does not exist on a clock-change day is skipped, never shifted. Busy
 * intervals keep `bufferMin` distance on both sides.
 */
final class SlotCalculator
{
    public function __construct(private readonly \DateTimeZone $zone)
    {
    }

    /**
     * @param list<WeeklyWindow> $windows
     * @param list<Interval> $busy
     * @return array<string, list<\DateTimeImmutable>>
     */
    public function slots(SlotPolicy $policy, array $windows, array $busy, \DateTimeImmutable $now, string $fromDate, string $toDate): array
    {
        $utc = new \DateTimeZone('UTC');
        $earliest = $now->setTimezone($utc)->add(new \DateInterval('PT' . $policy->leadTimeHours . 'H'));
        $lastDate = $now->setTimezone($this->zone)->add(new \DateInterval('P' . $policy->horizonDays . 'D'))->format('Y-m-d');
        $duration = new \DateInterval('PT' . $policy->durationMin . 'M');
        $result = [];
        $day = new \DateTimeImmutable($fromDate . ' 12:00', $this->zone);
        $end = new \DateTimeImmutable($toDate . ' 12:00', $this->zone);
        while ($day <= $end) {
            $date = $day->format('Y-m-d');
            $starts = [];
            if ($date <= $lastDate) {
                $weekday = (int) $day->format('N');
                foreach ($windows as $window) {
                    if ($window->weekday !== $weekday) {
                        continue;
                    }
                    $close = WeeklyWindow::minutes($window->end);
                    for ($minute = WeeklyWindow::minutes($window->start); $minute + $policy->durationMin <= $close; $minute += $policy->stepMin) {
                        $wall = sprintf('%02d:%02d', intdiv($minute, 60), $minute % 60);
                        $local = new \DateTimeImmutable($date . ' ' . $wall, $this->zone);
                        if ($local->format('H:i') !== $wall) {
                            continue;
                        }
                        $start = $local->setTimezone($utc);
                        if ($start < $earliest) {
                            continue;
                        }
                        $candidate = (new Interval($start, $start->add($duration)))->widen($policy->bufferMin);
                        foreach ($busy as $interval) {
                            if ($candidate->overlaps($interval)) {
                                continue 2;
                            }
                        }
                        $starts[$start->getTimestamp()] = $start;
                    }
                }
            }
            ksort($starts);
            $result[$date] = array_values($starts);
            $day = $day->add(new \DateInterval('P1D'));
        }
        return $result;
    }

    /**
     * @param list<WeeklyWindow> $windows
     * @param list<Interval> $busy
     */
    public function isBookable(SlotPolicy $policy, array $windows, array $busy, \DateTimeImmutable $now, \DateTimeImmutable $start): bool
    {
        $date = $start->setTimezone($this->zone)->format('Y-m-d');
        foreach ($this->slots($policy, $windows, $busy, $now, $date, $date)[$date] ?? [] as $slot) {
            if ($slot->getTimestamp() === $start->getTimestamp()) {
                return true;
            }
        }
        return false;
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run booking:test -- --filter SlotCalculatorTest`
Expected: `OK (11 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 5: Commit**

```bash
git add booking/src/Domain/SlotCalculator.php booking/tests/Unit/SlotCalculatorTest.php
git commit -m "feat(booking): slot calculation with clock-change handling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mail and calendar building blocks

**Files:**
- Create: `booking/src/Infrastructure/Mail/Message.php`, `MimeBuilder.php`, `Mailer.php`, `MailFunctionMailer.php`, `Layout.php`
- Create: `booking/src/Infrastructure/Calendar/ICalendar.php`
- Create: `booking/tests/Support/MemoryMailer.php`
- Test: `booking/tests/Unit/MailTest.php`, `booking/tests/Unit/ICalendarTest.php`

**Interfaces:**
- Produces:
  - `Message`:
    - `__construct(string $toEmail, string $toName, string $subject, string $html, string $text, ?array{method: string, content: string} $calendar = null)`
    - `toArray(): array`, `static fromArray(array $data): Message`
  - `MimeBuilder`:
    - `__construct(string $fromEmail, string $fromName, string $replyTo)`
    - `build(Message): array{to: string, subject: string, body: string, headers: array<string, string>}`
    - `static encode(string): string`, `static address(string $email, string $name): string`
  - `interface Mailer { send(Message $message): void; }`, which throws on failure. `MailFunctionMailer::__construct(MimeBuilder $mime, string $envelopeSender)`.
  - `Layout`:
    - `__construct(string $origin)`
    - `html(array $parts): string`, `text(array $parts): string`
    - `$parts` shape: `array{preheader: string, kicker: string, title: string, intro: string, rows?: array<string, string>, paragraphs?: list<string>, code?: string, button?: array{label: string, url: string}}`
  - `ICalendar::event(string $method /* REQUEST|CANCEL|PUBLISH */, string $uid, int $sequence, \DateTimeImmutable $start, \DateTimeImmutable $end, string $summary, string $description, string $location, array{email: string, name: string} $organizer, ?array{email: string, name: string} $attendee, \DateTimeImmutable $stamp): string`
  - Test helper `TuBooking\Tests\Support\MemoryMailer implements Mailer`:
    - `public array $sent` (list of Message), `public bool $fail`
    - `to(string $email): list<Message>`

- [ ] **Step 1: Write the failing tests**

`booking/tests/Unit/ICalendarTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Infrastructure\Calendar\ICalendar;

final class ICalendarTest extends TestCase
{
    private function event(string $method, string $summary = 'Kostenloses Erstgespräch', string $description = 'Referenz: TU-7K3M9Q2A'): string
    {
        $utc = new \DateTimeZone('UTC');
        return (new ICalendar())->event(
            $method,
            'TU-7K3M9Q2A@tayyipuenal.de',
            2,
            new \DateTimeImmutable('2026-10-05 07:00', $utc),
            new \DateTimeImmutable('2026-10-05 07:30', $utc),
            $summary,
            $description,
            'Telefon',
            ['email' => 'buchung@tayyipuenal.de', 'name' => 'Terminbuchung tayyipuenal.de'],
            ['email' => 'info@tayyipuenal.de', 'name' => 'Tayyip Ünal'],
            new \DateTimeImmutable('2026-10-01 08:00', $utc),
        );
    }

    public function testRequestHasEveryFieldOutlookNeeds(): void
    {
        $ics = $this->event('REQUEST');
        $unfolded = str_replace("\r\n ", '', $ics);
        foreach (['METHOD:REQUEST', 'UID:TU-7K3M9Q2A@tayyipuenal.de', 'SEQUENCE:2', 'DTSTAMP:20261001T080000Z', 'DTSTART:20261005T070000Z', 'DTEND:20261005T073000Z', 'STATUS:CONFIRMED', 'ORGANIZER;CN="Terminbuchung tayyipuenal.de":mailto:buchung@tayyipuenal.de', 'ATTENDEE;CN="Tayyip Ünal";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:info@tayyipuenal.de'] as $line) {
            self::assertStringContainsString($line . "\r\n", $unfolded);
        }
        self::assertStringStartsWith("BEGIN:VCALENDAR\r\n", $ics);
        self::assertStringEndsWith("END:VCALENDAR\r\n", $ics);
        self::assertSame(0, preg_match("/(?<!\r)\n/", $ics), 'bare LF found');
    }

    public function testCancelAndPublish(): void
    {
        $cancel = $this->event('CANCEL');
        self::assertStringContainsString("METHOD:CANCEL\r\n", $cancel);
        self::assertStringContainsString("STATUS:CANCELLED\r\n", $cancel);
        $publish = $this->event('PUBLISH');
        self::assertStringNotContainsString('ATTENDEE', $publish);
    }

    public function testEscapesText(): void
    {
        $ics = $this->event('REQUEST', 'Beratung; Termin, Test', "Zeile 1\nZeile 2\\Pfad");
        self::assertStringContainsString("SUMMARY:Beratung\; Termin\\, Test\r\n", $ics);
        self::assertStringContainsString("DESCRIPTION:Zeile 1\\nZeile 2\\\\Pfad\r\n", $ics);
    }

    public function testFoldsLongLinesWithoutSplittingCharacters(): void
    {
        $description = str_repeat('Größenänderung ', 20);
        $ics = $this->event('REQUEST', 'Kurz', $description);
        foreach (explode("\r\n", $ics) as $line) {
            self::assertLessThanOrEqual(75, strlen($line));
            self::assertTrue(mb_check_encoding($line, 'UTF-8'));
        }
        $unfolded = str_replace("\r\n ", '', $ics);
        self::assertStringContainsString('DESCRIPTION:' . $description . "\r\n", $unfolded);
    }
}
```

`booking/tests/Unit/MailTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Infrastructure\Mail\Layout;
use TuBooking\Infrastructure\Mail\Message;
use TuBooking\Infrastructure\Mail\MimeBuilder;

final class MailTest extends TestCase
{
    private function builder(): MimeBuilder
    {
        return new MimeBuilder('buchung@tayyipuenal.de', 'Tayyip Ünal · Terminbuchung', 'info@tayyipuenal.de');
    }

    /** @return array<string, string> content type => decoded body */
    private static function parts(string $body): array
    {
        preg_match_all("~Content-Type: ([^\r]+)\r\n(?:Content-Disposition: [^\r]+\r\n)?Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--~", $body, $matches, PREG_SET_ORDER);
        $parts = [];
        foreach ($matches as $match) {
            $parts[$match[1]] = (string) base64_decode(str_replace("\r\n", '', $match[2]), true);
        }
        return $parts;
    }

    public function testAlternativeMessageWithoutCalendar(): void
    {
        $message = new Message('kunde@example.com', 'Miriam Müller', 'Ihr Termin am Montag', '<p>Hallo</p>', "Hallo\n");
        $mail = $this->builder()->build($message);
        self::assertSame('=?UTF-8?B?' . base64_encode('Miriam Müller') . '?= <kunde@example.com>', $mail['to']);
        self::assertSame('Ihr Termin am Montag', iconv_mime_decode($mail['subject'], 0, 'UTF-8'));
        self::assertStringStartsWith('multipart/alternative; boundary="tu_alt_', $mail['headers']['Content-Type']);
        self::assertSame('info@tayyipuenal.de', $mail['headers']['Reply-To']);
        self::assertStringContainsString('<buchung@tayyipuenal.de>', $mail['headers']['From']);
        $parts = self::parts($mail['body']);
        self::assertSame("Hallo\n", $parts['text/plain; charset=UTF-8']);
        self::assertSame('<p>Hallo</p>', $parts['text/html; charset=UTF-8']);
    }

    public function testCalendarMessageIsMixedWithInlinePartAndAttachment(): void
    {
        $ics = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n";
        $mail = $this->builder()->build(new Message('info@tayyipuenal.de', 'Tayyip Ünal', 'Neuer Termin', '<p>x</p>', 'x', ['method' => 'REQUEST', 'content' => $ics]));
        self::assertStringStartsWith('multipart/mixed; boundary="tu_mix_', $mail['headers']['Content-Type']);
        $parts = self::parts($mail['body']);
        self::assertSame($ics, $parts['text/calendar; charset=UTF-8; method=REQUEST']);
        self::assertSame($ics, $parts['application/ics; name="termin.ics"']);
    }

    public function testHeaderValuesCannotBeInjected(): void
    {
        $mail = $this->builder()->build(new Message('kunde@example.com', "Evil\r\nBcc: x@example.com", "Betreff\r\nBcc: y@example.com", '', ''));
        self::assertStringNotContainsString("\r\n", $mail['to']);
        self::assertStringNotContainsString("\r\n", $mail['subject']);
    }

    public function testMessageRoundTrip(): void
    {
        $message = new Message('a@example.com', 'A', 'S', '<b>h</b>', 't', ['method' => 'CANCEL', 'content' => 'ics']);
        self::assertEquals($message, Message::fromArray(json_decode((string) json_encode($message->toArray()), true)));
    }

    public function testLayoutEscapesAndMirrorsText(): void
    {
        $layout = new Layout('https://tayyipuenal.de');
        $parts = [
            'preheader' => 'Vorschau',
            'kicker' => 'Kostenloses Erstgespräch',
            'title' => 'Ihr Termin ist bestätigt.',
            'intro' => "Guten Tag <script>alert(1)</script>,\nwillkommen.",
            'rows' => ['Anmerkung' => "<img src=x onerror=alert(1)>\nZweite Zeile"],
            'paragraphs' => ['A & B'],
            'code' => '123456',
            'button' => ['label' => 'Kundenkonto öffnen', 'url' => 'https://tayyipuenal.de/konto/?a=1&b=2'],
        ];
        $html = $layout->html($parts);
        self::assertStringNotContainsString('<script>', $html);
        self::assertStringNotContainsString('<img src=x', $html);
        self::assertStringContainsString('&lt;script&gt;', $html);
        self::assertStringContainsString('Zweite Zeile', $html);
        self::assertStringContainsString('<br>', $html);
        self::assertStringContainsString('A &amp; B', $html);
        self::assertStringContainsString('href="https://tayyipuenal.de/konto/?a=1&amp;b=2"', $html);
        self::assertStringContainsString('123456', $html);
        $text = $layout->text($parts);
        self::assertStringContainsString("Anmerkung: <img src=x onerror=alert(1)>\nZweite Zeile", $text);
        self::assertStringContainsString('Kundenkonto öffnen: https://tayyipuenal.de/konto/?a=1&b=2', $text);
        self::assertStringContainsString('123456', $text);
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run booking:test -- --filter 'ICalendarTest|MailTest'`
Expected: FAIL with `Class "TuBooking\Infrastructure\Calendar\ICalendar" not found` and `Class "TuBooking\Infrastructure\Mail\MimeBuilder" not found`.

- [ ] **Step 3: Write the mail classes**

`booking/src/Infrastructure/Mail/Message.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Mail;

/** One fully rendered email. Serialisable, so the outbox can store and retry it. */
final class Message
{
    /** @param array{method: string, content: string}|null $calendar */
    public function __construct(
        public readonly string $toEmail,
        public readonly string $toName,
        public readonly string $subject,
        public readonly string $html,
        public readonly string $text,
        public readonly ?array $calendar = null,
    ) {
    }

    /** @return array{toEmail: string, toName: string, subject: string, html: string, text: string, calendar: array{method: string, content: string}|null} */
    public function toArray(): array
    {
        return [
            'toEmail' => $this->toEmail,
            'toName' => $this->toName,
            'subject' => $this->subject,
            'html' => $this->html,
            'text' => $this->text,
            'calendar' => $this->calendar,
        ];
    }

    /** @param array<mixed> $data */
    public static function fromArray(array $data): self
    {
        $string = static function (string $key) use ($data): string {
            $value = $data[$key] ?? null;
            if (!is_string($value)) {
                throw new \InvalidArgumentException("Message field $key is missing.");
            }
            return $value;
        };
        $calendar = $data['calendar'] ?? null;
        if ($calendar !== null) {
            if (!is_array($calendar) || !is_string($calendar['method'] ?? null) || !is_string($calendar['content'] ?? null)) {
                throw new \InvalidArgumentException('Message calendar is invalid.');
            }
            $calendar = ['method' => $calendar['method'], 'content' => $calendar['content']];
        }
        return new self($string('toEmail'), $string('toName'), $string('subject'), $string('html'), $string('text'), $calendar);
    }
}
```

`booking/src/Infrastructure/Mail/MimeBuilder.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Mail;

/**
 * Builds the arguments for mail() the same way the production-tested enquiry
 * endpoint does: base64 parts, CRLF line ends, headers as an array. A calendar
 * invitation becomes multipart/mixed: the alternative block (text, HTML,
 * text/calendar) plus the same invitation as an .ics attachment.
 */
final class MimeBuilder
{
    public function __construct(private readonly string $fromEmail, private readonly string $fromName, private readonly string $replyTo)
    {
    }

    /** @return array{to: string, subject: string, body: string, headers: array<string, string>} */
    public function build(Message $message): array
    {
        $alternative = 'tu_alt_' . bin2hex(random_bytes(12));
        $body = self::part($alternative, 'text/plain; charset=UTF-8', $message->text)
            . self::part($alternative, 'text/html; charset=UTF-8', $message->html);
        if ($message->calendar !== null) {
            $body .= self::part($alternative, 'text/calendar; charset=UTF-8; method=' . $message->calendar['method'], $message->calendar['content']);
        }
        $body .= "--$alternative--\r\n";
        $contentType = 'multipart/alternative; boundary="' . $alternative . '"';
        if ($message->calendar !== null) {
            $mixed = 'tu_mix_' . bin2hex(random_bytes(12));
            $body = "--$mixed\r\nContent-Type: $contentType\r\n\r\n" . $body . "\r\n"
                . "--$mixed\r\nContent-Type: application/ics; name=\"termin.ics\"\r\nContent-Disposition: attachment; filename=\"termin.ics\"\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($message->calendar['content'])) . "\r\n"
                . "--$mixed--\r\n";
            $contentType = 'multipart/mixed; boundary="' . $mixed . '"';
        }
        return [
            'to' => self::address($message->toEmail, $message->toName),
            'subject' => self::encode($message->subject),
            'body' => $body,
            'headers' => [
                'From' => self::address($this->fromEmail, $this->fromName),
                'Reply-To' => $this->replyTo,
                'MIME-Version' => '1.0',
                'Content-Type' => $contentType,
                'Auto-Submitted' => 'auto-generated',
            ],
        ];
    }

    public static function encode(string $value): string
    {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    public static function address(string $email, string $name): string
    {
        return $name === '' ? $email : self::encode($name) . ' <' . $email . '>';
    }

    private static function part(string $boundary, string $type, string $content): string
    {
        return "--$boundary\r\nContent-Type: $type\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($content)) . "\r\n";
    }
}
```

`booking/src/Infrastructure/Mail/Mailer.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Mail;

interface Mailer
{
    /** Hands the message to the mail system; throws when that fails. */
    public function send(Message $message): void;
}
```

`booking/src/Infrastructure/Mail/MailFunctionMailer.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Mail;

/** Sends through PHP's mail(), which ALL-INKL delivers via its local MTA. */
final class MailFunctionMailer implements Mailer
{
    public function __construct(private readonly MimeBuilder $mime, private readonly string $envelopeSender)
    {
    }

    public function send(Message $message): void
    {
        $mail = $this->mime->build($message);
        if (!mail($mail['to'], $mail['subject'], $mail['body'], $mail['headers'], '-f ' . $this->envelopeSender)) {
            throw new \RuntimeException('mail() returned false.');
        }
    }
}
```

`booking/src/Infrastructure/Mail/Layout.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Mail;

/**
 * Shared look of every booking email (palette and structure of the existing
 * enquiry mails) and its complete plain-text twin. Every value is escaped.
 *
 * @phpstan-type Parts array{preheader: string, kicker: string, title: string, intro: string, rows?: array<string, string>, paragraphs?: list<string>, code?: string, button?: array{label: string, url: string}}
 */
final class Layout
{
    public function __construct(private readonly string $origin)
    {
    }

    /** @param Parts $parts */
    public function html(array $parts): string
    {
        $e = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $rows = '';
        foreach ($parts['rows'] ?? [] as $label => $value) {
            $rows .= '<tr><th align="left" valign="top" width="130" style="padding:12px 12px 12px 0;border-bottom:1px solid #e0eaf0;color:#526d7d;font:normal 13px/1.6 Arial,sans-serif;">'
                . $e($label) . '</th><td valign="top" style="padding:12px 0;border-bottom:1px solid #e0eaf0;color:#173e55;font:15px/1.6 Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere;">'
                . nl2br($e($value), false) . '</td></tr>';
        }
        $table = $rows === '' ? '' : '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;margin:0 0 22px;">' . $rows . '</table>';
        $paragraphs = '';
        foreach ($parts['paragraphs'] ?? [] as $paragraph) {
            $paragraphs .= '<p style="margin:0 0 14px;font:15px/1.75 Arial,sans-serif;color:#2b5368;">' . nl2br($e($paragraph), false) . '</p>';
        }
        $code = isset($parts['code'])
            ? '<p style="margin:4px 0 24px;font:700 34px/1.2 Consolas,\'Courier New\',monospace;letter-spacing:8px;color:#0a5c86;">' . $e($parts['code']) . '</p>'
            : '';
        $button = '';
        if (isset($parts['button'])) {
            $button = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 6px;"><tr><td align="center" bgcolor="#076f9b" style="border-radius:7px;background:#076f9b;"><a href="'
                . $e($parts['button']['url']) . '" style="display:inline-block;padding:14px 22px;color:#ffffff;font:700 15px/1.3 Arial,sans-serif;text-decoration:none;border-radius:7px;">'
                . $e($parts['button']['label']) . '</a></td></tr></table>';
        }
        $origin = $e($this->origin);
        $title = $e($parts['title']);
        $kicker = $e($parts['kicker']);
        $preheader = $e($parts['preheader']);
        $intro = nl2br($e($parts['intro']), false);
        return <<<HTML
<!doctype html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>{$title}</title>
<style>@media only screen and (max-width:520px){.email-pad{padding:24px 20px!important}.email-title{font-size:26px!important}.email-outer{padding:16px 8px!important}}</style></head>
<body style="margin:0;padding:0;background:#edf4f8;color:#173e55;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#edf4f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{$preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edf4f8;"><tr><td class="email-outer" align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #d4e3ec;border-top:5px solid #0784b8;border-radius:12px;">
<tr><td class="email-pad" style="padding:24px 36px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><p style="margin:0 0 7px;font:700 21px/1.3 Arial,sans-serif;letter-spacing:.3px;color:#174a64;">Tayyip Ünal</p><p style="margin:0;font:13px/1.6 Arial,sans-serif;color:#526e80;">Audits · Qualifikation · Beratung</p></td><td width="88" align="right"><img src="{$origin}/brand-logo.png" width="88" height="88" alt="Tayyip Ünal" style="display:block;border:0;width:88px;height:88px;"></td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:28px 36px;background:#edf7fc;border-top:1px solid #d7e9f2;border-bottom:1px solid #d7e9f2;">
<p style="margin:0 0 12px;font:700 12px/1.5 Arial,sans-serif;letter-spacing:1.1px;text-transform:uppercase;color:#1b7096;">{$kicker}</p>
<h1 class="email-title" style="margin:0 0 14px;font:700 30px/1.2 Arial,sans-serif;color:#173e55;">{$title}</h1>
<p style="margin:0;font:15px/1.75 Arial,sans-serif;color:#416477;">{$intro}</p>
</td></tr>
<tr><td class="email-pad" style="padding:28px 36px 20px;">{$code}{$table}{$paragraphs}{$button}</td></tr>
<tr><td class="email-pad" style="padding:20px 36px;background:#f6fafc;border-top:1px solid #dce8ef;border-radius:0 0 12px 12px;">
<p style="margin:0;font:12px/1.7 Arial,sans-serif;color:#526d7d;">Tayyip Ünal · Antonio-Segni-Str. 4 · 44263 Dortmund · <a href="{$origin}/" style="color:#17698c;text-decoration:underline;">tayyipuenal.de</a> · <a href="{$origin}/datenschutz/" style="color:#17698c;text-decoration:underline;">Datenschutz</a></p>
</td></tr></table>
</td></tr></table></body></html>
HTML;
    }

    /** @param Parts $parts */
    public function text(array $parts): string
    {
        $lines = [$parts['title'], '', $parts['intro']];
        if (isset($parts['code'])) {
            array_push($lines, '', '    ' . $parts['code']);
        }
        $rows = $parts['rows'] ?? [];
        if ($rows !== []) {
            $lines[] = '';
            foreach ($rows as $label => $value) {
                $lines[] = $label . ': ' . $value;
            }
        }
        foreach ($parts['paragraphs'] ?? [] as $paragraph) {
            array_push($lines, '', $paragraph);
        }
        if (isset($parts['button'])) {
            array_push($lines, '', $parts['button']['label'] . ': ' . $parts['button']['url']);
        }
        array_push($lines, '', '-- ', 'Tayyip Ünal · Antonio-Segni-Str. 4 · 44263 Dortmund', $this->origin . '/');
        return implode("\n", $lines) . "\n";
    }
}
```

`booking/src/Infrastructure/Calendar/ICalendar.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Calendar;

/**
 * Minimal RFC 5545 writer for one VEVENT, used for iMIP invitations
 * (RFC 6047: REQUEST, CANCEL) and for calendar downloads (PUBLISH).
 * Times are written in UTC, so no VTIMEZONE block is needed.
 */
final class ICalendar
{
    /**
     * @param array{email: string, name: string} $organizer
     * @param array{email: string, name: string}|null $attendee
     */
    public function event(string $method, string $uid, int $sequence, \DateTimeImmutable $start, \DateTimeImmutable $end, string $summary, string $description, string $location, array $organizer, ?array $attendee, \DateTimeImmutable $stamp): string
    {
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//tayyipuenal.de//Terminbuchung//DE',
            'CALSCALE:GREGORIAN',
            'METHOD:' . $method,
            'BEGIN:VEVENT',
            'UID:' . $uid,
            'SEQUENCE:' . $sequence,
            'DTSTAMP:' . self::utc($stamp),
            'DTSTART:' . self::utc($start),
            'DTEND:' . self::utc($end),
            'SUMMARY:' . self::text($summary),
            'DESCRIPTION:' . self::text($description),
            'LOCATION:' . self::text($location),
            'STATUS:' . ($method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'),
            'TRANSP:OPAQUE',
            'ORGANIZER;CN=' . self::param($organizer['name']) . ':mailto:' . $organizer['email'],
        ];
        if ($attendee !== null && $method !== 'PUBLISH') {
            $lines[] = 'ATTENDEE;CN=' . self::param($attendee['name']) . ';ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:' . $attendee['email'];
        }
        $lines[] = 'END:VEVENT';
        $lines[] = 'END:VCALENDAR';
        return implode("\r\n", array_map(self::fold(...), $lines)) . "\r\n";
    }

    private static function utc(\DateTimeImmutable $time): string
    {
        return $time->setTimezone(new \DateTimeZone('UTC'))->format('Ymd\THis\Z');
    }

    private static function text(string $value): string
    {
        return str_replace(['\\', ';', ',', "\r\n", "\r", "\n"], ['\\\\', '\;', '\\,', '\\n', '\\n', '\\n'], $value);
    }

    private static function param(string $value): string
    {
        return '"' . str_replace('"', "'", (string) preg_replace('/[\x00-\x1F\x7F]/', ' ', $value)) . '"';
    }

    /** Folds at 75 octets without splitting a UTF-8 character. */
    private static function fold(string $line): string
    {
        if (strlen($line) <= 75) {
            return $line;
        }
        $folded = '';
        $current = '';
        $limit = 75;
        foreach (mb_str_split($line, 1, 'UTF-8') as $char) {
            if (strlen($current) + strlen($char) > $limit) {
                $folded .= $current . "\r\n ";
                $current = '';
                $limit = 74;
            }
            $current .= $char;
        }
        return $folded . $current;
    }
}
```

`booking/tests/Support/MemoryMailer.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Support;

use TuBooking\Infrastructure\Mail\Mailer;
use TuBooking\Infrastructure\Mail\Message;

final class MemoryMailer implements Mailer
{
    /** @var list<Message> */
    public array $sent = [];
    public bool $fail = false;

    public function send(Message $message): void
    {
        if ($this->fail) {
            throw new \RuntimeException('Mail transport down');
        }
        $this->sent[] = $message;
    }

    /** @return list<Message> */
    public function to(string $email): array
    {
        return array_values(array_filter($this->sent, static fn(Message $message): bool => $message->toEmail === $email));
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run booking:test -- --filter 'ICalendarTest|MailTest'`
Expected: `OK (9 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 5: Commit**

```bash
git add booking/src/Infrastructure/Mail booking/src/Infrastructure/Calendar booking/tests/Support/MemoryMailer.php booking/tests/Unit/MailTest.php booking/tests/Unit/ICalendarTest.php
git commit -m "feat(booking): MIME builder, email layout and iCalendar writer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tokens, keyed hashes, encryption and TOTP

**Files:**
- Create: `booking/src/Infrastructure/Crypto.php`, `booking/src/Infrastructure/Totp.php`
- Test: `booking/tests/Unit/CryptoTest.php`, `booking/tests/Unit/TotpTest.php`

**Interfaces:**
- Consumes: `Config` (Task 1)
- Produces:
  - `Crypto`:
    - `__construct(string $pepper, string $key)` (both 32 raw bytes); `static fromConfig(Config)` (reads `secrets.code_pepper`, `secrets.totp_key` as 64 hex chars)
    - `token(int $bytes = 32): string` (base64url, no padding), `hash(string $token): string` (sha256 hex), `hmac(string $value): string` (HMAC-SHA256 hex with the pepper)
    - `code(): string` (6 digits), `encrypt(string): string`, `decrypt(string): string`
  - `Totp`, all static:
    - `secret(): string` (base32, 160 bit), `code(string $secret, int $time, int $digits = 6): string`
    - `match(string $secret, string $code, int $time): ?int`, which returns the matched 30-second counter within ±1 step
    - `uri(string $secret, string $account, string $issuer): string`, `base32Encode(string): string`, `base32Decode(string): string`

- [ ] **Step 1: Write the failing tests**

`booking/tests/Unit/TotpTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Infrastructure\Totp;

final class TotpTest extends TestCase
{
    /** RFC 6238 appendix B, SHA-1, secret "12345678901234567890". */
    public function testRfc6238Vectors(): void
    {
        $secret = Totp::base32Encode('12345678901234567890');
        self::assertSame('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', $secret);
        $vectors = [59 => '94287082', 1111111109 => '07081804', 1111111111 => '14050471', 1234567890 => '89005924', 2000000000 => '69279037', 20000000000 => '65353130'];
        foreach ($vectors as $time => $expected) {
            self::assertSame($expected, Totp::code($secret, $time, 8), "t=$time");
        }
    }

    public function testBase32RoundTripAndLenientDecoding(): void
    {
        $bytes = random_bytes(20);
        $encoded = Totp::base32Encode($bytes);
        self::assertSame($bytes, Totp::base32Decode($encoded));
        self::assertSame($bytes, Totp::base32Decode(strtolower(implode(' ', str_split($encoded, 4)))));
        self::assertMatchesRegularExpression('/^[A-Z2-7]{32}$/', Totp::secret());
    }

    public function testMatchAcceptsOneStepEitherSide(): void
    {
        $secret = Totp::secret();
        $time = 1790000000;
        $counter = intdiv($time, 30);
        self::assertSame($counter, Totp::match($secret, Totp::code($secret, $time), $time));
        self::assertSame($counter - 1, Totp::match($secret, Totp::code($secret, $time - 30), $time));
        self::assertSame($counter + 1, Totp::match($secret, Totp::code($secret, $time + 30), $time));
        self::assertNull(Totp::match($secret, Totp::code($secret, $time - 90), $time));
        self::assertNull(Totp::match($secret, '12345', $time));
        self::assertNull(Totp::match($secret, 'abcdef', $time));
    }

    public function testUri(): void
    {
        self::assertSame(
            'otpauth://totp/Tayyip%20%C3%9Cnal%20Verwaltung%3Ainfo%40tayyipuenal.de?secret=ABC&issuer=Tayyip%20%C3%9Cnal%20Verwaltung&algorithm=SHA1&digits=6&period=30',
            Totp::uri('ABC', 'info@tayyipuenal.de', 'Tayyip Ünal Verwaltung'),
        );
    }
}
```

`booking/tests/Unit/CryptoTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Config;
use TuBooking\Infrastructure\Crypto;
use TuBooking\Tests\Support\TestConfig;

final class CryptoTest extends TestCase
{
    private function crypto(): Crypto
    {
        return Crypto::fromConfig(TestConfig::create());
    }

    public function testTokensAreUrlSafeAndUnique(): void
    {
        $a = $this->crypto()->token();
        self::assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $a);
        self::assertNotSame($a, $this->crypto()->token());
    }

    public function testHashesAreDeterministicAndKeyed(): void
    {
        $crypto = $this->crypto();
        self::assertSame(hash('sha256', 'abc'), $crypto->hash('abc'));
        self::assertSame($crypto->hmac('max@example.com|123456'), $crypto->hmac('max@example.com|123456'));
        self::assertNotSame(hash('sha256', 'max@example.com|123456'), $crypto->hmac('max@example.com|123456'));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $crypto->hmac('x'));
    }

    public function testCodesHaveSixDigits(): void
    {
        for ($i = 0; $i < 100; $i++) {
            self::assertMatchesRegularExpression('/^\d{6}$/', $this->crypto()->code());
        }
    }

    public function testEncryptionRoundTripAndTamperDetection(): void
    {
        $crypto = $this->crypto();
        $cipher = $crypto->encrypt('JBSWY3DPEHPK3PXP');
        self::assertNotSame($cipher, $crypto->encrypt('JBSWY3DPEHPK3PXP'));
        self::assertSame('JBSWY3DPEHPK3PXP', $crypto->decrypt($cipher));
        $raw = (string) base64_decode($cipher, true);
        $raw[strlen($raw) - 1] = chr(ord($raw[strlen($raw) - 1]) ^ 1);
        $this->expectException(\RuntimeException::class);
        $crypto->decrypt(base64_encode($raw));
    }

    public function testRejectsMalformedSecrets(): void
    {
        $this->expectException(\RuntimeException::class);
        Crypto::fromConfig(Config::fromArray(['secrets' => ['code_pepper' => 'short', 'totp_key' => str_repeat('00', 32)]]));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run booking:test -- --filter 'CryptoTest|TotpTest'`
Expected: FAIL with `Class "TuBooking\Infrastructure\Totp" not found` and `Class "TuBooking\Infrastructure\Crypto" not found`.

- [ ] **Step 3: Write the classes**

`booking/src/Infrastructure/Crypto.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

use TuBooking\Config;

/**
 * Random tokens and codes, keyed hashes (codes, IPs and rate-limit buckets
 * are never stored in clear), and authenticated encryption of the admins'
 * TOTP secrets.
 */
final class Crypto
{
    public function __construct(private readonly string $pepper, private readonly string $key)
    {
        if (strlen($pepper) !== 32 || strlen($key) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
            throw new \RuntimeException('Secrets must be 32 bytes long.');
        }
    }

    public static function fromConfig(Config $config): self
    {
        return new self(self::hex($config->string('secrets.code_pepper')), self::hex($config->string('secrets.totp_key')));
    }

    public function token(int $bytes = 32): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    public function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public function hmac(string $value): string
    {
        return hash_hmac('sha256', $value, $this->pepper);
    }

    public function code(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    public function encrypt(string $plain): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $this->key));
    }

    public function decrypt(string $cipher): string
    {
        $raw = base64_decode($cipher, true);
        if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            throw new \RuntimeException('Encrypted value is malformed.');
        }
        $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $this->key);
        if ($plain === false) {
            throw new \RuntimeException('Encrypted value could not be decrypted.');
        }
        return $plain;
    }

    private static function hex(string $hex): string
    {
        if (preg_match('/^[0-9a-f]{64}$/i', $hex) !== 1) {
            throw new \RuntimeException('Secrets must be 64 hexadecimal characters.');
        }
        return (string) hex2bin($hex);
    }
}
```

`booking/src/Infrastructure/Totp.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

/** RFC 6238 time-based one-time passwords (SHA-1, 30 s, 6 digits), as used by every authenticator app. */
final class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    private const PERIOD = 30;

    public static function secret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    public static function code(string $secret, int $time, int $digits = 6): string
    {
        $hash = hash_hmac('sha1', pack('J', intdiv($time, self::PERIOD)), self::base32Decode($secret), true);
        $offset = ord($hash[19]) & 0x0f;
        $value = ((ord($hash[$offset]) & 0x7f) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);
        return str_pad((string) ($value % (10 ** $digits)), $digits, '0', STR_PAD_LEFT);
    }

    /** Returns the 30-second counter the code belongs to (±1 step of clock drift), or null. */
    public static function match(string $secret, string $code, int $time): ?int
    {
        if (preg_match('/^\d{6}$/', $code) !== 1) {
            return null;
        }
        foreach ([0, -1, 1] as $step) {
            $at = $time + $step * self::PERIOD;
            if (hash_equals(self::code($secret, $at), $code)) {
                return intdiv($at, self::PERIOD);
            }
        }
        return null;
    }

    public static function uri(string $secret, string $account, string $issuer): string
    {
        return 'otpauth://totp/' . rawurlencode($issuer . ':' . $account)
            . '?secret=' . $secret . '&issuer=' . rawurlencode($issuer) . '&algorithm=SHA1&digits=6&period=30';
    }

    public static function base32Encode(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }
        $encoded = '';
        foreach (str_split($bits, 5) as $chunk) {
            $encoded .= self::ALPHABET[(int) bindec(str_pad($chunk, 5, '0'))];
        }
        return $encoded;
    }

    public static function base32Decode(string $text): string
    {
        $clean = strtoupper((string) preg_replace('/[\s=-]/', '', $text));
        $bits = '';
        foreach (str_split($clean) as $char) {
            $index = strpos(self::ALPHABET, $char);
            if ($index === false) {
                throw new \InvalidArgumentException('Invalid base32 character.');
            }
            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }
        $bytes = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $bytes .= chr((int) bindec($chunk));
            }
        }
        return $bytes;
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run booking:test -- --filter 'CryptoTest|TotpTest'`
Expected: `OK (9 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 5: Commit**

```bash
git add booking/src/Infrastructure/Crypto.php booking/src/Infrastructure/Totp.php booking/tests/Unit/CryptoTest.php booking/tests/Unit/TotpTest.php
git commit -m "feat(booking): tokens, keyed hashes, encryption and TOTP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Database, migrations and the composition root

**Files:**
- Create: `booking/src/Infrastructure/Database.php`, `booking/src/Infrastructure/Time.php`, `booking/src/Infrastructure/Migrator.php`
- Create: `booking/migrations/0001_foundation.sql`
- Create: `booking/src/App.php`
- Create: `booking/tests/Support/DatabaseTestCase.php`
- Test: `booking/tests/Unit/TimeTest.php`, `booking/tests/Integration/MigratorTest.php`

**Interfaces:**
- Consumes: `Config`, `Clock` (Task 1); `MemoryMailer` (Task 4)
- Produces:
  - `Database`:
    - `static connect(Config)`, `__construct(\PDO)`
    - `one(string $sql, array $params = []): ?array<string, mixed>`, `all(...): list<array<string, mixed>>`, `execute(...): int` (affected rows), `insert(...): int` (last id), `scalar(...): mixed`
    - `transaction(callable $work): mixed`; nested calls join the outer transaction
    - `pdo(): \PDO`
  - `Time`, all static: `utc(): \DateTimeZone`, `sql(\DateTimeImmutable): string`, `parse(string): \DateTimeImmutable`, `iso(\DateTimeImmutable): string` (`Y-m-d\TH:i:s\Z`), `parseIso(string): ?\DateTimeImmutable`
  - `Migrator::__construct(Database, string $directory)`, `->migrate(): list<string>`, `->ensureCurrent(): void`
  - `App`:
    - `__construct(Config $config, Clock $clock, array<string, object> $overrides = [])`, `static fromEnvironment(): App`
    - getters `db()`, `migrator()`, `zone()`
    - a private `service(string $name, class-string $type, callable $factory)`. Every later task adds getters with this exact pattern.
  - `DatabaseTestCase` (abstract): protected `FixedClock $clock`, `MemoryMailer $mailer`, `App $app`, and a fresh migrated `tu_booking_test` database per test

- [ ] **Step 1: Write the failing tests**

`booking/tests/Unit/TimeTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Infrastructure\Time;

final class TimeTest extends TestCase
{
    public function testSqlRoundTripIsUtc(): void
    {
        $local = new \DateTimeImmutable('2026-10-05 09:30:00', new \DateTimeZone('Europe/Berlin'));
        self::assertSame('2026-10-05 07:30:00', Time::sql($local));
        self::assertSame('2026-10-05T07:30:00Z', Time::iso(Time::parse('2026-10-05 07:30:00')));
    }

    public function testParseIsoAcceptsZuluAndOffsets(): void
    {
        self::assertSame('2026-10-05T07:30:00Z', Time::iso((Time::parseIso('2026-10-05T07:30:00Z') ?? self::fail())));
        self::assertSame('2026-10-05T07:30:00Z', Time::iso((Time::parseIso('2026-10-05T09:30+02:00') ?? self::fail())));
        self::assertSame('2026-10-05T07:30:00Z', Time::iso((Time::parseIso('2026-10-05T07:30:00.000Z') ?? self::fail())));
    }

    public function testParseIsoRejectsEverythingElse(): void
    {
        foreach (['', '2026-10-05', '2026-10-05 07:30', '2026-10-05T07:30', 'morgen', '2026-10-05T07:30:00Z; DROP'] as $value) {
            self::assertNull(Time::parseIso($value), $value);
        }
    }
}
```

`booking/tests/Integration/MigratorTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Tests\Support\DatabaseTestCase;

final class MigratorTest extends DatabaseTestCase
{
    public function testCreatesTheWholeSchemaOnce(): void
    {
        $tables = array_map(static fn(array $row): mixed => array_values($row)[0], $this->app->db()->all('SHOW TABLES'));
        foreach (['absences', 'admins', 'appointment_types', 'appointments', 'audit_log', 'availability_rules', 'companies', 'customers', 'idempotency_keys', 'login_codes', 'maintenance_runs', 'outbox', 'rate_limits', 'resource_locks', 'schema_migrations', 'sessions', 'settings'] as $table) {
            self::assertContains($table, $tables);
        }
        self::assertSame([], $this->app->migrator()->migrate());
        $this->app->migrator()->ensureCurrent();
        self::assertSame(1, (int) $this->app->db()->scalar('SELECT COUNT(*) FROM schema_migrations'));
    }

    public function testSeedsTheFirstMeetingAndWeeklyHours(): void
    {
        $type = $this->app->db()->one("SELECT * FROM appointment_types WHERE slug = 'erstgespraech'");
        self::assertNotNull($type);
        self::assertSame('Kostenloses Erstgespräch', $type['title']);
        self::assertSame('phone,video', $type['modes']);
        self::assertSame(30, (int) $type['duration_min']);
        self::assertSame(5, (int) $this->app->db()->scalar('SELECT COUNT(*) FROM availability_rules WHERE appointment_type_id IS NULL'));
        self::assertSame('host', $this->app->db()->scalar('SELECT name FROM resource_locks'));
    }

    public function testTransactionsRollBackAndJoinWhenNested(): void
    {
        $db = $this->app->db();
        try {
            $db->transaction(function () use ($db): void {
                $db->insert("INSERT INTO companies (name, created_at) VALUES ('A', UTC_TIMESTAMP())");
                $db->transaction(fn(): int => $db->insert("INSERT INTO companies (name, created_at) VALUES ('B', UTC_TIMESTAMP())"));
                throw new \RuntimeException('boom');
            });
        } catch (\RuntimeException) {
        }
        self::assertSame(0, (int) $db->scalar('SELECT COUNT(*) FROM companies'));
        self::assertSame(7, $db->transaction(fn(): int => 7));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run booking:test -- --filter 'TimeTest|MigratorTest'`
Expected: FAIL with `Class "TuBooking\Infrastructure\Time" not found` and `Class "TuBooking\App" not found`.

- [ ] **Step 3: Write `booking/src/Infrastructure/Time.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

/** Conversions between DateTimeImmutable, SQL DATETIME (UTC) and ISO-8601 for the API. */
final class Time
{
    public static function utc(): \DateTimeZone
    {
        return new \DateTimeZone('UTC');
    }

    public static function sql(\DateTimeImmutable $time): string
    {
        return $time->setTimezone(self::utc())->format('Y-m-d H:i:s');
    }

    public static function parse(string $sql): \DateTimeImmutable
    {
        $time = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $sql, self::utc());
        if ($time === false) {
            throw new \RuntimeException('Invalid database time.');
        }
        return $time;
    }

    public static function iso(\DateTimeImmutable $time): string
    {
        return $time->setTimezone(self::utc())->format('Y-m-d\TH:i:s\Z');
    }

    /** Strict ISO-8601 date and time with Z or an offset; returns UTC or null. */
    public static function parseIso(string $value): ?\DateTimeImmutable
    {
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/', $value) !== 1) {
            return null;
        }
        try {
            return (new \DateTimeImmutable($value))->setTimezone(self::utc());
        } catch (\Exception) {
            return null;
        }
    }
}
```

- [ ] **Step 4: Write `booking/src/Infrastructure/Database.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

use TuBooking\Config;

/** Thin PDO wrapper: prepared statements only, exceptions on errors, UTC session time zone. */
final class Database
{
    public function __construct(private readonly \PDO $pdo)
    {
    }

    public static function connect(Config $config): self
    {
        $pdo = new \PDO($config->string('db.dsn'), $config->string('db.user'), $config->string('db.password'), [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        return new self($pdo);
    }

    /**
     * @param array<int|string, scalar|null> $params
     * @return array<string, mixed>|null
     */
    public function one(string $sql, array $params = []): ?array
    {
        $row = $this->run($sql, $params)->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @param array<int|string, scalar|null> $params
     * @return list<array<string, mixed>>
     */
    public function all(string $sql, array $params = []): array
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = array_values($this->run($sql, $params)->fetchAll());
        return $rows;
    }

    /** @param array<int|string, scalar|null> $params */
    public function execute(string $sql, array $params = []): int
    {
        return $this->run($sql, $params)->rowCount();
    }

    /** @param array<int|string, scalar|null> $params */
    public function insert(string $sql, array $params = []): int
    {
        $this->run($sql, $params);
        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<int|string, scalar|null> $params */
    public function scalar(string $sql, array $params = []): mixed
    {
        $value = $this->run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    /**
     * Runs $work in a transaction. A nested call joins the outer transaction,
     * so an exception anywhere rolls back everything.
     *
     * @template T
     * @param callable(): T $work
     * @return T
     */
    public function transaction(callable $work): mixed
    {
        if ($this->pdo->inTransaction()) {
            return $work();
        }
        $this->pdo->beginTransaction();
        try {
            $result = $work();
            $this->pdo->commit();
            return $result;
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    public function pdo(): \PDO
    {
        return $this->pdo;
    }

    /** @param array<int|string, scalar|null> $params */
    private function run(string $sql, array $params): \PDOStatement
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement;
    }
}
```

- [ ] **Step 5: Write `booking/src/Infrastructure/Migrator.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

/**
 * Applies the numbered SQL files in migrations/ that are not yet recorded.
 * Runs under a MySQL named lock, so two requests arriving right after an
 * upload never migrate at the same time. Each statement in a migration file
 * must end with a semicolon at the end of a line.
 */
final class Migrator
{
    public function __construct(private readonly Database $db, private readonly string $directory)
    {
    }

    /** @return list<string> the versions applied now */
    public function migrate(): array
    {
        if ((int) $this->db->scalar("SELECT GET_LOCK('tu_booking_migrate', 10)") !== 1) {
            throw new \RuntimeException('Migration lock not acquired.');
        }
        try {
            $this->db->execute('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(60) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
            $applied = array_map(static fn(array $row): string => (string) $row['version'], $this->db->all('SELECT version FROM schema_migrations'));
            $done = [];
            foreach ($this->files() as $version => $file) {
                if (in_array($version, $applied, true)) {
                    continue;
                }
                foreach (self::statements((string) file_get_contents($file)) as $statement) {
                    $this->db->pdo()->exec($statement);
                }
                $this->db->execute('INSERT INTO schema_migrations (version, applied_at) VALUES (?, UTC_TIMESTAMP())', [$version]);
                $done[] = $version;
            }
            return $done;
        } finally {
            $this->db->scalar("SELECT RELEASE_LOCK('tu_booking_migrate')");
        }
    }

    /** Cheap check on every request; migrates only when files and records differ. */
    public function ensureCurrent(): void
    {
        try {
            $count = (int) $this->db->scalar('SELECT COUNT(*) FROM schema_migrations');
        } catch (\PDOException) {
            $count = -1;
        }
        if ($count !== count($this->files())) {
            $this->migrate();
        }
    }

    /** @return array<string, string> version => path, in order */
    private function files(): array
    {
        $files = glob($this->directory . '/*.sql') ?: [];
        sort($files);
        $versions = [];
        foreach ($files as $file) {
            $versions[basename($file, '.sql')] = $file;
        }
        return $versions;
    }

    /** @return list<string> */
    private static function statements(string $sql): array
    {
        $withoutComments = (string) preg_replace('/^\s*--.*$/m', '', $sql);
        $statements = [];
        foreach (preg_split('/;\s*$/m', $withoutComments) ?: [] as $part) {
            $part = trim($part);
            if ($part !== '') {
                $statements[] = $part;
            }
        }
        return $statements;
    }
}
```

- [ ] **Step 6: Write `booking/migrations/0001_foundation.sql`**

```sql
-- Phase 1: accounts, 1:1 appointments and operations.
-- Rule for every migration: each statement ends with a semicolon at the end
-- of a line, and no line inside a string literal ends with a semicolon.

CREATE TABLE companies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  email VARCHAR(254) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  last_activity_at DATETIME NOT NULL,
  inactivity_notice_at DATETIME NULL,
  UNIQUE KEY uq_customers_email (email),
  KEY ix_customers_company (company_id),
  KEY ix_customers_activity (last_activity_at),
  CONSTRAINT fk_customers_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  name VARCHAR(100) NOT NULL,
  totp_secret_enc VARCHAR(255) NULL,
  totp_pending_enc VARCHAR(255) NULL,
  totp_last_step BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  purpose VARCHAR(10) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY ix_login_codes_lookup (email, purpose, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  admin_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  second_factor_at DATETIME NULL,
  KEY ix_sessions_customer (customer_id),
  KEY ix_sessions_admin (admin_id),
  KEY ix_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE appointment_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '',
  duration_min SMALLINT UNSIGNED NOT NULL,
  modes VARCHAR(40) NOT NULL,
  buffer_min SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  slot_step_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  lead_time_h SMALLINT UNSIGNED NOT NULL DEFAULT 24,
  horizon_days SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  video_link VARCHAR(300) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_types_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE availability_rules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appointment_type_id INT UNSIGNED NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  KEY ix_rules_type (appointment_type_id),
  CONSTRAINT fk_rules_type FOREIGN KEY (appointment_type_id) REFERENCES appointment_types (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE absences (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  KEY ix_absences_range (starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE appointments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference CHAR(11) NOT NULL,
  customer_id INT UNSIGNED NULL,
  company_id INT UNSIGNED NULL,
  appointment_type_id INT UNSIGNED NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  mode VARCHAR(10) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  address VARCHAR(300) NOT NULL DEFAULT '',
  customer_note VARCHAR(2000) NOT NULL DEFAULT '',
  status VARCHAR(10) NOT NULL,
  hold_email VARCHAR(254) NULL,
  hold_expires_at DATETIME NULL,
  draft TEXT NULL,
  sequence INT UNSIGNED NOT NULL DEFAULT 0,
  reminder_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  confirmed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancelled_by VARCHAR(10) NULL,
  cancel_reason VARCHAR(500) NOT NULL DEFAULT '',
  UNIQUE KEY uq_appointments_reference (reference),
  KEY ix_appointments_time (starts_at, status),
  KEY ix_appointments_customer (customer_id),
  KEY ix_appointments_company (company_id),
  KEY ix_appointments_hold (hold_email),
  CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_appointments_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_appointments_type FOREIGN KEY (appointment_type_id) REFERENCES appointment_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE outbox (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dedupe_key VARCHAR(191) NOT NULL,
  kind VARCHAR(60) NOT NULL,
  recipient VARCHAR(254) NOT NULL,
  message MEDIUMTEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL,
  last_error VARCHAR(300) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  UNIQUE KEY uq_outbox_dedupe (dedupe_key),
  KEY ix_outbox_due (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
  bucket_hash CHAR(64) NOT NULL,
  window_start INT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_hash, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE idempotency_keys (
  key_hash CHAR(64) NOT NULL PRIMARY KEY,
  request_hash CHAR(64) NOT NULL,
  status SMALLINT UNSIGNED NOT NULL,
  response MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_type VARCHAR(10) NOT NULL,
  actor_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  subject_type VARCHAR(40) NOT NULL,
  subject_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  KEY ix_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE resource_locks (
  name VARCHAR(40) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trigger_source VARCHAR(10) NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  stats TEXT NULL,
  KEY ix_maintenance_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  name VARCHAR(60) NOT NULL PRIMARY KEY,
  value VARCHAR(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO resource_locks (name) VALUES ('host');

INSERT INTO appointment_types (slug, title, description, duration_min, modes, buffer_min, slot_step_min, lead_time_h, horizon_days, active, sort)
VALUES ('erstgespraech', 'Kostenloses Erstgespräch', 'Wir lernen Ihr Vorhaben kennen und besprechen die nächsten Schritte. Telefonisch oder per Video.', 30, 'phone,video', 15, 30, 24, 60, 1, 1);

INSERT INTO availability_rules (appointment_type_id, weekday, start_time, end_time)
VALUES (NULL, 1, '09:00', '17:00'), (NULL, 2, '09:00', '17:00'), (NULL, 3, '09:00', '17:00'), (NULL, 4, '09:00', '17:00'), (NULL, 5, '09:00', '17:00');
```

- [ ] **Step 7: Write `booking/src/App.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking;

use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Migrator;
use TuBooking\Support\Clock;
use TuBooking\Support\SystemClock;

/**
 * Composition root: every service is created once, on first use. Tests pass
 * replacements keyed by getter name (for example 'mailer') as overrides.
 */
final class App
{
    /** @var array<string, object> */
    private array $services = [];

    /** @param array<string, object> $overrides */
    public function __construct(public readonly Config $config, public readonly Clock $clock, private readonly array $overrides = [])
    {
    }

    public static function fromEnvironment(): self
    {
        return new self(Config::load(), new SystemClock());
    }

    public function db(): Database
    {
        return $this->service('db', Database::class, fn(): Database => Database::connect($this->config));
    }

    public function migrator(): Migrator
    {
        return $this->service('migrator', Migrator::class, fn(): Migrator => new Migrator($this->db(), dirname(__DIR__) . '/migrations'));
    }

    public function zone(): \DateTimeZone
    {
        return $this->service('zone', \DateTimeZone::class, fn(): \DateTimeZone => new \DateTimeZone($this->config->string('site.timezone')));
    }

    /**
     * @template T of object
     * @param class-string<T> $type
     * @param callable(): T $factory
     * @return T
     */
    private function service(string $name, string $type, callable $factory): object
    {
        if (!isset($this->services[$name])) {
            $this->services[$name] = $this->overrides[$name] ?? $factory();
        }
        $service = $this->services[$name];
        if (!$service instanceof $type) {
            throw new \LogicException("Service $name has the wrong type.");
        }
        return $service;
    }
}
```

- [ ] **Step 8: Write `booking/tests/Support/DatabaseTestCase.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Support;

use PHPUnit\Framework\TestCase;
use TuBooking\App;

/** Every test gets a freshly created and migrated database and an in-memory mailer. */
abstract class DatabaseTestCase extends TestCase
{
    protected FixedClock $clock;
    protected MemoryMailer $mailer;
    protected App $app;

    protected function setUp(): void
    {
        $pdo = new \PDO(
            getenv('TU_BOOKING_TEST_DSN') ?: 'mysql:host=db;charset=utf8mb4',
            getenv('TU_BOOKING_TEST_USER') ?: 'root',
            getenv('TU_BOOKING_TEST_PASSWORD') ?: 'root-dev',
            [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION],
        );
        $pdo->exec('DROP DATABASE IF EXISTS tu_booking_test');
        $pdo->exec('CREATE DATABASE tu_booking_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $this->clock = new FixedClock();
        $this->mailer = new MemoryMailer();
        $this->app = new App(TestConfig::create(), $this->clock, ['mailer' => $this->mailer]);
        $this->app->migrator()->migrate();
    }
}
```

- [ ] **Step 9: Run the tests**

Run: `npm run booking:test -- --filter 'TimeTest|MigratorTest'`
Expected: `OK (6 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 10: Commit**

```bash
git add booking/src/App.php booking/src/Infrastructure/Database.php booking/src/Infrastructure/Time.php booking/src/Infrastructure/Migrator.php booking/migrations booking/tests/Support/DatabaseTestCase.php booking/tests/Unit/TimeTest.php booking/tests/Integration/MigratorTest.php
git commit -m "feat(booking): database access, migrations and phase-1 schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rate limiter, outbox, audit log and error log

**Files:**
- Create: `booking/src/Infrastructure/RateLimiter.php`, `Outbox.php`, `AuditLog.php`, `Logger.php`
- Modify: `booking/src/App.php` (add getters)
- Test: `booking/tests/Integration/OperationsTest.php`, `booking/tests/Unit/LoggerTest.php`

**Interfaces:**
- Consumes: `Database`, `Time` (Task 6); `Crypto` (Task 5); `Mailer`, `Message`, `MimeBuilder`, `MailFunctionMailer` (Task 4); `DomainError` (Task 2)
- Produces:
  - `RateLimiter::__construct(Database, Clock, Crypto)`, `->hit(string $bucket, int $limit, int $windowSeconds, string $message): void`, which throws `DomainError` 429 with `retryAfter`; `->purge(): int`
  - `Outbox::__construct(Database, Mailer, Clock)`:
    - `->enqueue(string $dedupeKey, string $kind, Message $message): void`, which silently ignores a repeated key
    - `->dispatch(int $limit = 20): array{sent: int, failed: int}`
    - `->failed(): list<array{id: int, kind: string, recipient: string, attempts: int, lastError: string, createdAt: string}>`
    - `->countFailed(): int`, `->retry(int $id): bool`, `->purge(): int`
  - `AuditLog::__construct(Database, Clock)`:
    - `->record(string $actorType, ?int $actorId, string $action, string $subjectType, ?int $subjectId): void`
    - `->latest(int $limit = 200): list<array{actorType: string, actorId: ?int, action: string, subjectType: string, subjectId: ?int, createdAt: string}>`
    - `->purge(): int`
  - `Logger::__construct(string $directory, Clock)`, `->error(string $reference, string $route, \Throwable $error): void`, `->purge(int $days = 30): int`
  - `App` getters: `crypto()`, `rateLimiter()`, `mailer()`, `outbox()`, `audit()`, `logger()`, `varDirectory(): string`

- [ ] **Step 1: Write the failing tests**

`booking/tests/Integration/OperationsTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Domain\DomainError;
use TuBooking\Infrastructure\Mail\Message;
use TuBooking\Tests\Support\DatabaseTestCase;

final class OperationsTest extends DatabaseTestCase
{
    public function testRateLimiterCountsPerWindow(): void
    {
        $limiter = $this->app->rateLimiter();
        for ($i = 0; $i < 3; $i++) {
            $limiter->hit('code:email:max@example.com', 3, 3600, 'Zu viele Codes.');
        }
        try {
            $limiter->hit('code:email:max@example.com', 3, 3600, 'Zu viele Codes.');
            self::fail('Fourth hit was accepted.');
        } catch (DomainError $error) {
            self::assertSame(429, $error->status);
            self::assertSame('Zu viele Codes.', $error->getMessage());
            self::assertGreaterThan(0, $error->retryAfter);
        }
        $limiter->hit('code:email:other@example.com', 3, 3600, 'Zu viele Codes.');
        $this->clock->advance('PT1H');
        $limiter->hit('code:email:max@example.com', 3, 3600, 'Zu viele Codes.');
        self::assertStringNotContainsString('max@example.com', (string) json_encode($this->app->db()->all('SELECT * FROM rate_limits')));
        $this->clock->advance('P2D');
        self::assertGreaterThan(0, $this->app->rateLimiter()->purge());
    }

    public function testOutboxSendsEachKeyOnce(): void
    {
        $message = new Message('kunde@example.com', 'Kunde', 'Betreff', '<p>x</p>', 'x');
        $this->app->outbox()->enqueue('appt:1:confirmed', 'appointment-confirmed', $message);
        $this->app->outbox()->enqueue('appt:1:confirmed', 'appointment-confirmed', $message);
        self::assertSame(['sent' => 1, 'failed' => 0], $this->app->outbox()->dispatch());
        self::assertSame(['sent' => 0, 'failed' => 0], $this->app->outbox()->dispatch());
        self::assertCount(1, $this->mailer->to('kunde@example.com'));
    }

    public function testOutboxBacksOffAndGivesUpAfterFiveAttempts(): void
    {
        $this->mailer->fail = true;
        $this->app->outbox()->enqueue('code:1', 'code', new Message('kunde@example.com', '', 'Code', '', ''));
        foreach (['PT10M', 'PT1H', 'PT4H', 'PT16H'] as $wait) {
            self::assertSame(['sent' => 0, 'failed' => 1], $this->app->outbox()->dispatch());
            self::assertSame(['sent' => 0, 'failed' => 0], $this->app->outbox()->dispatch(), 'retried too early');
            $this->clock->advance($wait);
        }
        self::assertSame(['sent' => 0, 'failed' => 1], $this->app->outbox()->dispatch());
        self::assertSame(1, $this->app->outbox()->countFailed());
        $failed = $this->app->outbox()->failed();
        self::assertSame([5, 'Mail transport down', 'kunde@example.com'], [$failed[0]['attempts'], $failed[0]['lastError'], $failed[0]['recipient']]);
        $this->mailer->fail = false;
        self::assertTrue($this->app->outbox()->retry($failed[0]['id']));
        self::assertSame(['sent' => 1, 'failed' => 0], $this->app->outbox()->dispatch());
        self::assertSame(0, $this->app->outbox()->countFailed());
        $this->clock->advance('P8D');
        self::assertSame(1, $this->app->outbox()->purge());
    }

    public function testAuditLogKeepsNoContent(): void
    {
        $this->app->audit()->record('customer', 7, 'appointment.cancel', 'appointment', 12);
        $entry = $this->app->audit()->latest()[0];
        self::assertSame(['customer', 7, 'appointment.cancel', 'appointment', 12], [$entry['actorType'], $entry['actorId'], $entry['action'], $entry['subjectType'], $entry['subjectId']]);
        $this->clock->advance('P25M');
        self::assertSame(1, $this->app->audit()->purge());
    }
}
```

`booking/tests/Unit/LoggerTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Infrastructure\Logger;
use TuBooking\Tests\Support\FixedClock;

final class LoggerTest extends TestCase
{
    public function testWritesStructuredLinesWithoutMessagesAndPurgesOldFiles(): void
    {
        $directory = sys_get_temp_dir() . '/tu-booking-log-' . bin2hex(random_bytes(4));
        $clock = new FixedClock('2026-10-01T08:00:00Z');
        $logger = new Logger($directory, $clock);
        $logger->error('E-1234ABCD', 'POST appointments', new \RuntimeException('max@example.com could not be saved'));
        $content = (string) file_get_contents($directory . '/booking-2026-10-01.log');
        $line = json_decode(trim($content), true);
        self::assertIsArray($line);
        self::assertSame(['E-1234ABCD', 'POST appointments', 'RuntimeException'], [$line['reference'], $line['route'], $line['type']]);
        self::assertStringNotContainsString('max@example.com', $content);
        $clock->set('2026-11-05T08:00:00Z');
        self::assertSame(1, $logger->purge());
        self::assertFileDoesNotExist($directory . '/booking-2026-10-01.log');
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run booking:test -- --filter 'OperationsTest|LoggerTest'`
Expected: FAIL. Errors: `Call to undefined method TuBooking\App::rateLimiter()` and `Class "TuBooking\Infrastructure\Logger" not found`.

- [ ] **Step 3: Write `booking/src/Infrastructure/RateLimiter.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

use TuBooking\Domain\DomainError;
use TuBooking\Support\Clock;

/** Fixed-window counters. Bucket names (which contain emails or IPs) are stored only as keyed hashes. */
final class RateLimiter
{
    public function __construct(private readonly Database $db, private readonly Clock $clock, private readonly Crypto $crypto)
    {
    }

    public function hit(string $bucket, int $limit, int $windowSeconds, string $message): void
    {
        $now = $this->clock->now()->getTimestamp();
        $window = intdiv($now, $windowSeconds) * $windowSeconds;
        $key = $this->crypto->hmac('rate|' . $bucket);
        $this->db->execute('INSERT INTO rate_limits (bucket_hash, window_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1', [$key, $window]);
        $hits = (int) $this->db->scalar('SELECT hits FROM rate_limits WHERE bucket_hash = ? AND window_start = ?', [$key, $window]);
        if ($hits > $limit) {
            throw DomainError::tooMany($message, $window + $windowSeconds - $now);
        }
    }

    public function purge(): int
    {
        return $this->db->execute('DELETE FROM rate_limits WHERE window_start < ?', [$this->clock->now()->getTimestamp() - 86400]);
    }
}
```

- [ ] **Step 4: Write `booking/src/Infrastructure/Outbox.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

use TuBooking\Infrastructure\Mail\Mailer;
use TuBooking\Infrastructure\Mail\Message;
use TuBooking\Support\Clock;

/**
 * Transactional outbox. Operations enqueue rendered messages inside their
 * database transaction; dispatch() sends them afterwards and retries failures
 * with backoff: 5 attempts over about 21 hours, then the row is "failed" and
 * shows up in the admin area. A dedupe key makes every email idempotent.
 */
final class Outbox
{
    private const BACKOFF = [600, 3600, 14400, 57600];

    public function __construct(private readonly Database $db, private readonly Mailer $mailer, private readonly Clock $clock)
    {
    }

    public function enqueue(string $dedupeKey, string $kind, Message $message): void
    {
        $now = Time::sql($this->clock->now());
        $this->db->execute(
            "INSERT IGNORE INTO outbox (dedupe_key, kind, recipient, message, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)",
            [hash('sha256', $dedupeKey), $kind, $message->toEmail, json_encode($message->toArray(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $now, $now],
        );
    }

    /** @return array{sent: int, failed: int} */
    public function dispatch(int $limit = 20): array
    {
        $now = $this->clock->now();
        $rows = $this->db->all(
            "SELECT id, attempts, message FROM outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id LIMIT " . max(1, min(100, $limit)),
            [Time::sql($now)],
        );
        $result = ['sent' => 0, 'failed' => 0];
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            // Claim the row so that a parallel dispatcher skips it.
            $claimed = $this->db->execute(
                "UPDATE outbox SET next_attempt_at = ? WHERE id = ? AND status = 'pending' AND next_attempt_at <= ?",
                [Time::sql($now->add(new \DateInterval('PT5M'))), $id, Time::sql($now)],
            );
            if ($claimed !== 1) {
                continue;
            }
            $attempts = (int) $row['attempts'] + 1;
            try {
                $data = json_decode((string) $row['message'], true, 512, JSON_THROW_ON_ERROR);
                if (!is_array($data)) {
                    throw new \RuntimeException('Stored message is not an object.');
                }
                $this->mailer->send(Message::fromArray($data));
                $this->db->execute("UPDATE outbox SET status = 'sent', attempts = ?, sent_at = ?, last_error = '' WHERE id = ?", [$attempts, Time::sql($now), $id]);
                $result['sent']++;
            } catch (\Throwable $error) {
                $final = $attempts > count(self::BACKOFF);
                $next = $final ? $now : $now->add(new \DateInterval('PT' . self::BACKOFF[$attempts - 1] . 'S'));
                $this->db->execute(
                    'UPDATE outbox SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?',
                    [$final ? 'failed' : 'pending', $attempts, Time::sql($next), mb_substr($error->getMessage(), 0, 300), $id],
                );
                $result['failed']++;
            }
        }
        return $result;
    }

    /** @return list<array{id: int, kind: string, recipient: string, attempts: int, lastError: string, createdAt: string}> */
    public function failed(): array
    {
        return array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'kind' => (string) $row['kind'],
            'recipient' => (string) $row['recipient'],
            'attempts' => (int) $row['attempts'],
            'lastError' => (string) $row['last_error'],
            'createdAt' => Time::iso(Time::parse((string) $row['created_at'])),
        ], $this->db->all("SELECT id, kind, recipient, attempts, last_error, created_at FROM outbox WHERE status = 'failed' ORDER BY id DESC LIMIT 100"));
    }

    public function countFailed(): int
    {
        return (int) $this->db->scalar("SELECT COUNT(*) FROM outbox WHERE status = 'failed'");
    }

    public function retry(int $id): bool
    {
        return $this->db->execute(
            "UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = ? WHERE id = ? AND status = 'failed'",
            [Time::sql($this->clock->now()), $id],
        ) === 1;
    }

    public function purge(): int
    {
        $now = $this->clock->now();
        return $this->db->execute(
            "DELETE FROM outbox WHERE (status = 'sent' AND sent_at < ?) OR (status = 'failed' AND created_at < ?)",
            [Time::sql($now->sub(new \DateInterval('P7D'))), Time::sql($now->sub(new \DateInterval('P30D')))],
        );
    }
}
```

- [ ] **Step 5: Write `booking/src/Infrastructure/AuditLog.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

use TuBooking\Support\Clock;

/** Who did what to which record, and when. Never any message content. */
final class AuditLog
{
    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    public function record(string $actorType, ?int $actorId, string $action, string $subjectType, ?int $subjectId): void
    {
        $this->db->execute(
            'INSERT INTO audit_log (actor_type, actor_id, action, subject_type, subject_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$actorType, $actorId, $action, $subjectType, $subjectId, Time::sql($this->clock->now())],
        );
    }

    /** @return list<array{actorType: string, actorId: ?int, action: string, subjectType: string, subjectId: ?int, createdAt: string}> */
    public function latest(int $limit = 200): array
    {
        return array_map(static fn(array $row): array => [
            'actorType' => (string) $row['actor_type'],
            'actorId' => $row['actor_id'] === null ? null : (int) $row['actor_id'],
            'action' => (string) $row['action'],
            'subjectType' => (string) $row['subject_type'],
            'subjectId' => $row['subject_id'] === null ? null : (int) $row['subject_id'],
            'createdAt' => Time::iso(Time::parse((string) $row['created_at'])),
        ], $this->db->all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ' . max(1, min(1000, $limit))));
    }

    public function purge(): int
    {
        return $this->db->execute('DELETE FROM audit_log WHERE created_at < ?', [Time::sql($this->clock->now()->sub(new \DateInterval('P24M')))]);
    }
}
```

- [ ] **Step 6: Write `booking/src/Infrastructure/Logger.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure;

use TuBooking\Support\Clock;

/**
 * One JSON line per unexpected error in var/log/booking-YYYY-MM-DD.log.
 * Only the error reference, route, exception class and location are written;
 * exception messages can contain personal data and are left out.
 */
final class Logger
{
    public function __construct(private readonly string $directory, private readonly Clock $clock)
    {
    }

    public function error(string $reference, string $route, \Throwable $error): void
    {
        try {
            if (!is_dir($this->directory)) {
                mkdir($this->directory, 0700, true);
            }
            $line = json_encode([
                'time' => Time::iso($this->clock->now()),
                'reference' => $reference,
                'route' => $route,
                'type' => $error::class,
                'code' => $error->getCode(),
                'file' => basename($error->getFile()),
                'line' => $error->getLine(),
            ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
            file_put_contents($this->directory . '/booking-' . $this->clock->now()->format('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);
        } catch (\Throwable) {
            // Logging must never turn an error response into a crash.
        }
    }

    public function purge(int $days = 30): int
    {
        $cutoff = $this->clock->now()->sub(new \DateInterval('P' . $days . 'D'))->format('Y-m-d');
        $removed = 0;
        foreach (glob($this->directory . '/booking-*.log') ?: [] as $file) {
            if (preg_match('/booking-(\d{4}-\d{2}-\d{2})\.log$/', $file, $match) === 1 && $match[1] < $cutoff) {
                unlink($file);
                $removed++;
            }
        }
        return $removed;
    }
}
```

- [ ] **Step 7: Add the getters to `booking/src/App.php`**

Add these `use` lines below the existing ones:

```php
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Crypto;
use TuBooking\Infrastructure\Logger;
use TuBooking\Infrastructure\Mail\MailFunctionMailer;
use TuBooking\Infrastructure\Mail\Mailer;
use TuBooking\Infrastructure\Mail\MimeBuilder;
use TuBooking\Infrastructure\Outbox;
use TuBooking\Infrastructure\RateLimiter;
```

Add these methods after `zone()`:

```php
    public function varDirectory(): string
    {
        return dirname(__DIR__) . '/var';
    }

    public function crypto(): Crypto
    {
        return $this->service('crypto', Crypto::class, fn(): Crypto => Crypto::fromConfig($this->config));
    }

    public function rateLimiter(): RateLimiter
    {
        return $this->service('rateLimiter', RateLimiter::class, fn(): RateLimiter => new RateLimiter($this->db(), $this->clock, $this->crypto()));
    }

    public function mailer(): Mailer
    {
        return $this->service('mailer', Mailer::class, fn(): Mailer => new MailFunctionMailer(
            new MimeBuilder($this->config->string('mail.from'), $this->config->string('mail.from_name'), $this->config->string('mail.reply_to')),
            $this->config->string('mail.from'),
        ));
    }

    public function outbox(): Outbox
    {
        return $this->service('outbox', Outbox::class, fn(): Outbox => new Outbox($this->db(), $this->mailer(), $this->clock));
    }

    public function audit(): AuditLog
    {
        return $this->service('audit', AuditLog::class, fn(): AuditLog => new AuditLog($this->db(), $this->clock));
    }

    public function logger(): Logger
    {
        return $this->service('logger', Logger::class, fn(): Logger => new Logger($this->varDirectory() . '/log', $this->clock));
    }
```

- [ ] **Step 8: Run the tests**

Run: `npm run booking:test -- --filter 'OperationsTest|LoggerTest'`
Expected: `OK (5 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 9: Commit**

```bash
git add booking/src/App.php booking/src/Infrastructure/RateLimiter.php booking/src/Infrastructure/Outbox.php booking/src/Infrastructure/AuditLog.php booking/src/Infrastructure/Logger.php booking/tests/Integration/OperationsTest.php booking/tests/Unit/LoggerTest.php
git commit -m "feat(booking): rate limiter, outbox, audit and error log" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Account and authentication repositories

**Files:**
- Create: `booking/src/Domain/Model/Company.php`, `Customer.php`, `Admin.php`, `Session.php`
- Create: `booking/src/Infrastructure/Repository/Companies.php`, `Customers.php`, `LoginCodes.php`, `Sessions.php`, `Admins.php`, `Settings.php`, `IdempotencyKeys.php`
- Modify: `booking/src/App.php` (add getters)
- Test: `booking/tests/Integration/AccountRepositoriesTest.php`

**Interfaces:**
- Consumes: `Database`, `Time` (Task 6); `Clock` (Task 1)
- Produces (all repositories take `(Database $db, Clock $clock)` except `Settings(Database $db)`):
  - Models (readonly properties):
    - `Company(int $id, ?string $name)`
    - `Customer(int $id, int $companyId, string $email, string $name, string $phone)`
    - `Admin(int $id, string $email, string $name, ?string $totpSecretEnc, ?string $totpPendingEnc, ?int $totpLastStep)`, plus `isPaired(): bool`
    - `Session(string $tokenHash, ?int $customerId, ?int $adminId, \DateTimeImmutable $expiresAt, \DateTimeImmutable $lastSeenAt, bool $secondFactor)`
  - `Companies`:
    - `create(?string $name): int`, `find(int): ?Company`, `rename(int, ?string): void`, `delete(int): void`, `memberCount(int): int`
    - `search(string $term): list<array{id: int, name: ?string, members: list<array{id: int, name: string, email: string}>, appointments: int}>`
    - `all(): list<Company>`
  - `Customers`:
    - `findByEmail(string): ?Customer`, `find(int): ?Customer`, `create(int $companyId, string $email, string $name, string $phone): Customer`
    - `update(int $id, string $name, string $phone): void`, `fillMissingPhone(int $id, string $phone): void`
    - `touch(int $id, bool $login): void`, which resets any inactivity notice
    - `members(int $companyId): list<Customer>`, `delete(int): void`, `moveToCompany(int $id, int $companyId): void`
    - `dueForInactivityNotice(\DateTimeImmutable $activityBefore): list<Customer>`, `dueForErasure(\DateTimeImmutable $noticeBefore): list<Customer>`, `markInactivityNotice(int): void`
    - `all(): list<Customer>`
  - `LoginCodes`:
    - `TTL_MINUTES = 10`, `MAX_ATTEMPTS = 5`
    - `create(string $email, string $purpose, string $codeHash): int`, which invalidates older unused codes for that email and purpose
    - `active(string $email, string $purpose): ?array{id: int, codeHash: string, attempts: int}`
    - `failedAttempt(int): void`, `markUsed(int): void`, `purge(): int`
  - `Sessions`:
    - `create(string $tokenHash, ?int $customerId, ?int $adminId, \DateTimeImmutable $expiresAt, bool $secondFactor): void`
    - `find(string $tokenHash): ?Session` (only unexpired)
    - `extend(string, \DateTimeImmutable): void`, `completeSecondFactor(string, \DateTimeImmutable): void`
    - `delete(string): void`, `deleteForCustomer(int): void`, `deleteForAdmin(int): void`, `purge(): int`
  - `Admins`:
    - `count(): int`, `pairedCount(): int`, `findByEmail(string): ?Admin`, `find(int): ?Admin`, `create(string $email, string $name): Admin`
    - `setPendingSecret(int, string): void` (only when none is pending), `activatePendingSecret(int $id, int $step): void`, `recordStep(int $id, int $step): void`
    - `touchLogin(int): void`, `all(): list<Admin>`
  - `Settings`: `get(string $name, string $default): string`, `set(string $name, string $value): void`
  - `IdempotencyKeys`: `find(string $keyHash): ?array{requestHash: string, status: int, response: string}`, `store(string $keyHash, string $requestHash, int $status, string $response): void`, `purge(): int`
  - `App` getters: `companies()`, `customers()`, `loginCodes()`, `sessions()`, `admins()`, `settings()`, `idempotency()`

- [ ] **Step 1: Write the failing test**

`booking/tests/Integration/AccountRepositoriesTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Tests\Support\DatabaseTestCase;

final class AccountRepositoriesTest extends DatabaseTestCase
{
    public function testCompaniesAndCustomers(): void
    {
        $companyId = $this->app->companies()->create('  Muster GmbH  ');
        self::assertSame('Muster GmbH', $this->app->companies()->find($companyId)?->name);
        $max = $this->app->customers()->create($companyId, 'max@muster.de', 'Max Muster', '');
        $eva = $this->app->customers()->create($companyId, 'eva@muster.de', 'Eva Muster', '0231 1');
        self::assertSame($max->id, $this->app->customers()->findByEmail('max@muster.de')?->id);
        self::assertSame(2, $this->app->companies()->memberCount($companyId));
        self::assertSame(['Eva Muster', 'Max Muster'], array_map(static fn($c) => $c->name, $this->app->customers()->members($companyId)));
        $this->app->customers()->fillMissingPhone($max->id, '0172 2');
        $this->app->customers()->fillMissingPhone($eva->id, '0999');
        self::assertSame('0172 2', $this->app->customers()->find($max->id)?->phone);
        self::assertSame('0231 1', $this->app->customers()->find($eva->id)?->phone);
        $this->app->customers()->update($max->id, 'Max M.', '');
        self::assertSame('Max M.', $this->app->customers()->find($max->id)?->name);
        $other = $this->app->companies()->create(null);
        $this->app->customers()->moveToCompany($eva->id, $other);
        self::assertSame(1, $this->app->companies()->memberCount($companyId));
        $found = $this->app->companies()->search('eva@');
        self::assertCount(1, $found);
        self::assertSame($other, $found[0]['id']);
        self::assertSame('eva@muster.de', $found[0]['members'][0]['email']);
        $this->app->companies()->rename($other, '');
        self::assertNull($this->app->companies()->find($other)?->name);
        $this->expectException(\PDOException::class);
        $this->app->customers()->create($companyId, 'max@muster.de', 'Doppelt', '');
    }

    public function testInactivityTracking(): void
    {
        $customer = $this->app->customers()->create($this->app->companies()->create(null), 'alt@example.com', 'Alt', '');
        $this->clock->advance('P700D');
        self::assertCount(1, $this->app->customers()->dueForInactivityNotice($this->clock->now()->sub(new \DateInterval('P690D'))));
        $this->app->customers()->markInactivityNotice($customer->id);
        self::assertCount(0, $this->app->customers()->dueForInactivityNotice($this->clock->now()->sub(new \DateInterval('P690D'))));
        $this->clock->advance('P31D');
        self::assertCount(1, $this->app->customers()->dueForErasure($this->clock->now()->sub(new \DateInterval('P30D'))));
        $this->app->customers()->touch($customer->id, true);
        self::assertCount(0, $this->app->customers()->dueForErasure($this->clock->now()->sub(new \DateInterval('P30D'))));
    }

    public function testLoginCodes(): void
    {
        $codes = $this->app->loginCodes();
        $first = $codes->create('max@muster.de', 'customer', str_repeat('a', 64));
        $second = $codes->create('max@muster.de', 'customer', str_repeat('b', 64));
        self::assertSame($second, $codes->active('max@muster.de', 'customer')['id'] ?? null);
        self::assertNotSame($first, $second);
        self::assertNull($codes->active('max@muster.de', 'admin'));
        for ($i = 0; $i < 5; $i++) {
            $codes->failedAttempt($second);
        }
        self::assertNull($codes->active('max@muster.de', 'customer'));
        $third = $codes->create('max@muster.de', 'customer', str_repeat('c', 64));
        $this->clock->advance('PT11M');
        self::assertNull($codes->active('max@muster.de', 'customer'));
        $codes->markUsed($third);
        $this->clock->advance('P2D');
        self::assertSame(3, $codes->purge());
    }

    public function testSessions(): void
    {
        $customer = $this->app->customers()->create($this->app->companies()->create(null), 'max@muster.de', 'Max', '');
        $sessions = $this->app->sessions();
        $sessions->create('h1', $customer->id, null, $this->clock->now()->add(new \DateInterval('P30D')), true);
        self::assertSame($customer->id, $sessions->find('h1')?->customerId);
        $sessions->extend('h1', $this->clock->now()->add(new \DateInterval('P40D')));
        $this->clock->advance('P35D');
        self::assertNotNull($sessions->find('h1'));
        $admin = $this->app->admins()->create('info@tayyipuenal.de', 'Tayyip Ünal');
        $sessions->create('h2', null, $admin->id, $this->clock->now()->add(new \DateInterval('PT15M')), false);
        self::assertFalse($sessions->find('h2')?->secondFactor);
        $sessions->completeSecondFactor('h2', $this->clock->now()->add(new \DateInterval('PT12H')));
        self::assertTrue($sessions->find('h2')?->secondFactor);
        $this->app->customers()->delete($customer->id);
        self::assertNull($sessions->find('h1'));
        $this->clock->advance('P1D');
        self::assertNull($sessions->find('h2'));
        self::assertSame(1, $sessions->purge());
    }

    public function testAdminsSettingsAndIdempotency(): void
    {
        $admins = $this->app->admins();
        $admin = $admins->create('info@tayyipuenal.de', 'Tayyip Ünal');
        self::assertSame([1, 0], [$admins->count(), $admins->pairedCount()]);
        $admins->setPendingSecret($admin->id, 'enc-pending');
        $admins->activatePendingSecret($admin->id, 59666666);
        $paired = $admins->find($admin->id);
        self::assertTrue($paired?->isPaired());
        self::assertSame(['enc-pending', null, 59666666], [$paired?->totpSecretEnc, $paired?->totpPendingEnc, $paired?->totpLastStep]);
        $admins->recordStep($admin->id, 59666667);
        self::assertSame(59666667, $admins->findByEmail('info@tayyipuenal.de')?->totpLastStep);
        self::assertSame(1, $admins->pairedCount());

        self::assertSame('info@tayyipuenal.de', $this->app->settings()->get('owner_email', 'info@tayyipuenal.de'));
        $this->app->settings()->set('owner_email', 'termine@tayyipuenal.de');
        $this->app->settings()->set('owner_email', 'buero@tayyipuenal.de');
        self::assertSame('buero@tayyipuenal.de', $this->app->settings()->get('owner_email', 'x'));

        $keys = $this->app->idempotency();
        self::assertNull($keys->find('k'));
        $keys->store('k', 'r', 202, '{"ok":true}');
        $keys->store('k', 'other', 500, 'x');
        self::assertSame(['requestHash' => 'r', 'status' => 202, 'response' => '{"ok":true}'], $keys->find('k'));
        $this->clock->advance('P2D');
        self::assertSame(1, $keys->purge());
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter AccountRepositoriesTest`
Expected: FAIL. Error: `Call to undefined method TuBooking\App::companies()`.

- [ ] **Step 3: Write the models**

`booking/src/Domain/Model/Company.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain\Model;

/** A customer company. A private person is a company without a name. */
final class Company
{
    public function __construct(public readonly int $id, public readonly ?string $name)
    {
    }
}
```

`booking/src/Domain/Model/Customer.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain\Model;

/** A person who can log in. Emails are stored trimmed and lower-cased. */
final class Customer
{
    public function __construct(
        public readonly int $id,
        public readonly int $companyId,
        public readonly string $email,
        public readonly string $name,
        public readonly string $phone,
    ) {
    }
}
```

`booking/src/Domain/Model/Admin.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain\Model;

final class Admin
{
    public function __construct(
        public readonly int $id,
        public readonly string $email,
        public readonly string $name,
        public readonly ?string $totpSecretEnc,
        public readonly ?string $totpPendingEnc,
        public readonly ?int $totpLastStep,
    ) {
    }

    public function isPaired(): bool
    {
        return $this->totpSecretEnc !== null;
    }
}
```

`booking/src/Domain/Model/Session.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain\Model;

final class Session
{
    public function __construct(
        public readonly string $tokenHash,
        public readonly ?int $customerId,
        public readonly ?int $adminId,
        public readonly \DateTimeImmutable $expiresAt,
        public readonly \DateTimeImmutable $lastSeenAt,
        public readonly bool $secondFactor,
    ) {
    }
}
```

- [ ] **Step 4: Write the repositories**

`booking/src/Infrastructure/Repository/Companies.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\Model\Company;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

final class Companies
{
    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    public function create(?string $name): int
    {
        return $this->db->insert('INSERT INTO companies (name, created_at) VALUES (?, ?)', [self::clean($name), Time::sql($this->clock->now())]);
    }

    public function find(int $id): ?Company
    {
        $row = $this->db->one('SELECT id, name FROM companies WHERE id = ?', [$id]);
        return $row === null ? null : new Company((int) $row['id'], $row['name'] === null ? null : (string) $row['name']);
    }

    public function rename(int $id, ?string $name): void
    {
        $this->db->execute('UPDATE companies SET name = ? WHERE id = ?', [self::clean($name), $id]);
    }

    public function delete(int $id): void
    {
        $this->db->execute('DELETE FROM companies WHERE id = ?', [$id]);
    }

    public function memberCount(int $id): int
    {
        return (int) $this->db->scalar('SELECT COUNT(*) FROM customers WHERE company_id = ?', [$id]);
    }

    /** @return list<array{id: int, name: ?string, members: list<array{id: int, name: string, email: string}>, appointments: int}> */
    public function search(string $term): array
    {
        $term = trim($term);
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term) . '%';
        $rows = $this->db->all(
            "SELECT DISTINCT c.id, c.name FROM companies c LEFT JOIN customers m ON m.company_id = c.id
             WHERE ? = '' OR c.name LIKE ? OR m.name LIKE ? OR m.email LIKE ? ORDER BY c.id DESC LIMIT 100",
            [$term, $like, $like, $like],
        );
        if ($rows === []) {
            return [];
        }
        $ids = array_map(static fn(array $row): int => (int) $row['id'], $rows);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $members = [];
        foreach ($this->db->all("SELECT id, company_id, name, email FROM customers WHERE company_id IN ($placeholders) ORDER BY name", $ids) as $member) {
            $members[(int) $member['company_id']][] = ['id' => (int) $member['id'], 'name' => (string) $member['name'], 'email' => (string) $member['email']];
        }
        $counts = [];
        foreach ($this->db->all("SELECT company_id, COUNT(*) AS n FROM appointments WHERE company_id IN ($placeholders) GROUP BY company_id", $ids) as $count) {
            $counts[(int) $count['company_id']] = (int) $count['n'];
        }
        return array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'name' => $row['name'] === null ? null : (string) $row['name'],
            'members' => $members[(int) $row['id']] ?? [],
            'appointments' => $counts[(int) $row['id']] ?? 0,
        ], $rows);
    }

    /** @return list<Company> */
    public function all(): array
    {
        return array_map(static fn(array $row): Company => new Company((int) $row['id'], $row['name'] === null ? null : (string) $row['name']), $this->db->all('SELECT id, name FROM companies ORDER BY id'));
    }

    private static function clean(?string $name): ?string
    {
        $name = $name === null ? null : trim($name);
        return $name === '' ? null : $name;
    }
}
```

`booking/src/Infrastructure/Repository/Customers.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\Model\Customer;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

final class Customers
{
    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    public function findByEmail(string $email): ?Customer
    {
        return self::map($this->db->one('SELECT * FROM customers WHERE email = ?', [$email]));
    }

    public function find(int $id): ?Customer
    {
        return self::map($this->db->one('SELECT * FROM customers WHERE id = ?', [$id]));
    }

    public function create(int $companyId, string $email, string $name, string $phone): Customer
    {
        $now = Time::sql($this->clock->now());
        $id = $this->db->insert(
            'INSERT INTO customers (company_id, email, name, phone, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$companyId, $email, $name, $phone, $now, $now],
        );
        return new Customer($id, $companyId, $email, $name, $phone);
    }

    public function update(int $id, string $name, string $phone): void
    {
        $this->db->execute('UPDATE customers SET name = ?, phone = ? WHERE id = ?', [$name, $phone, $id]);
    }

    public function fillMissingPhone(int $id, string $phone): void
    {
        if ($phone !== '') {
            $this->db->execute("UPDATE customers SET phone = ? WHERE id = ? AND phone = ''", [$phone, $id]);
        }
    }

    public function touch(int $id, bool $login): void
    {
        $now = Time::sql($this->clock->now());
        $this->db->execute(
            'UPDATE customers SET last_activity_at = ?, inactivity_notice_at = NULL' . ($login ? ', last_login_at = ?' : '') . ' WHERE id = ?',
            $login ? [$now, $now, $id] : [$now, $id],
        );
    }

    /** @return list<Customer> */
    public function members(int $companyId): array
    {
        return self::mapAll($this->db->all('SELECT * FROM customers WHERE company_id = ? ORDER BY name, id', [$companyId]));
    }

    public function delete(int $id): void
    {
        $this->db->execute('DELETE FROM customers WHERE id = ?', [$id]);
    }

    public function moveToCompany(int $id, int $companyId): void
    {
        $this->db->execute('UPDATE customers SET company_id = ? WHERE id = ?', [$companyId, $id]);
    }

    /** @return list<Customer> */
    public function dueForInactivityNotice(\DateTimeImmutable $activityBefore): array
    {
        return self::mapAll($this->db->all('SELECT * FROM customers WHERE last_activity_at < ? AND inactivity_notice_at IS NULL LIMIT 200', [Time::sql($activityBefore)]));
    }

    /** @return list<Customer> */
    public function dueForErasure(\DateTimeImmutable $noticeBefore): array
    {
        return self::mapAll($this->db->all('SELECT * FROM customers WHERE inactivity_notice_at IS NOT NULL AND inactivity_notice_at < ? LIMIT 200', [Time::sql($noticeBefore)]));
    }

    public function markInactivityNotice(int $id): void
    {
        $this->db->execute('UPDATE customers SET inactivity_notice_at = ? WHERE id = ?', [Time::sql($this->clock->now()), $id]);
    }

    /** @return list<Customer> */
    public function all(): array
    {
        return self::mapAll($this->db->all('SELECT * FROM customers ORDER BY id'));
    }

    /** @param array<string, mixed>|null $row */
    private static function map(?array $row): ?Customer
    {
        return $row === null ? null : new Customer((int) $row['id'], (int) $row['company_id'], (string) $row['email'], (string) $row['name'], (string) $row['phone']);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<Customer>
     */
    private static function mapAll(array $rows): array
    {
        return array_map(static fn(array $row): Customer => new Customer((int) $row['id'], (int) $row['company_id'], (string) $row['email'], (string) $row['name'], (string) $row['phone']), $rows);
    }
}
```

`booking/src/Infrastructure/Repository/LoginCodes.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

/** One-time email codes, stored only as keyed hashes. */
final class LoginCodes
{
    public const TTL_MINUTES = 10;
    public const MAX_ATTEMPTS = 5;

    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    /** Stores a new code; earlier unused codes for the same address and purpose stop working. */
    public function create(string $email, string $purpose, string $codeHash): int
    {
        $now = $this->clock->now();
        $this->db->execute('UPDATE login_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL', [Time::sql($now), $email, $purpose]);
        return $this->db->insert(
            'INSERT INTO login_codes (email, purpose, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)',
            [$email, $purpose, $codeHash, Time::sql($now->add(new \DateInterval('PT' . self::TTL_MINUTES . 'M'))), Time::sql($now)],
        );
    }

    /** @return array{id: int, codeHash: string, attempts: int}|null */
    public function active(string $email, string $purpose): ?array
    {
        $row = $this->db->one(
            'SELECT id, code_hash, attempts FROM login_codes WHERE email = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? AND attempts < ? ORDER BY id DESC LIMIT 1',
            [$email, $purpose, Time::sql($this->clock->now()), self::MAX_ATTEMPTS],
        );
        return $row === null ? null : ['id' => (int) $row['id'], 'codeHash' => (string) $row['code_hash'], 'attempts' => (int) $row['attempts']];
    }

    public function failedAttempt(int $id): void
    {
        $this->db->execute('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', [$id]);
    }

    public function markUsed(int $id): void
    {
        $this->db->execute('UPDATE login_codes SET used_at = ? WHERE id = ?', [Time::sql($this->clock->now()), $id]);
    }

    public function purge(): int
    {
        return $this->db->execute('DELETE FROM login_codes WHERE created_at < ?', [Time::sql($this->clock->now()->sub(new \DateInterval('PT24H')))]);
    }
}
```

`booking/src/Infrastructure/Repository/Sessions.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\Model\Session;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

/** Server-side sessions; the cookie holds a random token, the table only its SHA-256. */
final class Sessions
{
    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    public function create(string $tokenHash, ?int $customerId, ?int $adminId, \DateTimeImmutable $expiresAt, bool $secondFactor): void
    {
        $now = Time::sql($this->clock->now());
        $this->db->execute(
            'INSERT INTO sessions (token_hash, customer_id, admin_id, created_at, last_seen_at, expires_at, second_factor_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$tokenHash, $customerId, $adminId, $now, $now, Time::sql($expiresAt), $secondFactor ? $now : null],
        );
    }

    public function find(string $tokenHash): ?Session
    {
        $row = $this->db->one('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', [$tokenHash, Time::sql($this->clock->now())]);
        if ($row === null) {
            return null;
        }
        return new Session(
            (string) $row['token_hash'],
            $row['customer_id'] === null ? null : (int) $row['customer_id'],
            $row['admin_id'] === null ? null : (int) $row['admin_id'],
            Time::parse((string) $row['expires_at']),
            Time::parse((string) $row['last_seen_at']),
            $row['second_factor_at'] !== null,
        );
    }

    public function extend(string $tokenHash, \DateTimeImmutable $expiresAt): void
    {
        $this->db->execute('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?', [Time::sql($expiresAt), Time::sql($this->clock->now()), $tokenHash]);
    }

    public function completeSecondFactor(string $tokenHash, \DateTimeImmutable $expiresAt): void
    {
        $now = Time::sql($this->clock->now());
        $this->db->execute('UPDATE sessions SET second_factor_at = ?, expires_at = ?, last_seen_at = ? WHERE token_hash = ?', [$now, Time::sql($expiresAt), $now, $tokenHash]);
    }

    public function delete(string $tokenHash): void
    {
        $this->db->execute('DELETE FROM sessions WHERE token_hash = ?', [$tokenHash]);
    }

    public function deleteForCustomer(int $customerId): void
    {
        $this->db->execute('DELETE FROM sessions WHERE customer_id = ?', [$customerId]);
    }

    public function deleteForAdmin(int $adminId): void
    {
        $this->db->execute('DELETE FROM sessions WHERE admin_id = ?', [$adminId]);
    }

    public function purge(): int
    {
        return $this->db->execute('DELETE FROM sessions WHERE expires_at < ?', [Time::sql($this->clock->now())]);
    }
}
```

`booking/src/Infrastructure/Repository/Admins.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\Model\Admin;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

final class Admins
{
    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    public function count(): int
    {
        return (int) $this->db->scalar('SELECT COUNT(*) FROM admins');
    }

    public function pairedCount(): int
    {
        return (int) $this->db->scalar('SELECT COUNT(*) FROM admins WHERE totp_secret_enc IS NOT NULL');
    }

    public function findByEmail(string $email): ?Admin
    {
        return self::map($this->db->one('SELECT * FROM admins WHERE email = ?', [$email]));
    }

    public function find(int $id): ?Admin
    {
        return self::map($this->db->one('SELECT * FROM admins WHERE id = ?', [$id]));
    }

    public function create(string $email, string $name): Admin
    {
        $id = $this->db->insert('INSERT INTO admins (email, name, created_at) VALUES (?, ?, ?)', [$email, $name, Time::sql($this->clock->now())]);
        return new Admin($id, $email, $name, null, null, null);
    }

    /** Stores a pending authenticator secret unless one is already pending (parallel requests then share it). */
    public function setPendingSecret(int $id, string $encrypted): void
    {
        $this->db->execute('UPDATE admins SET totp_pending_enc = ? WHERE id = ? AND totp_pending_enc IS NULL', [$encrypted, $id]);
    }

    public function activatePendingSecret(int $id, int $step): void
    {
        $this->db->execute('UPDATE admins SET totp_secret_enc = totp_pending_enc, totp_pending_enc = NULL, totp_last_step = ? WHERE id = ? AND totp_pending_enc IS NOT NULL', [$step, $id]);
    }

    public function recordStep(int $id, int $step): void
    {
        $this->db->execute('UPDATE admins SET totp_last_step = ? WHERE id = ?', [$step, $id]);
    }

    public function touchLogin(int $id): void
    {
        $this->db->execute('UPDATE admins SET last_login_at = ? WHERE id = ?', [Time::sql($this->clock->now()), $id]);
    }

    /** @return list<Admin> */
    public function all(): array
    {
        $admins = [];
        foreach ($this->db->all('SELECT * FROM admins ORDER BY id') as $row) {
            $admin = self::map($row);
            if ($admin !== null) {
                $admins[] = $admin;
            }
        }
        return $admins;
    }

    /** @param array<string, mixed>|null $row */
    private static function map(?array $row): ?Admin
    {
        if ($row === null) {
            return null;
        }
        return new Admin(
            (int) $row['id'],
            (string) $row['email'],
            (string) $row['name'],
            $row['totp_secret_enc'] === null ? null : (string) $row['totp_secret_enc'],
            $row['totp_pending_enc'] === null ? null : (string) $row['totp_pending_enc'],
            $row['totp_last_step'] === null ? null : (int) $row['totp_last_step'],
        );
    }
}
```

`booking/src/Infrastructure/Repository/Settings.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Infrastructure\Database;

/** Small owner-editable settings (for example the notification address). */
final class Settings
{
    public function __construct(private readonly Database $db)
    {
    }

    public function get(string $name, string $default): string
    {
        $value = $this->db->scalar('SELECT value FROM settings WHERE name = ?', [$name]);
        return is_string($value) ? $value : $default;
    }

    public function set(string $name, string $value): void
    {
        $this->db->execute('INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', [$name, $value, $value]);
    }
}
```

`booking/src/Infrastructure/Repository/IdempotencyKeys.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

/** Stored responses of successful writes, so a retried request gets the same answer. Kept 24 hours. */
final class IdempotencyKeys
{
    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    /** @return array{requestHash: string, status: int, response: string}|null */
    public function find(string $keyHash): ?array
    {
        $row = $this->db->one('SELECT request_hash, status, response FROM idempotency_keys WHERE key_hash = ?', [$keyHash]);
        return $row === null ? null : ['requestHash' => (string) $row['request_hash'], 'status' => (int) $row['status'], 'response' => (string) $row['response']];
    }

    public function store(string $keyHash, string $requestHash, int $status, string $response): void
    {
        $this->db->execute(
            'INSERT IGNORE INTO idempotency_keys (key_hash, request_hash, status, response, created_at) VALUES (?, ?, ?, ?, ?)',
            [$keyHash, $requestHash, $status, $response, Time::sql($this->clock->now())],
        );
    }

    public function purge(): int
    {
        return $this->db->execute('DELETE FROM idempotency_keys WHERE created_at < ?', [Time::sql($this->clock->now()->sub(new \DateInterval('PT24H')))]);
    }
}
```

- [ ] **Step 5: Add the getters to `booking/src/App.php`**

Add `use` lines:

```php
use TuBooking\Infrastructure\Repository\Admins;
use TuBooking\Infrastructure\Repository\Companies;
use TuBooking\Infrastructure\Repository\Customers;
use TuBooking\Infrastructure\Repository\IdempotencyKeys;
use TuBooking\Infrastructure\Repository\LoginCodes;
use TuBooking\Infrastructure\Repository\Sessions;
use TuBooking\Infrastructure\Repository\Settings;
```

Add methods after `logger()`:

```php
    public function companies(): Companies
    {
        return $this->service('companies', Companies::class, fn(): Companies => new Companies($this->db(), $this->clock));
    }

    public function customers(): Customers
    {
        return $this->service('customers', Customers::class, fn(): Customers => new Customers($this->db(), $this->clock));
    }

    public function loginCodes(): LoginCodes
    {
        return $this->service('loginCodes', LoginCodes::class, fn(): LoginCodes => new LoginCodes($this->db(), $this->clock));
    }

    public function sessions(): Sessions
    {
        return $this->service('sessions', Sessions::class, fn(): Sessions => new Sessions($this->db(), $this->clock));
    }

    public function admins(): Admins
    {
        return $this->service('admins', Admins::class, fn(): Admins => new Admins($this->db(), $this->clock));
    }

    public function settings(): Settings
    {
        return $this->service('settings', Settings::class, fn(): Settings => new Settings($this->db()));
    }

    public function idempotency(): IdempotencyKeys
    {
        return $this->service('idempotency', IdempotencyKeys::class, fn(): IdempotencyKeys => new IdempotencyKeys($this->db(), $this->clock));
    }
```

- [ ] **Step 6: Run the tests**

Run: `npm run booking:test -- --filter AccountRepositoriesTest`
Expected: `OK (5 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 7: Commit**

```bash
git add booking/src/App.php booking/src/Domain/Model booking/src/Infrastructure/Repository booking/tests/Integration/AccountRepositoriesTest.php
git commit -m "feat(booking): account, session and admin repositories" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Scheduling repositories

**Files:**
- Create: `booking/src/Domain/Model/AppointmentType.php`, `Appointment.php`, `AppointmentView.php`
- Create: `booking/src/Infrastructure/Repository/AppointmentTypes.php`, `AvailabilityRules.php`, `Absences.php`, `Appointments.php`
- Modify: `booking/src/App.php` (add getters)
- Test: `booking/tests/Integration/SchedulingRepositoriesTest.php`

**Interfaces:**
- Consumes: `Mode`, `AppointmentStatus`, `Interval`, `WeeklyWindow`, `SlotPolicy` (Task 2); `Database`, `Time` (Task 6); `Companies`, `Customers` (Task 8, in tests)
- Produces:
  - `AppointmentType`:
    - readonly `id, slug, title, description, durationMin, modes (list<Mode>), bufferMin, slotStepMin, leadTimeH, horizonDays, videoLink (?string), active (bool), sort`
    - `policy(): SlotPolicy`, `allows(Mode): bool`
  - `Appointment`:
    - readonly `id, reference, customerId (?int), companyId (?int), typeId, start, end, mode (Mode), phone, address, note, status (AppointmentStatus), holdEmail (?string), holdExpiresAt (?\DateTimeImmutable), draft (array{name: string, company: string, phone: string}), sequence`
    - `interval(): Interval`
  - `AppointmentView`:
    - readonly `id, reference, typeId, typeSlug, typeTitle, videoLink, start, end, mode, phone, address, note, status, sequence, customerId, customerName, customerEmail, companyId, companyName, cancelledBy (?string), cancelReason, createdAt, holdEmail`
    - `interval(): Interval`
  - `AppointmentTypes(Database)`:
    - `active(): list<AppointmentType>`, `all()`, `bySlug(string): ?AppointmentType`, `find(int)`
    - `create(TypeFields): int`, `update(int, TypeFields): void`
    - `TypeFields` = `array{slug: string, title: string, description: string, durationMin: int, modes: list<Mode>, bufferMin: int, slotStepMin: int, leadTimeH: int, horizonDays: int, videoLink: ?string, active: bool, sort: int}`, exported as `@phpstan-type TypeFields`
  - `AvailabilityRules(Database)`:
    - `windowsFor(int $typeId): list<WeeklyWindow>` (type-specific rules replace the general ones)
    - `all(): list<array{typeId: ?int, weekday: int, start: string, end: string}>`
    - `replace(?int $typeId, list<WeeklyWindow>): void`
  - `Absences(Database)`:
    - `overlapping(\DateTimeImmutable $from, \DateTimeImmutable $to): list<Interval>`
    - `upcoming(\DateTimeImmutable $now): list<array{id: int, start: \DateTimeImmutable, end: \DateTimeImmutable, note: string}>`
    - `create(\DateTimeImmutable, \DateTimeImmutable, string): int`, `delete(int): bool`
  - `Appointments(Database, Clock)`:
    - `HOLD_GRACE_MINUTES = 30`
    - `busy(\DateTimeImmutable $from, \DateTimeImmutable $to, ?int $excludeId = null): list<Interval>`
    - `createHeld(string $reference, int $typeId, \DateTimeImmutable $start, \DateTimeImmutable $end, Mode $mode, string $phone, string $address, string $note, string $email, array{name: string, company: string, phone: string} $draft, \DateTimeImmutable $holdExpiresAt): int`
    - `createConfirmed(string $reference, int $typeId, int $customerId, int $companyId, \DateTimeImmutable $start, \DateTimeImmutable $end, Mode $mode, string $phone, string $address, string $note): int`
    - `find(int): ?Appointment`, `byReference(string): ?Appointment`, `hasRecentHold(string $email): bool`
    - `confirm(int $id, int $customerId, int $companyId): void`, `cancel(int $id, string $by, string $reason): void`, `reschedule(int $id, \DateTimeImmutable $start, \DateTimeImmutable $end): void`, `delete(int): void`
    - `view(int): AppointmentView`, `viewByReference(string $reference, ?int $companyId): ?AppointmentView`
    - `forCompany(int): list<AppointmentView>`, `between(\DateTimeImmutable, \DateTimeImmutable, ?AppointmentStatus): list<AppointmentView>`, `conflicting(Interval, ?int $excludeId): list<AppointmentView>`
    - `dueReminders(): list<AppointmentView>`, `markReminded(int): void`, `futureConfirmedForCustomer(int): list<AppointmentView>`
    - `deleteForCustomer(int): int`, `deleteForCompany(int): int`, `purgeExpiredHolds(): int`, `purgeEndedBefore(\DateTimeImmutable): int`
    - `allViews(): list<AppointmentView>`
  - `App` getters: `types()`, `rules()`, `absences()`, `appointments()`

- [ ] **Step 1: Write the failing test**

`booking/tests/Integration/SchedulingRepositoriesTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\Interval;
use TuBooking\Domain\Mode;
use TuBooking\Domain\WeeklyWindow;
use TuBooking\Tests\Support\DatabaseTestCase;

final class SchedulingRepositoriesTest extends DatabaseTestCase
{
    private function at(string $iso): \DateTimeImmutable
    {
        return (new \DateTimeImmutable($iso))->setTimezone(new \DateTimeZone('UTC'));
    }

    public function testTypesAndRules(): void
    {
        $first = $this->app->types()->bySlug('erstgespraech');
        self::assertNotNull($first);
        self::assertSame([Mode::Phone, Mode::Video], $first->modes);
        self::assertSame(30, $first->policy()->durationMin);
        self::assertTrue($first->allows(Mode::Video));
        self::assertFalse($first->allows(Mode::Onsite));
        $id = $this->app->types()->create([
            'slug' => 'beratung', 'title' => 'Beratungstermin', 'description' => 'Vor Ort', 'durationMin' => 60,
            'modes' => [Mode::Onsite], 'bufferMin' => 30, 'slotStepMin' => 60, 'leadTimeH' => 48, 'horizonDays' => 90,
            'videoLink' => null, 'active' => false, 'sort' => 2,
        ]);
        self::assertCount(1, $this->app->types()->active());
        self::assertCount(2, $this->app->types()->all());
        self::assertCount(5, $this->app->rules()->windowsFor($id));
        $this->app->rules()->replace($id, [new WeeklyWindow(3, '10:00', '12:00')]);
        $windows = $this->app->rules()->windowsFor($id);
        self::assertCount(1, $windows);
        self::assertSame([3, '10:00', '12:00'], [$windows[0]->weekday, $windows[0]->start, $windows[0]->end]);
        self::assertCount(5, $this->app->rules()->windowsFor($first->id));
        $this->app->rules()->replace(null, [new WeeklyWindow(1, '08:00', '12:00')]);
        self::assertCount(1, $this->app->rules()->windowsFor($first->id));
        self::assertCount(2, $this->app->rules()->all());
        $this->app->types()->update($id, [
            'slug' => 'beratung', 'title' => 'Beratung vor Ort', 'description' => '', 'durationMin' => 90,
            'modes' => [Mode::Onsite, Mode::Video], 'bufferMin' => 30, 'slotStepMin' => 30, 'leadTimeH' => 48, 'horizonDays' => 90,
            'videoLink' => 'https://meet.example/tu', 'active' => true, 'sort' => 2,
        ]);
        $updated = $this->app->types()->find($id);
        self::assertSame(['Beratung vor Ort', 90, 'https://meet.example/tu', true], [$updated?->title, $updated?->durationMin, $updated?->videoLink, $updated?->active]);
    }

    public function testAbsences(): void
    {
        $id = $this->app->absences()->create($this->at('2026-10-05T06:00:00Z'), $this->at('2026-10-06T06:00:00Z'), 'Urlaub');
        self::assertCount(1, $this->app->absences()->overlapping($this->at('2026-10-05T07:00:00Z'), $this->at('2026-10-05T08:00:00Z')));
        self::assertCount(0, $this->app->absences()->overlapping($this->at('2026-10-06T06:00:00Z'), $this->at('2026-10-06T08:00:00Z')));
        self::assertSame('Urlaub', $this->app->absences()->upcoming($this->clock->now())[0]['note']);
        self::assertTrue($this->app->absences()->delete($id));
        self::assertFalse($this->app->absences()->delete($id));
    }

    public function testHeldAppointmentsBlockUntilTheyExpire(): void
    {
        $type = $this->app->types()->bySlug('erstgespraech');
        self::assertNotNull($type);
        $start = $this->at('2026-10-05T07:00:00Z');
        $id = $this->app->appointments()->createHeld('TU-AAAAAAAA', $type->id, $start, $start->add(new \DateInterval('PT30M')), Mode::Video, '', '', 'Hallo', 'max@muster.de', ['name' => 'Max', 'company' => 'Muster GmbH', 'phone' => ''], $this->clock->now()->add(new \DateInterval('PT15M')));
        $held = $this->app->appointments()->find($id);
        self::assertSame([AppointmentStatus::Held, 'max@muster.de', 'Muster GmbH'], [$held?->status, $held?->holdEmail, $held?->draft['company']]);
        self::assertCount(1, $this->app->appointments()->busy($this->at('2026-10-05T00:00:00Z'), $this->at('2026-10-06T00:00:00Z')));
        self::assertCount(0, $this->app->appointments()->busy($this->at('2026-10-05T00:00:00Z'), $this->at('2026-10-06T00:00:00Z'), $id));
        self::assertTrue($this->app->appointments()->hasRecentHold('max@muster.de'));
        $this->clock->advance('PT16M');
        self::assertCount(0, $this->app->appointments()->busy($this->at('2026-10-05T00:00:00Z'), $this->at('2026-10-06T00:00:00Z')));
        self::assertTrue($this->app->appointments()->hasRecentHold('max@muster.de'));
        self::assertSame(0, $this->app->appointments()->purgeExpiredHolds());
        $this->clock->advance('PT30M');
        self::assertFalse($this->app->appointments()->hasRecentHold('max@muster.de'));
        self::assertSame(1, $this->app->appointments()->purgeExpiredHolds());
    }

    public function testConfirmedAppointmentsViewsAndChanges(): void
    {
        $type = $this->app->types()->bySlug('erstgespraech');
        self::assertNotNull($type);
        $companyId = $this->app->companies()->create('Muster GmbH');
        $max = $this->app->customers()->create($companyId, 'max@muster.de', 'Max Muster', '');
        $start = $this->at('2026-10-02T07:00:00Z');
        $id = $this->app->appointments()->createConfirmed('TU-BBBBBBBB', $type->id, $max->id, $companyId, $start, $start->add(new \DateInterval('PT30M')), Mode::Phone, '0231 1', '', 'Bitte anrufen');
        $view = $this->app->appointments()->view($id);
        self::assertSame(['Kostenloses Erstgespräch', 'Max Muster', 'max@muster.de', 'Muster GmbH', 0], [$view->typeTitle, $view->customerName, $view->customerEmail, $view->companyName, $view->sequence]);
        self::assertNotNull($this->app->appointments()->viewByReference('TU-BBBBBBBB', $companyId));
        self::assertNull($this->app->appointments()->viewByReference('TU-BBBBBBBB', $companyId + 1));
        self::assertCount(1, $this->app->appointments()->forCompany($companyId));
        self::assertCount(1, $this->app->appointments()->between($this->at('2026-10-02T00:00:00Z'), $this->at('2026-10-03T00:00:00Z'), AppointmentStatus::Confirmed));
        self::assertCount(1, $this->app->appointments()->conflicting(new Interval($this->at('2026-10-02T07:15:00Z'), $this->at('2026-10-02T07:45:00Z')), null));
        self::assertCount(0, $this->app->appointments()->conflicting(new Interval($this->at('2026-10-02T07:15:00Z'), $this->at('2026-10-02T07:45:00Z')), $id));

        self::assertCount(1, $this->app->appointments()->dueReminders());
        $this->app->appointments()->markReminded($id);
        self::assertCount(0, $this->app->appointments()->dueReminders());

        $later = $this->at('2026-10-09T07:00:00Z');
        $this->app->appointments()->reschedule($id, $later, $later->add(new \DateInterval('PT30M')));
        $moved = $this->app->appointments()->view($id);
        self::assertSame(['2026-10-09 07:00', 1], [$moved->start->format('Y-m-d H:i'), $moved->sequence]);
        self::assertCount(1, $this->app->appointments()->futureConfirmedForCustomer($max->id));

        $this->app->appointments()->cancel($id, 'customer', 'Terminkonflikt');
        $cancelled = $this->app->appointments()->view($id);
        self::assertSame([AppointmentStatus::Cancelled, 'customer', 'Terminkonflikt', 2], [$cancelled->status, $cancelled->cancelledBy, $cancelled->cancelReason, $cancelled->sequence]);
        self::assertCount(0, $this->app->appointments()->futureConfirmedForCustomer($max->id));

        $this->app->customers()->delete($max->id);
        $orphan = $this->app->appointments()->view($id);
        self::assertSame([null, null, $companyId], [$orphan->customerId, $orphan->customerName, $orphan->companyId]);

        $this->clock->advance('P400D');
        self::assertSame(1, $this->app->appointments()->purgeEndedBefore($this->clock->now()->sub(new \DateInterval('P12M'))));
    }

    public function testDeleteHelpers(): void
    {
        $type = $this->app->types()->bySlug('erstgespraech');
        self::assertNotNull($type);
        $companyId = $this->app->companies()->create(null);
        $eva = $this->app->customers()->create($companyId, 'eva@example.com', 'Eva', '');
        $start = $this->at('2026-10-02T07:00:00Z');
        $this->app->appointments()->createConfirmed('TU-CCCCCCCC', $type->id, $eva->id, $companyId, $start, $start->add(new \DateInterval('PT30M')), Mode::Video, '', '', '');
        $this->app->appointments()->createConfirmed('TU-DDDDDDDD', $type->id, $eva->id, $companyId, $start->add(new \DateInterval('P1D')), $start->add(new \DateInterval('P1DT30M')), Mode::Video, '', '', '');
        self::assertCount(2, $this->app->appointments()->allViews());
        self::assertSame(2, $this->app->appointments()->deleteForCustomer($eva->id));
        self::assertSame(0, $this->app->appointments()->deleteForCompany($companyId));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter SchedulingRepositoriesTest`
Expected: FAIL. Error: `Call to undefined method TuBooking\App::types()`.

- [ ] **Step 3: Write the models**

`booking/src/Domain/Model/AppointmentType.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain\Model;

use TuBooking\Domain\Mode;
use TuBooking\Domain\SlotPolicy;

final class AppointmentType
{
    /** @param list<Mode> $modes */
    public function __construct(
        public readonly int $id,
        public readonly string $slug,
        public readonly string $title,
        public readonly string $description,
        public readonly int $durationMin,
        public readonly array $modes,
        public readonly int $bufferMin,
        public readonly int $slotStepMin,
        public readonly int $leadTimeH,
        public readonly int $horizonDays,
        public readonly ?string $videoLink,
        public readonly bool $active,
        public readonly int $sort,
    ) {
    }

    public function policy(): SlotPolicy
    {
        return new SlotPolicy($this->durationMin, $this->bufferMin, $this->slotStepMin, $this->leadTimeH, $this->horizonDays);
    }

    public function allows(Mode $mode): bool
    {
        return in_array($mode, $this->modes, true);
    }
}
```

`booking/src/Domain/Model/Appointment.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain\Model;

use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\Interval;
use TuBooking\Domain\Mode;

/** A row of the appointments table. While held it has no customer yet, only the typed details in $draft. */
final class Appointment
{
    /** @param array{name: string, company: string, phone: string} $draft */
    public function __construct(
        public readonly int $id,
        public readonly string $reference,
        public readonly ?int $customerId,
        public readonly ?int $companyId,
        public readonly int $typeId,
        public readonly \DateTimeImmutable $start,
        public readonly \DateTimeImmutable $end,
        public readonly Mode $mode,
        public readonly string $phone,
        public readonly string $address,
        public readonly string $note,
        public readonly AppointmentStatus $status,
        public readonly ?string $holdEmail,
        public readonly ?\DateTimeImmutable $holdExpiresAt,
        public readonly array $draft,
        public readonly int $sequence,
    ) {
    }

    public function interval(): Interval
    {
        return new Interval($this->start, $this->end);
    }
}
```

`booking/src/Domain/Model/AppointmentView.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain\Model;

use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\Interval;
use TuBooking\Domain\Mode;

/** An appointment joined with its type, booker and company: what emails and screens show. */
final class AppointmentView
{
    public function __construct(
        public readonly int $id,
        public readonly string $reference,
        public readonly int $typeId,
        public readonly string $typeSlug,
        public readonly string $typeTitle,
        public readonly ?string $videoLink,
        public readonly \DateTimeImmutable $start,
        public readonly \DateTimeImmutable $end,
        public readonly Mode $mode,
        public readonly string $phone,
        public readonly string $address,
        public readonly string $note,
        public readonly AppointmentStatus $status,
        public readonly int $sequence,
        public readonly ?int $customerId,
        public readonly ?string $customerName,
        public readonly ?string $customerEmail,
        public readonly ?int $companyId,
        public readonly ?string $companyName,
        public readonly ?string $cancelledBy,
        public readonly string $cancelReason,
        public readonly \DateTimeImmutable $createdAt,
        public readonly ?string $holdEmail,
    ) {
    }

    public function interval(): Interval
    {
        return new Interval($this->start, $this->end);
    }
}
```

- [ ] **Step 4: Write the repositories**

`booking/src/Infrastructure/Repository/AppointmentTypes.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\AppointmentType;
use TuBooking\Infrastructure\Database;

/**
 * @phpstan-type TypeFields array{slug: string, title: string, description: string, durationMin: int, modes: list<Mode>, bufferMin: int, slotStepMin: int, leadTimeH: int, horizonDays: int, videoLink: ?string, active: bool, sort: int}
 */
final class AppointmentTypes
{
    public function __construct(private readonly Database $db)
    {
    }

    /** @return list<AppointmentType> */
    public function active(): array
    {
        return array_map(self::map(...), $this->db->all('SELECT * FROM appointment_types WHERE active = 1 ORDER BY sort, id'));
    }

    /** @return list<AppointmentType> */
    public function all(): array
    {
        return array_map(self::map(...), $this->db->all('SELECT * FROM appointment_types ORDER BY sort, id'));
    }

    public function bySlug(string $slug): ?AppointmentType
    {
        $row = $this->db->one('SELECT * FROM appointment_types WHERE slug = ?', [$slug]);
        return $row === null ? null : self::map($row);
    }

    public function find(int $id): ?AppointmentType
    {
        $row = $this->db->one('SELECT * FROM appointment_types WHERE id = ?', [$id]);
        return $row === null ? null : self::map($row);
    }

    /** @param TypeFields $fields */
    public function create(array $fields): int
    {
        return $this->db->insert(
            'INSERT INTO appointment_types (slug, title, description, duration_min, modes, buffer_min, slot_step_min, lead_time_h, horizon_days, video_link, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            self::values($fields),
        );
    }

    /** @param TypeFields $fields */
    public function update(int $id, array $fields): void
    {
        $this->db->execute(
            'UPDATE appointment_types SET slug = ?, title = ?, description = ?, duration_min = ?, modes = ?, buffer_min = ?, slot_step_min = ?, lead_time_h = ?, horizon_days = ?, video_link = ?, active = ?, sort = ? WHERE id = ?',
            [...self::values($fields), $id],
        );
    }

    /**
     * @param TypeFields $fields
     * @return list<scalar|null>
     */
    private static function values(array $fields): array
    {
        return [
            $fields['slug'], $fields['title'], $fields['description'], $fields['durationMin'], Mode::toCsv($fields['modes']),
            $fields['bufferMin'], $fields['slotStepMin'], $fields['leadTimeH'], $fields['horizonDays'], $fields['videoLink'],
            $fields['active'] ? 1 : 0, $fields['sort'],
        ];
    }

    /** @param array<string, mixed> $row */
    private static function map(array $row): AppointmentType
    {
        return new AppointmentType(
            (int) $row['id'],
            (string) $row['slug'],
            (string) $row['title'],
            (string) $row['description'],
            (int) $row['duration_min'],
            Mode::fromCsv((string) $row['modes']),
            (int) $row['buffer_min'],
            (int) $row['slot_step_min'],
            (int) $row['lead_time_h'],
            (int) $row['horizon_days'],
            $row['video_link'] === null ? null : (string) $row['video_link'],
            (int) $row['active'] === 1,
            (int) $row['sort'],
        );
    }
}
```

`booking/src/Infrastructure/Repository/AvailabilityRules.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\WeeklyWindow;
use TuBooking\Infrastructure\Database;

final class AvailabilityRules
{
    public function __construct(private readonly Database $db)
    {
    }

    /**
     * Weekly windows of a type. As soon as one rule exists for the type, its
     * rules replace the general ones (appointment_type_id IS NULL).
     *
     * @return list<WeeklyWindow>
     */
    public function windowsFor(int $typeId): array
    {
        $rows = $this->db->all('SELECT weekday, start_time, end_time FROM availability_rules WHERE appointment_type_id = ? ORDER BY weekday, start_time', [$typeId]);
        if ($rows === []) {
            $rows = $this->db->all('SELECT weekday, start_time, end_time FROM availability_rules WHERE appointment_type_id IS NULL ORDER BY weekday, start_time');
        }
        return array_map(static fn(array $row): WeeklyWindow => new WeeklyWindow((int) $row['weekday'], (string) $row['start_time'], (string) $row['end_time']), $rows);
    }

    /** @return list<array{typeId: ?int, weekday: int, start: string, end: string}> */
    public function all(): array
    {
        return array_map(static fn(array $row): array => [
            'typeId' => $row['appointment_type_id'] === null ? null : (int) $row['appointment_type_id'],
            'weekday' => (int) $row['weekday'],
            'start' => (string) $row['start_time'],
            'end' => (string) $row['end_time'],
        ], $this->db->all('SELECT * FROM availability_rules ORDER BY appointment_type_id, weekday, start_time'));
    }

    /** @param list<WeeklyWindow> $windows */
    public function replace(?int $typeId, array $windows): void
    {
        $this->db->transaction(function () use ($typeId, $windows): void {
            if ($typeId === null) {
                $this->db->execute('DELETE FROM availability_rules WHERE appointment_type_id IS NULL');
            } else {
                $this->db->execute('DELETE FROM availability_rules WHERE appointment_type_id = ?', [$typeId]);
            }
            foreach ($windows as $window) {
                $this->db->execute(
                    'INSERT INTO availability_rules (appointment_type_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)',
                    [$typeId, $window->weekday, $window->start, $window->end],
                );
            }
        });
    }
}
```

`booking/src/Infrastructure/Repository/Absences.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\Interval;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;

final class Absences
{
    public function __construct(private readonly Database $db)
    {
    }

    /** @return list<Interval> */
    public function overlapping(\DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        return array_map(
            static fn(array $row): Interval => new Interval(Time::parse((string) $row['starts_at']), Time::parse((string) $row['ends_at'])),
            $this->db->all('SELECT starts_at, ends_at FROM absences WHERE starts_at < ? AND ends_at > ?', [Time::sql($to), Time::sql($from)]),
        );
    }

    /** @return list<array{id: int, start: \DateTimeImmutable, end: \DateTimeImmutable, note: string}> */
    public function upcoming(\DateTimeImmutable $now): array
    {
        return array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'start' => Time::parse((string) $row['starts_at']),
            'end' => Time::parse((string) $row['ends_at']),
            'note' => (string) $row['note'],
        ], $this->db->all('SELECT * FROM absences WHERE ends_at > ? ORDER BY starts_at LIMIT 200', [Time::sql($now)]));
    }

    public function create(\DateTimeImmutable $start, \DateTimeImmutable $end, string $note): int
    {
        return $this->db->insert('INSERT INTO absences (starts_at, ends_at, note) VALUES (?, ?, ?)', [Time::sql($start), Time::sql($end), $note]);
    }

    public function delete(int $id): bool
    {
        return $this->db->execute('DELETE FROM absences WHERE id = ?', [$id]) === 1;
    }
}
```

`booking/src/Infrastructure/Repository/Appointments.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Infrastructure\Repository;

use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\Interval;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Appointment;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

final class Appointments
{
    /** Expired holds stay this long, so that a code re-sent near the end of a hold can still confirm it. */
    public const HOLD_GRACE_MINUTES = 30;

    private const VIEW = 'SELECT a.*, t.slug AS type_slug, t.title AS type_title, t.video_link, c.name AS customer_name, c.email AS customer_email, co.name AS company_name
        FROM appointments a
        JOIN appointment_types t ON t.id = a.appointment_type_id
        LEFT JOIN customers c ON c.id = a.customer_id
        LEFT JOIN companies co ON co.id = a.company_id';

    public function __construct(private readonly Database $db, private readonly Clock $clock)
    {
    }

    /**
     * Confirmed appointments and holds that have not expired, overlapping [from, to).
     *
     * @return list<Interval>
     */
    public function busy(\DateTimeImmutable $from, \DateTimeImmutable $to, ?int $excludeId = null): array
    {
        $rows = $this->db->all(
            "SELECT starts_at, ends_at FROM appointments WHERE starts_at < ? AND ends_at > ? AND id <> ?
             AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > ?))",
            [Time::sql($to), Time::sql($from), $excludeId ?? 0, Time::sql($this->clock->now())],
        );
        return array_map(static fn(array $row): Interval => new Interval(Time::parse((string) $row['starts_at']), Time::parse((string) $row['ends_at'])), $rows);
    }

    /** @param array{name: string, company: string, phone: string} $draft */
    public function createHeld(string $reference, int $typeId, \DateTimeImmutable $start, \DateTimeImmutable $end, Mode $mode, string $phone, string $address, string $note, string $email, array $draft, \DateTimeImmutable $holdExpiresAt): int
    {
        return $this->db->insert(
            "INSERT INTO appointments (reference, appointment_type_id, starts_at, ends_at, mode, phone, address, customer_note, status, hold_email, hold_expires_at, draft, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'held', ?, ?, ?, ?)",
            [$reference, $typeId, Time::sql($start), Time::sql($end), $mode->value, $phone, $address, $note, $email, Time::sql($holdExpiresAt), json_encode($draft, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), Time::sql($this->clock->now())],
        );
    }

    public function createConfirmed(string $reference, int $typeId, int $customerId, int $companyId, \DateTimeImmutable $start, \DateTimeImmutable $end, Mode $mode, string $phone, string $address, string $note): int
    {
        $now = Time::sql($this->clock->now());
        return $this->db->insert(
            "INSERT INTO appointments (reference, customer_id, company_id, appointment_type_id, starts_at, ends_at, mode, phone, address, customer_note, status, created_at, confirmed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)",
            [$reference, $customerId, $companyId, $typeId, Time::sql($start), Time::sql($end), $mode->value, $phone, $address, $note, $now, $now],
        );
    }

    public function find(int $id): ?Appointment
    {
        $row = $this->db->one('SELECT * FROM appointments WHERE id = ?', [$id]);
        return $row === null ? null : self::map($row);
    }

    public function byReference(string $reference): ?Appointment
    {
        $row = $this->db->one('SELECT * FROM appointments WHERE reference = ?', [$reference]);
        return $row === null ? null : self::map($row);
    }

    public function hasRecentHold(string $email): bool
    {
        return (int) $this->db->scalar(
            "SELECT COUNT(*) FROM appointments WHERE status = 'held' AND hold_email = ? AND hold_expires_at > ?",
            [$email, Time::sql($this->graceCutoff())],
        ) > 0;
    }

    public function confirm(int $id, int $customerId, int $companyId): void
    {
        $this->db->execute(
            "UPDATE appointments SET status = 'confirmed', customer_id = ?, company_id = ?, confirmed_at = ?, hold_email = NULL, hold_expires_at = NULL, draft = NULL WHERE id = ? AND status = 'held'",
            [$customerId, $companyId, Time::sql($this->clock->now()), $id],
        );
    }

    public function cancel(int $id, string $by, string $reason): void
    {
        $this->db->execute(
            "UPDATE appointments SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancel_reason = ?, sequence = sequence + 1 WHERE id = ? AND status = 'confirmed'",
            [Time::sql($this->clock->now()), $by, $reason, $id],
        );
    }

    public function reschedule(int $id, \DateTimeImmutable $start, \DateTimeImmutable $end): void
    {
        $this->db->execute(
            "UPDATE appointments SET starts_at = ?, ends_at = ?, sequence = sequence + 1, reminder_sent_at = NULL WHERE id = ? AND status = 'confirmed'",
            [Time::sql($start), Time::sql($end), $id],
        );
    }

    public function delete(int $id): void
    {
        $this->db->execute('DELETE FROM appointments WHERE id = ?', [$id]);
    }

    public function view(int $id): AppointmentView
    {
        $row = $this->db->one(self::VIEW . ' WHERE a.id = ?', [$id]);
        if ($row === null) {
            throw new \RuntimeException('Appointment disappeared.');
        }
        return self::mapView($row);
    }

    public function viewByReference(string $reference, ?int $companyId): ?AppointmentView
    {
        $row = $companyId === null
            ? $this->db->one(self::VIEW . ' WHERE a.reference = ?', [$reference])
            : $this->db->one(self::VIEW . ' WHERE a.reference = ? AND a.company_id = ?', [$reference, $companyId]);
        return $row === null ? null : self::mapView($row);
    }

    /** @return list<AppointmentView> */
    public function forCompany(int $companyId): array
    {
        return self::mapViews($this->db->all(self::VIEW . " WHERE a.company_id = ? AND a.status <> 'held' ORDER BY a.starts_at DESC LIMIT 200", [$companyId]));
    }

    /** @return list<AppointmentView> */
    public function between(\DateTimeImmutable $from, \DateTimeImmutable $to, ?AppointmentStatus $status): array
    {
        $sql = self::VIEW . " WHERE a.starts_at >= ? AND a.starts_at < ? AND a.status <> 'held'";
        $params = [Time::sql($from), Time::sql($to)];
        if ($status !== null) {
            $sql .= ' AND a.status = ?';
            $params[] = $status->value;
        }
        return self::mapViews($this->db->all($sql . ' ORDER BY a.starts_at LIMIT 500', $params));
    }

    /** @return list<AppointmentView> */
    public function conflicting(Interval $interval, ?int $excludeId): array
    {
        return self::mapViews($this->db->all(
            self::VIEW . " WHERE a.starts_at < ? AND a.ends_at > ? AND a.id <> ? AND (a.status = 'confirmed' OR (a.status = 'held' AND a.hold_expires_at > ?)) ORDER BY a.starts_at",
            [Time::sql($interval->end), Time::sql($interval->start), $excludeId ?? 0, Time::sql($this->clock->now())],
        ));
    }

    /** @return list<AppointmentView> */
    public function dueReminders(): array
    {
        $now = $this->clock->now();
        return self::mapViews($this->db->all(
            self::VIEW . " WHERE a.status = 'confirmed' AND a.reminder_sent_at IS NULL AND a.starts_at > ? AND a.starts_at <= ? ORDER BY a.starts_at LIMIT 100",
            [Time::sql($now), Time::sql($now->add(new \DateInterval('PT24H')))],
        ));
    }

    public function markReminded(int $id): void
    {
        $this->db->execute('UPDATE appointments SET reminder_sent_at = ? WHERE id = ?', [Time::sql($this->clock->now()), $id]);
    }

    /** @return list<AppointmentView> */
    public function futureConfirmedForCustomer(int $customerId): array
    {
        return self::mapViews($this->db->all(
            self::VIEW . " WHERE a.customer_id = ? AND a.status = 'confirmed' AND a.starts_at > ? ORDER BY a.starts_at",
            [$customerId, Time::sql($this->clock->now())],
        ));
    }

    public function deleteForCustomer(int $customerId): int
    {
        return $this->db->execute('DELETE FROM appointments WHERE customer_id = ?', [$customerId]);
    }

    public function deleteForCompany(int $companyId): int
    {
        return $this->db->execute('DELETE FROM appointments WHERE company_id = ?', [$companyId]);
    }

    public function purgeExpiredHolds(): int
    {
        return $this->db->execute("DELETE FROM appointments WHERE status = 'held' AND hold_expires_at < ?", [Time::sql($this->graceCutoff())]);
    }

    public function purgeEndedBefore(\DateTimeImmutable $cutoff): int
    {
        return $this->db->execute("DELETE FROM appointments WHERE status <> 'held' AND ends_at < ?", [Time::sql($cutoff)]);
    }

    /** @return list<AppointmentView> */
    public function allViews(): array
    {
        return self::mapViews($this->db->all(self::VIEW . " WHERE a.status <> 'held' ORDER BY a.starts_at"));
    }

    private function graceCutoff(): \DateTimeImmutable
    {
        return $this->clock->now()->sub(new \DateInterval('PT' . self::HOLD_GRACE_MINUTES . 'M'));
    }

    /** @param array<string, mixed> $row */
    private static function map(array $row): Appointment
    {
        $draft = ['name' => '', 'company' => '', 'phone' => ''];
        if (is_string($row['draft']) && $row['draft'] !== '') {
            $decoded = json_decode($row['draft'], true);
            if (is_array($decoded)) {
                foreach (array_keys($draft) as $key) {
                    $draft[$key] = is_string($decoded[$key] ?? null) ? $decoded[$key] : '';
                }
            }
        }
        return new Appointment(
            (int) $row['id'],
            (string) $row['reference'],
            $row['customer_id'] === null ? null : (int) $row['customer_id'],
            $row['company_id'] === null ? null : (int) $row['company_id'],
            (int) $row['appointment_type_id'],
            Time::parse((string) $row['starts_at']),
            Time::parse((string) $row['ends_at']),
            Mode::from((string) $row['mode']),
            (string) $row['phone'],
            (string) $row['address'],
            (string) $row['customer_note'],
            AppointmentStatus::from((string) $row['status']),
            $row['hold_email'] === null ? null : (string) $row['hold_email'],
            $row['hold_expires_at'] === null ? null : Time::parse((string) $row['hold_expires_at']),
            $draft,
            (int) $row['sequence'],
        );
    }

    /** @param array<string, mixed> $row */
    private static function mapView(array $row): AppointmentView
    {
        return new AppointmentView(
            (int) $row['id'],
            (string) $row['reference'],
            (int) $row['appointment_type_id'],
            (string) $row['type_slug'],
            (string) $row['type_title'],
            $row['video_link'] === null ? null : (string) $row['video_link'],
            Time::parse((string) $row['starts_at']),
            Time::parse((string) $row['ends_at']),
            Mode::from((string) $row['mode']),
            (string) $row['phone'],
            (string) $row['address'],
            (string) $row['customer_note'],
            AppointmentStatus::from((string) $row['status']),
            (int) $row['sequence'],
            $row['customer_id'] === null ? null : (int) $row['customer_id'],
            $row['customer_name'] === null ? null : (string) $row['customer_name'],
            $row['customer_email'] === null ? null : (string) $row['customer_email'],
            $row['company_id'] === null ? null : (int) $row['company_id'],
            $row['company_name'] === null ? null : (string) $row['company_name'],
            $row['cancelled_by'] === null ? null : (string) $row['cancelled_by'],
            (string) $row['cancel_reason'],
            Time::parse((string) $row['created_at']),
            $row['hold_email'] === null ? null : (string) $row['hold_email'],
        );
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<AppointmentView>
     */
    private static function mapViews(array $rows): array
    {
        return array_map(self::mapView(...), $rows);
    }
}
```

- [ ] **Step 5: Add the getters to `booking/src/App.php`**

Add `use` lines:

```php
use TuBooking\Infrastructure\Repository\Absences;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\AppointmentTypes;
use TuBooking\Infrastructure\Repository\AvailabilityRules;
```

Add methods after `idempotency()`:

```php
    public function types(): AppointmentTypes
    {
        return $this->service('types', AppointmentTypes::class, fn(): AppointmentTypes => new AppointmentTypes($this->db()));
    }

    public function rules(): AvailabilityRules
    {
        return $this->service('rules', AvailabilityRules::class, fn(): AvailabilityRules => new AvailabilityRules($this->db()));
    }

    public function absences(): Absences
    {
        return $this->service('absences', Absences::class, fn(): Absences => new Absences($this->db()));
    }

    public function appointments(): Appointments
    {
        return $this->service('appointments', Appointments::class, fn(): Appointments => new Appointments($this->db(), $this->clock));
    }
```

- [ ] **Step 6: Run the tests**

Run: `npm run booking:test -- --filter SchedulingRepositoriesTest`
Expected: `OK (5 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 7: Commit**

```bash
git add booking/src/App.php booking/src/Domain/Model booking/src/Infrastructure/Repository booking/tests/Integration/SchedulingRepositoriesTest.php
git commit -m "feat(booking): appointment types, availability, absences and appointments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Notifications (every email and invitation)

**Files:**
- Create: `booking/src/Application/Notifications.php`
- Modify: `booking/src/App.php` (add `layout()`, `ical()`, `notifications()`)
- Test: `booking/tests/Integration/NotificationsTest.php`

**Interfaces:**
- Consumes: `Outbox` (Task 7); `Layout`, `Message` (Task 4); `ICalendar` (Task 4); `Settings` (Task 8); `AppointmentView`, `Customer` (Tasks 8–9); `Mode` (Task 2)
- Produces:
  - `Notifications::__construct(Outbox, Layout, ICalendar, Config, Settings, Clock, \DateTimeZone)`. Recipient shape: `array{email: string, name: string}`.
  - Owner and codes:
    - `owner(): array{email: string, name: string}`: settings `owner_email` or `mail.owner`
    - `code(int $codeId, string $email, string $code, bool $admin): void`
    - `noAccount(string $email): void`
  - Appointment emails:
    - `appointmentConfirmed(AppointmentView $a, list<Recipient> $recipients): void`: customers REQUEST plus owner REQUEST
    - `appointmentRescheduled(AppointmentView $a, \DateTimeImmutable $previousStart, list<Recipient> $recipients): void`: REQUEST with the new sequence
    - `appointmentCancelled(AppointmentView $a, list<Recipient> $recipients, string $reason): void`: CANCEL; the recipient list may be empty, and the owner is always notified
    - `appointmentReminder(AppointmentView $a, list<Recipient> $recipients): void`
  - Account notices:
    - `memberInvited(string $email, string $name, string $companyLabel, string $inviterName): void`
    - `adminInvited(string $email, string $name): void`
    - `accountDeleted(string $customerName, int $cancelled): void`
    - `inactivityNotice(Customer $customer, \DateTimeImmutable $deleteOn): void`
  - Helpers:
    - `download(AppointmentView $a): string`: a PUBLISH `.ics` for the download endpoint
    - `date(\DateTimeImmutable): string` (for example "Freitag, 2. Oktober 2026"), `time(\DateTimeImmutable): string` ("09:00")

- [ ] **Step 1: Write the failing test**

`booking/tests/Integration/NotificationsTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Tests\Support\DatabaseTestCase;

final class NotificationsTest extends DatabaseTestCase
{
    private function appointment(Mode $mode = Mode::Phone, string $note = 'Bitte <b>vormittags</b>'): AppointmentView
    {
        $type = $this->app->types()->bySlug('erstgespraech');
        self::assertNotNull($type);
        $companyId = $this->app->companies()->create('Muster GmbH');
        $customer = $this->app->customers()->create($companyId, 'max@muster.de', 'Max Muster', '0231 1');
        $start = new \DateTimeImmutable('2026-10-02 07:00', new \DateTimeZone('UTC'));
        $id = $this->app->appointments()->createConfirmed('TU-7K3M9Q2A', $type->id, $customer->id, $companyId, $start, $start->add(new \DateInterval('PT30M')), $mode, '0231 1', '', $note);
        return $this->app->appointments()->view($id);
    }

    private function unfold(string $ics): string
    {
        return str_replace("\r\n ", '', $ics);
    }

    public function testConfirmationGoesToCustomerAndOwnerWithInvitations(): void
    {
        $appointment = $this->appointment();
        $this->app->notifications()->appointmentConfirmed($appointment, [['email' => 'max@muster.de', 'name' => 'Max Muster']]);
        $this->app->notifications()->appointmentConfirmed($appointment, [['email' => 'max@muster.de', 'name' => 'Max Muster']]);
        $this->app->outbox()->dispatch();
        self::assertCount(2, $this->mailer->sent);

        $customer = $this->mailer->to('max@muster.de')[0];
        self::assertSame('Termin bestätigt: Kostenloses Erstgespräch am Freitag, 2. Oktober 2026', $customer->subject);
        self::assertStringContainsString('09:00–09:30 Uhr', $customer->text);
        self::assertStringContainsString('Bitte &lt;b&gt;vormittags&lt;/b&gt;', $customer->html);
        self::assertNotNull($customer->calendar);
        self::assertSame('REQUEST', $customer->calendar['method']);
        $ics = $this->unfold($customer->calendar['content']);
        self::assertStringContainsString('UID:TU-7K3M9Q2A@tayyipuenal.de', $ics);
        self::assertStringContainsString('ORGANIZER;CN="Tayyip Ünal":mailto:info@tayyipuenal.de', $ics);
        self::assertStringContainsString('RSVP=FALSE:mailto:max@muster.de', $ics);

        $owner = $this->mailer->to('info@tayyipuenal.de')[0];
        self::assertStringStartsWith('Neuer Termin: Kostenloses Erstgespräch · Max Muster · Muster GmbH', $owner->subject);
        $ownerIcs = $this->unfold((string) ($owner->calendar['content'] ?? ''));
        self::assertStringContainsString('ORGANIZER;CN="Terminbuchung tayyipuenal.de":mailto:buchung@tayyipuenal.de', $ownerIcs);
        self::assertStringContainsString('RSVP=FALSE:mailto:info@tayyipuenal.de', $ownerIcs);
        self::assertStringContainsString('LOCATION:Telefon: 0231 1', $ownerIcs);
    }

    public function testRescheduleAndCancelUpdateTheSameEvent(): void
    {
        $appointment = $this->appointment(Mode::Video, '');
        $later = new \DateTimeImmutable('2026-10-09 07:00', new \DateTimeZone('UTC'));
        $this->app->appointments()->reschedule($appointment->id, $later, $later->add(new \DateInterval('PT30M')));
        $moved = $this->app->appointments()->view($appointment->id);
        $this->app->notifications()->appointmentRescheduled($moved, $appointment->start, [['email' => 'max@muster.de', 'name' => 'Max Muster']]);
        $this->app->appointments()->cancel($appointment->id, 'owner', 'Krankheit');
        $cancelled = $this->app->appointments()->view($appointment->id);
        $this->app->notifications()->appointmentCancelled($cancelled, [['email' => 'max@muster.de', 'name' => 'Max Muster']], 'Krankheit');
        $this->app->outbox()->dispatch();

        [$rescheduled, $cancel] = $this->mailer->to('max@muster.de');
        self::assertStringContainsString('Freitag, 2. Oktober 2026, 09:00 Uhr', $rescheduled->text);
        self::assertStringContainsString("SEQUENCE:1\r\n", (string) ($rescheduled->calendar['content'] ?? ''));
        self::assertStringContainsString('Den Link zum Videotermin erhalten Sie', $rescheduled->text);
        self::assertSame('CANCEL', $cancel->calendar['method'] ?? null);
        self::assertStringContainsString("SEQUENCE:2\r\n", (string) ($cancel->calendar['content'] ?? ''));
        self::assertStringContainsString("STATUS:CANCELLED\r\n", (string) ($cancel->calendar['content'] ?? ''));
        self::assertStringContainsString('Nachricht von Tayyip Ünal: Krankheit', $cancel->text);
        $ownerCancel = $this->mailer->to('info@tayyipuenal.de')[1];
        self::assertSame('CANCEL', $ownerCancel->calendar['method'] ?? null);
        self::assertStringContainsString('Grund: Krankheit', $ownerCancel->text);
    }

    public function testCodesNoticesAndOwnerOverride(): void
    {
        $this->app->settings()->set('owner_email', 'termine@tayyipuenal.de');
        $this->app->notifications()->code(1, 'max@muster.de', '123456', false);
        $this->app->notifications()->code(2, 'info@tayyipuenal.de', '654321', true);
        $this->app->notifications()->noAccount('neu@example.com');
        $this->app->notifications()->accountDeleted('Max Muster', 2);
        $this->app->outbox()->dispatch();
        self::assertSame('123456 ist Ihr Bestätigungscode', $this->mailer->to('max@muster.de')[0]->subject);
        self::assertStringContainsString('123456', $this->mailer->to('max@muster.de')[0]->text);
        self::assertSame('654321 – Anmeldung Verwaltung', $this->mailer->to('info@tayyipuenal.de')[0]->subject);
        self::assertStringContainsString('noch kein Kundenkonto', $this->mailer->to('neu@example.com')[0]->text);
        self::assertSame('Kundenkonto gelöscht: 2 Termin(e) storniert', $this->mailer->to('termine@tayyipuenal.de')[0]->subject);
    }

    public function testDownloadIsPublish(): void
    {
        $ics = $this->app->notifications()->download($this->appointment());
        self::assertStringContainsString("METHOD:PUBLISH\r\n", $ics);
        self::assertStringNotContainsString('ATTENDEE', $ics);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter NotificationsTest`
Expected: FAIL. Error: `Call to undefined method TuBooking\App::notifications()`.

- [ ] **Step 3: Write `booking/src/Application/Notifications.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Config;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Customer;
use TuBooking\Infrastructure\Calendar\ICalendar;
use TuBooking\Infrastructure\Mail\Layout;
use TuBooking\Infrastructure\Mail\Message;
use TuBooking\Infrastructure\Outbox;
use TuBooking\Infrastructure\Repository\Settings;
use TuBooking\Support\Clock;

/**
 * Every email of the booking module, composed here and queued in the outbox.
 *
 * Calendar invitations share one UID per appointment (<reference>@tayyipuenal.de)
 * and carry its sequence number, so later updates and cancellations change the
 * existing calendar entry. Customers receive the invitation with the owner as
 * organiser. The owner's copy comes from buchung@…, so that "Annehmen" in his
 * Outlook stores it like any invitation from someone else.
 *
 * @phpstan-type Recipient array{email: string, name: string}
 * @phpstan-type Parts array{preheader: string, kicker: string, title: string, intro: string, rows?: array<string, string>, paragraphs?: list<string>, code?: string, button?: array{label: string, url: string}}
 */
final class Notifications
{
    private const WEEKDAYS = [1 => 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    private const MONTHS = [1 => 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    public function __construct(
        private readonly Outbox $outbox,
        private readonly Layout $layout,
        private readonly ICalendar $ical,
        private readonly Config $config,
        private readonly Settings $settings,
        private readonly Clock $clock,
        private readonly \DateTimeZone $zone,
    ) {
    }

    /** @return Recipient */
    public function owner(): array
    {
        return [
            'email' => $this->settings->get('owner_email', $this->config->string('mail.owner')),
            'name' => $this->config->string('mail.owner_name'),
        ];
    }

    public function code(int $codeId, string $email, string $code, bool $admin): void
    {
        $this->queue("code:$codeId", $admin ? 'admin-code' : 'code', ['email' => $email, 'name' => ''], $admin ? "$code – Anmeldung Verwaltung" : "$code ist Ihr Bestätigungscode", [
            'preheader' => "Ihr Code: $code",
            'kicker' => $admin ? 'Verwaltung' : 'Terminbuchung',
            'title' => $admin ? 'Ihr Anmeldecode für die Verwaltung' : 'Ihr Bestätigungscode',
            'intro' => $admin
                ? 'Geben Sie diesen Code in der Verwaltung ein. Anschließend fragen wir den Code aus Ihrer Authenticator-App ab.'
                : 'Geben Sie diesen Code auf unserer Website ein, um Ihre Buchung zu bestätigen oder sich im Kundenkonto anzumelden.',
            'code' => $code,
            'paragraphs' => ['Der Code ist 10 Minuten gültig. Wenn Sie ihn nicht angefordert haben, können Sie diese E-Mail ignorieren.'],
        ]);
    }

    public function noAccount(string $email): void
    {
        $this->queue('no-account:' . $email . ':' . $this->clock->now()->format('YmdH'), 'no-account', ['email' => $email, 'name' => ''], 'Anmeldung bei tayyipuenal.de', [
            'preheader' => 'Zu dieser Adresse gibt es noch kein Kundenkonto.',
            'kicker' => 'Kundenkonto',
            'title' => 'Noch kein Kundenkonto',
            'intro' => 'Sie haben eine Anmeldung angefordert. Zu dieser E-Mail-Adresse gibt es bei uns noch kein Kundenkonto.',
            'paragraphs' => ['Ihr Konto entsteht automatisch mit Ihrer ersten Terminbuchung. Wenn Sie die Anmeldung nicht angefordert haben, können Sie diese E-Mail ignorieren.'],
            'button' => ['label' => 'Termin vereinbaren', 'url' => $this->origin() . '/'],
        ]);
    }

    /** @param list<Recipient> $recipients */
    public function appointmentConfirmed(AppointmentView $a, array $recipients): void
    {
        foreach ($recipients as $to) {
            $this->queue("appt:{$a->id}:confirmed:{$a->sequence}:{$to['email']}", 'appointment-confirmed', $to, "Termin bestätigt: {$a->typeTitle} am {$this->date($a->start)}", [
                'preheader' => "Ihr Termin am {$this->date($a->start)} um {$this->time($a->start)} Uhr ist bestätigt.",
                'kicker' => $a->typeTitle,
                'title' => 'Ihr Termin ist bestätigt.',
                'intro' => $this->greeting($to) . 'vielen Dank für Ihre Buchung. Die Einladung für Ihren Kalender finden Sie im Anhang.',
                'rows' => $this->customerRows($a),
                'paragraphs' => [$this->modeHint($a), $this->changeHint()],
                'button' => ['label' => 'Termin im Kundenkonto ansehen', 'url' => $this->origin() . '/konto/'],
            ], $this->customerInvite($a, 'REQUEST', $to));
        }
        $this->ownerInvite($a, 'REQUEST', 'Neuer Termin');
    }

    /** @param list<Recipient> $recipients */
    public function appointmentRescheduled(AppointmentView $a, \DateTimeImmutable $previousStart, array $recipients): void
    {
        $previous = $this->date($previousStart) . ', ' . $this->time($previousStart) . ' Uhr';
        foreach ($recipients as $to) {
            $this->queue("appt:{$a->id}:rescheduled:{$a->sequence}:{$to['email']}", 'appointment-rescheduled', $to, "Termin verschoben: {$a->typeTitle} am {$this->date($a->start)}", [
                'preheader' => "Neuer Termin: {$this->date($a->start)} um {$this->time($a->start)} Uhr.",
                'kicker' => $a->typeTitle,
                'title' => 'Ihr Termin wurde verschoben.',
                'intro' => $this->greeting($to) . "Ihr Termin findet nicht mehr am $previous statt, sondern zum unten genannten Zeitpunkt. Die aktualisierte Einladung finden Sie im Anhang.",
                'rows' => $this->customerRows($a),
                'paragraphs' => [$this->modeHint($a), $this->changeHint()],
                'button' => ['label' => 'Termin im Kundenkonto ansehen', 'url' => $this->origin() . '/konto/'],
            ], $this->customerInvite($a, 'REQUEST', $to));
        }
        $this->ownerInvite($a, 'REQUEST', 'Termin verschoben');
    }

    /** @param list<Recipient> $recipients */
    public function appointmentCancelled(AppointmentView $a, array $recipients, string $reason): void
    {
        $byOwner = $a->cancelledBy === 'owner';
        foreach ($recipients as $to) {
            $paragraphs = [];
            if ($reason !== '') {
                $paragraphs[] = ($byOwner ? 'Nachricht von Tayyip Ünal: ' : 'Grund: ') . $reason;
            }
            $paragraphs[] = 'Einen neuen Termin können Sie jederzeit auf unserer Website vereinbaren.';
            $this->queue("appt:{$a->id}:cancelled:{$a->sequence}:{$to['email']}", 'appointment-cancelled', $to, "Termin storniert: {$a->typeTitle} am {$this->date($a->start)}", [
                'preheader' => "Der Termin am {$this->date($a->start)} um {$this->time($a->start)} Uhr wurde storniert.",
                'kicker' => $a->typeTitle,
                'title' => 'Ihr Termin wurde storniert.',
                'intro' => $this->greeting($to) . ($byOwner ? 'leider müssen wir den folgenden Termin absagen.' : 'der folgende Termin wurde storniert.') . ' Der Eintrag in Ihrem Kalender wird damit entfernt.',
                'rows' => $this->customerRows($a),
                'paragraphs' => $paragraphs,
                'button' => ['label' => 'Neuen Termin vereinbaren', 'url' => $this->origin() . '/'],
            ], $this->customerInvite($a, 'CANCEL', $to));
        }
        $this->ownerInvite($a, 'CANCEL', 'Termin storniert', $reason);
    }

    /** @param list<Recipient> $recipients */
    public function appointmentReminder(AppointmentView $a, array $recipients): void
    {
        foreach ($recipients as $to) {
            $this->queue("appt:{$a->id}:reminder:{$a->sequence}:{$to['email']}", 'appointment-reminder', $to, "Erinnerung: {$a->typeTitle} am {$this->date($a->start)} um {$this->time($a->start)} Uhr", [
                'preheader' => "Ihr Termin beginnt am {$this->date($a->start)} um {$this->time($a->start)} Uhr.",
                'kicker' => $a->typeTitle,
                'title' => 'Bis bald!',
                'intro' => $this->greeting($to) . 'wir erinnern Sie an Ihren Termin.',
                'rows' => $this->customerRows($a),
                'paragraphs' => [$this->modeHint($a), 'Sie können nicht teilnehmen? Bitte rufen Sie uns an: ' . $this->config->string('site.phone_label') . '.'],
            ]);
        }
    }

    public function memberInvited(string $email, string $name, string $companyLabel, string $inviterName): void
    {
        $this->queue('member-invite:' . $email . ':' . $this->clock->now()->format('YmdHi'), 'member-invite', ['email' => $email, 'name' => $name], "Einladung zum Kundenkonto von $companyLabel", [
            'preheader' => "$inviterName hat Sie zum Kundenkonto eingeladen.",
            'kicker' => 'Kundenkonto',
            'title' => 'Sie wurden eingeladen.',
            'intro' => "Guten Tag $name, $inviterName hat Sie zum Kundenkonto von $companyLabel bei Tayyip Ünal eingeladen. Dort sehen Sie gemeinsam alle Termine und können neue buchen.",
            'paragraphs' => ['Zum Anmelden geben Sie Ihre E-Mail-Adresse ein; wir senden Ihnen dann einen Code. Ein Passwort brauchen Sie nicht.'],
            'button' => ['label' => 'Zum Kundenkonto', 'url' => $this->origin() . '/konto/'],
        ]);
    }

    public function adminInvited(string $email, string $name): void
    {
        $this->queue('admin-invite:' . $email . ':' . $this->clock->now()->format('YmdHi'), 'admin-invite', ['email' => $email, 'name' => $name], 'Einladung zur Verwaltung der Terminbuchung', [
            'preheader' => 'Sie wurden zur Verwaltung eingeladen.',
            'kicker' => 'Verwaltung',
            'title' => 'Willkommen in der Verwaltung.',
            'intro' => "Guten Tag $name, Sie wurden zur Verwaltung der Terminbuchung von tayyipuenal.de eingeladen.",
            'paragraphs' => ['Öffnen Sie die Verwaltung, melden Sie sich mit dieser E-Mail-Adresse an und richten Sie anschließend eine Authenticator-App ein (zum Beispiel Microsoft Authenticator oder Google Authenticator).'],
            'button' => ['label' => 'Zur Verwaltung', 'url' => $this->origin() . '/verwaltung/'],
        ]);
    }

    public function accountDeleted(string $customerName, int $cancelled): void
    {
        $this->queue('account-deleted:' . $customerName . ':' . $this->clock->now()->format('YmdHis'), 'account-deleted', $this->owner(), "Kundenkonto gelöscht: $cancelled Termin(e) storniert", [
            'preheader' => "$customerName hat das Kundenkonto gelöscht.",
            'kicker' => 'Kundenkonto',
            'title' => 'Ein Kundenkonto wurde gelöscht.',
            'intro' => "$customerName hat das Kundenkonto gelöscht. Dabei wurden $cancelled zukünftige Termine storniert; die zugehörigen Kalendereinträge entfernen die separaten Absagen.",
        ]);
    }

    public function inactivityNotice(Customer $customer, \DateTimeImmutable $deleteOn): void
    {
        $this->queue('inactivity:' . $customer->id . ':' . $deleteOn->format('Ymd'), 'inactivity-notice', ['email' => $customer->email, 'name' => $customer->name], 'Ihr Kundenkonto wird am ' . $this->date($deleteOn) . ' gelöscht', [
            'preheader' => 'Melden Sie sich einmal an, wenn Sie Ihr Konto behalten möchten.',
            'kicker' => 'Kundenkonto',
            'title' => 'Ihr Kundenkonto wird bald gelöscht.',
            'intro' => "Guten Tag {$customer->name}, Ihr Kundenkonto wurde fast zwei Jahre nicht genutzt. Nach unseren Datenschutzregeln löschen wir es am {$this->date($deleteOn)}.",
            'paragraphs' => ['Wenn Sie Ihr Konto behalten möchten, melden Sie sich bis dahin einmal an. Sonst müssen Sie nichts tun.'],
            'button' => ['label' => 'Zum Kundenkonto', 'url' => $this->origin() . '/konto/'],
        ]);
    }

    public function download(AppointmentView $a): string
    {
        return $this->ical->event('PUBLISH', $this->uid($a), $a->sequence, $a->start, $a->end, $a->typeTitle . ' mit Tayyip Ünal', "Referenz: {$a->reference}\n" . $this->modeHint($a), $this->customerLocation($a), $this->owner(), null, $this->clock->now());
    }

    public function date(\DateTimeImmutable $time): string
    {
        $local = $time->setTimezone($this->zone);
        return self::WEEKDAYS[(int) $local->format('N')] . ', ' . $local->format('j') . '. ' . self::MONTHS[(int) $local->format('n')] . ' ' . $local->format('Y');
    }

    public function time(\DateTimeImmutable $time): string
    {
        return $time->setTimezone($this->zone)->format('H:i');
    }

    private function ownerInvite(AppointmentView $a, string $method, string $headline, string $reason = ''): void
    {
        $owner = $this->owner();
        $who = ($a->customerName ?? 'Ehemaliges Mitglied') . ($a->companyName !== null ? ' · ' . $a->companyName : '');
        $rows = [
            'Termin' => $a->typeTitle,
            'Datum' => $this->date($a->start) . ', ' . $this->time($a->start) . '–' . $this->time($a->end) . ' Uhr',
            'Form' => $a->mode->label(),
            'Kunde' => $who,
            'E-Mail' => $a->customerEmail ?? '–',
            'Telefon' => $a->phone !== '' ? $a->phone : '–',
        ];
        if ($a->mode === Mode::Onsite) {
            $rows['Adresse'] = $a->address;
        }
        if ($a->note !== '') {
            $rows['Anmerkung'] = $a->note;
        }
        if ($reason !== '') {
            $rows['Grund'] = $reason;
        }
        $rows['Referenz'] = $a->reference;
        $lines = [];
        foreach ($rows as $label => $value) {
            $lines[] = "$label: $value";
        }
        $calendar = $this->ical->event(
            $method,
            $this->uid($a),
            $a->sequence,
            $a->start,
            $a->end,
            $a->typeTitle . ' – ' . $who,
            implode("\n", $lines) . "\n\nVerwaltung: " . $this->origin() . '/verwaltung/',
            $this->ownerLocation($a),
            ['email' => $this->config->string('mail.from'), 'name' => 'Terminbuchung tayyipuenal.de'],
            $owner,
            $this->clock->now(),
        );
        $this->queue("appt:{$a->id}:owner:$method:{$a->sequence}", 'owner-' . strtolower($method), $owner, "$headline: {$a->typeTitle} · $who · {$this->date($a->start)} {$this->time($a->start)}", [
            'preheader' => "$headline am {$this->date($a->start)} um {$this->time($a->start)} Uhr.",
            'kicker' => 'Terminbuchung',
            'title' => $headline,
            'intro' => $method === 'CANCEL'
                ? 'Dieser Termin wurde storniert. Die Absage entfernt den Eintrag aus Ihrem Kalender.'
                : 'Mit „Annehmen“ übernehmen Sie den Termin in Ihren Outlook-Kalender.',
            'rows' => $rows,
            'button' => ['label' => 'In der Verwaltung öffnen', 'url' => $this->origin() . '/verwaltung/'],
        ], ['method' => $method, 'content' => $calendar]);
    }

    /**
     * @param Recipient $to
     * @return array{method: string, content: string}
     */
    private function customerInvite(AppointmentView $a, string $method, array $to): array
    {
        $description = "Referenz: {$a->reference}\n" . $this->modeHint($a) . "\n\nIhr Kundenkonto: " . $this->origin() . '/konto/';
        return [
            'method' => $method,
            'content' => $this->ical->event($method, $this->uid($a), $a->sequence, $a->start, $a->end, $a->typeTitle . ' mit Tayyip Ünal', $description, $this->customerLocation($a), $this->owner(), $to, $this->clock->now()),
        ];
    }

    /** @return array<string, string> */
    private function customerRows(AppointmentView $a): array
    {
        $rows = [
            'Termin' => $a->typeTitle,
            'Datum' => $this->date($a->start),
            'Uhrzeit' => $this->time($a->start) . '–' . $this->time($a->end) . ' Uhr',
            'Form' => $a->mode->label(),
        ];
        if ($a->mode === Mode::Onsite) {
            $rows['Ort'] = $a->address;
        }
        if ($a->note !== '') {
            $rows['Ihre Anmerkung'] = $a->note;
        }
        $rows['Referenz'] = $a->reference;
        return $rows;
    }

    private function modeHint(AppointmentView $a): string
    {
        return match ($a->mode) {
            Mode::Phone => 'Wir rufen Sie zum Termin unter ' . ($a->phone !== '' ? $a->phone : 'Ihrer Telefonnummer') . ' an.',
            Mode::Video => $a->videoLink !== null ? 'Zum Videotermin: ' . $a->videoLink : 'Den Link zum Videotermin erhalten Sie rechtzeitig vorher per E-Mail.',
            Mode::Onsite => 'Wir kommen zu Ihnen: ' . $a->address . '.',
        };
    }

    private function changeHint(): string
    {
        return 'Sie können den Termin bis 24 Stunden vorher in Ihrem Kundenkonto verschieben oder stornieren. Danach erreichen Sie uns telefonisch unter ' . $this->config->string('site.phone_label') . '.';
    }

    private function customerLocation(AppointmentView $a): string
    {
        return match ($a->mode) {
            Mode::Phone => 'Telefon – wir rufen Sie an',
            Mode::Video => $a->videoLink ?? 'Videotermin – Link folgt per E-Mail',
            Mode::Onsite => $a->address,
        };
    }

    private function ownerLocation(AppointmentView $a): string
    {
        return match ($a->mode) {
            Mode::Phone => 'Telefon: ' . ($a->phone !== '' ? $a->phone : '–'),
            Mode::Video => $a->videoLink ?? 'Videotermin',
            Mode::Onsite => $a->address,
        };
    }

    private function uid(AppointmentView $a): string
    {
        return $a->reference . '@tayyipuenal.de';
    }

    private function origin(): string
    {
        return $this->config->string('site.origin');
    }

    /** @param Recipient $to */
    private function greeting(array $to): string
    {
        return $to['name'] !== '' ? "Guten Tag {$to['name']}, " : 'Guten Tag, ';
    }

    /**
     * @param Recipient $to
     * @param Parts $parts
     * @param array{method: string, content: string}|null $calendar
     */
    private function queue(string $key, string $kind, array $to, string $subject, array $parts, ?array $calendar = null): void
    {
        $this->outbox->enqueue($key, $kind, new Message($to['email'], $to['name'], $subject, $this->layout->html($parts), $this->layout->text($parts), $calendar));
    }
}
```

- [ ] **Step 4: Add the getters to `booking/src/App.php`**

Add `use` lines:

```php
use TuBooking\Application\Notifications;
use TuBooking\Infrastructure\Calendar\ICalendar;
use TuBooking\Infrastructure\Mail\Layout;
```

Add methods after `appointments()`:

```php
    public function layout(): Layout
    {
        return $this->service('layout', Layout::class, fn(): Layout => new Layout($this->config->string('site.origin')));
    }

    public function ical(): ICalendar
    {
        return $this->service('ical', ICalendar::class, fn(): ICalendar => new ICalendar());
    }

    public function notifications(): Notifications
    {
        return $this->service('notifications', Notifications::class, fn(): Notifications => new Notifications(
            $this->outbox(), $this->layout(), $this->ical(), $this->config, $this->settings(), $this->clock, $this->zone(),
        ));
    }
```

- [ ] **Step 5: Run the tests**

Run: `npm run booking:test -- --filter NotificationsTest`
Expected: `OK (4 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 6: Commit**

```bash
git add booking/src/App.php booking/src/Application/Notifications.php booking/tests/Integration/NotificationsTest.php
git commit -m "feat(booking): emails and calendar invitations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Codes, booking and customer login

**Files:**
- Create: `booking/src/Domain/Email.php`
- Create: `booking/src/Application/Codes.php`, `BookingRequest.php`, `Booking.php`, `CustomerAuth.php`
- Modify: `booking/src/App.php` (add `calculator()`, `codes()`, `booking()`, `customerAuth()`)
- Test: `booking/tests/Unit/EmailTest.php`, `booking/tests/Integration/BookingFlowTest.php`

**Interfaces:**
- Consumes: everything from Tasks 2–10
- Produces:
  - `Email::normalize(string): string` (trim, lower-case), `Email::isValid(string): bool`
  - `Codes`:
    - `PURPOSE_CUSTOMER = 'customer'`, `PURPOSE_ADMIN = 'admin'`
    - `__construct(LoginCodes, Crypto, RateLimiter, Notifications)`
    - `limit(string $email, string $ip): void`: 5 per address and 20 per IP per hour
    - `issue(string $email, string $purpose): void`: no rate limit of its own; callers call `limit()` first
    - `consume(string $email, string $purpose, string $code, string $ip): void`: 30 verifications per IP per hour; throws 422
  - `BookingRequest(string $typeSlug, \DateTimeImmutable $start, Mode $mode, string $name, string $email, string $company, string $phone, string $address, string $note)`. The email is normalised in the constructor.
  - `Booking`:
    - `HOLD_MINUTES = 15`
    - `activeType(string $slug): AppointmentType` (404 when missing or inactive)
    - `days(AppointmentType $type, string $fromDate, string $toDate, ?int $excludeId): array<string, list<\DateTimeImmutable>>`
    - `book(BookingRequest, ?Customer, string $ip): array{status: 'held'|'confirmed', view: AppointmentView, holdExpiresAt: ?\DateTimeImmutable}`
    - `confirmHeld(Appointment $held, Customer $customer): bool`
    - `assertBookable(AppointmentType, \DateTimeImmutable $start, ?int $excludeId): void` (409)
    - `isFree(AppointmentType, \DateTimeImmutable $start, ?int $excludeId): bool`
    - `lockHost(): void`, `newReference(): string`
    - `recipients(AppointmentView, ?Customer $actor): list<array{email: string, name: string}>`
  - `CustomerAuth`:
    - `SESSION_DAYS = 30`
    - `requestCode(string $email, string $ip): void`
    - `verify(string $email, string $code, ?string $reference, string $ip): array{token: string, customer: Customer, appointment: ?AppointmentView, slotTaken: bool}`
    - `customerFor(Session): ?Customer`, `logout(string $tokenHash): void`, `logoutAll(Customer): void`

- [ ] **Step 1: Write the failing tests**

`booking/tests/Unit/EmailTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Unit;

use PHPUnit\Framework\TestCase;
use TuBooking\Domain\Email;

final class EmailTest extends TestCase
{
    public function testNormalisesAndValidates(): void
    {
        self::assertSame('max@firma.de', Email::normalize("  Max@Firma.DE \n"));
        self::assertTrue(Email::isValid('max@firma.de'));
        foreach (['', 'max', 'max@', "max@firma.de\r\nBcc: x@y.de", 'max @firma.de', str_repeat('a', 250) . '@x.de'] as $invalid) {
            self::assertFalse(Email::isValid($invalid), $invalid);
        }
    }
}
```

`booking/tests/Integration/BookingFlowTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Application\BookingRequest;
use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Mode;
use TuBooking\Domain\WeeklyWindow;
use TuBooking\Tests\Support\DatabaseTestCase;

final class BookingFlowTest extends DatabaseTestCase
{
    private const IP = '203.0.113.7';

    private function request(string $start, string $email = 'max@muster.de', Mode $mode = Mode::Video, string $phone = ''): BookingRequest
    {
        return new BookingRequest('erstgespraech', new \DateTimeImmutable($start), $mode, 'Max Muster', $email, 'Muster GmbH', $phone, '', 'Zertifizierung ISO 9001');
    }

    private function lastCode(string $email): string
    {
        $this->app->outbox()->dispatch(50);
        foreach (array_reverse($this->mailer->to($email)) as $message) {
            if (preg_match('/^(\d{6}) ist Ihr Bestätigungscode$/', $message->subject, $match) === 1) {
                return $match[1];
            }
        }
        self::fail("No code sent to $email");
    }

    public function testSlotsFollowRulesLeadTimeAndBuffer(): void
    {
        $type = $this->app->booking()->activeType('erstgespraech');
        $days = $this->app->booking()->days($type, '2026-10-02', '2026-10-05', null);
        self::assertCount(14, $days['2026-10-02']);
        self::assertSame('2026-10-02T08:00Z', $days['2026-10-02'][0]->format('Y-m-d\TH:i\Z'));
        self::assertSame([], $days['2026-10-03']);
        self::assertCount(16, $days['2026-10-05']);
        $this->app->booking()->book($this->request('2026-10-02T08:00:00Z'), null, self::IP);
        self::assertCount(12, $this->app->booking()->days($type, '2026-10-02', '2026-10-02', null)['2026-10-02']);
    }

    public function testAnonymousBookingIsHeldUntilTheCodeIsEntered(): void
    {
        $result = $this->app->booking()->book($this->request('2026-10-02T08:00:00Z'), null, self::IP);
        self::assertSame('held', $result['status']);
        self::assertSame(AppointmentStatus::Held, $result['view']->status);
        self::assertSame('2026-10-01 08:15', $result['holdExpiresAt']?->format('Y-m-d H:i'));
        $code = $this->lastCode('max@muster.de');

        $verified = $this->app->customerAuth()->verify('max@muster.de', $code, $result['view']->reference, self::IP);
        self::assertFalse($verified['slotTaken']);
        self::assertSame(AppointmentStatus::Confirmed, $verified['appointment']?->status);
        self::assertSame(['Max Muster', 'Muster GmbH'], [$verified['customer']->name, $this->app->companies()->find($verified['customer']->companyId)?->name]);
        self::assertNotNull($this->app->sessions()->find($this->app->crypto()->hash($verified['token'])));
        $this->app->outbox()->dispatch(50);
        self::assertStringStartsWith('Termin bestätigt:', $this->mailer->to('max@muster.de')[1]->subject);
        self::assertStringStartsWith('Neuer Termin:', $this->mailer->to('info@tayyipuenal.de')[0]->subject);

        $this->expectException(DomainError::class);
        $this->app->customerAuth()->verify('max@muster.de', $code, null, self::IP);
    }

    public function testVerifyNormalisesEmail(): void
    {
        $result = $this->app->booking()->book($this->request('2026-10-02T08:00:00Z', ' Max@Muster.DE '), null, self::IP);
        self::assertSame('max@muster.de', $result['view']->holdEmail);
        $code = $this->lastCode('max@muster.de');
        $verified = $this->app->customerAuth()->verify(' MAX@muster.de', $code, $result['view']->reference, self::IP);
        self::assertSame('max@muster.de', $verified['customer']->email);
        self::assertSame(AppointmentStatus::Confirmed, $verified['appointment']?->status);
    }

    public function testWrongCodesAreLimited(): void
    {
        $result = $this->app->booking()->book($this->request('2026-10-02T08:00:00Z'), null, self::IP);
        $code = $this->lastCode('max@muster.de');
        $wrong = $code === '000000' ? '111111' : '000000';
        for ($i = 1; $i <= 5; $i++) {
            try {
                $this->app->customerAuth()->verify('max@muster.de', $wrong, $result['view']->reference, self::IP);
                self::fail('Wrong code accepted');
            } catch (DomainError $error) {
                self::assertSame(422, $error->status);
                if ($i === 5) {
                    self::assertStringContainsString('zu oft falsch', $error->getMessage());
                }
            }
        }
        $this->expectExceptionMessage('ungültig oder abgelaufen');
        $this->app->customerAuth()->verify('max@muster.de', $code, $result['view']->reference, self::IP);
    }

    public function testExpiredHoldStillConfirmsWhenFree(): void
    {
        $result = $this->app->booking()->book($this->request('2026-10-02T08:00:00Z'), null, self::IP);
        $this->clock->advance('PT16M');
        $this->app->customerAuth()->requestCode('max@muster.de', self::IP);
        $verified = $this->app->customerAuth()->verify('max@muster.de', $this->lastCode('max@muster.de'), $result['view']->reference, self::IP);
        self::assertFalse($verified['slotTaken']);
        self::assertSame(AppointmentStatus::Confirmed, $verified['appointment']?->status);
    }

    public function testExpiredHoldTakenMeanwhileReportsSlotTaken(): void
    {
        // Monday 10:00 local: still outside the 24-hour notice after the clock moves on.
        $held = $this->app->booking()->book($this->request('2026-10-05T08:00:00Z'), null, self::IP);
        $this->clock->advance('PT16M');
        $eva = $this->app->customers()->create($this->app->companies()->create(null), 'eva@example.com', 'Eva', '');
        self::assertSame('confirmed', $this->app->booking()->book($this->request('2026-10-05T08:00:00Z', 'eva@example.com'), $eva, self::IP)['status']);
        $this->app->customerAuth()->requestCode('max@muster.de', self::IP);
        $verified = $this->app->customerAuth()->verify('max@muster.de', $this->lastCode('max@muster.de'), $held['view']->reference, self::IP);
        self::assertTrue($verified['slotTaken']);
        self::assertNull($verified['appointment']);
        self::assertSame('Max Muster', $verified['customer']->name);
        self::assertNull($this->app->appointments()->byReference($held['view']->reference));
    }

    public function testBookingJustAfterMidnightBerlin(): void
    {
        $this->app->rules()->replace(null, [new WeeklyWindow(2, '00:00', '01:00')]);
        self::assertSame('held', $this->app->booking()->book($this->request('2026-10-05T22:30:00Z'), null, self::IP)['status']);
        $this->expectExceptionMessage('gerade vergeben');
        $this->app->booking()->book($this->request('2026-10-06T22:30:00Z', 'eva@example.com'), null, self::IP);
    }

    public function testLoggedInCustomerBooksDirectly(): void
    {
        $eva = $this->app->customers()->create($this->app->companies()->create('Eva AG'), 'eva@example.com', 'Eva Beispiel', '0231 9');
        $result = $this->app->booking()->book($this->request('2026-10-02T08:00:00Z', 'ignored@example.com', Mode::Phone), $eva, self::IP);
        self::assertSame('confirmed', $result['status']);
        self::assertSame(['eva@example.com', '0231 9'], [$result['view']->customerEmail, $result['view']->phone]);
        $this->app->outbox()->dispatch();
        self::assertCount(1, $this->mailer->to('eva@example.com'));
        self::assertCount(0, $this->mailer->to('ignored@example.com'));
    }

    public function testHoldBlocksOtherBookingsAndModesAreChecked(): void
    {
        $this->app->booking()->book($this->request('2026-10-02T08:00:00Z'), null, self::IP);
        try {
            $this->app->booking()->book($this->request('2026-10-02T08:00:00Z', 'eva@example.com'), null, self::IP);
            self::fail('Double booking accepted');
        } catch (DomainError $error) {
            self::assertSame(409, $error->status);
        }
        try {
            $this->app->booking()->book($this->request('2026-10-02T09:00:00Z', 'eva@example.com', Mode::Phone), null, self::IP);
            self::fail('Phone booking without number accepted');
        } catch (DomainError $error) {
            self::assertStringContainsString('Telefonnummer', $error->getMessage());
        }
        $this->expectExceptionMessage('verfügbare Terminform');
        $this->app->booking()->book($this->request('2026-10-02T09:00:00Z', 'eva@example.com', Mode::Onsite), null, self::IP);
    }

    public function testUnknownAddressGetsANoteInsteadOfACode(): void
    {
        $this->app->customerAuth()->requestCode('neu@example.com', self::IP);
        $this->app->outbox()->dispatch();
        self::assertSame('Anmeldung bei tayyipuenal.de', $this->mailer->to('neu@example.com')[0]->subject);
        $this->expectExceptionMessage('ungültig oder abgelaufen');
        $this->app->customerAuth()->verify('neu@example.com', '123456', null, self::IP);
    }

    public function testCodeRequestsAreRateLimited(): void
    {
        $customer = $this->app->customers()->create($this->app->companies()->create(null), 'max@muster.de', 'Max', '');
        for ($i = 0; $i < 5; $i++) {
            $this->app->customerAuth()->requestCode($customer->email, self::IP);
        }
        $this->expectExceptionMessage('mehrere Codes');
        $this->app->customerAuth()->requestCode($customer->email, self::IP);
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run booking:test -- --filter 'EmailTest|BookingFlowTest'`
Expected: FAIL with `Class "TuBooking\Domain\Email" not found` and `Call to undefined method TuBooking\App::booking()`.

- [ ] **Step 3: Write `booking/src/Domain/Email.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Domain;

final class Email
{
    /** Every email is compared and stored trimmed and lower-cased. */
    public static function normalize(string $email): string
    {
        return strtolower(trim($email));
    }

    public static function isValid(string $email): bool
    {
        return strlen($email) <= 254
            && preg_match('/[\x00-\x1F\x7F\s]/', $email) !== 1
            && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }
}
```

- [ ] **Step 4: Write `booking/src/Application/Codes.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\DomainError;
use TuBooking\Domain\Email;
use TuBooking\Infrastructure\Crypto;
use TuBooking\Infrastructure\RateLimiter;
use TuBooking\Infrastructure\Repository\LoginCodes;

/** Six-digit email codes for customers and admins. The code is part of a keyed hash, never stored. */
final class Codes
{
    public const PURPOSE_CUSTOMER = 'customer';
    public const PURPOSE_ADMIN = 'admin';

    public function __construct(
        private readonly LoginCodes $codes,
        private readonly Crypto $crypto,
        private readonly RateLimiter $limiter,
        private readonly Notifications $notifications,
    ) {
    }

    /** Counts one code request against the limits (5 per address, 20 per IP and hour). */
    public function limit(string $email, string $ip): void
    {
        $message = 'Es wurden bereits mehrere Codes angefordert. Bitte warten Sie etwas und versuchen Sie es erneut.';
        $this->limiter->hit('code:email:' . Email::normalize($email), 5, 3600, $message);
        $this->limiter->hit('code:ip:' . $ip, 20, 3600, $message);
    }

    public function issue(string $email, string $purpose): void
    {
        $email = Email::normalize($email);
        $code = $this->crypto->code();
        $id = $this->codes->create($email, $purpose, $this->hash($purpose, $email, $code));
        $this->notifications->code($id, $email, $code, $purpose === self::PURPOSE_ADMIN);
    }

    public function consume(string $email, string $purpose, string $code, string $ip): void
    {
        $email = Email::normalize($email);
        $this->limiter->hit('verify:ip:' . $ip, 30, 3600, 'Zu viele Versuche. Bitte warten Sie etwas und versuchen Sie es erneut.');
        $active = $this->codes->active($email, $purpose);
        if ($active === null) {
            throw DomainError::invalid('Der Code ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Code an.');
        }
        $code = trim($code);
        if (preg_match('/^\d{6}$/', $code) !== 1 || !hash_equals($active['codeHash'], $this->hash($purpose, $email, $code))) {
            $this->codes->failedAttempt($active['id']);
            throw DomainError::invalid($active['attempts'] + 1 >= LoginCodes::MAX_ATTEMPTS
                ? 'Der Code wurde zu oft falsch eingegeben. Bitte fordern Sie einen neuen Code an.'
                : 'Der Code ist nicht korrekt. Bitte prüfen Sie Ihre Eingabe.');
        }
        $this->codes->markUsed($active['id']);
    }

    private function hash(string $purpose, string $email, string $code): string
    {
        return $this->crypto->hmac($purpose . '|' . $email . '|' . $code);
    }
}
```

- [ ] **Step 5: Write `booking/src/Application/BookingRequest.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\Email;
use TuBooking\Domain\Mode;

/** What a visitor (or the owner, for a phoned-in appointment) asks to book. Already validated by the HTTP layer. */
final class BookingRequest
{
    public readonly string $email;

    public function __construct(
        public readonly string $typeSlug,
        public readonly \DateTimeImmutable $start,
        public readonly Mode $mode,
        public readonly string $name,
        string $email,
        public readonly string $company,
        public readonly string $phone,
        public readonly string $address,
        public readonly string $note,
    ) {
        $this->email = Email::normalize($email);
    }
}
```

- [ ] **Step 6: Write `booking/src/Application/Booking.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Interval;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Appointment;
use TuBooking\Domain\Model\AppointmentType;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Customer;
use TuBooking\Domain\Reference;
use TuBooking\Domain\SlotCalculator;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\RateLimiter;
use TuBooking\Infrastructure\Repository\Absences;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\AppointmentTypes;
use TuBooking\Infrastructure\Repository\AvailabilityRules;
use TuBooking\Infrastructure\Repository\Customers;
use TuBooking\Support\Clock;

/**
 * Free slots and new bookings. Every write that could double-book runs in a
 * transaction holding the 'host' row lock, re-checks bookability and only then
 * inserts, so of two parallel requests for one slot exactly one wins.
 */
final class Booking
{
    public const HOLD_MINUTES = 15;

    public function __construct(
        private readonly Database $db,
        private readonly AppointmentTypes $types,
        private readonly AvailabilityRules $rules,
        private readonly Absences $absences,
        private readonly Appointments $appointments,
        private readonly Customers $customers,
        private readonly Codes $codes,
        private readonly Notifications $notifications,
        private readonly RateLimiter $limiter,
        private readonly AuditLog $audit,
        private readonly SlotCalculator $calculator,
        private readonly Clock $clock,
        private readonly \DateTimeZone $zone,
    ) {
    }

    public function activeType(string $slug): AppointmentType
    {
        $type = $this->types->bySlug($slug);
        if ($type === null || !$type->active) {
            throw DomainError::notFound('Diese Terminart ist nicht verfügbar.');
        }
        return $type;
    }

    /** @return array<string, list<\DateTimeImmutable>> */
    public function days(AppointmentType $type, string $fromDate, string $toDate, ?int $excludeId): array
    {
        $from = (new \DateTimeImmutable($fromDate . ' 00:00', $this->zone))->sub(new \DateInterval('P1D'));
        $to = (new \DateTimeImmutable($toDate . ' 00:00', $this->zone))->add(new \DateInterval('P2D'));
        return $this->calculator->slots($type->policy(), $this->rules->windowsFor($type->id), $this->busy($from, $to, $excludeId), $this->clock->now(), $fromDate, $toDate);
    }

    /** @return array{status: 'held'|'confirmed', view: AppointmentView, holdExpiresAt: ?\DateTimeImmutable} */
    public function book(BookingRequest $request, ?Customer $customer, string $ip): array
    {
        $type = $this->activeType($request->typeSlug);
        if (!$type->allows($request->mode)) {
            throw DomainError::invalid('Bitte wählen Sie eine verfügbare Terminform.');
        }
        $phone = $request->phone !== '' ? $request->phone : ($customer?->phone ?? '');
        if ($request->mode === Mode::Phone && $phone === '') {
            throw DomainError::invalid('Bitte geben Sie eine Telefonnummer an – wir rufen Sie an.');
        }
        if ($request->mode === Mode::Onsite && $request->address === '') {
            throw DomainError::invalid('Bitte geben Sie die Adresse für den Termin vor Ort an.');
        }
        $this->limiter->hit('book:ip:' . $ip, 10, 3600, 'Es wurden bereits mehrere Buchungen gestartet. Bitte versuchen Sie es später erneut oder rufen Sie uns an.');
        if ($customer === null) {
            $this->codes->limit($request->email, $ip);
        }
        $end = $request->start->add(new \DateInterval('PT' . $type->durationMin . 'M'));
        return $this->db->transaction(function () use ($request, $customer, $type, $phone, $end): array {
            $this->lockHost();
            $this->assertBookable($type, $request->start, null);
            $reference = $this->newReference();
            if ($customer !== null) {
                $id = $this->appointments->createConfirmed($reference, $type->id, $customer->id, $customer->companyId, $request->start, $end, $request->mode, $phone, $request->address, $request->note);
                $view = $this->appointments->view($id);
                $this->customers->touch($customer->id, false);
                $this->notifications->appointmentConfirmed($view, [['email' => $customer->email, 'name' => $customer->name]]);
                $this->audit->record('customer', $customer->id, 'appointment.book', 'appointment', $id);
                return ['status' => 'confirmed', 'view' => $view, 'holdExpiresAt' => null];
            }
            $expires = $this->clock->now()->add(new \DateInterval('PT' . self::HOLD_MINUTES . 'M'));
            $id = $this->appointments->createHeld(
                $reference, $type->id, $request->start, $end, $request->mode, $phone, $request->address, $request->note,
                $request->email, ['name' => $request->name, 'company' => $request->company, 'phone' => $phone], $expires,
            );
            $this->codes->issue($request->email, Codes::PURPOSE_CUSTOMER);
            return ['status' => 'held', 'view' => $this->appointments->view($id), 'holdExpiresAt' => $expires];
        });
    }

    /**
     * Confirms a held booking for its verified customer. An expired hold is
     * still confirmed if nothing has taken its time meanwhile; otherwise the
     * hold is removed and false is returned.
     */
    public function confirmHeld(Appointment $held, Customer $customer): bool
    {
        return $this->db->transaction(function () use ($held, $customer): bool {
            $this->lockHost();
            $current = $this->appointments->find($held->id);
            if ($current === null || $current->status !== AppointmentStatus::Held) {
                return false;
            }
            $type = $this->types->find($current->typeId);
            $expired = $current->holdExpiresAt === null || $current->holdExpiresAt <= $this->clock->now();
            if ($type === null || ($expired && !$this->isFree($type, $current->start, $current->id))) {
                $this->appointments->delete($current->id);
                return false;
            }
            $this->appointments->confirm($current->id, $customer->id, $customer->companyId);
            $this->customers->fillMissingPhone($customer->id, $current->phone);
            $view = $this->appointments->view($current->id);
            $this->notifications->appointmentConfirmed($view, [['email' => $customer->email, 'name' => $customer->name]]);
            $this->audit->record('customer', $customer->id, 'appointment.book', 'appointment', $current->id);
            return true;
        });
    }

    /** Throws 409 unless $start is one of the free slots of $type right now. Call inside lockHost(). */
    public function assertBookable(AppointmentType $type, \DateTimeImmutable $start, ?int $excludeId): void
    {
        $day = $start->setTimezone($this->zone)->format('Y-m-d');
        $from = (new \DateTimeImmutable($day . ' 00:00', $this->zone))->sub(new \DateInterval('P1D'));
        $to = $from->add(new \DateInterval('P3D'));
        if (!$this->calculator->isBookable($type->policy(), $this->rules->windowsFor($type->id), $this->busy($from, $to, $excludeId), $this->clock->now(), $start)) {
            throw DomainError::conflict('Dieser Termin wurde gerade vergeben – bitte wählen Sie einen anderen.');
        }
    }

    /** True when no appointment or absence lies within the type's buffer around [start, start + duration). */
    public function isFree(AppointmentType $type, \DateTimeImmutable $start, ?int $excludeId): bool
    {
        $candidate = (new Interval($start, $start->add(new \DateInterval('PT' . $type->durationMin . 'M'))))->widen($type->bufferMin);
        foreach ($this->busy($candidate->start, $candidate->end, $excludeId) as $interval) {
            if ($candidate->overlaps($interval)) {
                return false;
            }
        }
        return true;
    }

    public function lockHost(): void
    {
        $this->db->one("SELECT name FROM resource_locks WHERE name = 'host' FOR UPDATE");
    }

    /**
     * Who is told about a change: the booker and the acting colleague; if the
     * booker's account is gone and nobody acted, every member of the company.
     *
     * @return list<array{email: string, name: string}>
     */
    public function recipients(AppointmentView $a, ?Customer $actor): array
    {
        $recipients = [];
        if ($a->customerEmail !== null) {
            $recipients[$a->customerEmail] = ['email' => $a->customerEmail, 'name' => (string) $a->customerName];
        }
        if ($actor !== null) {
            $recipients[$actor->email] = ['email' => $actor->email, 'name' => $actor->name];
        }
        if ($recipients === [] && $a->companyId !== null) {
            foreach ($this->customers->members($a->companyId) as $member) {
                $recipients[$member->email] = ['email' => $member->email, 'name' => $member->name];
            }
        }
        return array_values($recipients);
    }

    /** @return list<Interval> */
    private function busy(\DateTimeImmutable $from, \DateTimeImmutable $to, ?int $excludeId): array
    {
        return [...$this->appointments->busy($from, $to, $excludeId), ...$this->absences->overlapping($from, $to)];
    }

    /** A reference that no appointment uses yet. */
    public function newReference(): string
    {
        do {
            $reference = Reference::generate();
        } while ($this->appointments->byReference($reference) !== null);
        return $reference;
    }
}
```

- [ ] **Step 7: Write `booking/src/Application/CustomerAuth.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Email;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Customer;
use TuBooking\Domain\Model\Session;
use TuBooking\Infrastructure\Crypto;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\Companies;
use TuBooking\Infrastructure\Repository\Customers;
use TuBooking\Infrastructure\Repository\Sessions;
use TuBooking\Support\Clock;

/**
 * Passwordless customer login. The verified email is the account: the first
 * verified booking creates it; later a code alone logs in.
 */
final class CustomerAuth
{
    public const SESSION_DAYS = 30;

    public function __construct(
        private readonly Database $db,
        private readonly Codes $codes,
        private readonly Customers $customers,
        private readonly Companies $companies,
        private readonly Appointments $appointments,
        private readonly Sessions $sessions,
        private readonly Booking $booking,
        private readonly Notifications $notifications,
        private readonly Crypto $crypto,
        private readonly Clock $clock,
    ) {
    }

    /** Sends a code to known addresses and to addresses with a pending booking; otherwise a short "no account yet" note. */
    public function requestCode(string $email, string $ip): void
    {
        $email = Email::normalize($email);
        $this->codes->limit($email, $ip);
        $this->db->transaction(function () use ($email): void {
            if ($this->customers->findByEmail($email) !== null || $this->appointments->hasRecentHold($email)) {
                $this->codes->issue($email, Codes::PURPOSE_CUSTOMER);
            } else {
                $this->notifications->noAccount($email);
            }
        });
    }

    /** @return array{token: string, customer: Customer, appointment: ?AppointmentView, slotTaken: bool} */
    public function verify(string $email, string $code, ?string $reference, string $ip): array
    {
        $email = Email::normalize($email);
        $this->codes->consume($email, Codes::PURPOSE_CUSTOMER, $code, $ip);
        $held = $reference !== null ? $this->appointments->byReference($reference) : null;
        $customer = $this->customers->findByEmail($email);
        $appointment = null;
        $slotTaken = false;
        if ($held !== null && $held->status === AppointmentStatus::Held && $held->holdEmail === $email) {
            if ($customer === null) {
                $customer = $this->db->transaction(function () use ($held, $email): Customer {
                    $companyId = $this->companies->create($held->draft['company'] !== '' ? $held->draft['company'] : null);
                    return $this->customers->create($companyId, $email, $held->draft['name'], $held->draft['phone']);
                });
            }
            if ($this->booking->confirmHeld($held, $customer)) {
                $appointment = $this->appointments->view($held->id);
            } else {
                $slotTaken = true;
            }
        } elseif ($held !== null && $customer !== null && $held->status === AppointmentStatus::Confirmed && $held->customerId === $customer->id) {
            $appointment = $this->appointments->view($held->id);
        }
        if ($customer === null) {
            throw DomainError::notFound('Zu dieser E-Mail-Adresse gibt es noch kein Kundenkonto. Buchen Sie einfach Ihren ersten Termin – Ihr Konto entsteht dabei automatisch.');
        }
        $token = $this->crypto->token();
        $this->sessions->create($this->crypto->hash($token), $customer->id, null, $this->clock->now()->add(new \DateInterval('P' . self::SESSION_DAYS . 'D')), true);
        $this->customers->touch($customer->id, true);
        return ['token' => $token, 'customer' => $customer, 'appointment' => $appointment, 'slotTaken' => $slotTaken];
    }

    /** The session's customer; the session is extended at most once an hour (30 days sliding). */
    public function customerFor(Session $session): ?Customer
    {
        if ($session->customerId === null) {
            return null;
        }
        $customer = $this->customers->find($session->customerId);
        if ($customer !== null && $session->lastSeenAt < $this->clock->now()->sub(new \DateInterval('PT1H'))) {
            $this->sessions->extend($session->tokenHash, $this->clock->now()->add(new \DateInterval('P' . self::SESSION_DAYS . 'D')));
        }
        return $customer;
    }

    public function logout(string $tokenHash): void
    {
        $this->sessions->delete($tokenHash);
    }

    public function logoutAll(Customer $customer): void
    {
        $this->sessions->deleteForCustomer($customer->id);
    }
}
```

- [ ] **Step 8: Add the getters to `booking/src/App.php`**

Add `use` lines:

```php
use TuBooking\Application\Booking;
use TuBooking\Application\Codes;
use TuBooking\Application\CustomerAuth;
use TuBooking\Domain\SlotCalculator;
```

Add methods after `notifications()`:

```php
    public function calculator(): SlotCalculator
    {
        return $this->service('calculator', SlotCalculator::class, fn(): SlotCalculator => new SlotCalculator($this->zone()));
    }

    public function codes(): Codes
    {
        return $this->service('codes', Codes::class, fn(): Codes => new Codes($this->loginCodes(), $this->crypto(), $this->rateLimiter(), $this->notifications()));
    }

    public function booking(): Booking
    {
        return $this->service('booking', Booking::class, fn(): Booking => new Booking(
            $this->db(), $this->types(), $this->rules(), $this->absences(), $this->appointments(), $this->customers(),
            $this->codes(), $this->notifications(), $this->rateLimiter(), $this->audit(), $this->calculator(), $this->clock, $this->zone(),
        ));
    }

    public function customerAuth(): CustomerAuth
    {
        return $this->service('customerAuth', CustomerAuth::class, fn(): CustomerAuth => new CustomerAuth(
            $this->db(), $this->codes(), $this->customers(), $this->companies(), $this->appointments(), $this->sessions(),
            $this->booking(), $this->notifications(), $this->crypto(), $this->clock,
        ));
    }
```

- [ ] **Step 9: Run the tests**

Run: `npm run booking:test -- --filter 'EmailTest|BookingFlowTest'`
Expected: `OK (12 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 10: Commit**

```bash
git add booking/src/App.php booking/src/Domain/Email.php booking/src/Application booking/tests/Unit/EmailTest.php booking/tests/Integration/BookingFlowTest.php
git commit -m "feat(booking): holds, email codes and customer login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Customer changes and accounts

**Files:**
- Create: `booking/src/Application/AppointmentChanges.php`, `booking/src/Application/Accounts.php`
- Modify: `booking/src/App.php` (add `changes()`, `accounts()`)
- Test: `booking/tests/Integration/CustomerChangesTest.php`

**Interfaces:**
- Consumes: `Booking` (`lockHost`, `assertBookable`, `recipients`), `Notifications`, repositories (Tasks 8–11)
- Produces:
  - `AppointmentChanges`:
    - `CUTOFF_HOURS = 24`
    - `canChange(AppointmentView): bool`
    - `cancel(Customer $actor, string $reference, string $reason): AppointmentView`, which is idempotent once cancelled
    - `reschedule(Customer $actor, string $reference, \DateTimeImmutable $start): AppointmentView`
    - Both are scoped to the actor's company: another company's reference gives 404.
  - `Accounts`:
    - `profile(Customer): array{customer: Customer, company: Company, members: list<Customer>}`
    - `update(Customer, string $name, string $phone, ?string $companyName): Customer`
    - `bookings(Customer): list<AppointmentView>`
    - `invite(Customer $inviter, string $email, string $name): Customer`
    - `removeMember(Customer $actor, int $memberId): void`
    - `erase(Customer $customer, string $actorType, ?int $actorId, string $reason): void`, used by account deletion, the admin and retention

- [ ] **Step 1: Write the failing test**

`booking/tests/Integration/CustomerChangesTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Application\BookingRequest;
use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Customer;
use TuBooking\Tests\Support\DatabaseTestCase;

final class CustomerChangesTest extends DatabaseTestCase
{
    private Customer $max;
    private AppointmentView $appointment;

    protected function setUp(): void
    {
        parent::setUp();
        $this->max = $this->app->customers()->create($this->app->companies()->create('Muster GmbH'), 'max@muster.de', 'Max Muster', '0231 1');
        $this->appointment = $this->book($this->max, '2026-10-05T08:00:00Z');
        $this->mailer->sent = [];
        $this->app->outbox()->dispatch(50);
        $this->mailer->sent = [];
    }

    private function book(Customer $customer, string $start): AppointmentView
    {
        $request = new BookingRequest('erstgespraech', new \DateTimeImmutable($start), Mode::Video, $customer->name, $customer->email, '', '', '', '');
        return $this->app->booking()->book($request, $customer, '203.0.113.7')['view'];
    }

    private function colleague(string $email = 'eva@muster.de'): Customer
    {
        return $this->app->accounts()->invite($this->max, $email, 'Eva Muster');
    }

    public function testCustomerCancelsOwnAppointmentOnce(): void
    {
        $cancelled = $this->app->changes()->cancel($this->max, $this->appointment->reference, 'Terminkonflikt');
        self::assertSame(AppointmentStatus::Cancelled, $cancelled->status);
        self::assertSame($cancelled->sequence, $this->app->changes()->cancel($this->max, $this->appointment->reference, '')->sequence);
        $this->app->outbox()->dispatch(50);
        self::assertSame('CANCEL', $this->mailer->to('max@muster.de')[0]->calendar['method'] ?? null);
        self::assertSame('CANCEL', $this->mailer->to('info@tayyipuenal.de')[0]->calendar['method'] ?? null);
        self::assertSame('appointment.cancel', $this->app->audit()->latest()[0]['action']);
    }

    public function testColleagueChangesCompanyBookingAndBothAreInformed(): void
    {
        $eva = $this->colleague();
        self::assertCount(1, $this->app->accounts()->bookings($eva));
        $this->app->changes()->cancel($eva, $this->appointment->reference, '');
        $this->app->outbox()->dispatch(50);
        self::assertCount(1, array_filter($this->mailer->to('max@muster.de'), static fn($m) => str_starts_with($m->subject, 'Termin storniert')));
        self::assertCount(1, array_filter($this->mailer->to('eva@muster.de'), static fn($m) => str_starts_with($m->subject, 'Termin storniert')));
    }

    public function testOtherCompanyGetsNotFound(): void
    {
        $stranger = $this->app->customers()->create($this->app->companies()->create(null), 'x@example.com', 'X', '');
        $this->expectExceptionMessage('nicht gefunden');
        $this->app->changes()->cancel($stranger, $this->appointment->reference, '');
    }

    public function testShortNoticeChangesAreRefused(): void
    {
        $this->clock->set('2026-10-04T09:00:00Z');
        self::assertFalse($this->app->changes()->canChange($this->app->appointments()->view($this->appointment->id)));
        $this->expectExceptionMessage('nur telefonisch möglich: 0155 63084795');
        $this->app->changes()->cancel($this->max, $this->appointment->reference, '');
    }

    public function testRescheduleMovesTheSameEvent(): void
    {
        $moved = $this->app->changes()->reschedule($this->max, $this->appointment->reference, new \DateTimeImmutable('2026-10-06T08:00:00Z'));
        self::assertSame(['2026-10-06 08:00', 1, $this->appointment->reference], [$moved->start->format('Y-m-d H:i'), $moved->sequence, $moved->reference]);
        $this->app->outbox()->dispatch(50);
        self::assertStringStartsWith('Termin verschoben:', $this->mailer->to('max@muster.de')[0]->subject);
        self::assertStringContainsString("SEQUENCE:1\r\n", (string) ($this->mailer->to('info@tayyipuenal.de')[0]->calendar['content'] ?? ''));
        try {
            $this->app->changes()->reschedule($this->max, $this->appointment->reference, new \DateTimeImmutable('2026-10-06T08:10:00Z'));
            self::fail('Accepted a time that is not a slot');
        } catch (DomainError $error) {
            self::assertSame(409, $error->status);
        }
    }

    public function testCancelNotifiesMembersWhenBookerRemoved(): void
    {
        $eva = $this->colleague();
        $this->app->accounts()->removeMember($eva, $this->max->id);
        $orphan = $this->app->appointments()->view($this->appointment->id);
        self::assertNull($orphan->customerId);
        self::assertSame([['email' => 'eva@muster.de', 'name' => 'Eva Muster']], $this->app->booking()->recipients($orphan, null));
        $this->app->changes()->cancel($eva, $this->appointment->reference, 'Nicht mehr nötig');
        $this->app->outbox()->dispatch(50);
        self::assertCount(1, array_filter($this->mailer->to('eva@muster.de'), static fn($m) => str_starts_with($m->subject, 'Termin storniert')));
    }

    public function testInviteRules(): void
    {
        $eva = $this->colleague();
        self::assertSame($this->max->companyId, $eva->companyId);
        $this->app->outbox()->dispatch(50);
        self::assertSame('Einladung zum Kundenkonto von Muster GmbH', $this->mailer->to('eva@muster.de')[0]->subject);
        try {
            $this->colleague(' EVA@muster.de ');
            self::fail('Invited twice');
        } catch (DomainError $error) {
            self::assertStringContainsString('bereits zu Ihrem Firmenkonto', $error->getMessage());
        }
        $this->app->customers()->create($this->app->companies()->create(null), 'fremd@example.com', 'Fremd', '');
        $this->expectExceptionMessage('bereits ein eigenes Kundenkonto');
        $this->colleague('fremd@example.com');
    }

    public function testRemoveMemberRules(): void
    {
        $eva = $this->colleague();
        try {
            $this->app->accounts()->removeMember($this->max, $this->max->id);
            self::fail('Removed self');
        } catch (DomainError $error) {
            self::assertSame(422, $error->status);
        }
        $this->app->sessions()->create('eva-session', $eva->id, null, $this->clock->now()->add(new \DateInterval('P1D')), true);
        $this->app->accounts()->removeMember($this->max, $eva->id);
        self::assertNull($this->app->customers()->find($eva->id));
        self::assertNull($this->app->sessions()->find('eva-session'));
        $stranger = $this->app->customers()->create($this->app->companies()->create(null), 'x@example.com', 'X', '');
        $this->expectException(DomainError::class);
        $this->app->accounts()->removeMember($this->max, $stranger->id);
    }

    public function testEraseLastMemberRemovesCompanyAndInformsOwner(): void
    {
        $this->app->accounts()->erase($this->max, 'customer', $this->max->id, 'Kundenkonto gelöscht');
        self::assertNull($this->app->customers()->find($this->max->id));
        self::assertNull($this->app->companies()->find($this->max->companyId));
        self::assertNull($this->app->appointments()->find($this->appointment->id));
        $this->app->outbox()->dispatch(50);
        $owner = $this->mailer->to('info@tayyipuenal.de');
        self::assertSame('CANCEL', $owner[0]->calendar['method'] ?? null);
        self::assertSame('Kundenkonto gelöscht: 1 Termin(e) storniert', $owner[1]->subject);
        self::assertCount(0, $this->mailer->to('max@muster.de'));
    }

    public function testEraseKeepsCompanyWhenColleaguesRemain(): void
    {
        $eva = $this->colleague();
        $evas = $this->book($eva, '2026-10-06T08:00:00Z');
        $this->app->accounts()->erase($this->max, 'customer', $this->max->id, 'Kundenkonto gelöscht');
        self::assertNotNull($this->app->companies()->find($eva->companyId));
        self::assertSame(AppointmentStatus::Confirmed, $this->app->appointments()->view($evas->id)->status);
    }

    public function testUpdateProfileAndCompanyName(): void
    {
        $updated = $this->app->accounts()->update($this->max, 'Max M. Muster', '0172 5', 'Muster & Söhne GmbH');
        self::assertSame(['Max M. Muster', '0172 5'], [$updated->name, $updated->phone]);
        self::assertSame('Muster & Söhne GmbH', $this->app->accounts()->profile($updated)['company']->name);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter CustomerChangesTest`
Expected: FAIL. Error: `Call to undefined method TuBooking\App::accounts()`.

- [ ] **Step 3: Write `booking/src/Application/AppointmentChanges.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Config;
use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Customer;
use TuBooking\Domain\Reference;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\AppointmentTypes;
use TuBooking\Support\Clock;

/** Cancelling and rescheduling by customers: company-scoped, until 24 hours before the start. */
final class AppointmentChanges
{
    public const CUTOFF_HOURS = 24;

    public function __construct(
        private readonly Database $db,
        private readonly Appointments $appointments,
        private readonly AppointmentTypes $types,
        private readonly Booking $booking,
        private readonly Notifications $notifications,
        private readonly AuditLog $audit,
        private readonly Clock $clock,
        private readonly Config $config,
    ) {
    }

    public function canChange(AppointmentView $appointment): bool
    {
        return $appointment->status === AppointmentStatus::Confirmed
            && $appointment->start >= $this->clock->now()->add(new \DateInterval('PT' . self::CUTOFF_HOURS . 'H'));
    }

    public function cancel(Customer $actor, string $reference, string $reason): AppointmentView
    {
        $view = $this->find($actor, $reference);
        if ($view->status === AppointmentStatus::Cancelled) {
            return $view;
        }
        $this->assertChangeable($view);
        return $this->db->transaction(function () use ($actor, $view, $reason): AppointmentView {
            $this->appointments->cancel($view->id, 'customer', $reason);
            $updated = $this->appointments->view($view->id);
            $this->notifications->appointmentCancelled($updated, $this->booking->recipients($updated, $actor), $reason);
            $this->audit->record('customer', $actor->id, 'appointment.cancel', 'appointment', $view->id);
            return $updated;
        });
    }

    public function reschedule(Customer $actor, string $reference, \DateTimeImmutable $start): AppointmentView
    {
        $view = $this->find($actor, $reference);
        $this->assertChangeable($view);
        if ($view->start->getTimestamp() === $start->getTimestamp()) {
            return $view;
        }
        $type = $this->types->find($view->typeId) ?? throw DomainError::conflict('Diese Terminart gibt es nicht mehr. Bitte rufen Sie uns an.');
        return $this->db->transaction(function () use ($actor, $view, $type, $start): AppointmentView {
            $this->booking->lockHost();
            $this->booking->assertBookable($type, $start, $view->id);
            $this->appointments->reschedule($view->id, $start, $start->add(new \DateInterval('PT' . $type->durationMin . 'M')));
            $updated = $this->appointments->view($view->id);
            $this->notifications->appointmentRescheduled($updated, $view->start, $this->booking->recipients($updated, $actor));
            $this->audit->record('customer', $actor->id, 'appointment.reschedule', 'appointment', $view->id);
            return $updated;
        });
    }

    private function find(Customer $actor, string $reference): AppointmentView
    {
        $view = Reference::isValid($reference) ? $this->appointments->viewByReference($reference, $actor->companyId) : null;
        if ($view === null || $view->status === AppointmentStatus::Held) {
            throw DomainError::notFound('Dieser Termin wurde nicht gefunden.');
        }
        return $view;
    }

    private function assertChangeable(AppointmentView $view): void
    {
        if ($view->status !== AppointmentStatus::Confirmed) {
            throw DomainError::conflict('Dieser Termin kann nicht mehr geändert werden.');
        }
        if (!$this->canChange($view)) {
            throw DomainError::conflict('Kurzfristige Änderungen sind nur telefonisch möglich: ' . $this->config->string('site.phone_label') . '.');
        }
    }
}
```

- [ ] **Step 4: Write `booking/src/Application/Accounts.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\DomainError;
use TuBooking\Domain\Email;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Company;
use TuBooking\Domain\Model\Customer;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\RateLimiter;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\Companies;
use TuBooking\Infrastructure\Repository\Customers;
use TuBooking\Infrastructure\Repository\Sessions;

/** The customer's own account: profile, colleagues, the company's bookings, deletion. */
final class Accounts
{
    public function __construct(
        private readonly Database $db,
        private readonly Customers $customers,
        private readonly Companies $companies,
        private readonly Appointments $appointments,
        private readonly Sessions $sessions,
        private readonly Notifications $notifications,
        private readonly RateLimiter $limiter,
        private readonly AuditLog $audit,
    ) {
    }

    /** @return array{customer: Customer, company: Company, members: list<Customer>} */
    public function profile(Customer $customer): array
    {
        $company = $this->companies->find($customer->companyId) ?? throw new \RuntimeException('Company missing.');
        return ['customer' => $customer, 'company' => $company, 'members' => $this->customers->members($customer->companyId)];
    }

    public function update(Customer $customer, string $name, string $phone, ?string $companyName): Customer
    {
        $this->db->transaction(function () use ($customer, $name, $phone, $companyName): void {
            $this->customers->update($customer->id, $name, $phone);
            if ($companyName !== null) {
                $this->companies->rename($customer->companyId, $companyName);
            }
            $this->audit->record('customer', $customer->id, 'profile.update', 'customer', $customer->id);
        });
        return $this->customers->find($customer->id) ?? throw new \RuntimeException('Customer missing.');
    }

    /** @return list<AppointmentView> */
    public function bookings(Customer $customer): array
    {
        return $this->appointments->forCompany($customer->companyId);
    }

    public function invite(Customer $inviter, string $email, string $name): Customer
    {
        $email = Email::normalize($email);
        $this->limiter->hit('invite:customer:' . $inviter->id, 10, 3600, 'Sie haben bereits mehrere Einladungen verschickt. Bitte versuchen Sie es später erneut.');
        return $this->db->transaction(function () use ($inviter, $email, $name): Customer {
            $existing = $this->customers->findByEmail($email);
            if ($existing !== null && $existing->companyId === $inviter->companyId) {
                throw DomainError::conflict('Diese Person gehört bereits zu Ihrem Firmenkonto.');
            }
            if ($existing !== null) {
                throw DomainError::conflict('Zu dieser E-Mail-Adresse gibt es bereits ein eigenes Kundenkonto. Bitte wenden Sie sich an uns, wenn die Person Ihrem Firmenkonto zugeordnet werden soll.');
            }
            $member = $this->customers->create($inviter->companyId, $email, $name, '');
            $this->notifications->memberInvited($email, $name, $this->companies->find($inviter->companyId)?->name ?? $inviter->name, $inviter->name);
            $this->audit->record('customer', $inviter->id, 'member.invite', 'customer', $member->id);
            return $member;
        });
    }

    public function removeMember(Customer $actor, int $memberId): void
    {
        $member = $this->customers->find($memberId);
        if ($member === null || $member->companyId !== $actor->companyId) {
            throw DomainError::notFound('Diese Person wurde nicht gefunden.');
        }
        if ($member->id === $actor->id) {
            throw DomainError::invalid('Um Ihr eigenes Konto zu entfernen, nutzen Sie bitte „Konto löschen“.');
        }
        $this->db->transaction(function () use ($actor, $member): void {
            $this->sessions->deleteForCustomer($member->id);
            $this->customers->delete($member->id);
            $this->audit->record('customer', $actor->id, 'member.remove', 'customer', $member->id);
        });
    }

    /**
     * Deletes a person. Their future appointments are cancelled (the owner
     * receives the calendar cancellations and a summary) and their past ones
     * deleted. When nobody is left in the company, the company and all its
     * bookings are deleted as well.
     */
    public function erase(Customer $customer, string $actorType, ?int $actorId, string $reason): void
    {
        $this->db->transaction(function () use ($customer, $actorType, $actorId, $reason): void {
            $future = $this->appointments->futureConfirmedForCustomer($customer->id);
            $cancelledBy = match ($actorType) {
                'admin' => 'owner',
                'system' => 'system',
                default => 'customer',
            };
            foreach ($future as $view) {
                $this->appointments->cancel($view->id, $cancelledBy, $reason);
                $this->notifications->appointmentCancelled($this->appointments->view($view->id), [], $reason);
            }
            if ($future !== []) {
                $this->notifications->accountDeleted($customer->name, count($future));
            }
            $this->appointments->deleteForCustomer($customer->id);
            $this->sessions->deleteForCustomer($customer->id);
            $this->customers->delete($customer->id);
            if ($this->companies->memberCount($customer->companyId) === 0) {
                $this->appointments->deleteForCompany($customer->companyId);
                $this->companies->delete($customer->companyId);
            }
            $this->audit->record($actorType, $actorId, 'customer.erase', 'customer', $customer->id);
        });
    }
}
```

- [ ] **Step 5: Add the getters to `booking/src/App.php`**

Add `use` lines:

```php
use TuBooking\Application\Accounts;
use TuBooking\Application\AppointmentChanges;
```

Add methods after `customerAuth()`:

```php
    public function changes(): AppointmentChanges
    {
        return $this->service('changes', AppointmentChanges::class, fn(): AppointmentChanges => new AppointmentChanges(
            $this->db(), $this->appointments(), $this->types(), $this->booking(), $this->notifications(), $this->audit(), $this->clock, $this->config,
        ));
    }

    public function accounts(): Accounts
    {
        return $this->service('accounts', Accounts::class, fn(): Accounts => new Accounts(
            $this->db(), $this->customers(), $this->companies(), $this->appointments(), $this->sessions(), $this->notifications(), $this->rateLimiter(), $this->audit(),
        ));
    }
```

- [ ] **Step 6: Run the tests**

Run: `npm run booking:test -- --filter CustomerChangesTest`
Expected: `OK (11 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 7: Commit**

```bash
git add booking/src/App.php booking/src/Application/AppointmentChanges.php booking/src/Application/Accounts.php booking/tests/Integration/CustomerChangesTest.php
git commit -m "feat(booking): customer cancel/reschedule, colleagues and account deletion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Admin authentication (setup, email code, authenticator)

**Files:**
- Create: `booking/src/Application/AdminAuth.php`
- Modify: `booking/src/App.php` (add `adminAuth()`)
- Test: `booking/tests/Integration/AdminAuthTest.php`

**Interfaces:**
- Consumes: `Admins`, `Sessions` (Task 8); `Codes` (Task 11); `Crypto`, `Totp` (Task 5); `RateLimiter`, `AuditLog` (Task 7); `Notifications` (Task 10)
- Produces:
  - `AdminAuth`:
    - `SESSION_HOURS = 12`, `PENDING_MINUTES = 15`
    - `setup(string $key, string $email, string $name, string $ip): void`: 403 on a wrong key, or once any admin is paired
    - `requestCode(string $email, string $ip): void`: silent for unknown addresses
    - `verifyCode(string $email, string $code, string $ip): array{token: string, state: 'needsTotp'|'needsPairing'}`: creates a pending session (15 minutes, second factor open)
    - `state(?Session): array{state: 'none'|'needsTotp'|'needsPairing'|'ok', admin: ?Admin}`
    - `startPairing(Session): array{secret: string, uri: string}`
    - `confirmPairing(Session, string $code): void`, `verifyTotp(Session, string $code): void`: both complete the session to 12 h; codes are rejected when replayed
    - `adminFor(Session): ?Admin`: only fully authenticated sessions
    - `logout(string $tokenHash): void`
    - `invite(Admin $actor, string $email, string $name): Admin`

- [ ] **Step 1: Write the failing test**

`booking/tests/Integration/AdminAuthTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Domain\DomainError;
use TuBooking\Infrastructure\Totp;
use TuBooking\Tests\Support\DatabaseTestCase;

final class AdminAuthTest extends DatabaseTestCase
{
    private const IP = '198.51.100.4';

    private function lastAdminCode(string $email): string
    {
        $this->app->outbox()->dispatch(50);
        foreach (array_reverse($this->mailer->to($email)) as $message) {
            if (preg_match('/^(\d{6}) – Anmeldung Verwaltung$/', $message->subject, $match) === 1) {
                return $match[1];
            }
        }
        self::fail("No admin code for $email");
    }

    /** @return array{token: string, secret: string} */
    private function setUpOwner(): array
    {
        $this->app->adminAuth()->setup('test-setup-key', 'Info@TayyipUenal.de', 'Tayyip Ünal', self::IP);
        $verified = $this->app->adminAuth()->verifyCode('info@tayyipuenal.de', $this->lastAdminCode('info@tayyipuenal.de'), self::IP);
        self::assertSame('needsPairing', $verified['state']);
        $session = $this->app->sessions()->find($this->app->crypto()->hash($verified['token']));
        self::assertNotNull($session);
        self::assertFalse($session->secondFactor);
        $pairing = $this->app->adminAuth()->startPairing($session);
        self::assertSame($pairing['secret'], $this->app->adminAuth()->startPairing($session)['secret'], 'a repeated start must show the same secret');
        self::assertStringStartsWith('otpauth://totp/Tayyip%20%C3%9Cnal%20Verwaltung%3Ainfo%40tayyipuenal.de?secret=', $pairing['uri']);
        $this->app->adminAuth()->confirmPairing($session, Totp::code($pairing['secret'], $this->clock->now()->getTimestamp()));
        return ['token' => $verified['token'], 'secret' => $pairing['secret']];
    }

    public function testSetupPairsTheFirstAdmin(): void
    {
        $owner = $this->setUpOwner();
        $session = $this->app->sessions()->find($this->app->crypto()->hash($owner['token']));
        self::assertNotNull($session);
        self::assertTrue($session->secondFactor);
        self::assertSame('2026-10-01 20:00', $session->expiresAt->format('Y-m-d H:i'));
        self::assertSame('ok', $this->app->adminAuth()->state($session)['state']);
        self::assertSame('info@tayyipuenal.de', $this->app->adminAuth()->adminFor($session)?->email);
        self::assertSame(1, $this->app->admins()->pairedCount());
        self::assertStringNotContainsString($owner['secret'], (string) $this->app->admins()->findByEmail('info@tayyipuenal.de')?->totpSecretEnc);
    }

    public function testSetupIsRefusedWithWrongKeyAndAfterPairing(): void
    {
        try {
            $this->app->adminAuth()->setup('wrong', 'x@example.com', 'X', self::IP);
            self::fail('Wrong key accepted');
        } catch (DomainError $error) {
            self::assertSame(403, $error->status);
        }
        $this->setUpOwner();
        $this->expectExceptionMessage('bereits eingerichtet');
        $this->app->adminAuth()->setup('test-setup-key', 'x@example.com', 'X', self::IP);
    }

    public function testLoginNeedsCodeAndAuthenticatorAndRejectsReplays(): void
    {
        $owner = $this->setUpOwner();
        $this->clock->advance('PT2M');
        $this->app->adminAuth()->requestCode('info@tayyipuenal.de', self::IP);
        $verified = $this->app->adminAuth()->verifyCode('info@tayyipuenal.de', $this->lastAdminCode('info@tayyipuenal.de'), self::IP);
        self::assertSame('needsTotp', $verified['state']);
        $session = $this->app->sessions()->find($this->app->crypto()->hash($verified['token']));
        self::assertNotNull($session);
        self::assertNull($this->app->adminAuth()->adminFor($session));
        try {
            $this->app->adminAuth()->verifyTotp($session, '000000' === Totp::code($owner['secret'], $this->clock->now()->getTimestamp()) ? '111111' : '000000');
            self::fail('Wrong authenticator code accepted');
        } catch (DomainError $error) {
            self::assertSame(422, $error->status);
        }
        $code = Totp::code($owner['secret'], $this->clock->now()->getTimestamp());
        $this->app->adminAuth()->verifyTotp($session, $code);
        self::assertSame('ok', $this->app->adminAuth()->state($this->app->sessions()->find($session->tokenHash))['state']);
        $again = $this->app->adminAuth()->verifyCode('info@tayyipuenal.de', $this->requestAndGetCode(), self::IP);
        $second = $this->app->sessions()->find($this->app->crypto()->hash($again['token']));
        self::assertNotNull($second);
        $this->expectExceptionMessage('nicht korrekt');
        $this->app->adminAuth()->verifyTotp($second, $code);
    }

    private function requestAndGetCode(): string
    {
        $this->app->adminAuth()->requestCode('info@tayyipuenal.de', self::IP);
        return $this->lastAdminCode('info@tayyipuenal.de');
    }

    public function testUnknownAddressesGetNothing(): void
    {
        $this->app->adminAuth()->requestCode('fremd@example.com', self::IP);
        $this->app->outbox()->dispatch();
        self::assertCount(0, $this->mailer->to('fremd@example.com'));
        $this->expectException(DomainError::class);
        $this->app->adminAuth()->verifyCode('fremd@example.com', '123456', self::IP);
    }

    public function testAuthenticatorAttemptsAreLimited(): void
    {
        $this->setUpOwner();
        $this->clock->advance('PT2M');
        $verified = $this->app->adminAuth()->verifyCode('info@tayyipuenal.de', $this->requestAndGetCode(), self::IP);
        $session = $this->app->sessions()->find($this->app->crypto()->hash($verified['token']));
        self::assertNotNull($session);
        // Pairing already used one of the 10 attempts in this 15-minute window.
        for ($i = 0; $i < 9; $i++) {
            try {
                $this->app->adminAuth()->verifyTotp($session, 'abcdef');
            } catch (DomainError $error) {
                self::assertSame(422, $error->status);
            }
        }
        try {
            $this->app->adminAuth()->verifyTotp($session, 'abcdef');
            self::fail('No limit');
        } catch (DomainError $error) {
            self::assertSame(429, $error->status);
        }
    }

    public function testInvitedAdminPairsOnFirstLogin(): void
    {
        $owner = $this->setUpOwner();
        $actor = $this->app->adminAuth()->adminFor($this->app->sessions()->find($this->app->crypto()->hash($owner['token'])) ?? self::fail());
        self::assertNotNull($actor);
        $this->app->adminAuth()->invite($actor, 'Assistenz@TayyipUenal.de', 'Büro');
        $this->app->outbox()->dispatch();
        self::assertSame('Einladung zur Verwaltung der Terminbuchung', $this->mailer->to('assistenz@tayyipuenal.de')[0]->subject);
        $this->app->adminAuth()->requestCode('assistenz@tayyipuenal.de', self::IP);
        $verified = $this->app->adminAuth()->verifyCode('assistenz@tayyipuenal.de', $this->lastAdminCode('assistenz@tayyipuenal.de'), self::IP);
        self::assertSame('needsPairing', $verified['state']);
        $this->expectExceptionMessage('bereits Zugang');
        $this->app->adminAuth()->invite($actor, 'assistenz@tayyipuenal.de', 'Büro');
    }

    public function testPendingSessionsExpire(): void
    {
        $this->app->adminAuth()->setup('test-setup-key', 'info@tayyipuenal.de', 'Tayyip Ünal', self::IP);
        $verified = $this->app->adminAuth()->verifyCode('info@tayyipuenal.de', $this->lastAdminCode('info@tayyipuenal.de'), self::IP);
        $this->clock->advance('PT16M');
        self::assertNull($this->app->sessions()->find($this->app->crypto()->hash($verified['token'])));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter AdminAuthTest`
Expected: FAIL. Error: `Call to undefined method TuBooking\App::adminAuth()`.

- [ ] **Step 3: Write `booking/src/Application/AdminAuth.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Config;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Email;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\Session;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Crypto;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\RateLimiter;
use TuBooking\Infrastructure\Repository\Admins;
use TuBooking\Infrastructure\Repository\Sessions;
use TuBooking\Infrastructure\Totp;
use TuBooking\Support\Clock;

/**
 * Admin login in two steps: an email code opens a pending session (15 min);
 * a code from the authenticator app completes it (12 h). The first login of
 * an admin without an authenticator pairs one instead. Authenticator codes
 * are accepted once only (the last used 30-second step is stored).
 */
final class AdminAuth
{
    public const SESSION_HOURS = 12;
    public const PENDING_MINUTES = 15;
    private const ISSUER = 'Tayyip Ünal Verwaltung';

    public function __construct(
        private readonly Database $db,
        private readonly Admins $admins,
        private readonly Sessions $sessions,
        private readonly Codes $codes,
        private readonly Crypto $crypto,
        private readonly RateLimiter $limiter,
        private readonly Notifications $notifications,
        private readonly AuditLog $audit,
        private readonly Clock $clock,
        private readonly Config $config,
    ) {
    }

    public function setup(string $key, string $email, string $name, string $ip): void
    {
        $expected = $this->config->string('secrets.setup_key');
        if (strlen($expected) < 12 || !hash_equals($expected, $key)) {
            throw DomainError::forbidden('Der Einrichtungslink ist ungültig.');
        }
        if ($this->admins->pairedCount() > 0) {
            throw DomainError::forbidden('Die Verwaltung ist bereits eingerichtet. Bitte melden Sie sich an.');
        }
        $email = Email::normalize($email);
        $this->codes->limit($email, $ip);
        $this->db->transaction(function () use ($email, $name): void {
            if ($this->admins->findByEmail($email) === null) {
                $this->admins->create($email, $name);
            }
            $this->codes->issue($email, Codes::PURPOSE_ADMIN);
        });
    }

    public function requestCode(string $email, string $ip): void
    {
        $email = Email::normalize($email);
        $this->codes->limit($email, $ip);
        if ($this->admins->findByEmail($email) !== null) {
            $this->db->transaction(fn() => $this->codes->issue($email, Codes::PURPOSE_ADMIN));
        }
    }

    /** @return array{token: string, state: 'needsTotp'|'needsPairing'} */
    public function verifyCode(string $email, string $code, string $ip): array
    {
        $email = Email::normalize($email);
        $this->codes->consume($email, Codes::PURPOSE_ADMIN, $code, $ip);
        $admin = $this->admins->findByEmail($email) ?? throw DomainError::invalid('Der Code ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Code an.');
        $token = $this->crypto->token();
        $this->sessions->create($this->crypto->hash($token), null, $admin->id, $this->clock->now()->add(new \DateInterval('PT' . self::PENDING_MINUTES . 'M')), false);
        return ['token' => $token, 'state' => $admin->isPaired() ? 'needsTotp' : 'needsPairing'];
    }

    /** @return array{state: 'none'|'needsTotp'|'needsPairing'|'ok', admin: ?Admin} */
    public function state(?Session $session): array
    {
        $admin = $session !== null && $session->adminId !== null ? $this->admins->find($session->adminId) : null;
        if ($session === null || $admin === null) {
            return ['state' => 'none', 'admin' => null];
        }
        if ($session->secondFactor) {
            return ['state' => 'ok', 'admin' => $admin];
        }
        return ['state' => $admin->isPaired() ? 'needsTotp' : 'needsPairing', 'admin' => $admin];
    }

    /** @return array{secret: string, uri: string} */
    public function startPairing(Session $session): array
    {
        $admin = $this->sessionAdmin($session);
        if ($admin->isPaired()) {
            throw DomainError::conflict('Die Authenticator-App ist bereits eingerichtet.');
        }
        // Only stored when none is pending, so a repeated or parallel call returns the same secret.
        $this->admins->setPendingSecret($admin->id, $this->crypto->encrypt(Totp::secret()));
        $pending = $this->admins->find($admin->id)?->totpPendingEnc ?? throw new \RuntimeException('Pending secret missing.');
        $secret = $this->crypto->decrypt($pending);
        return ['secret' => $secret, 'uri' => Totp::uri($secret, $admin->email, self::ISSUER)];
    }

    public function confirmPairing(Session $session, string $code): void
    {
        $admin = $this->sessionAdmin($session);
        $this->limitTotp($admin);
        if ($admin->totpPendingEnc === null) {
            throw DomainError::conflict('Bitte starten Sie die Einrichtung erneut.');
        }
        $step = Totp::match($this->crypto->decrypt($admin->totpPendingEnc), trim($code), $this->clock->now()->getTimestamp());
        if ($step === null) {
            throw DomainError::invalid('Der Code aus der Authenticator-App ist nicht korrekt.');
        }
        $this->db->transaction(function () use ($admin, $session, $step): void {
            $this->admins->activatePendingSecret($admin->id, $step);
            $this->complete($admin, $session, 'admin.pair');
        });
    }

    public function verifyTotp(Session $session, string $code): void
    {
        $admin = $this->sessionAdmin($session);
        $this->limitTotp($admin);
        if ($admin->totpSecretEnc === null) {
            throw DomainError::conflict('Bitte richten Sie zuerst die Authenticator-App ein.');
        }
        $step = Totp::match($this->crypto->decrypt($admin->totpSecretEnc), trim($code), $this->clock->now()->getTimestamp());
        if ($step === null || ($admin->totpLastStep !== null && $step <= $admin->totpLastStep)) {
            throw DomainError::invalid('Der Code aus der Authenticator-App ist nicht korrekt.');
        }
        $this->db->transaction(function () use ($admin, $session, $step): void {
            $this->admins->recordStep($admin->id, $step);
            $this->complete($admin, $session, 'admin.login');
        });
    }

    public function adminFor(Session $session): ?Admin
    {
        if ($session->adminId === null || !$session->secondFactor) {
            return null;
        }
        return $this->admins->find($session->adminId);
    }

    public function logout(string $tokenHash): void
    {
        $this->sessions->delete($tokenHash);
    }

    public function invite(Admin $actor, string $email, string $name): Admin
    {
        $email = Email::normalize($email);
        if ($this->admins->findByEmail($email) !== null) {
            throw DomainError::conflict('Diese Person hat bereits Zugang zur Verwaltung.');
        }
        return $this->db->transaction(function () use ($actor, $email, $name): Admin {
            $admin = $this->admins->create($email, $name);
            $this->notifications->adminInvited($email, $name);
            $this->audit->record('admin', $actor->id, 'admin.invite', 'admin', $admin->id);
            return $admin;
        });
    }

    private function sessionAdmin(Session $session): Admin
    {
        $admin = $session->adminId !== null ? $this->admins->find($session->adminId) : null;
        if ($admin === null) {
            throw DomainError::unauthorized('Bitte melden Sie sich erneut an.');
        }
        return $admin;
    }

    private function limitTotp(Admin $admin): void
    {
        $this->limiter->hit('totp:admin:' . $admin->id, 10, 900, 'Zu viele Versuche. Bitte warten Sie 15 Minuten.');
    }

    private function complete(Admin $admin, Session $session, string $action): void
    {
        $this->sessions->completeSecondFactor($session->tokenHash, $this->clock->now()->add(new \DateInterval('PT' . self::SESSION_HOURS . 'H')));
        $this->admins->touchLogin($admin->id);
        $this->audit->record('admin', $admin->id, $action, 'admin', $admin->id);
    }
}
```

- [ ] **Step 4: Add the getter to `booking/src/App.php`**

Add `use TuBooking\Application\AdminAuth;` and, after `accounts()`:

```php
    public function adminAuth(): AdminAuth
    {
        return $this->service('adminAuth', AdminAuth::class, fn(): AdminAuth => new AdminAuth(
            $this->db(), $this->admins(), $this->sessions(), $this->codes(), $this->crypto(), $this->rateLimiter(),
            $this->notifications(), $this->audit(), $this->clock, $this->config,
        ));
    }
```

- [ ] **Step 5: Run the tests**

Run: `npm run booking:test -- --filter AdminAuthTest`
Expected: `OK (7 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 6: Commit**

```bash
git add booking/src/App.php booking/src/Application/AdminAuth.php booking/tests/Integration/AdminAuthTest.php
git commit -m "feat(booking): admin setup, email code and authenticator login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Admin operations

**Files:**
- Create: `booking/src/Application/AdminSchedule.php`, `AdminAppointments.php`, `AdminCustomers.php`, `AdminSettings.php`
- Modify: `booking/src/Infrastructure/Repository/Appointments.php` (add `reassignCompany()`, `countForCompany()`)
- Modify: `booking/src/App.php` (add four getters)
- Test: `booking/tests/Integration/AdminOperationsTest.php`

**Interfaces:**
- Consumes: `Booking` (`lockHost`, `newReference`, `recipients`), `Accounts::erase`, `Notifications`, the repositories, `Outbox`, `AuditLog`
- Produces:
  - `AdminSchedule`:
    - `types(): list<AppointmentType>`, `saveType(Admin, ?int $id, TypeFields $fields): AppointmentType`
    - `rules(): list<array{typeId: ?int, weekday: int, start: string, end: string}>`, `replaceRules(Admin, ?int $typeId, list<WeeklyWindow>): void`
    - `absences(): list<array{id: int, start: \DateTimeImmutable, end: \DateTimeImmutable, note: string}>`, `addAbsence(Admin, \DateTimeImmutable, \DateTimeImmutable, string): int`, `deleteAbsence(Admin, int): void`
  - `AdminAppointments`:
    - `list(\DateTimeImmutable $from, \DateTimeImmutable $to, ?AppointmentStatus): list<AppointmentView>`
    - `create(Admin, BookingRequest, bool $force): AppointmentView`
    - `cancel(Admin, string $reference, string $reason): AppointmentView`
    - `reschedule(Admin, string $reference, \DateTimeImmutable $start, bool $force): AppointmentView`
    - Availability rules do not apply to the owner. An overlap with appointments or absences gives 409 unless `$force` is set.
  - `AdminCustomers`:
    - `search(string): list<…Companies::search shape>`, `company(int): array{company: Company, members: list<Customer>, appointments: list<AppointmentView>}`
    - `renameCompany(Admin, int, ?string): void`, `addMember(Admin, int $companyId, string $email, string $name): Customer`
    - `updateCustomer(Admin, int $id, string $name, string $phone, ?int $companyId): Customer`, `deleteCustomer(Admin, int $id): void`
  - `AdminSettings`:
    - `failedEmails(): list<…>`, `retryEmail(Admin, int): void`, `admins(): list<Admin>`
    - `auditLog(): list<…>`, `ownerEmail(): string`, `setOwnerEmail(Admin, string): void`
    - `export(): array<string, mixed>`
  - `Appointments::reassignCompany(int $customerId, int $companyId): void`, `Appointments::countForCompany(int $companyId): int`
  - `App` getters: `adminSchedule()`, `adminAppointments()`, `adminCustomers()`, `adminSettings()`

- [ ] **Step 1: Write the failing test**

`booking/tests/Integration/AdminOperationsTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Application\BookingRequest;
use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\WeeklyWindow;
use TuBooking\Tests\Support\DatabaseTestCase;

final class AdminOperationsTest extends DatabaseTestCase
{
    private Admin $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->app->admins()->create('info@tayyipuenal.de', 'Tayyip Ünal');
    }

    private function request(string $start, string $email = 'neu@kunde.de', Mode $mode = Mode::Phone): BookingRequest
    {
        return new BookingRequest('erstgespraech', new \DateTimeImmutable($start), $mode, 'Nina Neu', $email, 'Neu KG', '0231 7', '', 'Telefonisch gebucht');
    }

    /** @return array{slug: string, title: string, description: string, durationMin: int, modes: list<Mode>, bufferMin: int, slotStepMin: int, leadTimeH: int, horizonDays: int, videoLink: ?string, active: bool, sort: int} */
    private function fields(string $slug): array
    {
        return ['slug' => $slug, 'title' => 'Auditvorbereitung', 'description' => '', 'durationMin' => 60, 'modes' => [Mode::Onsite, Mode::Video], 'bufferMin' => 30, 'slotStepMin' => 60, 'leadTimeH' => 48, 'horizonDays' => 90, 'videoLink' => null, 'active' => true, 'sort' => 2];
    }

    public function testTypesAvailabilityAndAbsences(): void
    {
        $schedule = $this->app->adminSchedule();
        try {
            $schedule->saveType($this->admin, null, $this->fields('Audit Vorbereitung'));
            self::fail('Invalid slug accepted');
        } catch (DomainError $error) {
            self::assertSame(422, $error->status);
        }
        $type = $schedule->saveType($this->admin, null, $this->fields('audit'));
        self::assertSame('Auditvorbereitung', $type->title);
        try {
            $schedule->saveType($this->admin, null, $this->fields('audit'));
            self::fail('Duplicate slug accepted');
        } catch (DomainError $error) {
            self::assertSame(409, $error->status);
        }
        $schedule->replaceRules($this->admin, $type->id, [new WeeklyWindow(2, '10:00', '12:00')]);
        self::assertCount(6, $schedule->rules());
        try {
            $schedule->addAbsence($this->admin, new \DateTimeImmutable('2026-10-05T10:00:00Z'), new \DateTimeImmutable('2026-10-05T09:00:00Z'), '');
            self::fail('Absence ending before it starts accepted');
        } catch (DomainError $error) {
            self::assertSame(422, $error->status);
        }
        $absence = $schedule->addAbsence($this->admin, new \DateTimeImmutable('2026-10-04T22:00:00Z'), new \DateTimeImmutable('2026-10-05T22:00:00Z'), 'Seminar');
        $first = $this->app->booking()->activeType('erstgespraech');
        self::assertSame([], $this->app->booking()->days($first, '2026-10-05', '2026-10-05', null)['2026-10-05']);
        self::assertCount(1, $schedule->absences());
        $schedule->deleteAbsence($this->admin, $absence);
        self::assertCount(16, $this->app->booking()->days($first, '2026-10-05', '2026-10-05', null)['2026-10-05']);
        $this->expectException(DomainError::class);
        $schedule->deleteAbsence($this->admin, $absence);
    }

    public function testOwnerBooksPhonedInAppointmentForNewCustomer(): void
    {
        $view = $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-03T08:00:00Z'), false);
        self::assertSame([AppointmentStatus::Confirmed, 'Nina Neu', 'Neu KG'], [$view->status, $view->customerName, $view->companyName]);
        $this->app->outbox()->dispatch(50);
        self::assertStringStartsWith('Termin bestätigt:', $this->mailer->to('neu@kunde.de')[0]->subject);
        self::assertStringStartsWith('Neuer Termin:', $this->mailer->to('info@tayyipuenal.de')[0]->subject);
    }

    public function testOverlapsNeedForce(): void
    {
        $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-05T08:00:00Z'), false);
        try {
            $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-05T08:15:00Z', 'zweite@kunde.de'), false);
            self::fail('Overlap accepted without force');
        } catch (DomainError $error) {
            self::assertSame(409, $error->status);
            self::assertStringContainsString('Überschneidung mit Kostenloses Erstgespräch', $error->getMessage());
        }
        $forced = $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-05T08:15:00Z', 'zweite@kunde.de'), true);
        self::assertSame(AppointmentStatus::Confirmed, $forced->status);
    }

    public function testOwnerCancelsWithMessageAndReachesMembersWhenBookerIsGone(): void
    {
        $view = $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-05T08:00:00Z'), false);
        $colleague = $this->app->adminCustomers()->addMember($this->admin, (int) $view->companyId, 'kollege@kunde.de', 'Kai Kollege');
        $this->app->accounts()->removeMember($colleague, (int) $view->customerId);
        $this->mailer->sent = [];
        $this->app->outbox()->dispatch(50);
        $this->mailer->sent = [];
        $cancelled = $this->app->adminAppointments()->cancel($this->admin, $view->reference, 'Krankheit');
        self::assertSame('owner', $cancelled->cancelledBy);
        $this->app->outbox()->dispatch(50);
        $message = $this->mailer->to('kollege@kunde.de')[0];
        self::assertStringContainsString('Nachricht von Tayyip Ünal: Krankheit', $message->text);
        self::assertSame('CANCEL', $message->calendar['method'] ?? null);
    }

    public function testOwnerReschedulesOutsideTheWeeklyHours(): void
    {
        $view = $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-05T08:00:00Z'), false);
        $moved = $this->app->adminAppointments()->reschedule($this->admin, $view->reference, new \DateTimeImmutable('2026-10-10T08:00:00Z'), false);
        self::assertSame(['2026-10-10 08:00', 1], [$moved->start->format('Y-m-d H:i'), $moved->sequence]);
        self::assertCount(1, $this->app->adminAppointments()->list(new \DateTimeImmutable('2026-10-10T00:00:00Z'), new \DateTimeImmutable('2026-10-11T00:00:00Z'), null));
    }

    public function testCustomersCanBeFoundMovedAndDeleted(): void
    {
        $view = $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-05T08:00:00Z'), false);
        $target = $this->app->companies()->create('Ziel GmbH');
        self::assertSame('Neu KG', $this->app->adminCustomers()->search('neu@kunde')[0]['name']);
        $moved = $this->app->adminCustomers()->updateCustomer($this->admin, (int) $view->customerId, 'Nina Neu-Muster', '0231 8', $target);
        self::assertSame($target, $moved->companyId);
        self::assertSame($target, $this->app->appointments()->view($view->id)->companyId);
        self::assertNull($this->app->companies()->find((int) $view->companyId));
        self::assertCount(1, $this->app->adminCustomers()->company($target)['appointments']);
        try {
            $this->app->adminCustomers()->addMember($this->admin, $target, 'neu@kunde.de', 'Doppelt');
            self::fail('Existing address added twice');
        } catch (DomainError $error) {
            self::assertSame(409, $error->status);
        }
        $this->app->adminCustomers()->deleteCustomer($this->admin, $moved->id);
        self::assertNull($this->app->customers()->find($moved->id));
        self::assertNull($this->app->companies()->find($target));
    }

    public function testSettingsFailedEmailsAndExport(): void
    {
        $settings = $this->app->adminSettings();
        try {
            $settings->setOwnerEmail($this->admin, 'kein-email');
            self::fail('Invalid owner email accepted');
        } catch (DomainError $error) {
            self::assertSame(422, $error->status);
        }
        $settings->setOwnerEmail($this->admin, ' Termine@TayyipUenal.de ');
        self::assertSame('termine@tayyipuenal.de', $settings->ownerEmail());
        $this->mailer->fail = true;
        $this->app->adminAppointments()->create($this->admin, $this->request('2026-10-05T08:00:00Z'), false);
        for ($i = 0; $i < 5; $i++) {
            $this->app->outbox()->dispatch(50);
            $this->clock->advance('P1D');
        }
        $failed = $settings->failedEmails();
        self::assertCount(2, $failed);
        $this->mailer->fail = false;
        $settings->retryEmail($this->admin, $failed[0]['id']);
        self::assertSame(['sent' => 1, 'failed' => 0], $this->app->outbox()->dispatch(50));
        $export = $settings->export();
        self::assertSame('neu@kunde.de', $export['customers'][0]['email']);
        self::assertCount(1, $export['appointments']);
        self::assertSame('erstgespraech', $export['appointmentTypes'][0]['slug']);
        self::assertSame('admin', $settings->auditLog()[0]['actorType']);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter AdminOperationsTest`
Expected: FAIL. Error: `Call to undefined method TuBooking\App::adminSchedule()`.

- [ ] **Step 3: Add two methods to `booking/src/Infrastructure/Repository/Appointments.php`**

Insert after `deleteForCompany()`:

```php
    /** Moves a person's appointments along with the person to another company. */
    public function reassignCompany(int $customerId, int $companyId): void
    {
        $this->db->execute('UPDATE appointments SET company_id = ? WHERE customer_id = ?', [$companyId, $customerId]);
    }

    public function countForCompany(int $companyId): int
    {
        return (int) $this->db->scalar('SELECT COUNT(*) FROM appointments WHERE company_id = ?', [$companyId]);
    }
```

- [ ] **Step 4: Write `booking/src/Application/AdminSchedule.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\DomainError;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\AppointmentType;
use TuBooking\Domain\WeeklyWindow;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Repository\Absences;
use TuBooking\Infrastructure\Repository\AppointmentTypes;
use TuBooking\Infrastructure\Repository\AvailabilityRules;
use TuBooking\Support\Clock;

/** @phpstan-import-type TypeFields from AppointmentTypes */
final class AdminSchedule
{
    public function __construct(
        private readonly Database $db,
        private readonly AppointmentTypes $types,
        private readonly AvailabilityRules $rules,
        private readonly Absences $absences,
        private readonly AuditLog $audit,
        private readonly Clock $clock,
    ) {
    }

    /** @return list<AppointmentType> */
    public function types(): array
    {
        return $this->types->all();
    }

    /** @param TypeFields $fields */
    public function saveType(Admin $admin, ?int $id, array $fields): AppointmentType
    {
        if (preg_match('/^[a-z0-9-]{2,60}$/', $fields['slug']) !== 1) {
            throw DomainError::invalid('Die Kurzbezeichnung darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.');
        }
        if ($fields['modes'] === []) {
            throw DomainError::invalid('Bitte wählen Sie mindestens eine Terminform.');
        }
        if ($id !== null && $this->types->find($id) === null) {
            throw DomainError::notFound('Diese Terminart wurde nicht gefunden.');
        }
        $existing = $this->types->bySlug($fields['slug']);
        if ($existing !== null && $existing->id !== $id) {
            throw DomainError::conflict('Diese Kurzbezeichnung ist bereits vergeben.');
        }
        $savedId = $this->db->transaction(function () use ($admin, $id, $fields): int {
            if ($id === null) {
                $id = $this->types->create($fields);
            } else {
                $this->types->update($id, $fields);
            }
            $this->audit->record('admin', $admin->id, 'type.save', 'appointment_type', $id);
            return $id;
        });
        return $this->types->find($savedId) ?? throw new \RuntimeException('Type disappeared.');
    }

    /** @return list<array{typeId: ?int, weekday: int, start: string, end: string}> */
    public function rules(): array
    {
        return $this->rules->all();
    }

    /** @param list<WeeklyWindow> $windows */
    public function replaceRules(Admin $admin, ?int $typeId, array $windows): void
    {
        if ($typeId !== null && $this->types->find($typeId) === null) {
            throw DomainError::notFound('Diese Terminart wurde nicht gefunden.');
        }
        $this->db->transaction(function () use ($admin, $typeId, $windows): void {
            $this->rules->replace($typeId, $windows);
            $this->audit->record('admin', $admin->id, 'availability.replace', 'appointment_type', $typeId);
        });
    }

    /** @return list<array{id: int, start: \DateTimeImmutable, end: \DateTimeImmutable, note: string}> */
    public function absences(): array
    {
        return $this->absences->upcoming($this->clock->now());
    }

    public function addAbsence(Admin $admin, \DateTimeImmutable $start, \DateTimeImmutable $end, string $note): int
    {
        if ($end <= $start) {
            throw DomainError::invalid('Das Ende muss nach dem Beginn liegen.');
        }
        return $this->db->transaction(function () use ($admin, $start, $end, $note): int {
            $id = $this->absences->create($start, $end, $note);
            $this->audit->record('admin', $admin->id, 'absence.create', 'absence', $id);
            return $id;
        });
    }

    public function deleteAbsence(Admin $admin, int $id): void
    {
        if (!$this->absences->delete($id)) {
            throw DomainError::notFound('Diese Abwesenheit wurde nicht gefunden.');
        }
        $this->audit->record('admin', $admin->id, 'absence.delete', 'absence', $id);
    }
}
```

- [ ] **Step 5: Write `booking/src/Application/AdminAppointments.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Interval;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Reference;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Repository\Absences;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\AppointmentTypes;
use TuBooking\Infrastructure\Repository\Companies;
use TuBooking\Infrastructure\Repository\Customers;

/**
 * The owner's view of appointments. Weekly hours and notice periods do not
 * bind the owner; an overlap with another appointment or an absence is shown
 * as a 409 and saved only when the owner confirms ($force).
 */
final class AdminAppointments
{
    public function __construct(
        private readonly Database $db,
        private readonly Appointments $appointments,
        private readonly AppointmentTypes $types,
        private readonly Absences $absences,
        private readonly Customers $customers,
        private readonly Companies $companies,
        private readonly Booking $booking,
        private readonly Notifications $notifications,
        private readonly AuditLog $audit,
    ) {
    }

    /** @return list<AppointmentView> */
    public function list(\DateTimeImmutable $from, \DateTimeImmutable $to, ?AppointmentStatus $status): array
    {
        return $this->appointments->between($from, $to, $status);
    }

    public function create(Admin $admin, BookingRequest $request, bool $force): AppointmentView
    {
        $type = $this->types->bySlug($request->typeSlug) ?? throw DomainError::notFound('Diese Terminart wurde nicht gefunden.');
        if (!$type->allows($request->mode)) {
            throw DomainError::invalid('Diese Terminform ist für die Terminart nicht vorgesehen.');
        }
        if ($request->mode === Mode::Onsite && $request->address === '') {
            throw DomainError::invalid('Bitte geben Sie die Adresse für den Termin vor Ort an.');
        }
        $end = $request->start->add(new \DateInterval('PT' . $type->durationMin . 'M'));
        return $this->db->transaction(function () use ($admin, $request, $type, $end, $force): AppointmentView {
            $this->booking->lockHost();
            $this->assertNoConflict(new Interval($request->start, $end), null, $force);
            $customer = $this->customers->findByEmail($request->email)
                ?? $this->customers->create($this->companies->create($request->company !== '' ? $request->company : null), $request->email, $request->name, $request->phone);
            $id = $this->appointments->createConfirmed(
                $this->booking->newReference(), $type->id, $customer->id, $customer->companyId, $request->start, $end, $request->mode,
                $request->phone !== '' ? $request->phone : $customer->phone, $request->address, $request->note,
            );
            $view = $this->appointments->view($id);
            $this->notifications->appointmentConfirmed($view, [['email' => $customer->email, 'name' => $customer->name]]);
            $this->audit->record('admin', $admin->id, 'appointment.create', 'appointment', $id);
            return $view;
        });
    }

    public function cancel(Admin $admin, string $reference, string $reason): AppointmentView
    {
        $view = $this->find($reference);
        if ($view->status === AppointmentStatus::Cancelled) {
            return $view;
        }
        return $this->db->transaction(function () use ($admin, $view, $reason): AppointmentView {
            $this->appointments->cancel($view->id, 'owner', $reason);
            $updated = $this->appointments->view($view->id);
            $this->notifications->appointmentCancelled($updated, $this->booking->recipients($updated, null), $reason);
            $this->audit->record('admin', $admin->id, 'appointment.cancel', 'appointment', $view->id);
            return $updated;
        });
    }

    public function reschedule(Admin $admin, string $reference, \DateTimeImmutable $start, bool $force): AppointmentView
    {
        $view = $this->find($reference);
        if ($view->status !== AppointmentStatus::Confirmed) {
            throw DomainError::conflict('Nur bestätigte Termine können verschoben werden.');
        }
        $type = $this->types->find($view->typeId) ?? throw DomainError::notFound('Diese Terminart wurde nicht gefunden.');
        $end = $start->add(new \DateInterval('PT' . $type->durationMin . 'M'));
        return $this->db->transaction(function () use ($admin, $view, $start, $end, $force): AppointmentView {
            $this->booking->lockHost();
            $this->assertNoConflict(new Interval($start, $end), $view->id, $force);
            $this->appointments->reschedule($view->id, $start, $end);
            $updated = $this->appointments->view($view->id);
            $this->notifications->appointmentRescheduled($updated, $view->start, $this->booking->recipients($updated, null));
            $this->audit->record('admin', $admin->id, 'appointment.reschedule', 'appointment', $view->id);
            return $updated;
        });
    }

    private function find(string $reference): AppointmentView
    {
        $view = Reference::isValid($reference) ? $this->appointments->viewByReference($reference, null) : null;
        if ($view === null || $view->status === AppointmentStatus::Held) {
            throw DomainError::notFound('Dieser Termin wurde nicht gefunden.');
        }
        return $view;
    }

    private function assertNoConflict(Interval $interval, ?int $excludeId, bool $force): void
    {
        if ($force) {
            return;
        }
        $conflicts = [];
        foreach ($this->appointments->conflicting($interval, $excludeId) as $other) {
            $conflicts[] = $other->typeTitle . ' (' . $other->reference . ')';
        }
        if ($this->absences->overlapping($interval->start, $interval->end) !== []) {
            $conflicts[] = 'einer eingetragenen Abwesenheit';
        }
        if ($conflicts !== []) {
            throw DomainError::conflict('Überschneidung mit ' . implode(', ', $conflicts) . '. Zum Speichern bitte „Trotzdem speichern“ wählen.');
        }
    }
}
```

- [ ] **Step 6: Write `booking/src/Application/AdminCustomers.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\DomainError;
use TuBooking\Domain\Email;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Company;
use TuBooking\Domain\Model\Customer;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\Companies;
use TuBooking\Infrastructure\Repository\Customers;

final class AdminCustomers
{
    public function __construct(
        private readonly Database $db,
        private readonly Companies $companies,
        private readonly Customers $customers,
        private readonly Appointments $appointments,
        private readonly Accounts $accounts,
        private readonly Notifications $notifications,
        private readonly AuditLog $audit,
    ) {
    }

    /** @return list<array{id: int, name: ?string, members: list<array{id: int, name: string, email: string}>, appointments: int}> */
    public function search(string $term): array
    {
        return $this->companies->search($term);
    }

    /** @return array{company: Company, members: list<Customer>, appointments: list<AppointmentView>} */
    public function company(int $id): array
    {
        $company = $this->companies->find($id) ?? throw DomainError::notFound('Diese Firma wurde nicht gefunden.');
        return ['company' => $company, 'members' => $this->customers->members($id), 'appointments' => $this->appointments->forCompany($id)];
    }

    public function renameCompany(Admin $admin, int $id, ?string $name): void
    {
        if ($this->companies->find($id) === null) {
            throw DomainError::notFound('Diese Firma wurde nicht gefunden.');
        }
        $this->companies->rename($id, $name);
        $this->audit->record('admin', $admin->id, 'company.rename', 'company', $id);
    }

    public function addMember(Admin $admin, int $companyId, string $email, string $name): Customer
    {
        $email = Email::normalize($email);
        $company = $this->companies->find($companyId) ?? throw DomainError::notFound('Diese Firma wurde nicht gefunden.');
        if ($this->customers->findByEmail($email) !== null) {
            throw DomainError::conflict('Zu dieser E-Mail-Adresse gibt es bereits ein Kundenkonto. Verschieben Sie die Person stattdessen in diese Firma.');
        }
        return $this->db->transaction(function () use ($admin, $company, $email, $name): Customer {
            $member = $this->customers->create($company->id, $email, $name, '');
            $this->notifications->memberInvited($email, $name, $company->name ?? $name, 'Tayyip Ünal');
            $this->audit->record('admin', $admin->id, 'member.add', 'customer', $member->id);
            return $member;
        });
    }

    public function updateCustomer(Admin $admin, int $id, string $name, string $phone, ?int $companyId): Customer
    {
        $customer = $this->customers->find($id) ?? throw DomainError::notFound('Diese Person wurde nicht gefunden.');
        if ($companyId !== null && $this->companies->find($companyId) === null) {
            throw DomainError::notFound('Diese Firma wurde nicht gefunden.');
        }
        $this->db->transaction(function () use ($admin, $customer, $name, $phone, $companyId): void {
            $this->customers->update($customer->id, $name, $phone);
            if ($companyId !== null && $companyId !== $customer->companyId) {
                $this->customers->moveToCompany($customer->id, $companyId);
                $this->appointments->reassignCompany($customer->id, $companyId);
                if ($this->companies->memberCount($customer->companyId) === 0 && $this->appointments->countForCompany($customer->companyId) === 0) {
                    $this->companies->delete($customer->companyId);
                }
            }
            $this->audit->record('admin', $admin->id, 'customer.update', 'customer', $customer->id);
        });
        return $this->customers->find($id) ?? throw new \RuntimeException('Customer disappeared.');
    }

    public function deleteCustomer(Admin $admin, int $id): void
    {
        $customer = $this->customers->find($id) ?? throw DomainError::notFound('Diese Person wurde nicht gefunden.');
        $this->accounts->erase($customer, 'admin', $admin->id, 'Kundenkonto durch die Verwaltung gelöscht');
    }
}
```

- [ ] **Step 7: Write `booking/src/Application/AdminSettings.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Domain\DomainError;
use TuBooking\Domain\Email;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\AppointmentType;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Company;
use TuBooking\Domain\Model\Customer;
use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Outbox;
use TuBooking\Infrastructure\Repository\Absences;
use TuBooking\Infrastructure\Repository\Admins;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\AppointmentTypes;
use TuBooking\Infrastructure\Repository\AvailabilityRules;
use TuBooking\Infrastructure\Repository\Companies;
use TuBooking\Infrastructure\Repository\Customers;
use TuBooking\Infrastructure\Repository\Settings;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

final class AdminSettings
{
    public function __construct(
        private readonly Outbox $outbox,
        private readonly Admins $admins,
        private readonly AuditLog $audit,
        private readonly Settings $settings,
        private readonly Notifications $notifications,
        private readonly Companies $companies,
        private readonly Customers $customers,
        private readonly Appointments $appointments,
        private readonly AppointmentTypes $types,
        private readonly AvailabilityRules $rules,
        private readonly Absences $absences,
        private readonly Clock $clock,
    ) {
    }

    /** @return list<array{id: int, kind: string, recipient: string, attempts: int, lastError: string, createdAt: string}> */
    public function failedEmails(): array
    {
        return $this->outbox->failed();
    }

    public function retryEmail(Admin $admin, int $id): void
    {
        if (!$this->outbox->retry($id)) {
            throw DomainError::notFound('Diese E-Mail wurde nicht gefunden.');
        }
        $this->audit->record('admin', $admin->id, 'outbox.retry', 'outbox', $id);
    }

    /** @return list<Admin> */
    public function admins(): array
    {
        return $this->admins->all();
    }

    /** @return list<array{actorType: string, actorId: ?int, action: string, subjectType: string, subjectId: ?int, createdAt: string}> */
    public function auditLog(): array
    {
        return $this->audit->latest();
    }

    public function ownerEmail(): string
    {
        return $this->notifications->owner()['email'];
    }

    public function setOwnerEmail(Admin $admin, string $email): void
    {
        $email = Email::normalize($email);
        if (!Email::isValid($email)) {
            throw DomainError::invalid('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        }
        $this->settings->set('owner_email', $email);
        $this->audit->record('admin', $admin->id, 'settings.owner_email', 'settings', null);
    }

    /** @return array<string, mixed> Everything the module stores about customers and bookings (Art. 15/20 DSGVO, backups). */
    public function export(): array
    {
        return [
            'exportedAt' => Time::iso($this->clock->now()),
            'companies' => array_map(static fn(Company $c): array => ['id' => $c->id, 'name' => $c->name], $this->companies->all()),
            'customers' => array_map(static fn(Customer $c): array => ['id' => $c->id, 'companyId' => $c->companyId, 'email' => $c->email, 'name' => $c->name, 'phone' => $c->phone], $this->customers->all()),
            'appointments' => array_map(static fn(AppointmentView $a): array => [
                'reference' => $a->reference, 'type' => $a->typeSlug, 'start' => Time::iso($a->start), 'end' => Time::iso($a->end),
                'mode' => $a->mode->value, 'status' => $a->status->value, 'customerId' => $a->customerId, 'companyId' => $a->companyId,
                'phone' => $a->phone, 'address' => $a->address, 'note' => $a->note, 'cancelledBy' => $a->cancelledBy, 'cancelReason' => $a->cancelReason,
                'createdAt' => Time::iso($a->createdAt),
            ], $this->appointments->allViews()),
            'appointmentTypes' => array_map(static fn(AppointmentType $t): array => [
                'id' => $t->id, 'slug' => $t->slug, 'title' => $t->title, 'durationMin' => $t->durationMin,
                'modes' => array_map(static fn(Mode $m): string => $m->value, $t->modes), 'active' => $t->active,
            ], $this->types->all()),
            'availability' => $this->rules->all(),
            'absences' => array_map(static fn(array $a): array => ['start' => Time::iso($a['start']), 'end' => Time::iso($a['end']), 'note' => $a['note']], $this->absences->upcoming($this->clock->now())),
        ];
    }
}
```

- [ ] **Step 8: Add the getters to `booking/src/App.php`**

Add `use` lines:

```php
use TuBooking\Application\AdminAppointments;
use TuBooking\Application\AdminCustomers;
use TuBooking\Application\AdminSchedule;
use TuBooking\Application\AdminSettings;
```

Add methods after `adminAuth()`:

```php
    public function adminSchedule(): AdminSchedule
    {
        return $this->service('adminSchedule', AdminSchedule::class, fn(): AdminSchedule => new AdminSchedule(
            $this->db(), $this->types(), $this->rules(), $this->absences(), $this->audit(), $this->clock,
        ));
    }

    public function adminAppointments(): AdminAppointments
    {
        return $this->service('adminAppointments', AdminAppointments::class, fn(): AdminAppointments => new AdminAppointments(
            $this->db(), $this->appointments(), $this->types(), $this->absences(), $this->customers(), $this->companies(),
            $this->booking(), $this->notifications(), $this->audit(),
        ));
    }

    public function adminCustomers(): AdminCustomers
    {
        return $this->service('adminCustomers', AdminCustomers::class, fn(): AdminCustomers => new AdminCustomers(
            $this->db(), $this->companies(), $this->customers(), $this->appointments(), $this->accounts(), $this->notifications(), $this->audit(),
        ));
    }

    public function adminSettings(): AdminSettings
    {
        return $this->service('adminSettings', AdminSettings::class, fn(): AdminSettings => new AdminSettings(
            $this->outbox(), $this->admins(), $this->audit(), $this->settings(), $this->notifications(), $this->companies(),
            $this->customers(), $this->appointments(), $this->types(), $this->rules(), $this->absences(), $this->clock,
        ));
    }
```

- [ ] **Step 9: Run the tests**

Run: `npm run booking:test -- --filter AdminOperationsTest`
Expected: `OK (7 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 10: Commit**

```bash
git add booking/src/App.php booking/src/Application booking/src/Infrastructure/Repository/Appointments.php booking/tests/Integration/AdminOperationsTest.php
git commit -m "feat(booking): owner operations for schedule, appointments, customers and settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Maintenance (retries, reminders, retention)

**Files:**
- Create: `booking/src/Application/Maintenance.php`
- Modify: `booking/src/App.php` (add `maintenance()`)
- Test: `booking/tests/Integration/MaintenanceTest.php`

**Interfaces:**
- Consumes: `Outbox`, `Appointments`, `LoginCodes`, `Sessions`, `RateLimiter`, `IdempotencyKeys`, `Customers`, `Accounts::erase`, `Booking::recipients`, `Notifications`, `AuditLog`, `Logger`
- Produces:
  - `Maintenance`:
    - `INTERVAL_MINUTES = 15`
    - `run(string $trigger /* cron|piggyback|manual */): ?array<string, int>`: null when another run is active or one started less than 60 s ago
    - `piggyback(): void`: runs only when the last run is older than 15 minutes
    - `lastRun(): ?array{trigger: string, startedAt: string, finishedAt: ?string, stats: array<string, mixed>}`

- [ ] **Step 1: Write the failing test**

`booking/tests/Integration/MaintenanceTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\Application\BookingRequest;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Tests\Support\DatabaseTestCase;

final class MaintenanceTest extends DatabaseTestCase
{
    private Admin $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->app->admins()->create('info@tayyipuenal.de', 'Tayyip Ünal');
    }

    private function appointmentIn20Hours(): AppointmentView
    {
        $request = new BookingRequest('erstgespraech', new \DateTimeImmutable('2026-10-02T04:00:00Z'), Mode::Phone, 'Nina Neu', 'nina@kunde.de', 'Neu KG', '0231 7', '', '');
        $view = $this->app->adminAppointments()->create($this->admin, $request, true);
        $this->app->outbox()->dispatch(50);
        $this->mailer->sent = [];
        return $view;
    }

    /** @return list<string> */
    private function subjects(string $email): array
    {
        return array_map(static fn($m) => $m->subject, $this->mailer->to($email));
    }

    public function testRemindersAreSentOnceAndRunsAreThrottled(): void
    {
        $this->appointmentIn20Hours();
        $stats = $this->app->maintenance()->run('cron');
        self::assertSame(1, $stats['reminders'] ?? null);
        self::assertSame(['Erinnerung: Kostenloses Erstgespräch am Freitag, 2. Oktober 2026 um 06:00 Uhr'], $this->subjects('nina@kunde.de'));
        self::assertNull($this->app->maintenance()->run('cron'));
        $this->clock->advance('PT2M');
        self::assertSame(0, $this->app->maintenance()->run('cron')['reminders'] ?? null);
        self::assertSame('cron', $this->app->maintenance()->lastRun()['trigger'] ?? null);
    }

    public function testReminderGoesToMembersWhenBookerRemoved(): void
    {
        $view = $this->appointmentIn20Hours();
        $colleague = $this->app->adminCustomers()->addMember($this->admin, (int) $view->companyId, 'kai@kunde.de', 'Kai Kollege');
        $this->app->accounts()->removeMember($colleague, (int) $view->customerId);
        $this->app->maintenance()->run('cron');
        self::assertContains('Erinnerung: Kostenloses Erstgespräch am Freitag, 2. Oktober 2026 um 06:00 Uhr', $this->subjects('kai@kunde.de'));
    }

    public function testPiggybackWaitsForTheInterval(): void
    {
        $this->app->maintenance()->piggyback();
        self::assertSame('piggyback', $this->app->maintenance()->lastRun()['trigger'] ?? null);
        $first = $this->app->maintenance()->lastRun()['startedAt'] ?? null;
        $this->clock->advance('PT5M');
        $this->app->maintenance()->piggyback();
        self::assertSame($first, $this->app->maintenance()->lastRun()['startedAt'] ?? null);
        $this->clock->advance('PT11M');
        $this->app->maintenance()->piggyback();
        self::assertNotSame($first, $this->app->maintenance()->lastRun()['startedAt'] ?? null);
    }

    public function testInactiveAccountsAreWarnedThenErased(): void
    {
        $customer = $this->app->customers()->create($this->app->companies()->create(null), 'alt@example.com', 'Alt Kunde', '');
        $this->clock->advance('P23M');
        $this->clock->advance('P1D');
        self::assertSame(1, $this->app->maintenance()->run('cron')['inactivityNotices'] ?? null);
        self::assertStringStartsWith('Ihr Kundenkonto wird am ', $this->subjects('alt@example.com')[0]);
        $this->clock->advance('P31D');
        self::assertSame(1, $this->app->maintenance()->run('cron')['erased'] ?? null);
        self::assertNull($this->app->customers()->find($customer->id));
    }

    public function testHoldsAndOldAppointmentsArePurged(): void
    {
        $request = new BookingRequest('erstgespraech', new \DateTimeImmutable('2026-10-05T08:00:00Z'), Mode::Video, 'Max', 'max@muster.de', '', '', '', '');
        $this->app->booking()->book($request, null, '203.0.113.7');
        $old = $this->appointmentIn20Hours();
        $this->clock->advance('PT46M');
        self::assertSame(1, $this->app->maintenance()->run('cron')['holds'] ?? null);
        $this->clock->advance('P13M');
        self::assertSame(1, $this->app->maintenance()->run('cron')['appointments'] ?? null);
        self::assertNull($this->app->appointments()->find($old->id));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter MaintenanceTest`
Expected: FAIL. Error: `Call to undefined method TuBooking\App::maintenance()`.

- [ ] **Step 3: Write `booking/src/Application/Maintenance.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Application;

use TuBooking\Infrastructure\AuditLog;
use TuBooking\Infrastructure\Database;
use TuBooking\Infrastructure\Logger;
use TuBooking\Infrastructure\Outbox;
use TuBooking\Infrastructure\RateLimiter;
use TuBooking\Infrastructure\Repository\Appointments;
use TuBooking\Infrastructure\Repository\Customers;
use TuBooking\Infrastructure\Repository\IdempotencyKeys;
use TuBooking\Infrastructure\Repository\LoginCodes;
use TuBooking\Infrastructure\Repository\Sessions;
use TuBooking\Infrastructure\Time;
use TuBooking\Support\Clock;

/**
 * Housekeeping, triggered by the ALL-INKL cron URL every 15 minutes or,
 * without cron, piggyback on normal requests. It retries the outbox, sends
 * 24-hour reminders and applies the retention rules. It runs at most once a
 * minute, and never twice at the same time.
 */
final class Maintenance
{
    public const INTERVAL_MINUTES = 15;

    public function __construct(
        private readonly Database $db,
        private readonly Outbox $outbox,
        private readonly Appointments $appointments,
        private readonly LoginCodes $codes,
        private readonly Sessions $sessions,
        private readonly RateLimiter $limiter,
        private readonly IdempotencyKeys $idempotency,
        private readonly Customers $customers,
        private readonly Accounts $accounts,
        private readonly Booking $booking,
        private readonly Notifications $notifications,
        private readonly AuditLog $audit,
        private readonly Logger $logger,
        private readonly Clock $clock,
    ) {
    }

    /** @return array<string, int>|null */
    public function run(string $trigger): ?array
    {
        if ((int) $this->db->scalar("SELECT GET_LOCK('tu_booking_maintenance', 0)") !== 1) {
            return null;
        }
        try {
            $now = $this->clock->now();
            $last = $this->db->scalar('SELECT MAX(started_at) FROM maintenance_runs');
            if (is_string($last) && Time::parse($last) > $now->sub(new \DateInterval('PT1M'))) {
                return null;
            }
            $runId = $this->db->insert('INSERT INTO maintenance_runs (trigger_source, started_at) VALUES (?, ?)', [$trigger, Time::sql($now)]);
            $first = $this->outbox->dispatch(50);

            $reminders = 0;
            foreach ($this->appointments->dueReminders() as $view) {
                $this->db->transaction(function () use ($view): void {
                    $this->notifications->appointmentReminder($view, $this->booking->recipients($view, null));
                    $this->appointments->markReminded($view->id);
                });
                $reminders++;
            }

            $notices = 0;
            foreach ($this->customers->dueForInactivityNotice($now->sub(new \DateInterval('P23M'))) as $customer) {
                $this->db->transaction(function () use ($customer, $now): void {
                    $this->notifications->inactivityNotice($customer, $now->add(new \DateInterval('P30D')));
                    $this->customers->markInactivityNotice($customer->id);
                });
                $notices++;
            }

            $erased = 0;
            foreach ($this->customers->dueForErasure($now->sub(new \DateInterval('P30D'))) as $customer) {
                $this->accounts->erase($customer, 'system', null, 'Kundenkonto wegen Inaktivität gelöscht');
                $erased++;
            }

            $stats = [
                'sent' => $first['sent'],
                'failed' => $first['failed'],
                'reminders' => $reminders,
                'inactivityNotices' => $notices,
                'erased' => $erased,
                'holds' => $this->appointments->purgeExpiredHolds(),
                'appointments' => $this->appointments->purgeEndedBefore($now->sub(new \DateInterval('P12M'))),
                'codes' => $this->codes->purge(),
                'sessions' => $this->sessions->purge(),
                'rateLimits' => $this->limiter->purge(),
                'idempotency' => $this->idempotency->purge(),
                'outbox' => $this->outbox->purge(),
                'audit' => $this->audit->purge(),
                'logs' => $this->logger->purge(),
                'runs' => $this->db->execute('DELETE FROM maintenance_runs WHERE started_at < ?', [Time::sql($now->sub(new \DateInterval('P30D')))]),
            ];
            $second = $this->outbox->dispatch(50);
            $stats['sent'] += $second['sent'];
            $stats['failed'] += $second['failed'];
            $this->db->execute('UPDATE maintenance_runs SET finished_at = ?, stats = ? WHERE id = ?', [Time::sql($this->clock->now()), json_encode($stats, JSON_THROW_ON_ERROR), $runId]);
            return $stats;
        } finally {
            $this->db->scalar("SELECT RELEASE_LOCK('tu_booking_maintenance')");
        }
    }

    public function piggyback(): void
    {
        $last = $this->db->scalar('SELECT MAX(started_at) FROM maintenance_runs');
        if (is_string($last) && Time::parse($last) > $this->clock->now()->sub(new \DateInterval('PT' . self::INTERVAL_MINUTES . 'M'))) {
            return;
        }
        $this->run('piggyback');
    }

    /** @return array{trigger: string, startedAt: string, finishedAt: ?string, stats: array<string, mixed>}|null */
    public function lastRun(): ?array
    {
        $row = $this->db->one('SELECT * FROM maintenance_runs ORDER BY id DESC LIMIT 1');
        if ($row === null) {
            return null;
        }
        $stats = is_string($row['stats']) ? json_decode($row['stats'], true) : null;
        return [
            'trigger' => (string) $row['trigger_source'],
            'startedAt' => Time::iso(Time::parse((string) $row['started_at'])),
            'finishedAt' => $row['finished_at'] === null ? null : Time::iso(Time::parse((string) $row['finished_at'])),
            'stats' => is_array($stats) ? $stats : [],
        ];
    }
}
```

- [ ] **Step 4: Add the getter to `booking/src/App.php`**

Add `use TuBooking\Application\Maintenance;` and, after `adminSettings()`:

```php
    public function maintenance(): Maintenance
    {
        return $this->service('maintenance', Maintenance::class, fn(): Maintenance => new Maintenance(
            $this->db(), $this->outbox(), $this->appointments(), $this->loginCodes(), $this->sessions(), $this->rateLimiter(),
            $this->idempotency(), $this->customers(), $this->accounts(), $this->booking(), $this->notifications(),
            $this->audit(), $this->logger(), $this->clock,
        ));
    }
```

- [ ] **Step 5: Run the tests**

Run: `npm run booking:test -- --filter MaintenanceTest`
Expected: `OK (5 tests, …)`.

Then run the whole suite once:

Run: `npm run booking:test`
Expected: `OK` with every unit and integration test.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 6: Commit**

```bash
git add booking/src/App.php booking/src/Application/Maintenance.php booking/tests/Integration/MaintenanceTest.php
git commit -m "feat(booking): maintenance job for retries, reminders and retention" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: HTTP core, front controller and guards

**Files:**
- Create: `booking/src/Http/Request.php`, `Response.php`, `Router.php`, `Context.php`, `Input.php`, `SessionCookie.php`, `Presenter.php`, `Idempotency.php`, `Kernel.php`, `booking/src/Http/Routes/MaintenanceRoutes.php`
- Create: `public/api/booking.php`
- Modify: `public/.htaccess` (rewrite rule)
- Modify: `booking/src/App.php` (add `presenter()`, `customerCookie()`, `adminCookie()`, `idempotencyGuard()`, `router()`)
- Test: `booking/tests/Integration/KernelTest.php`, `scripts/test-booking.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1–15
- Produces:
  - `Request`:
    - `__construct(string $method, string $path, array<string,string> $query, array<string,string> $headers, string $body, array<string,string> $cookies, string $ip)`
    - `static fromGlobals(string $ipHeader = ''): Request`
    - `header(string): string`, `json(): array<string, mixed>` (400 on malformed JSON)
    - `$path` is the part after `/api/booking/`, without leading or trailing slash.
  - `Response`:
    - `static json(int $status, array $data)`, which always sets `ok` from the status
    - `static error(int $status, string $message)`, `static raw(int $status, string $jsonBody)`, `static file(string $body, string $contentType, string $filename)`
    - `withHeader(string, string)`, `withCookie(string)`, `send()`
    - public readonly `status`, `body`, `headers`, `cookies`
  - `Router`:
    - `add(string $method, string $pattern, string $auth, \Closure $handler)`, where `$auth` is one of `public`, `customer`, `admin`, `admin-pending`, `maintenance` and `$handler` is `\Closure(Context): Response`
    - `match(string $method, string $path): array{route: ?array, params: array<string,string>, allowed: list<string>}`
  - `Context`:
    - `$request`, `$params`, `$customerSession`, `$customer`, `$adminSession`, `$admin`
    - `input(): Input`, `param(string): string`, `customer(): Customer` (401), `admin(): Admin` (401), `adminSession(): Session` (401)
  - `Input(array $data)`:
    - `text(string $key, string $label, int $max, bool $required = false, int $min = 0): string`
    - `line(...)` (same signature, no line breaks), `email(string $key = 'email'): string`
    - `bool(string): bool`, `int(string $key, string $label, int $min, int $max): int`, `optionalInt(string): ?int`
    - `datetime(string $key, string $label): \DateTimeImmutable`, `mode(string $key = 'mode'): Mode`
    - `list(string): list<mixed>`, `raw(string): mixed`, `static date(?string $value, string $default): string`
  - `SessionCookie(string $name, bool $secure)`: `read(Request): ?string`, `issue(string $token, int $maxAge): string`, `clear(): string`
  - `Presenter(\DateTimeZone)`:
    - `type(AppointmentType)`, `typeAdmin(AppointmentType)`, `days(array<string, list<\DateTimeImmutable>>)`
    - `appointment(AppointmentView, bool $canChange)`, `appointmentAdmin(AppointmentView)`
    - `customer(Customer)`, `member(Customer, int $selfId)`, `admin(Admin)`
  - `Idempotency(IdempotencyKeys)`: `run(Context, string $scope, \Closure(): Response $work): Response`
  - `Kernel`:
    - `MAX_BODY = 32768`
    - `__construct(App)`, `handle(Request): Response`, `afterResponse(): void`
    - `static serveGlobals(): void`
  - `MaintenanceRoutes::register(Router, App)`: `GET maintenance?key=…`
  - App getters `presenter()`, `customerCookie()`, `adminCookie()`, `idempotencyGuard()`, `router()`

- [ ] **Step 1: Write the failing PHPUnit test**

`booking/tests/Integration/KernelTest.php`:

```php
<?php
declare(strict_types=1);

namespace TuBooking\Tests\Integration;

use TuBooking\App;
use TuBooking\Domain\DomainError;
use TuBooking\Http\Context;
use TuBooking\Http\Kernel;
use TuBooking\Http\Request;
use TuBooking\Http\Response;
use TuBooking\Http\Router;
use TuBooking\Http\Routes\MaintenanceRoutes;
use TuBooking\Tests\Support\DatabaseTestCase;
use TuBooking\Tests\Support\TestConfig;

final class KernelTest extends DatabaseTestCase
{
    private int $calls = 0;

    private function kernel(): Kernel
    {
        $router = new Router();
        $app = null;
        $router->add('POST', 'echo/{id}', 'public', fn(Context $c): Response => Response::json(200, ['id' => $c->param('id'), 'name' => $c->input()->line('name', 'Name', 20, true)]));
        $router->add('GET', 'boom', 'public', static fn(Context $c): Response => throw new \LogicException('secret detail max@example.com'));
        $router->add('GET', 'limited', 'public', static fn(Context $c): Response => throw DomainError::tooMany('Zu viele.', 60));
        $router->add('GET', 'mine', 'customer', static fn(Context $c): Response => Response::json(200, ['email' => $c->customer()->email]));
        $router->add('POST', 'once', 'public', function (Context $c) use (&$app): Response {
            \assert($app instanceof App);
            return $app->idempotencyGuard()->run($c, 'test', function (): Response {
                $this->calls++;
                return Response::json(201, ['call' => $this->calls]);
            });
        });
        $app = new App(TestConfig::create(), $this->clock, ['mailer' => $this->mailer, 'router' => $router]);
        MaintenanceRoutes::register($router, $app);
        return new Kernel($app);
    }

    /**
     * @param array<string, string> $headers
     * @param array<string, string> $cookies
     */
    private function request(string $method, string $path, string $body = '', array $headers = [], array $cookies = [], array $query = []): Request
    {
        $defaults = $method === 'GET' ? [] : ['origin' => 'https://tayyipuenal.de', 'content-type' => 'application/json'];
        return new Request($method, $path, $query, array_replace($defaults, $headers), $body, $cookies, '203.0.113.9');
    }

    /** @return array<string, mixed> */
    private static function body(Response $response): array
    {
        $data = json_decode($response->body, true);
        self::assertIsArray($data);
        return $data;
    }

    public function testRoutingAndStandardHeaders(): void
    {
        $kernel = $this->kernel();
        $ok = $kernel->handle($this->request('POST', 'echo/42', '{"name":"Max"}'));
        self::assertSame(200, $ok->status);
        self::assertSame(['ok' => true, 'id' => '42', 'name' => 'Max'], self::body($ok));
        self::assertSame('no-store', $ok->headers['Cache-Control']);
        self::assertSame('nosniff', $ok->headers['X-Content-Type-Options']);
        self::assertSame(404, $kernel->handle($this->request('GET', 'unknown'))->status);
        $wrongMethod = $kernel->handle($this->request('GET', 'echo/42'));
        self::assertSame(405, $wrongMethod->status);
        self::assertSame('POST', $wrongMethod->headers['Allow']);
    }

    public function testWriteGuards(): void
    {
        $kernel = $this->kernel();
        self::assertSame(403, $kernel->handle($this->request('POST', 'echo/1', '{"name":"Max"}', ['origin' => 'https://evil.example']))->status);
        self::assertSame(403, $kernel->handle($this->request('POST', 'echo/1', '{"name":"Max"}', ['origin' => '']))->status);
        self::assertSame(415, $kernel->handle($this->request('POST', 'echo/1', 'name=Max', ['content-type' => 'application/x-www-form-urlencoded']))->status);
        self::assertSame(413, $kernel->handle($this->request('POST', 'echo/1', '{"name":"' . str_repeat('x', Kernel::MAX_BODY) . '"}'))->status);
        self::assertSame(400, $kernel->handle($this->request('POST', 'echo/1', '{broken'))->status);
        $invalid = $kernel->handle($this->request('POST', 'echo/1', '{"name":""}'));
        self::assertSame([422, 'Bitte füllen Sie das Feld „Name“ aus.'], [$invalid->status, self::body($invalid)['message']]);
    }

    public function testErrorsAreGermanAndLoggedWithoutDetails(): void
    {
        $kernel = $this->kernel();
        $boom = $kernel->handle($this->request('GET', 'boom'));
        self::assertSame(500, $boom->status);
        $message = (string) self::body($boom)['message'];
        self::assertMatchesRegularExpression('/unerwarteter Fehler \(E-[0-9A-F]{8}\)/', $message);
        self::assertStringNotContainsString('max@example.com', $boom->body);
        $limited = $kernel->handle($this->request('GET', 'limited'));
        self::assertSame([429, '60'], [$limited->status, $limited->headers['Retry-After']]);
    }

    public function testCustomerRoutesNeedTheSessionCookie(): void
    {
        $kernel = $this->kernel();
        self::assertSame(401, $kernel->handle($this->request('GET', 'mine'))->status);
        $customer = $this->app->customers()->create($this->app->companies()->create(null), 'max@muster.de', 'Max', '');
        $token = $this->app->crypto()->token();
        $this->app->sessions()->create($this->app->crypto()->hash($token), $customer->id, null, $this->clock->now()->add(new \DateInterval('P1D')), true);
        $mine = $kernel->handle($this->request('GET', 'mine', '', [], ['tu_session_test' => $token]));
        self::assertSame('max@muster.de', self::body($mine)['email'] ?? null);
        self::assertSame(401, $kernel->handle($this->request('GET', 'mine', '', [], ['tu_session_test' => 'forged']))->status);
    }

    public function testIdempotentWritesReplayAndDetectChanges(): void
    {
        $kernel = $this->kernel();
        $body = '{"requestId":"6f9619ff-8b86-4d11-b42d-00c04fc964ff","value":1}';
        $first = $kernel->handle($this->request('POST', 'once', $body));
        $second = $kernel->handle($this->request('POST', 'once', $body));
        self::assertSame([201, 201], [$first->status, $second->status]);
        self::assertSame($first->body, $second->body);
        self::assertSame(1, $this->calls);
        $changed = $kernel->handle($this->request('POST', 'once', '{"requestId":"6f9619ff-8b86-4d11-b42d-00c04fc964ff","value":2}'));
        self::assertSame(409, $changed->status);
        self::assertSame(422, $kernel->handle($this->request('POST', 'once', '{"value":1}'))->status);
    }

    public function testMaintenanceNeedsTheKey(): void
    {
        $kernel = $this->kernel();
        self::assertSame(403, $kernel->handle($this->request('GET', 'maintenance', '', [], [], ['key' => 'wrong']))->status);
        $run = $kernel->handle($this->request('GET', 'maintenance', '', [], [], ['key' => 'test-maintenance-key']));
        self::assertSame(200, $run->status);
        self::assertArrayHasKey('stats', self::body($run));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run booking:test -- --filter KernelTest`
Expected: FAIL. Error: `Class "TuBooking\Http\Router" not found`.

- [ ] **Step 3: Write `booking/src/Http/Request.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

use TuBooking\Domain\DomainError;

final class Request
{
    /**
     * @param array<string, string> $query
     * @param array<string, string> $headers lower-case names
     * @param array<string, string> $cookies
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $headers,
        public readonly string $body,
        public readonly array $cookies,
        public readonly string $ip,
    ) {
    }

    /** $ipHeader is only set in the local test configuration; production uses REMOTE_ADDR. */
    public static function fromGlobals(string $ipHeader = ''): self
    {
        $uri = is_string($_SERVER['REQUEST_URI'] ?? null) ? $_SERVER['REQUEST_URI'] : '/';
        $path = (string) parse_url($uri, PHP_URL_PATH);
        $prefix = '/api/booking/';
        $route = str_starts_with($path, $prefix) ? substr($path, strlen($prefix)) : '';
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (is_string($key) && is_string($value) && str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
            }
        }
        foreach (['CONTENT_TYPE' => 'content-type', 'CONTENT_LENGTH' => 'content-length'] as $key => $name) {
            if (is_string($_SERVER[$key] ?? null)) {
                $headers[$name] = $_SERVER[$key];
            }
        }
        $ip = is_string($_SERVER['REMOTE_ADDR'] ?? null) ? $_SERVER['REMOTE_ADDR'] : '';
        if ($ipHeader !== '' && ($headers[strtolower($ipHeader)] ?? '') !== '') {
            $ip = $headers[strtolower($ipHeader)];
        }
        return new self(
            strtoupper(is_string($_SERVER['REQUEST_METHOD'] ?? null) ? $_SERVER['REQUEST_METHOD'] : 'GET'),
            trim($route, '/'),
            self::strings($_GET),
            $headers,
            (string) file_get_contents('php://input', false, null, 0, Kernel::MAX_BODY + 1),
            self::strings($_COOKIE),
            $ip,
        );
    }

    public function header(string $name): string
    {
        return $this->headers[strtolower($name)] ?? '';
    }

    /** @return array<string, mixed> */
    public function json(): array
    {
        if ($this->body === '') {
            return [];
        }
        try {
            $data = json_decode($this->body, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw DomainError::status(400, 'Die Anfrage konnte nicht gelesen werden.');
        }
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            throw DomainError::status(400, 'Die Anfrage konnte nicht gelesen werden.');
        }
        /** @var array<string, mixed> $data */
        return $data;
    }

    /**
     * @param array<mixed> $values
     * @return array<string, string>
     */
    private static function strings(array $values): array
    {
        $strings = [];
        foreach ($values as $key => $value) {
            if (is_string($key) && is_string($value)) {
                $strings[$key] = $value;
            }
        }
        return $strings;
    }
}
```

- [ ] **Step 4: Write `booking/src/Http/Response.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

final class Response
{
    /**
     * @param array<string, string> $headers
     * @param list<string> $cookies
     */
    private function __construct(
        public readonly int $status,
        public readonly string $body,
        public readonly array $headers,
        public readonly array $cookies,
    ) {
    }

    /** @param array<string, mixed> $data */
    public static function json(int $status, array $data): self
    {
        $body = json_encode(['ok' => $status < 400] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        return new self($status, $body, ['Content-Type' => 'application/json; charset=utf-8'], []);
    }

    public static function error(int $status, string $message): self
    {
        return self::json($status, ['message' => $message]);
    }

    /** A JSON body stored earlier (idempotent replay). */
    public static function raw(int $status, string $jsonBody): self
    {
        return new self($status, $jsonBody, ['Content-Type' => 'application/json; charset=utf-8'], []);
    }

    public static function file(string $body, string $contentType, string $filename): self
    {
        return new self(200, $body, ['Content-Type' => $contentType, 'Content-Disposition' => 'attachment; filename="' . $filename . '"'], []);
    }

    public function withHeader(string $name, string $value): self
    {
        $headers = $this->headers;
        $headers[$name] = $value;
        return new self($this->status, $this->body, $headers, $this->cookies);
    }

    public function withCookie(string $cookie): self
    {
        return new self($this->status, $this->body, $this->headers, [...$this->cookies, $cookie]);
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }
        foreach ($this->cookies as $cookie) {
            header('Set-Cookie: ' . $cookie, false);
        }
        echo $this->body;
    }
}
```

- [ ] **Step 5: Write `booking/src/Http/Router.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

/**
 * Method + path patterns such as "appointments/{ref}/cancel". The auth level
 * of a route is checked by the Kernel before the handler runs.
 *
 * @phpstan-type Route array{method: string, regex: string, auth: string, handler: \Closure(Context): Response}
 */
final class Router
{
    /** @var list<Route> */
    private array $routes = [];

    /** @param \Closure(Context): Response $handler */
    public function add(string $method, string $pattern, string $auth, \Closure $handler): void
    {
        $parts = [];
        foreach (explode('/', $pattern) as $segment) {
            $parts[] = preg_match('/^\{(\w+)\}$/', $segment, $match) === 1 ? '(?P<' . $match[1] . '>[^/]+)' : preg_quote($segment, '#');
        }
        $this->routes[] = ['method' => $method, 'regex' => '#^' . implode('/', $parts) . '$#', 'auth' => $auth, 'handler' => $handler];
    }

    /** @return array{route: Route|null, params: array<string, string>, allowed: list<string>} */
    public function match(string $method, string $path): array
    {
        $allowed = [];
        foreach ($this->routes as $route) {
            if (preg_match($route['regex'], $path, $matches) !== 1) {
                continue;
            }
            if ($route['method'] !== $method) {
                $allowed[] = $route['method'];
                continue;
            }
            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }
            return ['route' => $route, 'params' => $params, 'allowed' => []];
        }
        return ['route' => null, 'params' => [], 'allowed' => array_values(array_unique($allowed))];
    }
}
```

- [ ] **Step 6: Write `booking/src/Http/Context.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

use TuBooking\Domain\DomainError;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\Customer;
use TuBooking\Domain\Model\Session;

/** Everything a route handler gets: the request, path parameters and the resolved sessions. */
final class Context
{
    private ?Input $input = null;

    /** @param array<string, string> $params */
    public function __construct(
        public readonly Request $request,
        public readonly array $params,
        public readonly ?Session $customerSession,
        public readonly ?Customer $customer,
        public readonly ?Session $adminSession,
        public readonly ?Admin $admin,
    ) {
    }

    public function input(): Input
    {
        return $this->input ??= new Input($this->request->json());
    }

    public function param(string $name): string
    {
        return $this->params[$name] ?? '';
    }

    public function customer(): Customer
    {
        return $this->customer ?? throw DomainError::unauthorized('Bitte melden Sie sich im Kundenkonto an.');
    }

    public function admin(): Admin
    {
        return $this->admin ?? throw DomainError::unauthorized('Bitte melden Sie sich in der Verwaltung an.');
    }

    public function adminSession(): Session
    {
        return $this->adminSession ?? throw DomainError::unauthorized('Bitte melden Sie sich in der Verwaltung an.');
    }
}
```

- [ ] **Step 7: Write `booking/src/Http/Input.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

use TuBooking\Domain\DomainError;
use TuBooking\Domain\Email;
use TuBooking\Domain\Mode;
use TuBooking\Infrastructure\Time;

/** Validates JSON input; every failure is a 422 with a German message naming the field. */
final class Input
{
    /** @param array<string, mixed> $data */
    public function __construct(private readonly array $data)
    {
    }

    public function text(string $key, string $label, int $max, bool $required = false, int $min = 0): string
    {
        $value = $this->data[$key] ?? '';
        if (!is_string($value)) {
            throw DomainError::invalid("Bitte prüfen Sie das Feld „{$label}“.");
        }
        $value = trim(str_replace("\r\n", "\n", $value));
        if ($required && $value === '') {
            throw DomainError::invalid("Bitte füllen Sie das Feld „{$label}“ aus.");
        }
        if (mb_strlen($value) > $max) {
            throw DomainError::invalid("Das Feld „{$label}“ ist zu lang (höchstens {$max} Zeichen).");
        }
        if ($value !== '' && mb_strlen($value) < $min) {
            throw DomainError::invalid("Das Feld „{$label}“ ist zu kurz.");
        }
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value) === 1) {
            throw DomainError::invalid("Bitte prüfen Sie das Feld „{$label}“.");
        }
        return $value;
    }

    public function line(string $key, string $label, int $max, bool $required = false, int $min = 0): string
    {
        $value = $this->text($key, $label, $max, $required, $min);
        if (str_contains($value, "\n") || str_contains($value, "\r")) {
            throw DomainError::invalid("Bitte entfernen Sie Zeilenumbrüche aus dem Feld „{$label}“.");
        }
        return $value;
    }

    public function email(string $key = 'email'): string
    {
        $value = $this->data[$key] ?? '';
        $email = is_string($value) ? Email::normalize($value) : '';
        if (!Email::isValid($email)) {
            throw DomainError::invalid('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        }
        return $email;
    }

    public function bool(string $key): bool
    {
        return ($this->data[$key] ?? false) === true;
    }

    public function int(string $key, string $label, int $min, int $max): int
    {
        $value = $this->data[$key] ?? null;
        if (!is_int($value) || $value < $min || $value > $max) {
            throw DomainError::invalid("Bitte geben Sie für „{$label}“ eine Zahl zwischen {$min} und {$max} an.");
        }
        return $value;
    }

    public function optionalInt(string $key): ?int
    {
        $value = $this->data[$key] ?? null;
        return is_int($value) ? $value : null;
    }

    public function datetime(string $key, string $label): \DateTimeImmutable
    {
        $value = $this->data[$key] ?? null;
        $time = is_string($value) ? Time::parseIso($value) : null;
        if ($time === null) {
            throw DomainError::invalid("Bitte prüfen Sie die Angabe „{$label}“.");
        }
        return $time;
    }

    public function mode(string $key = 'mode'): Mode
    {
        $value = $this->data[$key] ?? null;
        $mode = is_string($value) ? Mode::tryFrom($value) : null;
        if ($mode === null) {
            throw DomainError::invalid('Bitte wählen Sie, wie der Termin stattfinden soll.');
        }
        return $mode;
    }

    /** @return list<mixed> */
    public function list(string $key): array
    {
        $value = $this->data[$key] ?? [];
        if (!is_array($value) || !array_is_list($value)) {
            throw DomainError::invalid('Bitte prüfen Sie Ihre Angaben.');
        }
        return $value;
    }

    public function raw(string $key): mixed
    {
        return $this->data[$key] ?? null;
    }

    /** A Y-m-d date from the query string, or the default. */
    public static function date(?string $value, string $default): string
    {
        if ($value === null || $value === '') {
            return $default;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if ($date === false || $date->format('Y-m-d') !== $value) {
            throw DomainError::invalid('Bitte prüfen Sie das Datum.');
        }
        return $value;
    }
}
```

- [ ] **Step 8: Write `booking/src/Http/SessionCookie.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

/** The session cookie: a random token; HttpOnly, SameSite=Lax, Secure in production (__Host- prefix). */
final class SessionCookie
{
    public function __construct(public readonly string $name, private readonly bool $secure)
    {
    }

    public function read(Request $request): ?string
    {
        $value = $request->cookies[$this->name] ?? null;
        return is_string($value) && preg_match('/^[A-Za-z0-9_-]{43}$/', $value) === 1 ? $value : null;
    }

    public function issue(string $token, int $maxAge): string
    {
        return $this->name . '=' . $token . '; Path=/; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax' . ($this->secure ? '; Secure' : '');
    }

    public function clear(): string
    {
        return $this->name . '=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' . ($this->secure ? '; Secure' : '');
    }
}
```

- [ ] **Step 9: Write `booking/src/Http/Presenter.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Admin;
use TuBooking\Domain\Model\AppointmentType;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Customer;
use TuBooking\Infrastructure\Time;

/** The JSON shapes of the API (mirrored by src/booking/api.ts and src/admin/api.ts). */
final class Presenter
{
    public function __construct(private readonly \DateTimeZone $zone)
    {
    }

    /** @return array<string, mixed> */
    public function type(AppointmentType $type): array
    {
        return [
            'slug' => $type->slug,
            'title' => $type->title,
            'description' => $type->description,
            'durationMin' => $type->durationMin,
            'modes' => array_map(static fn(Mode $mode): string => $mode->value, $type->modes),
        ];
    }

    /** @return array<string, mixed> */
    public function typeAdmin(AppointmentType $type): array
    {
        return ['id' => $type->id] + $this->type($type) + [
            'bufferMin' => $type->bufferMin,
            'slotStepMin' => $type->slotStepMin,
            'leadTimeH' => $type->leadTimeH,
            'horizonDays' => $type->horizonDays,
            'videoLink' => $type->videoLink,
            'active' => $type->active,
            'sort' => $type->sort,
        ];
    }

    /**
     * @param array<string, list<\DateTimeImmutable>> $days
     * @return list<array{date: string, slots: list<array{start: string, label: string}>}>
     */
    public function days(array $days): array
    {
        $result = [];
        foreach ($days as $date => $slots) {
            $result[] = [
                'date' => (string) $date,
                'slots' => array_map(fn(\DateTimeImmutable $slot): array => ['start' => Time::iso($slot), 'label' => $slot->setTimezone($this->zone)->format('H:i')], $slots),
            ];
        }
        return $result;
    }

    /** @return array<string, mixed> */
    public function appointment(AppointmentView $a, bool $canChange): array
    {
        return [
            'reference' => $a->reference,
            'type' => $a->typeSlug,
            'typeTitle' => $a->typeTitle,
            'start' => Time::iso($a->start),
            'end' => Time::iso($a->end),
            'mode' => $a->mode->value,
            'status' => $a->status->value,
            'phone' => $a->phone,
            'address' => $a->address,
            'note' => $a->note,
            'bookedBy' => $a->customerName,
            'canChange' => $canChange,
        ];
    }

    /** @return array<string, mixed> */
    public function appointmentAdmin(AppointmentView $a): array
    {
        return $this->appointment($a, false) + [
            'customer' => $a->customerId === null ? null : ['id' => $a->customerId, 'name' => $a->customerName, 'email' => $a->customerEmail],
            'company' => $a->companyId === null ? null : ['id' => $a->companyId, 'name' => $a->companyName],
            'cancelledBy' => $a->cancelledBy,
            'cancelReason' => $a->cancelReason,
            'createdAt' => Time::iso($a->createdAt),
        ];
    }

    /** @return array{name: string, email: string, phone: string} */
    public function customer(Customer $customer): array
    {
        return ['name' => $customer->name, 'email' => $customer->email, 'phone' => $customer->phone];
    }

    /** @return array{id: int, name: string, email: string, self: bool} */
    public function member(Customer $member, int $selfId): array
    {
        return ['id' => $member->id, 'name' => $member->name, 'email' => $member->email, 'self' => $member->id === $selfId];
    }

    /** @return array{id: int, name: string, email: string, paired: bool} */
    public function admin(Admin $admin): array
    {
        return ['id' => $admin->id, 'name' => $admin->name, 'email' => $admin->email, 'paired' => $admin->isPaired()];
    }
}
```

- [ ] **Step 10: Write `booking/src/Http/Idempotency.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

use TuBooking\Domain\DomainError;
use TuBooking\Infrastructure\Repository\IdempotencyKeys;

/**
 * Makes a write safe to retry: the client sends a requestId (UUID); a repeat
 * with the same id and the same data gets the stored answer, a repeat with
 * changed data a 409. Only successful answers are stored (for 24 hours).
 */
final class Idempotency
{
    public function __construct(private readonly IdempotencyKeys $keys)
    {
    }

    /** @param \Closure(): Response $work */
    public function run(Context $context, string $scope, \Closure $work): Response
    {
        $data = $context->request->json();
        $requestId = $data['requestId'] ?? null;
        if (!is_string($requestId) || preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $requestId) !== 1) {
            throw DomainError::invalid('Bitte laden Sie die Seite neu und versuchen Sie es erneut.');
        }
        unset($data['requestId']);
        ksort($data);
        $requestHash = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
        $keyHash = hash('sha256', $scope . '|' . strtolower($requestId));
        $stored = $this->keys->find($keyHash);
        if ($stored !== null) {
            if (!hash_equals($stored['requestHash'], $requestHash)) {
                throw DomainError::conflict('Die Angaben wurden geändert. Bitte senden Sie das Formular erneut.');
            }
            return Response::raw($stored['status'], $stored['response']);
        }
        $response = $work();
        if ($response->status < 400) {
            $this->keys->store($keyHash, $requestHash, $response->status, $response->body);
        }
        return $response;
    }
}
```

- [ ] **Step 11: Write `booking/src/Http/Kernel.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http;

use TuBooking\App;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Model\Session;

/**
 * One request: route → guards → session → handler → JSON. Rule violations
 * become their status with a German message. Unexpected errors become 500
 * (503 for database trouble) with an error reference; the log gets the
 * details, the visitor never does.
 */
final class Kernel
{
    public const MAX_BODY = 32768;
    private const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function __construct(private readonly App $app)
    {
    }

    public static function serveGlobals(): void
    {
        try {
            $app = App::fromEnvironment();
            $request = Request::fromGlobals($app->config->string('site.client_ip_header'));
        } catch (\Throwable) {
            Response::error(503, 'Die Terminbuchung ist gerade nicht erreichbar. Bitte rufen Sie uns an: 0155 63084795.')
                ->withHeader('Cache-Control', 'no-store')
                ->send();
            return;
        }
        $kernel = new self($app);
        $kernel->handle($request)->send();
        $kernel->afterResponse();
    }

    public function handle(Request $request): Response
    {
        try {
            $response = $this->dispatch($request);
        } catch (DomainError $error) {
            $response = Response::error($error->status, $error->getMessage());
            if ($error->retryAfter !== null) {
                $response = $response->withHeader('Retry-After', (string) $error->retryAfter);
            }
        } catch (\Throwable $error) {
            $reference = 'E-' . strtoupper(bin2hex(random_bytes(4)));
            $this->app->logger()->error($reference, $request->method . ' ' . $request->path, $error);
            $phone = $this->app->config->string('site.phone_label');
            $response = $error instanceof \PDOException
                ? Response::error(503, "Die Terminbuchung ist gerade nicht erreichbar. Bitte rufen Sie uns an: $phone.")
                : Response::error(500, "Es ist ein unerwarteter Fehler aufgetreten ($reference). Bitte versuchen Sie es erneut oder rufen Sie uns an: $phone.");
        }
        return $response->withHeader('Cache-Control', 'no-store')->withHeader('X-Content-Type-Options', 'nosniff');
    }

    /** Runs after the response is on its way: sends queued emails, and maintenance when cron is missing. */
    public function afterResponse(): void
    {
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
        try {
            $this->app->outbox()->dispatch(10);
            $this->app->maintenance()->piggyback();
        } catch (\Throwable $error) {
            $this->app->logger()->error('E-AFTER', 'after-response', $error);
        }
    }

    private function dispatch(Request $request): Response
    {
        $match = $this->app->router()->match($request->method, $request->path);
        $route = $match['route'];
        if ($route === null) {
            if ($match['allowed'] !== []) {
                return Response::error(405, 'Diese Aktion ist hier nicht möglich.')->withHeader('Allow', implode(', ', $match['allowed']));
            }
            return Response::error(404, 'Diese Adresse gibt es nicht.');
        }
        if (in_array($request->method, self::WRITE_METHODS, true)) {
            if (!in_array($request->header('origin'), $this->app->config->strings('site.allowed_origins'), true)) {
                throw DomainError::forbidden('Bitte nutzen Sie die Terminbuchung direkt auf unserer Website.');
            }
            if (stripos($request->header('content-type'), 'application/json') !== 0) {
                throw DomainError::status(415, 'Ungültiges Anfrageformat.');
            }
            if (strlen($request->body) > self::MAX_BODY) {
                throw DomainError::status(413, 'Die Anfrage ist zu groß.');
            }
        }
        if ($route['auth'] === 'maintenance' && !hash_equals($this->app->config->string('secrets.maintenance_key'), $request->query['key'] ?? '')) {
            throw DomainError::forbidden('Nicht erlaubt.');
        }
        $this->app->migrator()->ensureCurrent();
        $context = $this->context($request, $match['params']);
        if ($route['auth'] === 'customer') {
            $context->customer();
        } elseif ($route['auth'] === 'admin') {
            $context->admin();
        } elseif ($route['auth'] === 'admin-pending') {
            $context->adminSession();
        }
        return ($route['handler'])($context);
    }

    /** @param array<string, string> $params */
    private function context(Request $request, array $params): Context
    {
        $customerSession = $this->session($request, $this->app->customerCookie());
        $customer = $customerSession !== null ? $this->app->customerAuth()->customerFor($customerSession) : null;
        $adminSession = $this->session($request, $this->app->adminCookie());
        $admin = $adminSession !== null ? $this->app->adminAuth()->adminFor($adminSession) : null;
        return new Context($request, $params, $customer !== null ? $customerSession : null, $customer, $adminSession, $admin);
    }

    private function session(Request $request, SessionCookie $cookie): ?Session
    {
        $token = $cookie->read($request);
        return $token === null ? null : $this->app->sessions()->find($this->app->crypto()->hash($token));
    }
}
```

- [ ] **Step 12: Write `booking/src/Http/Routes/MaintenanceRoutes.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http\Routes;

use TuBooking\App;
use TuBooking\Http\Context;
use TuBooking\Http\Response;
use TuBooking\Http\Router;

/** The URL the ALL-INKL cron job calls every 15 minutes: GET /api/booking/maintenance?key=… */
final class MaintenanceRoutes
{
    public static function register(Router $router, App $app): void
    {
        $router->add('GET', 'maintenance', 'maintenance', static fn(Context $c): Response => Response::json(200, [
            'stats' => $app->maintenance()->run('cron'),
        ]));
    }
}
```

- [ ] **Step 13: Add the getters to `booking/src/App.php`**

Add `use` lines:

```php
use TuBooking\Http\Idempotency;
use TuBooking\Http\Presenter;
use TuBooking\Http\Router;
use TuBooking\Http\Routes\MaintenanceRoutes;
use TuBooking\Http\SessionCookie;
```

Add methods after `maintenance()`:

```php
    public function presenter(): Presenter
    {
        return $this->service('presenter', Presenter::class, fn(): Presenter => new Presenter($this->zone()));
    }

    public function customerCookie(): SessionCookie
    {
        return $this->service('customerCookie', SessionCookie::class, fn(): SessionCookie => new SessionCookie($this->config->string('session.customer_cookie'), $this->config->bool('session.secure')));
    }

    public function adminCookie(): SessionCookie
    {
        return $this->service('adminCookie', SessionCookie::class, fn(): SessionCookie => new SessionCookie($this->config->string('session.admin_cookie'), $this->config->bool('session.secure')));
    }

    public function idempotencyGuard(): Idempotency
    {
        return $this->service('idempotencyGuard', Idempotency::class, fn(): Idempotency => new Idempotency($this->idempotency()));
    }

    public function router(): Router
    {
        return $this->service('router', Router::class, function (): Router {
            $router = new Router();
            MaintenanceRoutes::register($router, $this);
            return $router;
        });
    }
```

- [ ] **Step 14: Write the front controller `public/api/booking.php`**

```php
<?php
declare(strict_types=1);

// Front controller for every /api/booking/… request (see the rewrite rule in
// .htaccess). The application itself lives outside the document root in
// /tu-booking/, next to the domain folder.
$bootstrap = dirname(__DIR__, 2) . '/tu-booking/bootstrap.php';
if (!is_file($bootstrap)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo '{"ok":false,"message":"Die Terminbuchung ist gerade nicht erreichbar. Bitte rufen Sie uns an: 0155 63084795."}';
    exit;
}
require $bootstrap;
\TuBooking\Http\Kernel::serveGlobals();
```

- [ ] **Step 15: Add the rewrite rule to `public/.htaccess`**

Inside `<IfModule mod_rewrite.c>`, add this as the **last** rule, after the two redirect rules:

```apacheconf

  # Booking API: every /api/booking/… path goes to the front controller.
  RewriteRule ^api/booking/ api/booking.php [L]
```

It must come after the redirects. The HTTPS and www redirects then see the original URL first. The internal rewrite only happens for requests that are already on `https://tayyipuenal.de`, so the second rewrite pass has nothing left to redirect.

- [ ] **Step 16: Start the HTTP flow test script `scripts/test-booking.mjs`**

```js
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';

// HTTP flow tests for the booking API. They only target the local Docker stack
// (npm run booking:up): mail goes to booking/var/mail through the sendmail
// stub, nothing is sent. Each simulated visitor gets its own X-Test-Client
// address, which only the local configuration reads.
const root = process.env.BOOKING_ROOT ?? 'http://127.0.0.1:8086';
const api = `${root}/api/booking/`;
const origin = 'https://tayyipuenal.de';
const mailDir = new URL('../booking/var/mail/', import.meta.url);

function client(name = randomUUID()) {
  const jar = new Map();
  async function call(method, path, body, headers = {}) {
    const cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    const response = await fetch(api + path, {
      method,
      headers: {
        'X-Test-Client': name,
        ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      redirect: 'manual',
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === '') jar.delete(key);
      else jar.set(key, value);
    }
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, headers: response.headers, json, text };
  }
  return {
    name,
    jar,
    call,
    get: (path, headers) => call('GET', path, undefined, headers),
    post: (path, body, headers) => call('POST', path, body, headers),
    patch: (path, body) => call('PATCH', path, body),
    put: (path, body) => call('PUT', path, body),
    del: (path, body) => call('DELETE', path, body),
  };
}

const decodeWords = (value) => value.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b64) => Buffer.from(b64, 'base64').toString('utf8'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mails() {
  if (!existsSync(mailDir)) return [];
  return readdirSync(mailDir)
    .filter((file) => file.endsWith('.eml'))
    .map((file) => {
      const raw = readFileSync(new URL(file, mailDir), 'utf8');
      const head = raw.split(/\r?\n\r?\n/)[0];
      const header = (name) => (head.match(new RegExp(`^${name}: (.*)$`, 'mi'))?.[1] ?? '').trim();
      return { file, to: decodeWords(header('To')), subject: decodeWords(header('Subject')), raw };
    });
}

/** Waits for a mail that matches and was not among the `known` files. */
async function waitForMail(predicate, what, known = new Set()) {
  for (let i = 0; i < 50; i++) {
    const found = mails().find((mail) => !known.has(mail.file) && predicate(mail));
    if (found) return found;
    await sleep(100);
  }
  throw new Error(`no mail: ${what}`);
}

const CUSTOMER_CODE = /^(\d{6}) ist Ihr Bestätigungscode$/;
const ADMIN_CODE = /^(\d{6}) – Anmeldung Verwaltung$/;

/** Runs `action` and returns its result plus the code it caused to be mailed to `email`. */
async function codeAfter(email, action, pattern = CUSTOMER_CODE) {
  const known = new Set(mails().map((mail) => mail.file));
  const result = await action();
  const mail = await waitForMail((m) => m.to.includes(email) && pattern.test(m.subject), `code for ${email}`, known);
  return { result, code: mail.subject.match(pattern)[1] };
}

function totp(secretBase32, time = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secretBase32.replace(/[\s=]/g, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[19] & 0x0f;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Days are chosen in the future so that the 24-hour notice never interferes.
function weekday(offsetWeeks, isoDay) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  const shift = ((isoDay - ((date.getUTCDay() + 6) % 7) - 1 + 7) % 7) + 7 * offsetWeeks + 7;
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('guards, headers and the hidden application folder', async () => {
  const visitor = client();
  const unknown = await visitor.get('nope');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.ok, false);
  assert.equal(unknown.headers.get('cache-control'), 'no-store');
  assert.equal(unknown.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await visitor.get('maintenance?key=wrong')).status, 403);
  const run = await visitor.get('maintenance?key=local-maintenance-key');
  assert.equal(run.status, 200);
  assert.equal(run.json.ok, true);
  assert.equal((await fetch(`${root}/tu-booking/bootstrap.php`)).status, 404);
});

// ---- runner ----
rmSync(mailDir, { recursive: true, force: true });
let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}\n${error.stack}`);
  }
}
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nAll ${tests.length} booking HTTP tests passed.`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 17: Run all tests**

Run: `npm run booking:test -- --filter KernelTest`
Expected: `OK (6 tests, …)`.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

Run: `npm run test:booking`
Expected: `PASS guards, headers and the hidden application folder` and `All 1 booking HTTP tests passed.`

- [ ] **Step 18: Commit**

```bash
git add booking/src/App.php booking/src/Http public/api/booking.php public/.htaccess booking/tests/Integration/KernelTest.php scripts/test-booking.mjs
git commit -m "feat(booking): HTTP kernel, guards, front controller and flow-test harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Public and customer API routes

**Files:**
- Create: `booking/src/Http/Routes/PublicRoutes.php`, `booking/src/Http/Routes/CustomerRoutes.php`
- Modify: `booking/src/App.php` (register both in `router()`)
- Test: `scripts/test-booking.mjs` (add tests above the `// ---- runner ----` line)

**Interfaces:**
- Consumes: `Booking`, `CustomerAuth`, `AppointmentChanges`, `Accounts`, `Notifications::download`, `Presenter`, `Idempotency`, `Input` (Tasks 11–16)
- Produces the JSON API that `src/booking/api.ts` (Task 19) consumes:

| Method and path | Auth | Request body | Success response |
|---|---|---|---|
| `GET appointment-types` | public | — | `{types: Type[]}` |
| `GET slots?type&from&to&exclude` | public | — | `{type, days: [{date, slots: [{start, label}]}]}` |
| `POST appointments` | public | `{requestId, type, start, mode, name, email, company, phone, address, note, consent, website}` | 201 `{status: "confirmed", appointment}` or 202 `{status: "held", reference, email, holdExpiresAt}` |
| `POST verify` | public | `{email, code, reference?}` | `{customer, appointment \| null, slotTaken}` plus session cookie |
| `POST login` | public | `{email}` | 202 `{}` |
| `POST logout` | public | `{}` | `{}` plus cleared cookie |
| `POST logout-all` | customer | `{}` | `{}` plus cleared cookie |
| `GET me` | customer | — | `{customer, company: {name}, members: Member[]}` |
| `PATCH me` | customer | `{name, phone, companyName?}` | same as `GET me` |
| `DELETE me` | customer | `{}` | `{}` plus cleared cookie |
| `GET me/bookings` | customer | — | `{appointments: Appointment[]}` |
| `POST appointments/{ref}/cancel` | customer | `{reason}` | `{appointment}` |
| `POST appointments/{ref}/reschedule` | customer | `{start}` | `{appointment}` |
| `GET appointments/{ref}/calendar.ics` | customer | — | `text/calendar` file |
| `POST company/members` | customer | `{email, name}` | 201 `{member}` |
| `DELETE company/members/{id}` | customer | `{}` | `{}` |

- [ ] **Step 1: Add the failing HTTP tests**

In `scripts/test-booking.mjs`, insert above `// ---- runner ----`:

```js
const TYPE = 'erstgespraech';

async function freeSlots(visitor, date) {
  const response = await visitor.get(`slots?type=${TYPE}&from=${date}&to=${date}`);
  assert.equal(response.status, 200, response.text);
  return response.json.days[0].slots;
}

function bookingBody(fields) {
  return { requestId: randomUUID(), type: TYPE, mode: 'video', name: 'Test Person', company: '', phone: '', address: '', note: '', consent: true, website: '', ...fields };
}

/** Anonymous booking plus code: returns the reference; the visitor is logged in afterwards. */
async function bookAndVerify(visitor, fields) {
  const { result: held, code } = await codeAfter(fields.email, () => visitor.post('appointments', bookingBody(fields)));
  assert.equal(held.status, 202, held.text);
  const verified = await visitor.post('verify', { email: fields.email, code, reference: held.json.reference });
  assert.equal(verified.status, 200, verified.text);
  return held.json.reference;
}

async function logIn(visitor, email) {
  const { code } = await codeAfter(email, () => visitor.post('login', { email }));
  const verified = await visitor.post('verify', { email, code });
  assert.equal(verified.status, 200, verified.text);
  return verified;
}

const unique = (prefix, visitor) => `${prefix}-${visitor.name.slice(0, 8)}@example.com`;

test('appointment types and free slots', async () => {
  const visitor = client();
  const types = await visitor.get('appointment-types');
  assert.equal(types.status, 200);
  assert.equal(types.json.types[0].slug, TYPE);
  assert.deepEqual(types.json.types[0].modes, ['phone', 'video']);
  const slots = await freeSlots(visitor, weekday(0, 1));
  assert.ok(slots.length >= 10, `only ${slots.length} slots`);
  assert.match(slots[0].label, /^\d{2}:\d{2}$/);
  assert.match(slots[0].start, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
  assert.equal((await visitor.get(`slots?type=${TYPE}&from=${weekday(0, 1)}&to=${weekday(3, 1)}`)).status, 422);
  assert.equal((await visitor.get('slots?type=unbekannt')).status, 404);
});

test('anonymous booking: hold, code, confirmation, session, calendar file', async () => {
  const visitor = client();
  const email = unique('anna', visitor);
  const day = weekday(0, 2);
  const [slot] = await freeSlots(visitor, day);
  const { result: held, code } = await codeAfter(email, () =>
    visitor.post('appointments', bookingBody({ start: slot.start, name: 'Anna Beispiel', email: ` ${email.toUpperCase()} `, company: 'Beispiel GmbH', note: 'Test <b>fett</b>' })),
  );
  assert.equal(held.status, 202, held.text);
  assert.deepEqual([held.json.status, held.json.email], ['held', email]);
  const verified = await visitor.post('verify', { email, code, reference: held.json.reference });
  assert.equal(verified.status, 200, verified.text);
  assert.equal(verified.json.appointment.status, 'confirmed');
  assert.equal(verified.json.slotTaken, false);
  assert.ok(visitor.jar.has('tu_session_dev'));
  const me = await visitor.get('me');
  assert.deepEqual([me.json.customer.email, me.json.company.name], [email, 'Beispiel GmbH']);
  const bookings = await visitor.get('me/bookings');
  assert.equal(bookings.json.appointments[0].reference, held.json.reference);
  assert.equal(bookings.json.appointments[0].canChange, true);
  const ics = await visitor.get(`appointments/${held.json.reference}/calendar.ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /^text\/calendar/);
  assert.match(ics.text, /METHOD:PUBLISH/);
  const confirmation = await waitForMail((m) => m.to.includes(email) && m.subject.startsWith('Termin bestätigt:'), 'confirmation');
  assert.match(confirmation.raw, /method=REQUEST/);
  await waitForMail((m) => m.to.includes('info@tayyipuenal.de') && m.subject.startsWith('Neuer Termin:') && m.subject.includes('Anna Beispiel'), 'owner invitation');
  const after = await freeSlots(client(), day);
  assert.ok(!after.some((s) => s.start === slot.start), 'booked slot is still offered');
});

test('idempotent retry: same answer, one hold, one code; changed data is refused', async () => {
  const visitor = client();
  const email = unique('rita', visitor);
  const [slot] = await freeSlots(visitor, weekday(0, 3));
  const payload = bookingBody({ start: slot.start, name: 'Rita Retry', email });
  const { result: first } = await codeAfter(email, () => visitor.post('appointments', payload));
  const again = await visitor.post('appointments', payload);
  assert.equal(first.status, 202, first.text);
  assert.equal(again.status, 202);
  assert.deepEqual(again.json, first.json);
  await sleep(500);
  assert.equal(mails().filter((m) => m.to.includes(email)).length, 1, 'second code mail sent');
  assert.equal((await visitor.post('appointments', { ...payload, name: 'Rita Anders' })).status, 409);
});

test('twenty parallel bookings of one slot: exactly one wins', async () => {
  const [slot] = await freeSlots(client(), weekday(0, 4));
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => {
      const visitor = client();
      return visitor.post('appointments', bookingBody({ start: slot.start, name: `Person ${i}`, email: unique(`race${i}`, visitor) }));
    }),
  );
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 202).length, 1, statuses.join(','));
  assert.equal(statuses.filter((s) => s === 409).length, 19, statuses.join(','));
});

test('validation, consent, honeypot, header injection and write guards', async () => {
  const visitor = client();
  const [slot] = await freeSlots(visitor, weekday(1, 1));
  const base = { start: slot.start, name: 'Vera', email: unique('vera', visitor) };
  assert.equal((await visitor.post('appointments', bookingBody({ ...base, consent: false }))).status, 422);
  assert.equal((await visitor.post('appointments', bookingBody({ ...base, website: 'https://spam.example' }))).status, 422);
  assert.equal((await visitor.post('appointments', bookingBody({ ...base, email: 'vera@example.com\r\nBcc: x@example.com' }))).status, 422);
  assert.equal((await visitor.post('appointments', bookingBody({ ...base, mode: 'phone' }))).status, 422);
  assert.equal((await visitor.post('appointments', bookingBody({ ...base, requestId: 'kein-uuid' }))).status, 422);
  assert.equal((await visitor.post('login', { email: 'x@example.com' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await visitor.call('POST', 'login', 'email=x', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await visitor.post('login', { email: 'x@example.com', pad: 'x'.repeat(40000) })).status, 413);
  assert.equal((await visitor.post('login', '{kaputt')).status, 400);
  assert.equal((await visitor.get('me')).status, 401);
  assert.equal((await visitor.get('appointments')).status, 405);
});

test('login by code, colleagues and company scoping', async () => {
  const max = client();
  const maxEmail = unique('max', max);
  const [slot] = await freeSlots(max, weekday(1, 2));
  const reference = await bookAndVerify(max, { start: slot.start, name: 'Max Muster', email: maxEmail, company: 'Muster GmbH' });
  const evaEmail = unique('eva', max);
  const invited = await max.post('company/members', { email: evaEmail, name: 'Eva Muster' });
  assert.equal(invited.status, 201, invited.text);
  await waitForMail((m) => m.to.includes(evaEmail) && m.subject === 'Einladung zum Kundenkonto von Muster GmbH', 'invitation');
  const eva = client();
  const login = await logIn(eva, evaEmail);
  assert.equal(login.json.appointment, null);
  const evaBookings = await eva.get('me/bookings');
  assert.deepEqual([evaBookings.json.appointments[0].reference, evaBookings.json.appointments[0].bookedBy], [reference, 'Max Muster']);
  const members = (await eva.get('me')).json.members;
  assert.deepEqual(members.map((m) => [m.email, m.self]).sort(), [[evaEmail, true], [maxEmail, false]].sort());

  const stranger = client();
  const [other] = await freeSlots(stranger, weekday(1, 3));
  await bookAndVerify(stranger, { start: other.start, name: 'Fremd', email: unique('fremd', stranger) });
  assert.equal((await stranger.post(`appointments/${reference}/cancel`, { reason: '' })).status, 404);
  assert.equal((await stranger.get(`appointments/${reference}/calendar.ics`)).status, 404);
  const strangerMember = members.find((m) => m.email === evaEmail);
  assert.equal((await stranger.del(`company/members/${strangerMember.id}`, {})).status, 404);

  const nobody = client();
  const unknownEmail = unique('niemand', nobody);
  assert.equal((await nobody.post('login', { email: unknownEmail })).status, 202);
  await waitForMail((m) => m.to.includes(unknownEmail) && m.subject === 'Anmeldung bei tayyipuenal.de', 'no-account note');
});

test('reschedule, cancel, profile, log out everywhere, delete account', async () => {
  const visitor = client();
  const email = unique('lisa', visitor);
  const slots = await freeSlots(visitor, weekday(2, 1));
  const reference = await bookAndVerify(visitor, { start: slots[0].start, mode: 'phone', phone: '0231 555', name: 'Lisa Lang', email });
  const moved = await visitor.post(`appointments/${reference}/reschedule`, { start: slots[4].start });
  assert.equal(moved.status, 200, moved.text);
  assert.equal(moved.json.appointment.start, slots[4].start);
  await waitForMail((m) => m.to.includes(email) && m.subject.startsWith('Termin verschoben:'), 'reschedule mail');
  const profile = await visitor.patch('me', { name: 'Lisa Lang-Muster', phone: '0231 556', companyName: 'Lang Consulting' });
  assert.deepEqual([profile.json.customer.name, profile.json.company.name], ['Lisa Lang-Muster', 'Lang Consulting']);
  const cancelled = await visitor.post(`appointments/${reference}/cancel`, { reason: 'Terminkonflikt' });
  assert.equal(cancelled.json.appointment.status, 'cancelled');

  const secondDevice = client(visitor.name);
  await logIn(secondDevice, email);
  assert.equal((await secondDevice.get('me')).status, 200);
  assert.equal((await visitor.post('logout-all', {})).status, 200);
  assert.equal((await secondDevice.get('me')).status, 401);

  await logIn(visitor, email);
  assert.equal((await visitor.del('me', {})).status, 200);
  assert.equal((await visitor.get('me')).status, 401);
  const known = new Set(mails().map((m) => m.file));
  await visitor.post('login', { email });
  await waitForMail((m) => m.to.includes(email) && m.subject === 'Anmeldung bei tayyipuenal.de', 'account is gone', known);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:booking`
Expected: the guard test passes; the seven new tests FAIL, for example `appointment types and free slots` with `AssertionError … 404 !== 200` (the routes do not exist yet).

- [ ] **Step 3: Write `booking/src/Http/Routes/PublicRoutes.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http\Routes;

use TuBooking\App;
use TuBooking\Application\BookingRequest;
use TuBooking\Domain\DomainError;
use TuBooking\Http\Context;
use TuBooking\Http\Input;
use TuBooking\Http\Response;
use TuBooking\Http\Router;
use TuBooking\Infrastructure\Time;

final class PublicRoutes
{
    public static function register(Router $router, App $app): void
    {
        $present = $app->presenter();

        $router->add('GET', 'appointment-types', 'public', static fn(Context $c): Response => Response::json(200, [
            'types' => array_map($present->type(...), $app->types()->active()),
        ]));

        $router->add('GET', 'slots', 'public', static function (Context $c) use ($app, $present): Response {
            $type = $app->booking()->activeType($c->request->query['type'] ?? '');
            $today = $app->clock->now()->setTimezone($app->zone())->format('Y-m-d');
            $from = max($today, Input::date($c->request->query['from'] ?? null, $today));
            $defaultTo = (new \DateTimeImmutable($from))->add(new \DateInterval('P13D'))->format('Y-m-d');
            $to = Input::date($c->request->query['to'] ?? null, $defaultTo);
            if ($to < $from || $to > $defaultTo) {
                throw DomainError::invalid('Bitte wählen Sie einen Zeitraum von höchstens 14 Tagen.');
            }
            $exclude = null;
            $reference = $c->request->query['exclude'] ?? '';
            if ($reference !== '' && $c->customer !== null) {
                $exclude = $app->appointments()->viewByReference($reference, $c->customer->companyId)?->id;
            }
            return Response::json(200, [
                'type' => $present->type($type),
                'days' => $present->days($app->booking()->days($type, $from, $to, $exclude)),
            ]);
        });

        $router->add('POST', 'appointments', 'public', static fn(Context $c): Response => $app->idempotencyGuard()->run($c, 'book', static function () use ($c, $app, $present): Response {
            $in = $c->input();
            $customer = $c->customer;
            $website = $in->raw('website');
            if ($website !== null && $website !== '') {
                throw DomainError::invalid('Bitte prüfen Sie Ihre Angaben.');
            }
            if ($customer === null && !$in->bool('consent')) {
                throw DomainError::invalid('Bitte bestätigen Sie die Datenschutzhinweise.');
            }
            $request = new BookingRequest(
                $in->line('type', 'Terminart', 60, true),
                $in->datetime('start', 'Uhrzeit'),
                $in->mode(),
                $customer?->name ?? $in->line('name', 'Name', 100, true, 2),
                $customer?->email ?? $in->email(),
                $customer === null ? $in->line('company', 'Unternehmen', 160) : '',
                $in->line('phone', 'Telefon', 40),
                $in->text('address', 'Adresse', 300),
                $in->text('note', 'Anmerkung', 2000),
            );
            $result = $app->booking()->book($request, $customer, $c->request->ip);
            if ($result['status'] === 'confirmed') {
                return Response::json(201, ['status' => 'confirmed', 'appointment' => $present->appointment($result['view'], $app->changes()->canChange($result['view']))]);
            }
            return Response::json(202, [
                'status' => 'held',
                'reference' => $result['view']->reference,
                'email' => $request->email,
                'holdExpiresAt' => Time::iso($result['holdExpiresAt'] ?? $app->clock->now()),
            ]);
        }));

        $router->add('POST', 'verify', 'public', static function (Context $c) use ($app, $present): Response {
            $in = $c->input();
            $reference = $in->line('reference', 'Referenz', 11);
            $result = $app->customerAuth()->verify($in->email(), $in->line('code', 'Code', 10, true), $reference !== '' ? $reference : null, $c->request->ip);
            return Response::json(200, [
                'customer' => $present->customer($result['customer']),
                'appointment' => $result['appointment'] === null ? null : $present->appointment($result['appointment'], $app->changes()->canChange($result['appointment'])),
                'slotTaken' => $result['slotTaken'],
            ])->withCookie($app->customerCookie()->issue($result['token'], 30 * 86400));
        });

        $router->add('POST', 'login', 'public', static function (Context $c) use ($app): Response {
            $app->customerAuth()->requestCode($c->input()->email(), $c->request->ip);
            return Response::json(202, []);
        });

        $router->add('POST', 'logout', 'public', static function (Context $c) use ($app): Response {
            if ($c->customerSession !== null) {
                $app->customerAuth()->logout($c->customerSession->tokenHash);
            }
            return Response::json(200, [])->withCookie($app->customerCookie()->clear());
        });
    }
}
```

- [ ] **Step 4: Write `booking/src/Http/Routes/CustomerRoutes.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http\Routes;

use TuBooking\App;
use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Model\AppointmentView;
use TuBooking\Domain\Model\Customer;
use TuBooking\Http\Context;
use TuBooking\Http\Response;
use TuBooking\Http\Router;

final class CustomerRoutes
{
    public static function register(Router $router, App $app): void
    {
        $present = $app->presenter();
        $account = static function (Customer $customer) use ($app, $present): array {
            $profile = $app->accounts()->profile($customer);
            return [
                'customer' => $present->customer($profile['customer']),
                'company' => ['name' => $profile['company']->name],
                'members' => array_map(static fn(Customer $member): array => $present->member($member, $customer->id), $profile['members']),
            ];
        };

        $router->add('GET', 'me', 'customer', static fn(Context $c): Response => Response::json(200, $account($c->customer())));

        $router->add('PATCH', 'me', 'customer', static function (Context $c) use ($app, $account): Response {
            $in = $c->input();
            $companyName = $in->raw('companyName') === null ? null : $in->line('companyName', 'Unternehmen', 160);
            $updated = $app->accounts()->update($c->customer(), $in->line('name', 'Name', 100, true, 2), $in->line('phone', 'Telefon', 40), $companyName);
            return Response::json(200, $account($updated));
        });

        $router->add('DELETE', 'me', 'customer', static function (Context $c) use ($app): Response {
            $customer = $c->customer();
            $app->accounts()->erase($customer, 'customer', $customer->id, 'Kundenkonto gelöscht');
            return Response::json(200, [])->withCookie($app->customerCookie()->clear());
        });

        $router->add('POST', 'logout-all', 'customer', static function (Context $c) use ($app): Response {
            $app->customerAuth()->logoutAll($c->customer());
            return Response::json(200, [])->withCookie($app->customerCookie()->clear());
        });

        $router->add('GET', 'me/bookings', 'customer', static fn(Context $c): Response => Response::json(200, [
            'appointments' => array_map(
                static fn(AppointmentView $a): array => $present->appointment($a, $app->changes()->canChange($a)),
                $app->accounts()->bookings($c->customer()),
            ),
        ]));

        $router->add('POST', 'appointments/{ref}/cancel', 'customer', static function (Context $c) use ($app, $present): Response {
            $view = $app->changes()->cancel($c->customer(), $c->param('ref'), $c->input()->text('reason', 'Grund', 500));
            return Response::json(200, ['appointment' => $present->appointment($view, false)]);
        });

        $router->add('POST', 'appointments/{ref}/reschedule', 'customer', static function (Context $c) use ($app, $present): Response {
            $view = $app->changes()->reschedule($c->customer(), $c->param('ref'), $c->input()->datetime('start', 'Uhrzeit'));
            return Response::json(200, ['appointment' => $present->appointment($view, $app->changes()->canChange($view))]);
        });

        $router->add('GET', 'appointments/{ref}/calendar.ics', 'customer', static function (Context $c) use ($app): Response {
            $view = $app->appointments()->viewByReference($c->param('ref'), $c->customer()->companyId);
            if ($view === null || $view->status !== AppointmentStatus::Confirmed) {
                throw DomainError::notFound('Dieser Termin wurde nicht gefunden.');
            }
            return Response::file($app->notifications()->download($view), 'text/calendar; charset=utf-8', 'termin-' . $view->reference . '.ics');
        });

        $router->add('POST', 'company/members', 'customer', static function (Context $c) use ($app, $present): Response {
            $in = $c->input();
            $member = $app->accounts()->invite($c->customer(), $in->email(), $in->line('name', 'Name', 100, true, 2));
            return Response::json(201, ['member' => $present->member($member, $c->customer()->id)]);
        });

        $router->add('DELETE', 'company/members/{id}', 'customer', static function (Context $c) use ($app): Response {
            $app->accounts()->removeMember($c->customer(), (int) $c->param('id'));
            return Response::json(200, []);
        });
    }
}
```

- [ ] **Step 5: Register both in `App::router()`**

Add the `use` lines:

```php
use TuBooking\Http\Routes\CustomerRoutes;
use TuBooking\Http\Routes\PublicRoutes;
```

and change the body of `router()`'s factory to:

```php
            $router = new Router();
            PublicRoutes::register($router, $this);
            CustomerRoutes::register($router, $this);
            MaintenanceRoutes::register($router, $this);
            return $router;
```

- [ ] **Step 6: Run the tests**

Run: `npm run booking:down && npm run booking:up && npm run test:booking`
Expected: all 8 tests PASS, `All 8 booking HTTP tests passed.` Restarting the stack gives an empty in-memory database.

Run: `npm run booking:test && npm run booking:stan`
Expected: PHPUnit `OK`; PHPStan `[OK] No errors`.

- [ ] **Step 7: Commit**

```bash
git add booking/src/App.php booking/src/Http/Routes scripts/test-booking.mjs
git commit -m "feat(booking): public and customer API with HTTP flow tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Admin API routes

**Files:**
- Create: `booking/src/Http/Routes/AdminRoutes.php`
- Modify: `booking/src/App.php` (register in `router()`), `package.json` (script `test:booking:fresh`)
- Test: `scripts/test-booking.mjs` (add tests above `// ---- runner ----`)

**Interfaces:**
- Consumes: `AdminAuth`, `AdminSchedule`, `AdminAppointments`, `AdminCustomers`, `AdminSettings`, `Maintenance`, `Presenter`, `Idempotency`, `Input` (Tasks 13–16)
- Produces the admin JSON API that `src/admin/api.ts` (Task 21) consumes. Everything is `admin` auth unless marked otherwise.

**Login and session**

| Method and path | Auth | Request body | Response |
|---|---|---|---|
| `GET admin/session` | public | — | `{state: "none"\|"needsTotp"\|"needsPairing"\|"ok", admin \| null}` |
| `POST admin/setup` | public | `{key, email, name}` | 202 |
| `POST admin/login` | public | `{email}` | 202 |
| `POST admin/verify` | public | `{email, code}` | `{state}` plus admin cookie |
| `POST admin/totp/start` | admin-pending | `{}` | `{secret, uri}` |
| `POST admin/totp/confirm` | admin-pending | `{code}` | `{state: "ok"}` |
| `POST admin/totp` | admin-pending | `{code}` | `{state: "ok"}` |
| `POST admin/logout` | public | `{}` | `{}` plus cleared cookie |

**Overview and schedule**

| Method and path | Request body | Response |
|---|---|---|
| `GET admin/overview` | — | `{upcoming: AdminAppointment[], failedEmails, lastMaintenance}` |
| `GET admin/appointment-types` | — | `{types: AdminType[]}` |
| `POST admin/appointment-types` | TypeFields as JSON (modes as strings) | 201 `{type}` |
| `PATCH admin/appointment-types/{id}` | TypeFields as JSON | `{type}` |
| `GET admin/availability` | — | `{rules}` |
| `PUT admin/availability` | `{typeId \| null, rules: [{weekday, start, end}]}` | `{rules}` |
| `GET admin/absences` | — | `{absences: [{id, start, end, note}]}` |
| `POST admin/absences` | `{start, end, note}` | 201 `{id}` |
| `DELETE admin/absences/{id}` | — | `{}` |

**Appointments**

| Method and path | Request body | Response |
|---|---|---|
| `GET admin/appointments?from&to&status` | — | `{appointments}` |
| `POST admin/appointments` | `{requestId, type, start, mode, name, email, company, phone, address, note, force}` | 201 `{appointment}` |
| `POST admin/appointments/{ref}/cancel` | `{reason}` | `{appointment}` |
| `POST admin/appointments/{ref}/reschedule` | `{start, force}` | `{appointment}` |

**Customers**

| Method and path | Request body | Response |
|---|---|---|
| `GET admin/customers?search` | — | `{companies}` |
| `GET admin/companies/{id}` | — | `{company, members, appointments}` |
| `PATCH admin/companies/{id}` | `{name}` | `{}` |
| `POST admin/companies/{id}/members` | `{email, name}` | 201 `{member}` |
| `PATCH admin/customers/{id}` | `{name, phone, companyId?}` | `{customer}` |
| `DELETE admin/customers/{id}` | — | `{}` |

**Settings and maintenance**

| Method and path | Request body | Response |
|---|---|---|
| `GET admin/outbox` | — | `{failed}` |
| `POST admin/outbox/{id}/retry` | — | `{}` |
| `GET admin/audit` | — | `{entries}` |
| `GET admin/export` | — | JSON file |
| `GET admin/admins` | — | `{admins}` |
| `POST admin/admins` | `{email, name}` | 201 `{admin}` |
| `GET admin/settings` | — | `{ownerEmail}` |
| `PUT admin/settings` | `{ownerEmail}` | `{ownerEmail}` |
| `POST admin/maintenance/run` | — | `{stats}` |

- [ ] **Step 1: Add the failing HTTP tests**

In `scripts/test-booking.mjs`, insert above `// ---- runner ----`:

```js
const OWNER = 'info@tayyipuenal.de';

test('admin: setup link, authenticator, every operation, logout', async () => {
  const admin = client();
  assert.equal((await admin.get('admin/session')).json.state, 'none');
  assert.equal((await admin.post('admin/setup', { key: 'falsch', email: OWNER, name: 'Tayyip Ünal' })).status, 403);
  const { code } = await codeAfter(OWNER, () => admin.post('admin/setup', { key: 'local-setup-key', email: OWNER, name: 'Tayyip Ünal' }), ADMIN_CODE);
  const verified = await admin.post('admin/verify', { email: OWNER, code });
  assert.equal(verified.json.state, 'needsPairing', verified.text);
  assert.ok(admin.jar.has('tu_admin_dev'));
  assert.equal((await admin.get('admin/overview')).status, 401);
  const pairing = await admin.post('admin/totp/start', {});
  assert.match(pairing.json.uri, /^otpauth:\/\/totp\//);
  assert.equal((await admin.post('admin/totp/confirm', { code: totp(pairing.json.secret) })).status, 200);
  const session = await admin.get('admin/session');
  assert.deepEqual([session.json.state, session.json.admin.email, session.json.admin.paired], ['ok', OWNER, true]);
  assert.equal((await admin.post('admin/setup', { key: 'local-setup-key', email: 'x@example.com', name: 'X' })).status, 403);

  // Appointment types and weekly hours
  const types = await admin.get('admin/appointment-types');
  assert.equal(types.json.types[0].slug, TYPE);
  const typeFields = { slug: 'beratung-vor-ort', title: 'Beratung vor Ort', description: 'Bei Ihnen im Unternehmen.', durationMin: 90, modes: ['onsite'], bufferMin: 30, slotStepMin: 30, leadTimeH: 48, horizonDays: 90, videoLink: '', active: false, sort: 5 };
  const created = await admin.post('admin/appointment-types', typeFields);
  assert.equal(created.status, 201, created.text);
  const updated = await admin.patch(`admin/appointment-types/${created.json.type.id}`, { ...typeFields, title: 'Beratung bei Ihnen', active: true });
  assert.deepEqual([updated.json.type.title, updated.json.type.active], ['Beratung bei Ihnen', true]);
  assert.equal((await admin.patch(`admin/appointment-types/${created.json.type.id}`, { ...typeFields, modes: [] })).status, 422);
  const rules = await admin.put('admin/availability', { typeId: created.json.type.id, rules: [{ weekday: 3, start: '10:00', end: '12:00' }] });
  assert.ok(rules.json.rules.some((r) => r.typeId === created.json.type.id && r.weekday === 3));
  assert.equal((await admin.put('admin/availability', { typeId: null, rules: [{ weekday: 3, start: '12:00', end: '10:00' }] })).status, 422);

  // Absences
  const absence = await admin.post('admin/absences', { start: `${weekday(4, 1)}T06:00:00Z`, end: `${weekday(4, 1)}T16:00:00Z`, note: 'Seminar' });
  assert.equal(absence.status, 201, absence.text);
  assert.ok((await admin.get('admin/absences')).json.absences.some((a) => a.id === absence.json.id && a.note === 'Seminar'));
  assert.equal((await freeSlots(client(), weekday(4, 1))).length, 0);
  assert.equal((await admin.del(`admin/absences/${absence.json.id}`, {})).status, 200);

  // A phoned-in appointment on a Saturday, an overlap, a move and a cancellation
  const saturday = `${weekday(2, 6)}T08:00:00Z`;
  const guest = `telefon-${admin.name.slice(0, 8)}@example.com`;
  const phoned = await admin.post('admin/appointments', { requestId: randomUUID(), type: TYPE, start: saturday, mode: 'phone', name: 'Paul Telefon', email: guest, company: 'Telefon AG', phone: '0231 42', address: '', note: 'Rückruf gewünscht', force: false });
  assert.equal(phoned.status, 201, phoned.text);
  await waitForMail((m) => m.to.includes(guest) && m.subject.startsWith('Termin bestätigt:'), 'phoned-in confirmation');
  const overlap = { requestId: randomUUID(), type: TYPE, start: saturday.replace('08:00', '08:15'), mode: 'phone', name: 'Zweite Person', email: `zwei-${admin.name.slice(0, 8)}@example.com`, company: '', phone: '0231 43', address: '', note: '', force: false };
  const refused = await admin.post('admin/appointments', overlap);
  assert.equal(refused.status, 409);
  assert.match(refused.json.message, /Überschneidung/);
  assert.equal((await admin.post('admin/appointments', { ...overlap, requestId: randomUUID(), force: true })).status, 201);
  const reference = phoned.json.appointment.reference;
  const moved = await admin.post(`admin/appointments/${reference}/reschedule`, { start: saturday.replace('08:00', '12:00'), force: false });
  assert.equal(moved.status, 200, moved.text);
  const cancelled = await admin.post(`admin/appointments/${reference}/cancel`, { reason: 'Krankheitsbedingt' });
  assert.deepEqual([cancelled.json.appointment.status, cancelled.json.appointment.cancelledBy], ['cancelled', 'owner']);
  const cancelMail = await waitForMail((m) => m.to.includes(guest) && m.subject.startsWith('Termin storniert:'), 'cancellation');
  assert.match(cancelMail.raw, /method=CANCEL/);
  const listed = await admin.get(`admin/appointments?from=${weekday(2, 6)}&to=${weekday(2, 6)}`);
  assert.equal(listed.json.appointments.length, 2);

  // Customers
  const found = await admin.get(`admin/customers?search=${encodeURIComponent(guest)}`);
  const companyId = found.json.companies[0].id;
  const company = await admin.get(`admin/companies/${companyId}`);
  assert.deepEqual([company.json.company.name, company.json.members[0].email], ['Telefon AG', guest]);
  assert.equal((await admin.patch(`admin/companies/${companyId}`, { name: 'Telefon AG & Co. KG' })).status, 200);
  const colleague = await admin.post(`admin/companies/${companyId}/members`, { email: `kollegin-${admin.name.slice(0, 8)}@example.com`, name: 'Klara Kollegin' });
  assert.equal(colleague.status, 201, colleague.text);
  const renamed = await admin.patch(`admin/customers/${colleague.json.member.id}`, { name: 'Klara K.', phone: '0231 44' });
  assert.equal(renamed.json.customer.name, 'Klara K.');
  assert.equal((await admin.del(`admin/customers/${colleague.json.member.id}`, {})).status, 200);

  // Settings, failed emails, audit, export, second admin, maintenance, overview
  assert.equal((await admin.put('admin/settings', { ownerEmail: 'kein-email' })).status, 422);
  assert.equal((await admin.put('admin/settings', { ownerEmail: 'termine@tayyipuenal.de' })).json.ownerEmail, 'termine@tayyipuenal.de');
  assert.equal((await admin.put('admin/settings', { ownerEmail: OWNER })).json.ownerEmail, OWNER);
  assert.deepEqual((await admin.get('admin/outbox')).json.failed, []);
  assert.ok((await admin.get('admin/audit')).json.entries.length > 5);
  const exported = await admin.get('admin/export');
  assert.match(exported.headers.get('content-disposition'), /attachment; filename="terminbuchung-export-\d{4}-\d{2}-\d{2}\.json"/);
  assert.ok(JSON.parse(exported.text).customers.some((c) => c.email === guest));
  const invited = await admin.post('admin/admins', { email: `assistenz-${admin.name.slice(0, 8)}@example.com`, name: 'Büro' });
  assert.equal(invited.status, 201, invited.text);
  assert.equal((await admin.get('admin/admins')).json.admins.length, 2);
  assert.equal((await admin.post('admin/maintenance/run', {})).status, 200);
  const overview = await admin.get('admin/overview');
  assert.equal(typeof overview.json.failedEmails, 'number');
  assert.ok(Array.isArray(overview.json.upcoming));

  // Customers never reach admin routes
  const customer = client();
  await bookAndVerify(customer, { start: (await freeSlots(customer, weekday(2, 2)))[0].start, name: 'Kunde', email: unique('kunde', customer) });
  assert.equal((await customer.get('admin/overview')).status, 401);

  // Log out; log in again with code + the next authenticator step; a replayed code is refused
  assert.equal((await admin.post('admin/logout', {})).status, 200);
  assert.equal((await admin.get('admin/session')).json.state, 'none');
  const again = await codeAfter(OWNER, () => admin.post('admin/login', { email: OWNER }), ADMIN_CODE);
  assert.equal((await admin.post('admin/verify', { email: OWNER, code: again.code })).json.state, 'needsTotp');
  const nextStep = totp(pairing.json.secret, Date.now() + 30_000);
  assert.equal((await admin.post('admin/totp', { code: nextStep })).status, 200);
  const replay = await codeAfter(OWNER, () => admin.post('admin/login', { email: OWNER }), ADMIN_CODE);
  await admin.post('admin/verify', { email: OWNER, code: replay.code });
  assert.equal((await admin.post('admin/totp', { code: nextStep })).status, 422);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run booking:down && npm run booking:up && npm run test:booking`
Expected: the eight earlier tests PASS. `admin: setup link, authenticator, …` FAILS with `AssertionError … 404 !== …`, because `admin/session` does not exist yet.

- [ ] **Step 3: Write `booking/src/Http/Routes/AdminRoutes.php`**

```php
<?php
declare(strict_types=1);

namespace TuBooking\Http\Routes;

use TuBooking\App;
use TuBooking\Application\AdminAuth;
use TuBooking\Application\BookingRequest;
use TuBooking\Domain\AppointmentStatus;
use TuBooking\Domain\DomainError;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Model\Customer;
use TuBooking\Domain\WeeklyWindow;
use TuBooking\Http\Context;
use TuBooking\Http\Input;
use TuBooking\Http\Response;
use TuBooking\Http\Router;
use TuBooking\Infrastructure\Repository\AppointmentTypes;
use TuBooking\Infrastructure\Time;

/** @phpstan-import-type TypeFields from AppointmentTypes */
final class AdminRoutes
{
    public static function register(Router $router, App $app): void
    {
        self::auth($router, $app);
        self::schedule($router, $app);
        self::appointments($router, $app);
        self::customers($router, $app);
        self::settings($router, $app);
    }

    private static function auth(Router $router, App $app): void
    {
        $present = $app->presenter();
        $cookie = $app->adminCookie();
        $router->add('GET', 'admin/session', 'public', static function (Context $c) use ($app, $present): Response {
            $state = $app->adminAuth()->state($c->adminSession);
            return Response::json(200, [
                'state' => $state['state'],
                'admin' => $state['state'] === 'ok' && $state['admin'] !== null ? $present->admin($state['admin']) : null,
            ]);
        });
        $router->add('POST', 'admin/setup', 'public', static function (Context $c) use ($app): Response {
            $in = $c->input();
            $app->adminAuth()->setup($in->line('key', 'Einrichtungsschlüssel', 200, true), $in->email(), $in->line('name', 'Name', 100, true, 2), $c->request->ip);
            return Response::json(202, []);
        });
        $router->add('POST', 'admin/login', 'public', static function (Context $c) use ($app): Response {
            $app->adminAuth()->requestCode($c->input()->email(), $c->request->ip);
            return Response::json(202, []);
        });
        $router->add('POST', 'admin/verify', 'public', static function (Context $c) use ($app, $cookie): Response {
            $in = $c->input();
            $result = $app->adminAuth()->verifyCode($in->email(), $in->line('code', 'Code', 10, true), $c->request->ip);
            return Response::json(200, ['state' => $result['state']])->withCookie($cookie->issue($result['token'], AdminAuth::SESSION_HOURS * 3600));
        });
        $router->add('POST', 'admin/totp/start', 'admin-pending', static fn(Context $c): Response => Response::json(200, $app->adminAuth()->startPairing($c->adminSession())));
        $router->add('POST', 'admin/totp/confirm', 'admin-pending', static function (Context $c) use ($app): Response {
            $app->adminAuth()->confirmPairing($c->adminSession(), $c->input()->line('code', 'Code', 10, true));
            return Response::json(200, ['state' => 'ok']);
        });
        $router->add('POST', 'admin/totp', 'admin-pending', static function (Context $c) use ($app): Response {
            $app->adminAuth()->verifyTotp($c->adminSession(), $c->input()->line('code', 'Code', 10, true));
            return Response::json(200, ['state' => 'ok']);
        });
        $router->add('POST', 'admin/logout', 'public', static function (Context $c) use ($app, $cookie): Response {
            if ($c->adminSession !== null) {
                $app->adminAuth()->logout($c->adminSession->tokenHash);
            }
            return Response::json(200, [])->withCookie($cookie->clear());
        });
    }

    private static function schedule(Router $router, App $app): void
    {
        $present = $app->presenter();
        $router->add('GET', 'admin/appointment-types', 'admin', static fn(Context $c): Response => Response::json(200, [
            'types' => array_map($present->typeAdmin(...), $app->adminSchedule()->types()),
        ]));
        $router->add('POST', 'admin/appointment-types', 'admin', static fn(Context $c): Response => Response::json(201, [
            'type' => $present->typeAdmin($app->adminSchedule()->saveType($c->admin(), null, self::typeFields($c->input()))),
        ]));
        $router->add('PATCH', 'admin/appointment-types/{id}', 'admin', static fn(Context $c): Response => Response::json(200, [
            'type' => $present->typeAdmin($app->adminSchedule()->saveType($c->admin(), (int) $c->param('id'), self::typeFields($c->input()))),
        ]));
        $router->add('GET', 'admin/availability', 'admin', static fn(Context $c): Response => Response::json(200, ['rules' => $app->adminSchedule()->rules()]));
        $router->add('PUT', 'admin/availability', 'admin', static function (Context $c) use ($app): Response {
            $in = $c->input();
            $windows = [];
            foreach ($in->list('rules') as $rule) {
                if (!is_array($rule) || !is_int($rule['weekday'] ?? null) || !is_string($rule['start'] ?? null) || !is_string($rule['end'] ?? null)) {
                    throw DomainError::invalid('Bitte prüfen Sie die Zeiten.');
                }
                try {
                    $windows[] = new WeeklyWindow($rule['weekday'], $rule['start'], $rule['end']);
                } catch (\InvalidArgumentException) {
                    throw DomainError::invalid('Bitte prüfen Sie die Zeiten: Jeder Zeitraum braucht einen Beginn vor dem Ende (HH:MM).');
                }
            }
            $app->adminSchedule()->replaceRules($c->admin(), $in->optionalInt('typeId'), $windows);
            return Response::json(200, ['rules' => $app->adminSchedule()->rules()]);
        });
        $router->add('GET', 'admin/absences', 'admin', static fn(Context $c): Response => Response::json(200, [
            'absences' => array_map(
                static fn(array $a): array => ['id' => $a['id'], 'start' => Time::iso($a['start']), 'end' => Time::iso($a['end']), 'note' => $a['note']],
                $app->adminSchedule()->absences(),
            ),
        ]));
        $router->add('POST', 'admin/absences', 'admin', static function (Context $c) use ($app): Response {
            $in = $c->input();
            $id = $app->adminSchedule()->addAbsence($c->admin(), $in->datetime('start', 'Beginn'), $in->datetime('end', 'Ende'), $in->line('note', 'Notiz', 200));
            return Response::json(201, ['id' => $id]);
        });
        $router->add('DELETE', 'admin/absences/{id}', 'admin', static function (Context $c) use ($app): Response {
            $app->adminSchedule()->deleteAbsence($c->admin(), (int) $c->param('id'));
            return Response::json(200, []);
        });
    }

    private static function appointments(Router $router, App $app): void
    {
        $present = $app->presenter();
        $router->add('GET', 'admin/overview', 'admin', static function (Context $c) use ($app, $present): Response {
            $now = $app->clock->now();
            return Response::json(200, [
                'upcoming' => array_map($present->appointmentAdmin(...), $app->adminAppointments()->list($now, $now->add(new \DateInterval('P14D')), AppointmentStatus::Confirmed)),
                'failedEmails' => $app->outbox()->countFailed(),
                'lastMaintenance' => $app->maintenance()->lastRun(),
            ]);
        });
        $router->add('GET', 'admin/appointments', 'admin', static function (Context $c) use ($app, $present): Response {
            $zone = $app->zone();
            $today = $app->clock->now()->setTimezone($zone)->format('Y-m-d');
            $from = Input::date($c->request->query['from'] ?? null, $today);
            $to = Input::date($c->request->query['to'] ?? null, (new \DateTimeImmutable($from))->add(new \DateInterval('P31D'))->format('Y-m-d'));
            $statusValue = $c->request->query['status'] ?? '';
            $status = $statusValue === '' ? null : (AppointmentStatus::tryFrom($statusValue) ?? throw DomainError::invalid('Unbekannter Status.'));
            $list = $app->adminAppointments()->list(
                new \DateTimeImmutable($from . ' 00:00', $zone),
                (new \DateTimeImmutable($to . ' 00:00', $zone))->add(new \DateInterval('P1D')),
                $status,
            );
            return Response::json(200, ['appointments' => array_map($present->appointmentAdmin(...), $list)]);
        });
        $router->add('POST', 'admin/appointments', 'admin', static fn(Context $c): Response => $app->idempotencyGuard()->run($c, 'admin-book', static function () use ($c, $app, $present): Response {
            $in = $c->input();
            $request = new BookingRequest(
                $in->line('type', 'Terminart', 60, true),
                $in->datetime('start', 'Beginn'),
                $in->mode(),
                $in->line('name', 'Name', 100, true, 2),
                $in->email(),
                $in->line('company', 'Unternehmen', 160),
                $in->line('phone', 'Telefon', 40),
                $in->text('address', 'Adresse', 300),
                $in->text('note', 'Anmerkung', 2000),
            );
            return Response::json(201, ['appointment' => $present->appointmentAdmin($app->adminAppointments()->create($c->admin(), $request, $in->bool('force')))]);
        }));
        $router->add('POST', 'admin/appointments/{ref}/cancel', 'admin', static fn(Context $c): Response => Response::json(200, [
            'appointment' => $present->appointmentAdmin($app->adminAppointments()->cancel($c->admin(), $c->param('ref'), $c->input()->text('reason', 'Nachricht', 500))),
        ]));
        $router->add('POST', 'admin/appointments/{ref}/reschedule', 'admin', static function (Context $c) use ($app, $present): Response {
            $in = $c->input();
            return Response::json(200, [
                'appointment' => $present->appointmentAdmin($app->adminAppointments()->reschedule($c->admin(), $c->param('ref'), $in->datetime('start', 'Beginn'), $in->bool('force'))),
            ]);
        });
    }

    private static function customers(Router $router, App $app): void
    {
        $present = $app->presenter();
        $member = static fn(Customer $m): array => ['id' => $m->id, 'companyId' => $m->companyId, 'name' => $m->name, 'email' => $m->email, 'phone' => $m->phone];
        $router->add('GET', 'admin/customers', 'admin', static fn(Context $c): Response => Response::json(200, [
            'companies' => $app->adminCustomers()->search($c->request->query['search'] ?? ''),
        ]));
        $router->add('GET', 'admin/companies/{id}', 'admin', static function (Context $c) use ($app, $present, $member): Response {
            $company = $app->adminCustomers()->company((int) $c->param('id'));
            return Response::json(200, [
                'company' => ['id' => $company['company']->id, 'name' => $company['company']->name],
                'members' => array_map($member, $company['members']),
                'appointments' => array_map($present->appointmentAdmin(...), $company['appointments']),
            ]);
        });
        $router->add('PATCH', 'admin/companies/{id}', 'admin', static function (Context $c) use ($app): Response {
            $name = $c->input()->line('name', 'Firmenname', 160);
            $app->adminCustomers()->renameCompany($c->admin(), (int) $c->param('id'), $name !== '' ? $name : null);
            return Response::json(200, []);
        });
        $router->add('POST', 'admin/companies/{id}/members', 'admin', static function (Context $c) use ($app, $member): Response {
            $in = $c->input();
            return Response::json(201, ['member' => $member($app->adminCustomers()->addMember($c->admin(), (int) $c->param('id'), $in->email(), $in->line('name', 'Name', 100, true, 2)))]);
        });
        $router->add('PATCH', 'admin/customers/{id}', 'admin', static function (Context $c) use ($app, $member): Response {
            $in = $c->input();
            return Response::json(200, ['customer' => $member($app->adminCustomers()->updateCustomer(
                $c->admin(), (int) $c->param('id'), $in->line('name', 'Name', 100, true, 2), $in->line('phone', 'Telefon', 40), $in->optionalInt('companyId'),
            ))]);
        });
        $router->add('DELETE', 'admin/customers/{id}', 'admin', static function (Context $c) use ($app): Response {
            $app->adminCustomers()->deleteCustomer($c->admin(), (int) $c->param('id'));
            return Response::json(200, []);
        });
    }

    private static function settings(Router $router, App $app): void
    {
        $present = $app->presenter();
        $router->add('GET', 'admin/outbox', 'admin', static fn(Context $c): Response => Response::json(200, ['failed' => $app->adminSettings()->failedEmails()]));
        $router->add('POST', 'admin/outbox/{id}/retry', 'admin', static function (Context $c) use ($app): Response {
            $app->adminSettings()->retryEmail($c->admin(), (int) $c->param('id'));
            return Response::json(200, []);
        });
        $router->add('GET', 'admin/audit', 'admin', static fn(Context $c): Response => Response::json(200, ['entries' => $app->adminSettings()->auditLog()]));
        $router->add('GET', 'admin/export', 'admin', static fn(Context $c): Response => Response::file(
            json_encode($app->adminSettings()->export(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            'application/json; charset=utf-8',
            'terminbuchung-export-' . $app->clock->now()->format('Y-m-d') . '.json',
        ));
        $router->add('GET', 'admin/admins', 'admin', static fn(Context $c): Response => Response::json(200, ['admins' => array_map($present->admin(...), $app->adminSettings()->admins())]));
        $router->add('POST', 'admin/admins', 'admin', static function (Context $c) use ($app, $present): Response {
            $in = $c->input();
            return Response::json(201, ['admin' => $present->admin($app->adminAuth()->invite($c->admin(), $in->email(), $in->line('name', 'Name', 100, true, 2)))]);
        });
        $router->add('GET', 'admin/settings', 'admin', static fn(Context $c): Response => Response::json(200, ['ownerEmail' => $app->adminSettings()->ownerEmail()]));
        $router->add('PUT', 'admin/settings', 'admin', static function (Context $c) use ($app): Response {
            $app->adminSettings()->setOwnerEmail($c->admin(), $c->input()->email('ownerEmail'));
            return Response::json(200, ['ownerEmail' => $app->adminSettings()->ownerEmail()]);
        });
        $router->add('POST', 'admin/maintenance/run', 'admin', static fn(Context $c): Response => Response::json(200, ['stats' => $app->maintenance()->run('manual')]));
    }

    /** @return TypeFields */
    private static function typeFields(Input $in): array
    {
        $modes = [];
        foreach ($in->list('modes') as $value) {
            $mode = is_string($value) ? Mode::tryFrom($value) : null;
            if ($mode === null) {
                throw DomainError::invalid('Bitte prüfen Sie die Terminformen.');
            }
            if (!in_array($mode, $modes, true)) {
                $modes[] = $mode;
            }
        }
        $videoLink = $in->line('videoLink', 'Video-Link', 300);
        if ($videoLink !== '' && !str_starts_with($videoLink, 'https://')) {
            throw DomainError::invalid('Der Video-Link muss mit https:// beginnen.');
        }
        return [
            'slug' => $in->line('slug', 'Kurzbezeichnung', 60, true),
            'title' => $in->line('title', 'Titel', 120, true),
            'description' => $in->text('description', 'Beschreibung', 600),
            'durationMin' => $in->int('durationMin', 'Dauer', 10, 480),
            'modes' => $modes,
            'bufferMin' => $in->int('bufferMin', 'Puffer', 0, 240),
            'slotStepMin' => $in->int('slotStepMin', 'Raster', 5, 240),
            'leadTimeH' => $in->int('leadTimeH', 'Vorlauf', 0, 720),
            'horizonDays' => $in->int('horizonDays', 'Buchbar für', 1, 365),
            'videoLink' => $videoLink !== '' ? $videoLink : null,
            'active' => $in->bool('active'),
            'sort' => $in->int('sort', 'Reihenfolge', -100, 100),
        ];
    }
}
```

- [ ] **Step 4: Register the routes and add the fresh-stack script**

In `booking/src/App.php` add `use TuBooking\Http\Routes\AdminRoutes;`. In `router()`, add `AdminRoutes::register($router, $this);` directly after the `CustomerRoutes` line.

In `package.json` `"scripts"`, add:

```json
    "test:booking:fresh": "npm run booking:down && npm run booking:up && npm run test:booking"
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:booking:fresh`
Expected: all 9 tests PASS, `All 9 booking HTTP tests passed.`

Run: `npm run booking:test && npm run booking:stan`
Expected: PHPUnit `OK`; PHPStan `[OK] No errors`.

- [ ] **Step 6: Commit**

```bash
git add booking/src/App.php booking/src/Http/Routes/AdminRoutes.php scripts/test-booking.mjs package.json
git commit -m "feat(booking): admin API with setup, authenticator and operations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Booking dialog on the site

**Files:**
- Create: `src/booking/api.ts`, `src/booking/dates.ts`, `src/booking/presets.ts`, `src/booking/SlotPicker.tsx`, `src/booking/BookingDialog.tsx`, `src/booking/booking.css`
- Modify: `src/App.tsx` (booking state, lazy dialog, button wiring), `src/components/SccJourney.tsx` ("Termin vereinbaren" opens booking)

**Interfaces:**
- Consumes: the public/customer API (Task 17); `SUBMIT_FAILED`, `CONNECTION_LOST` from `src/api.ts`; `appointmentPreset` from `src/consultation.ts`; the configurator's CSS classes (`quote-progress`, `quote-segment`, `quote-panel`, `quote-hint`, `quote-footer`, `quote-back`, `quote-next`, `quote-success`, `quote-summary`, `quote-reference`, `quote-ghost`) and the form classes from `src/conversion.css`
- Produces:
  - `src/booking/api.ts`:
    - types `Mode`, `AppointmentType`, `Slot`, `SlotDay`, `Appointment`, `Customer`, `Member`, `Account`, `BookingInput`, `BookResult`, `VerifyResult`
    - `modeLabels`, `class ApiError { status: number }`
    - `apiRequest<T>(method, path, body?)`, `bookingApi` (object with one function per endpoint), `calendarUrl(reference)`
  - `src/booking/dates.ts`: `berlinToday()`, `addDays(date, days)`, `dayLabel(date)`, `formatDateLong(iso)`, `formatTime(iso)`
  - `src/booking/presets.ts`: `type BookingPreset = { kicker; title; type?; note? }`, `firstMeetingBooking`, `sccAppointmentBooking`
  - `SlotPicker` (named export) `({ type, value, onChange, exclude? })`
  - `BookingDialog` (default export, lazy-loaded) `({ preset, onClose, onMessage })`

The repository has no JavaScript test runner, and adding one would be a new dependency the spec doesn't need. So the checks are `tsc`, `eslint`, `build`, and a scripted browser run against the Docker API. The HTTP behaviour is already covered by `scripts/test-booking.mjs`.

- [ ] **Step 1: Write `src/booking/api.ts`**

```ts
import { CONNECTION_LOST, SUBMIT_FAILED } from "../api";

export type Mode = "phone" | "video" | "onsite";
export const modeLabels: Record<Mode, string> = { phone: "Telefon", video: "Video", onsite: "Vor Ort" };

export type AppointmentType = { slug: string; title: string; description: string; durationMin: number; modes: Mode[] };
export type Slot = { start: string; label: string };
export type SlotDay = { date: string; slots: Slot[] };
export type Appointment = {
  reference: string;
  type: string;
  typeTitle: string;
  start: string;
  end: string;
  mode: Mode;
  status: "held" | "confirmed" | "cancelled";
  phone: string;
  address: string;
  note: string;
  bookedBy: string | null;
  canChange: boolean;
};
export type Customer = { name: string; email: string; phone: string };
export type Member = { id: number; name: string; email: string; self: boolean };
export type Account = { customer: Customer; company: { name: string | null }; members: Member[] };
export type BookingInput = {
  type: string;
  start: string;
  mode: Mode;
  name: string;
  email: string;
  company: string;
  phone: string;
  address: string;
  note: string;
  consent: boolean;
  website: string;
};
export type BookResult =
  | { status: "confirmed"; appointment: Appointment }
  | { status: "held"; reference: string; email: string; holdExpiresAt: string };
export type VerifyResult = { customer: Customer; appointment: Appointment | null; slotTaken: boolean };

/** The server's German message plus the HTTP status (0 when the network failed). */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Calls /api/booking/<path>. Writes always send a JSON body; the server accepts nothing else. */
export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api/booking/${path}`, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new ApiError(result?.message || SUBMIT_FAILED, response.status);
    return result as T;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (cause instanceof Error && cause.name === "AbortError") throw new ApiError(CONNECTION_LOST, 0);
    throw new ApiError(SUBMIT_FAILED, 0);
  } finally {
    window.clearTimeout(timer);
  }
}

export const bookingApi = {
  types: () => apiRequest<{ types: AppointmentType[] }>("GET", "appointment-types"),
  slots: (type: string, from: string, to: string, exclude?: string) =>
    apiRequest<{ days: SlotDay[] }>("GET", `slots?${new URLSearchParams({ type, from, to, ...(exclude ? { exclude } : {}) })}`),
  /** The caller owns the request id so that a retry after a lost connection is recognised. */
  async book(input: BookingInput, requestId: { current: string | null }) {
    requestId.current ??= crypto.randomUUID();
    try {
      return await apiRequest<BookResult>("POST", "appointments", { ...input, requestId: requestId.current });
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) requestId.current = null;
      throw error;
    }
  },
  verify: (email: string, code: string, reference?: string) => apiRequest<VerifyResult>("POST", "verify", { email, code, reference: reference ?? "" }),
  login: (email: string) => apiRequest<object>("POST", "login", { email }),
  logout: () => apiRequest<object>("POST", "logout"),
  logoutAll: () => apiRequest<object>("POST", "logout-all"),
  account: () => apiRequest<Account>("GET", "me"),
  updateAccount: (input: { name: string; phone: string; companyName: string }) => apiRequest<Account>("PATCH", "me", input),
  deleteAccount: () => apiRequest<object>("DELETE", "me"),
  bookings: () => apiRequest<{ appointments: Appointment[] }>("GET", "me/bookings"),
  cancel: (reference: string, reason: string) => apiRequest<{ appointment: Appointment }>("POST", `appointments/${reference}/cancel`, { reason }),
  reschedule: (reference: string, start: string) => apiRequest<{ appointment: Appointment }>("POST", `appointments/${reference}/reschedule`, { start }),
  invite: (email: string, name: string) => apiRequest<{ member: Member }>("POST", "company/members", { email, name }),
  removeMember: (id: number) => apiRequest<object>("DELETE", `company/members/${id}`),
};

export const calendarUrl = (reference: string) => `/api/booking/appointments/${reference}/calendar.ics`;
```

- [ ] **Step 2: Write `src/booking/dates.ts`**

```ts
/** Dates as the owner sees them: always Europe/Berlin, whatever the visitor's device says. */
const zone = "Europe/Berlin";
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

export function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const result = noon(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function dayLabel(date: string): { weekday: string; date: string } {
  const value = noon(date);
  return {
    weekday: new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(value).replace(".", ""),
    date: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(value),
  };
}

export const formatDateLong = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: zone }).format(new Date(iso));

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(iso));
```

- [ ] **Step 3: Write `src/booking/presets.ts`**

```ts
/** What the booking dialog opens with. `type` preselects an appointment type by slug. */
export type BookingPreset = { kicker: string; title: string; type?: string; note?: string };

export const firstMeetingBooking: BookingPreset = {
  kicker: "Persönlich. Klar. Unverbindlich.",
  title: "Erstgespräch vereinbaren.",
  type: "erstgespraech",
};

export const sccAppointmentBooking: BookingPreset = {
  kicker: "SCC-Schulung & Zertifizierung",
  title: "Termin vereinbaren.",
  type: "erstgespraech",
  note: "Thema: SCC-Schulung",
};
```

- [ ] **Step 4: Write `src/booking/SlotPicker.tsx`**

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { bookingApi, type Slot, type SlotDay } from "./api";
import { addDays, berlinToday, dayLabel } from "./dates";

type Loaded = { key: string; days: SlotDay[]; error: string };

/**
 * Two weeks of free times of one appointment type. Whether a result is still
 * loading is derived from the request it belongs to, so the effect never sets
 * state synchronously.
 */
export function SlotPicker({
  type,
  value,
  onChange,
  exclude,
}: {
  type: string;
  value: Slot | null;
  onChange: (slot: Slot) => void;
  exclude?: string;
}) {
  const [today] = useState(berlinToday);
  const [from, setFrom] = useState(today);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const to = addDays(from, 13);
  const key = `${type}|${from}|${exclude ?? ""}`;

  useEffect(() => {
    let active = true;
    bookingApi
      .slots(type, from, to, exclude)
      .then((result) => {
        if (active) setLoaded({ key, days: result.days, error: "" });
      })
      .catch((error: Error) => {
        if (active) setLoaded({ key, days: [], error: error.message });
      });
    return () => {
      active = false;
    };
  }, [key, type, from, to, exclude]);

  const ready = loaded !== null && loaded.key === key ? loaded : null;
  const days = ready?.days ?? [];
  const firstFree = days.find((day) => day.slots.length > 0)?.date ?? null;
  const activeDay = chosenDay !== null && days.some((day) => day.date === chosenDay && day.slots.length > 0) ? chosenDay : firstFree;
  const times = days.find((day) => day.date === activeDay)?.slots ?? [];

  return (
    <div className="slot-picker">
      <div className="slot-range">
        <button
          type="button"
          className="slot-nav"
          onClick={() => setFrom((current) => (addDays(current, -14) < today ? today : addDays(current, -14)))}
          disabled={from <= today}
          aria-label="Frühere Tage"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span aria-live="polite">
          {dayLabel(from).date} – {dayLabel(to).date}
        </span>
        <button type="button" className="slot-nav" onClick={() => setFrom((current) => addDays(current, 14))} aria-label="Spätere Tage">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      {ready === null ? (
        <p className="slot-status">Freie Termine werden geladen …</p>
      ) : ready.error ? (
        <p className="form-error" role="alert">
          {ready.error}
        </p>
      ) : firstFree === null ? (
        <p className="slot-status">In diesem Zeitraum ist kein Termin frei. Sehen Sie sich die nächsten Tage an.</p>
      ) : (
        <>
          <div className="slot-days" role="radiogroup" aria-label="Tag wählen">
            {days.map((day) => {
              const label = dayLabel(day.date);
              const selected = day.date === activeDay;
              const empty = day.slots.length === 0;
              return (
                <button
                  key={day.date}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={empty}
                  className={`slot-day${selected ? " is-selected" : ""}`}
                  onClick={() => setChosenDay(day.date)}
                >
                  <small>{label.weekday}</small>
                  <strong>{label.date}</strong>
                  <span>{empty ? "–" : `${day.slots.length} frei`}</span>
                </button>
              );
            })}
          </div>
          <div className="slot-times" role="radiogroup" aria-label="Uhrzeit wählen">
            {times.map((slot) => {
              const selected = value?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`slot-time${selected ? " is-selected" : ""}`}
                  onClick={() => onChange(slot)}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/booking/BookingDialog.tsx`**

```tsx
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, MapPin, Phone, Send, UserRound, Video, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { EASE } from "../motion-tokens";
import {
  ApiError,
  bookingApi,
  calendarUrl,
  modeLabels,
  type Appointment,
  type AppointmentType,
  type Customer,
  type Mode,
  type Slot,
} from "./api";
import { formatDateLong, formatTime } from "./dates";
import type { BookingPreset } from "./presets";
import { SlotPicker } from "./SlotPicker";
import "./booking.css";

type Step = "type" | "slot" | "details" | "code" | "done";
type Details = { name: string; email: string; company: string; phone: string; address: string; note: string };

const modeIcons = { phone: Phone, video: Video, onsite: MapPin } satisfies Record<Mode, unknown>;
const titles = (loggedIn: boolean): Record<Step, string> => ({
  type: "Worum geht es?",
  slot: "Wählen Sie Tag und Uhrzeit.",
  details: loggedIn ? "Fast geschafft." : "Ihre Angaben.",
  code: "Bitte bestätigen Sie Ihre E-Mail-Adresse.",
  done: "Ihr Termin ist bestätigt.",
});

/**
 * 1:1 booking in the configurator's step pattern (progress bar only):
 * type → day and time → details → email code → done. Logged-in customers
 * skip the code, and a preselected type skips the first step.
 */
export default function BookingDialog({
  preset,
  onClose,
  onMessage,
}: {
  preset: BookingPreset;
  onClose: () => void;
  onMessage: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef<string | null>(null);
  const reduced = useReducedMotion();
  const [types, setTypes] = useState<AppointmentType[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [skipType, setSkipType] = useState(false);
  const [step, setStep] = useState<Step>("type");
  const [typeSlug, setTypeSlug] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [mode, setMode] = useState<Mode | "">("");
  const [details, setDetails] = useState<Details>({ name: "", email: "", company: "", phone: "", address: "", note: preset.note ?? "" });
  const [consent, setConsent] = useState(false);
  const [hold, setHold] = useState<{ reference: string; email: string } | null>(null);
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appointment, setAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      bookingApi.types(),
      bookingApi
        .account()
        .then((account) => account.customer)
        .catch((cause: unknown) => (cause instanceof ApiError && cause.status === 401 ? null : Promise.reject(cause))),
    ])
      .then(([{ types: loaded }, account]) => {
        if (!active) return;
        setTypes(loaded);
        setCustomer(account);
        if (account) setDetails((current) => ({ ...current, name: account.name, email: account.email, phone: current.phone || account.phone }));
        const preselected = loaded.find((type) => type.slug === preset.type) ?? (loaded.length === 1 ? loaded[0] : undefined);
        if (preselected) {
          setTypeSlug(preselected.slug);
          setMode(preselected.modes.length === 1 ? preselected.modes[0] : "");
          setSkipType(true);
          setStep("slot");
        }
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [preset.type]);

  useEffect(() => {
    if (step !== "code") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  const type = types?.find((item) => item.slug === typeSlug) ?? null;
  const steps: Step[] = [...(skipType ? [] : (["type"] as Step[])), "slot", "details", ...(customer ? [] : (["code"] as Step[]))];
  const stepIndex = step === "done" ? steps.length : Math.max(0, steps.indexOf(step));
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const update = (key: keyof Details) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDetails((current) => ({ ...current, [key]: event.target.value }));

  const back = () => {
    setError("");
    const index = steps.indexOf(step);
    if (index > 0) setStep(steps[index - 1]);
  };

  const chooseType = (slug: string) => {
    const chosen = types?.find((item) => item.slug === slug);
    setTypeSlug(slug);
    setSlot(null);
    setMode(chosen && chosen.modes.length === 1 ? chosen.modes[0] : "");
    setError("");
    setStep("slot");
  };

  const startResendTimer = () => {
    const time = Date.now();
    setResendAt(time + 60000);
    setNow(time);
  };

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !type || !slot) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!mode) {
      setError("Bitte wählen Sie, wie der Termin stattfinden soll.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const website = String(new FormData(form).get("website") ?? "");
      const result = await bookingApi.book({ type: type.slug, start: slot.start, mode, ...details, consent, website }, requestId);
      requestId.current = null;
      if (result.status === "confirmed") {
        setAppointment(result.appointment);
        setStep("done");
      } else {
        setHold({ reference: result.reference, email: result.email });
        setCode("");
        startResendTimer();
        setStep("code");
      }
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(String(cause), 0);
      setError(failure.message);
      if (failure.status === 409) {
        setSlot(null);
        setStep("slot");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !hold) return;
    setBusy(true);
    setError("");
    try {
      const result = await bookingApi.verify(hold.email, code.trim(), hold.reference);
      setCustomer(result.customer);
      if (result.appointment && !result.slotTaken) {
        setAppointment(result.appointment);
        setStep("done");
      } else {
        setSlot(null);
        setHold(null);
        setError("Dieser Termin ist leider nicht mehr frei. Bitte wählen Sie eine andere Zeit – Sie sind jetzt angemeldet und buchen ohne neuen Code.");
        setStep("slot");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!hold || resendIn > 0) return;
    setError("");
    try {
      await bookingApi.login(hold.email);
      startResendTimer();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <dialog
      className="consultation-dialog booking-dialog"
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
      aria-labelledby={`${id}-title`}
    >
      <button type="button" className="dialog-close" onClick={onClose} aria-label="Dialog schließen">
        <X size={22} />
      </button>
      <p className="section-kicker">{preset.kicker}</p>
      <h2 id={`${id}-title`}>{preset.title}</h2>
      {loadError ? (
        <div className="booking-fallback">
          <p className="form-error" role="alert">
            {loadError}
          </p>
          <button type="button" className="quote-ghost" onClick={onMessage}>
            Stattdessen eine Nachricht senden
          </button>
        </div>
      ) : types === null ? (
        <p className="slot-status">Einen Moment …</p>
      ) : (
        <>
          <div
            className="quote-progress booking-progress"
            role="progressbar"
            aria-label="Fortschritt"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={Math.min(stepIndex + 1, steps.length)}
            aria-valuetext={step === "done" ? "Abgeschlossen" : `Schritt ${stepIndex + 1} von ${steps.length}`}
          >
            {steps.map((name, index) => {
              const state = step === "done" || index < stepIndex ? "done" : index === stepIndex ? "current" : "todo";
              return (
                <span key={name} className={`quote-segment is-${state}`}>
                  <motion.i initial={false} animate={{ scaleX: state === "todo" ? 0 : 1 }} transition={{ duration: 0.4, ease: EASE }} />
                </span>
              );
            })}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className="quote-panel booking-panel"
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -8, transition: { duration: 0.15 } }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <h3
                tabIndex={-1}
                ref={(element) => {
                  element?.focus({ preventScroll: true });
                }}
              >
                {titles(customer !== null)[step]}
              </h3>

              {step === "type" && (
                <div className="booking-types" role="radiogroup" aria-label="Terminart">
                  {types.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      role="radio"
                      aria-checked={item.slug === typeSlug}
                      className={`booking-type${item.slug === typeSlug ? " is-selected" : ""}`}
                      onClick={() => chooseType(item.slug)}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.durationMin} Minuten · {item.modes.map((value) => modeLabels[value]).join(", ")}
                      </span>
                      {item.description && <small>{item.description}</small>}
                    </button>
                  ))}
                </div>
              )}

              {step === "slot" && type && (
                <>
                  <p className="quote-hint">
                    {type.title} · {type.durationMin} Minuten
                  </p>
                  <SlotPicker
                    type={type.slug}
                    value={slot}
                    onChange={(value) => {
                      setSlot(value);
                      setError("");
                    }}
                  />
                  <p className="booking-aside">
                    Kein passender Termin dabei?{" "}
                    <button type="button" onClick={onMessage}>
                      Nachricht senden
                    </button>
                  </p>
                </>
              )}

              {step === "details" && type && slot && (
                <form id={`${id}-details`} className="inquiry-form booking-form" onSubmit={submitDetails}>
                  <p className="booking-summary">
                    <CalendarPlus size={16} aria-hidden="true" /> {formatDateLong(slot.start)}, {slot.label} Uhr · {type.title}
                  </p>
                  <fieldset className="booking-modes">
                    <legend>Wie soll der Termin stattfinden? *</legend>
                    {type.modes.map((value) => {
                      const Icon = modeIcons[value];
                      return (
                        <label key={value} className={`booking-mode${mode === value ? " is-selected" : ""}`}>
                          <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} required />
                          <Icon size={18} aria-hidden="true" /> {modeLabels[value]}
                        </label>
                      );
                    })}
                  </fieldset>
                  {customer ? (
                    <p className="booking-account">
                      <UserRound size={16} aria-hidden="true" /> Angemeldet als <strong>{customer.name}</strong> ({customer.email})
                    </p>
                  ) : (
                    <div className="form-grid">
                      <label htmlFor={`${id}-name`}>
                        Ihr Name *
                        <input id={`${id}-name`} name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Vor- und Nachname" value={details.name} onChange={update("name")} />
                      </label>
                      <label htmlFor={`${id}-email`}>
                        E-Mail *
                        <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} placeholder="name@unternehmen.de" value={details.email} onChange={update("email")} />
                      </label>
                      <label htmlFor={`${id}-company`}>
                        Unternehmen
                        <input id={`${id}-company`} name="company" autoComplete="organization" maxLength={160} placeholder="Optional" value={details.company} onChange={update("company")} />
                      </label>
                      <label htmlFor={`${id}-phone`}>
                        Telefon{mode === "phone" ? " *" : ""}
                        <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={40} required={mode === "phone"} placeholder={mode === "phone" ? "Wir rufen Sie an" : "Optional"} value={details.phone} onChange={update("phone")} />
                      </label>
                    </div>
                  )}
                  {customer && mode === "phone" && (
                    <label htmlFor={`${id}-phone`}>
                      Telefon *
                      <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={40} required placeholder="Wir rufen Sie an" value={details.phone} onChange={update("phone")} />
                    </label>
                  )}
                  {mode === "onsite" && (
                    <label htmlFor={`${id}-address`}>
                      Adresse für den Termin vor Ort *
                      <textarea id={`${id}-address`} name="address" rows={2} required maxLength={300} placeholder="Straße, Hausnummer, PLZ und Ort" value={details.address} onChange={update("address")} />
                    </label>
                  )}
                  <label htmlFor={`${id}-note`}>
                    Worum geht es? (optional)
                    <textarea id={`${id}-note`} name="note" rows={3} maxLength={2000} placeholder="Zum Beispiel ISO 9001, SCC-Schulung, gewünschter Zeitrahmen …" value={details.note} onChange={update("note")} />
                  </label>
                  <div className="form-honeypot" aria-hidden="true">
                    <label htmlFor={`${id}-website`}>
                      Website
                      <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>
                  {!customer && (
                    <label className="form-consent">
                      <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                      <span>
                        Ich habe die{" "}
                        <a href="/datenschutz/" target="_blank" rel="noreferrer">
                          Datenschutzhinweise
                        </a>{" "}
                        gelesen und bin mit der Verarbeitung meiner Angaben zur Terminbuchung einverstanden. *
                      </span>
                    </label>
                  )}
                </form>
              )}

              {step === "code" && hold && (
                <form id={`${id}-code`} className="inquiry-form booking-code" onSubmit={submitCode}>
                  <p className="form-intro">
                    Wir haben einen 6-stelligen Code an <strong>{hold.email}</strong> gesendet. Der Termin ist 15 Minuten für Sie reserviert.
                  </p>
                  <label htmlFor={`${id}-code-input`}>
                    Bestätigungscode
                    <input
                      id={`${id}-code-input`}
                      className="booking-code-input"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      placeholder="000000"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </label>
                  <p className="booking-resend">
                    Keine E-Mail erhalten? Bitte prüfen Sie auch den Spam-Ordner.{" "}
                    <button type="button" onClick={resend} disabled={resendIn > 0}>
                      {resendIn > 0 ? `Neuen Code senden (${resendIn} s)` : "Neuen Code senden"}
                    </button>
                  </p>
                </form>
              )}

              {step === "done" && appointment && (
                <div className="quote-success booking-success" role="status">
                  <Check className="booking-success-icon" size={40} aria-hidden="true" />
                  <p>
                    Bestätigung und Kalendereinladung sind unterwegs an <strong>{customer?.email ?? details.email}</strong>.
                  </p>
                  <ul className="quote-summary" aria-label="Ihr Termin">
                    <li>
                      <span>Termin</span>
                      <strong>{appointment.typeTitle}</strong>
                    </li>
                    <li>
                      <span>Datum</span>
                      <strong>{formatDateLong(appointment.start)}</strong>
                    </li>
                    <li>
                      <span>Uhrzeit</span>
                      <strong>{formatTime(appointment.start)} Uhr</strong>
                    </li>
                    <li>
                      <span>Form</span>
                      <strong>{modeLabels[appointment.mode]}</strong>
                    </li>
                  </ul>
                  <span className="quote-reference">Referenz {appointment.reference}</span>
                  <div className="quote-success-actions">
                    <a className="text-link" href={calendarUrl(appointment.reference)} download>
                      In Kalender speichern <CalendarPlus size={16} aria-hidden="true" />
                    </a>
                    <a className="text-link" href="/konto/">
                      Mein Konto <ArrowRight size={16} aria-hidden="true" />
                    </a>
                    <button type="button" className="quote-ghost" onClick={onClose}>
                      Schließen
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          {step !== "done" && (
            <footer className="quote-footer booking-footer">
              {steps.indexOf(step) > 0 ? (
                <button type="button" className="quote-back" onClick={back}>
                  <ArrowLeft size={16} aria-hidden="true" /> Zurück
                </button>
              ) : (
                <span />
              )}
              <span className="quote-footer-hint" role="alert">
                {error}
              </span>
              {step === "slot" ? (
                <button type="button" className="button button-primary quote-next" onClick={() => slot && setStep("details")} disabled={!slot}>
                  Weiter <ArrowRight size={17} aria-hidden="true" />
                </button>
              ) : step === "details" ? (
                <button type="submit" form={`${id}-details`} className="button button-primary quote-next" disabled={busy}>
                  {busy ? "Wird gesendet …" : customer ? "Termin verbindlich buchen" : "Weiter zur Bestätigung"}
                  <Send size={16} aria-hidden="true" />
                </button>
              ) : step === "code" ? (
                <button type="submit" form={`${id}-code`} className="button button-primary quote-next" disabled={busy || code.length !== 6}>
                  {busy ? "Wird geprüft …" : "Termin bestätigen"}
                  <Check size={16} aria-hidden="true" />
                </button>
              ) : (
                <span />
              )}
            </footer>
          )}
        </>
      )}
    </dialog>
  );
}
```

- [ ] **Step 6: Write `src/booking/booking.css`**

```css
/* Booking dialog. Progress, panel, footer and success reuse the configurator's classes. */
.booking-dialog {
  width: min(760px, calc(100% - 32px));
}
.booking-types {
  display: grid;
  gap: 12px;
}
.booking-type {
  display: grid;
  gap: 4px;
  padding: 16px 18px;
  border: 1px solid #d4e6ef;
  border-radius: 14px;
  background: #fff;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.booking-type:hover {
  transform: translateY(-2px);
  border-color: #8cc4de;
}
.booking-type.is-selected {
  border-color: var(--blue-500);
  box-shadow: 0 0 0 3px rgba(7, 132, 184, 0.15);
}
.booking-type strong {
  font-size: 1rem;
}
.booking-type span {
  color: var(--ink-soft);
  font-size: 0.8rem;
  font-weight: 600;
}
.booking-type small {
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.6;
}
.slot-picker {
  display: grid;
  gap: 14px;
}
.slot-range {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--ink-soft);
  font-size: 0.82rem;
  font-weight: 700;
}
.slot-nav {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid #d4e6ef;
  border-radius: 50%;
  background: #fff;
  color: var(--blue-700);
  cursor: pointer;
}
.slot-nav:disabled {
  opacity: 0.4;
  cursor: default;
}
.slot-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}
.slot-day {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 10px 4px;
  border: 1px solid #d4e6ef;
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  cursor: pointer;
}
.slot-day small {
  color: var(--muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.slot-day strong {
  font-size: 0.9rem;
}
.slot-day span {
  color: var(--blue-700);
  font-size: 0.66rem;
  font-weight: 700;
}
.slot-day:disabled {
  background: #f4f8fa;
  color: #9fb1bb;
  cursor: default;
}
.slot-day:disabled small,
.slot-day:disabled span {
  color: #9fb1bb;
}
.slot-day.is-selected {
  border-color: var(--blue-600);
  background: var(--blue-600);
  color: #fff;
}
.slot-day.is-selected small,
.slot-day.is-selected span {
  color: #d9f0fb;
}
.slot-times {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.slot-time {
  min-width: 76px;
  padding: 10px 14px;
  border: 1px solid #cfe2ed;
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
}
.slot-time:hover {
  border-color: #8cc4de;
}
.slot-time.is-selected {
  border-color: var(--blue-600);
  background: var(--blue-100);
  color: var(--blue-700);
}
.slot-status {
  margin: 12px 0;
  color: var(--ink-soft);
  font-size: 0.86rem;
}
.booking-aside,
.booking-resend {
  margin: 16px 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}
.booking-aside button,
.booking-resend button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--blue-700);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.booking-resend button:disabled {
  color: var(--muted);
  text-decoration: none;
  cursor: default;
}
.booking-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--mist);
  color: var(--ink);
  font-size: 0.84rem;
  font-weight: 700;
}
.booking-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
.booking-modes legend {
  margin-bottom: 8px;
  color: #34556a;
  font-size: 0.76rem;
  font-weight: 600;
}
.booking-mode {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #cfe2ed;
  border-radius: 10px;
  background: #fff;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
}
.booking-mode input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.booking-mode.is-selected {
  border-color: var(--blue-600);
  background: var(--blue-100);
  color: var(--blue-700);
}
.booking-mode:focus-within {
  outline: 2px solid var(--blue-500);
  outline-offset: 2px;
}
.booking-account {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.84rem;
}
.inquiry-form input.booking-code-input {
  max-width: 240px;
  font: 700 1.6rem/1.2 Consolas, "Courier New", monospace;
  letter-spacing: 0.4em;
  text-align: center;
}
.booking-success-icon {
  display: block;
  margin: 0 auto 12px;
  color: #0a8a55;
}
.booking-fallback {
  display: grid;
  justify-items: start;
  gap: 14px;
}
@media (max-width: 640px) {
  .slot-days {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .inquiry-form input.booking-code-input {
    max-width: none;
  }
}
```

- [ ] **Step 7: Wire the dialog into `src/App.tsx`**

Replace the React import line and add three imports, so the top of the file reads:

```tsx
import { lazy, Suspense, useState } from "react";
import { appointmentPreset, firstMeetingPreset, type ConsultationPreset } from "./consultation";
import { firstMeetingBooking, type BookingPreset } from "./booking/presets";

const BookingDialog = lazy(() => import("./booking/BookingDialog"));
```

Remove the old `import { useState } from "react";` and the old `import { firstMeetingPreset, type ConsultationPreset } from "./consultation";`. Leave every other import in place.

Inside `App`, directly after the `openConsultation` line, add:

```tsx
  const [booking, setBooking] = useState<BookingPreset | null>(null);
  const openBooking = (preset: BookingPreset = firstMeetingBooking) => setBooking(preset);
  const openMessage = () => {
    const subject = booking?.note?.replace(/^Thema: /, "") ?? "";
    setBooking(null);
    setConsultation(appointmentPreset(subject));
  };
```

Change the JSX so every "Erstgespräch" entry point opens the booking dialog, and the SCC section gets both callbacks:

```tsx
      <Header onConsultation={() => openBooking()} home={home} />
```

```tsx
            <Hero onConsultation={() => openBooking()} />
            <QuoteConfigurator onConsultation={() => openBooking()} />
            <SccJourney onRequest={openConsultation} onBook={openBooking} />
            <Story />
            <Expertise />
            <Contact onConsultation={() => openBooking()} />
```

Directly after the `{consultation && (…)}` block, add:

```tsx
      {booking && (
        <Suspense fallback={null}>
          <BookingDialog preset={booking} onClose={() => setBooking(null)} onMessage={openMessage} />
        </Suspense>
      )}
```

- [ ] **Step 8: Rewire the SCC card button in `src/components/SccJourney.tsx`**

Change line 4 to:

```tsx
import { sccQuotePreset, type ConsultationPreset } from "../consultation";
import { sccAppointmentBooking, type BookingPreset } from "../booking/presets";
```

Change the component signature (line 68) to:

```tsx
export function SccJourney({
  onRequest,
  onBook,
}: {
  onRequest: (preset: ConsultationPreset) => void;
  onBook: (preset: BookingPreset) => void;
}) {
```

Change the "Termin vereinbaren" button's handler from `onClick={() => onRequest(appointmentPreset("SCC-Schulung"))}` to:

```tsx
                    onClick={() => onBook(sccAppointmentBooking)}
```

- [ ] **Step 9: Type-check, lint and build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no TypeScript errors and no ESLint errors (warnings from existing files are unchanged). The build prerenders the six pages and emits separate chunks, among them `BookingDialog-*.js` and `BookingDialog-*.css`.

Run: `grep -L "BookingDialog" dist/assets/index-*.js`
Expected: the main bundle file name is printed, which shows the dialog is not in the main bundle.

- [ ] **Step 10: Verify in the browser**

1. Start the API and the site: `npm run booking:up`, then `preview_start` with `name: "dev-alt"` (port 5174; `vite.config.ts` proxies `/api` to 8086 and rewrites the Origin).
2. Open `http://127.0.0.1:5174/`, click the header button "Erstgespräch".
   - The dialog shows kicker "Persönlich. Klar. Unverbindlich.", title "Erstgespräch vereinbaren." and a 3-segment progress bar.
   - It opens directly at "Wählen Sie Tag und Uhrzeit." because the type is preselected.
3. Pick the first free day and time, then click "Weiter".
   - Choose "Video", fill name and email (`browser-test@example.com`), tick the consent box, then click "Weiter zur Bestätigung".
   - The code step shows the address and "Neuen Code senden (60 s)", counting down.
4. Read the code: `grep -h "^Subject:" booking/var/mail/*.eml | tail -1` gives an encoded word. Decode it with `node -e "console.log(Buffer.from(process.argv[1],'base64').toString())" <base64 part>`. Enter the code, then click "Termin bestätigen".
   - The success panel shows date, time, form and reference, plus the links "In Kalender speichern" and "Mein Konto".
5. Close the dialog and open it again with "Erstgespräch".
   - The details step now shows "Angemeldet als …" and "Termin verbindlich buchen", and there is no code step (a 2-segment bar).
6. Scroll to "02 · SCC-Schulung & Zertifizierung" and click "Termin vereinbaren".
   - The kicker reads "SCC-Schulung & Zertifizierung" and the note field is prefilled with "Thema: SCC-Schulung".
   - Click "Nachricht senden": the enquiry form opens with the topic "Terminanfrage" and "Thema: SCC-Schulung" in the message.
7. Press Escape: the dialog closes and focus returns to the button.
8. Check `read_console_messages` for errors: expected none. Resize to 390×844 and screenshot the slot step: the day grid shows 4 columns with no horizontal scrolling.
9. Stop with `preview_stop`.

- [ ] **Step 11: Commit**

```bash
git add src/booking src/App.tsx src/components/SccJourney.tsx
git commit -m "feat(site): booking dialog for first meetings and SCC appointments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Customer area `/konto/`

**Files:**
- Create: `src/account/AccountApp.tsx`, `src/account/AppointmentList.tsx`, `src/account/AccountSettings.tsx`, `src/account/account.css`
- Modify: `src/App.tsx` (route `/konto`, refresh after booking), `src/components/Footer.tsx` ("Mein Konto" link)

**Interfaces:**
- Consumes: `bookingApi`, `ApiError`, `calendarUrl`, `modeLabels`, types (Task 19); `SlotPicker` (Task 19); `formatDateLong`, `formatTime` (Task 19); `contact` from `src/content.ts`
- Produces:
  - `AccountApp` (default export, lazy) `({ onBook: () => void; refreshKey: number })`
  - `AppointmentList({ appointments, onChanged })`
  - `AccountSettings({ account, onChanged, onLoggedOut })`

- [ ] **Step 1: Write `src/account/AccountApp.tsx`**

```tsx
import { CalendarPlus, LogOut } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ApiError, bookingApi, type Account, type Appointment } from "../booking/api";
import { AccountSettings } from "./AccountSettings";
import { AppointmentList } from "./AppointmentList";
import "../booking/booking.css";
import "./account.css";

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

function LoginPanel({ onLoggedIn }: { onLoggedIn: () => void }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      await bookingApi.login(email);
      setSent(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      await bookingApi.verify(email, code.trim());
      onLoggedIn();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-card account-login" aria-labelledby={`${id}-title`}>
      <p className="section-kicker">Kundenkonto</p>
      <h1 id={`${id}-title`}>Willkommen zurück.</h1>
      <p className="account-lead">Melden Sie sich mit Ihrer E-Mail-Adresse an. Wir senden Ihnen einen Code – ein Passwort brauchen Sie nicht.</p>
      {!sent ? (
        <form className="inquiry-form" onSubmit={requestCode}>
          <label htmlFor={`${id}-email`}>
            E-Mail
            <input id={`${id}-email`} type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@unternehmen.de" />
          </label>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Wird gesendet …" : "Code anfordern"}
          </button>
        </form>
      ) : (
        <form className="inquiry-form" onSubmit={verify}>
          <p className="form-intro">
            Falls zu <strong>{email}</strong> ein Kundenkonto besteht, erhalten Sie jetzt einen 6-stelligen Code.
          </p>
          <label htmlFor={`${id}-code`}>
            Code
            <input
              id={`${id}-code`}
              className="booking-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <div className="account-panel-actions">
            <button type="submit" className="button button-primary" disabled={busy || code.length !== 6}>
              {busy ? "Wird geprüft …" : "Anmelden"}
            </button>
            <button
              type="button"
              className="quote-ghost"
              onClick={() => {
                setSent(false);
                setCode("");
                setError("");
              }}
            >
              Andere E-Mail-Adresse
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="account-hint">Noch kein Konto? Es entsteht automatisch mit Ihrer ersten Terminbuchung.</p>
    </section>
  );
}

/** /konto/: login by email code, then the company's appointments, colleagues and profile. */
export default function AccountApp({ onBook, refreshKey }: { onBook: () => void; refreshKey: number }) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((current) => current + 1);

  useEffect(() => {
    let active = true;
    Promise.all([bookingApi.account(), bookingApi.bookings()])
      .then(([loaded, list]) => {
        if (!active) return;
        setAccount(loaded);
        setAppointments(list.appointments);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) setAccount(null);
        else setError(message(cause));
      });
    return () => {
      active = false;
    };
  }, [version, refreshKey]);

  async function logout() {
    await bookingApi.logout().catch(() => null);
    setAccount(null);
    setAppointments([]);
  }

  if (account === undefined) {
    return (
      <div className="account-page">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="slot-status">Kundenkonto wird geladen …</p>
        )}
      </div>
    );
  }
  if (account === null) {
    return (
      <div className="account-page">
        <LoginPanel onLoggedIn={reload} />
      </div>
    );
  }
  return (
    <div className="account-page">
      <header className="account-head">
        <p className="section-kicker">Kundenkonto{account.company.name ? ` · ${account.company.name}` : ""}</p>
        <h1>Guten Tag, {account.customer.name}.</h1>
        <div className="account-panel-actions">
          <button type="button" className="button button-primary" onClick={onBook}>
            Neuen Termin buchen <CalendarPlus size={17} aria-hidden="true" />
          </button>
          <button type="button" className="quote-ghost" onClick={logout}>
            <LogOut size={15} aria-hidden="true" /> Abmelden
          </button>
        </div>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <AppointmentList appointments={appointments} onChanged={reload} />
      <AccountSettings account={account} onChanged={reload} onLoggedOut={() => setAccount(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Write `src/account/AppointmentList.tsx`**

```tsx
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { bookingApi, calendarUrl, modeLabels, type Appointment, type Slot } from "../booking/api";
import { formatDateLong, formatTime } from "../booking/dates";
import { SlotPicker } from "../booking/SlotPicker";
import { contact } from "../content";

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

function AppointmentCard({ appointment, onChanged }: { appointment: Appointment; onChanged: () => void }) {
  const [panel, setPanel] = useState<"none" | "reschedule" | "cancel">("none");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setPanel("none");
      setSlot(null);
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`account-appointment is-${appointment.status}`}>
      <div className="account-appointment-main">
        <p className="account-date">
          {formatDateLong(appointment.start)} · {formatTime(appointment.start)}–{formatTime(appointment.end)} Uhr
        </p>
        <h3>{appointment.typeTitle}</h3>
        <p className="account-meta">
          {modeLabels[appointment.mode]}
          {appointment.bookedBy ? ` · gebucht von ${appointment.bookedBy}` : ""} · {appointment.reference}
        </p>
        {appointment.status === "cancelled" && <span className="account-badge">Storniert</span>}
      </div>
      {appointment.status === "confirmed" && (
        <div className="account-appointment-actions">
          <a className="text-link" href={calendarUrl(appointment.reference)} download>
            Kalender <CalendarPlus size={15} aria-hidden="true" />
          </a>
          {appointment.canChange ? (
            <>
              <button type="button" className="quote-ghost" onClick={() => setPanel("reschedule")} aria-expanded={panel === "reschedule"}>
                Verschieben
              </button>
              <button type="button" className="quote-ghost" onClick={() => setPanel("cancel")} aria-expanded={panel === "cancel"}>
                Stornieren
              </button>
            </>
          ) : (
            <p className="account-hint">
              Kurzfristige Änderungen bitte telefonisch: <a href={contact.phoneHref}>{contact.phoneLabel}</a>
            </p>
          )}
        </div>
      )}
      {panel === "reschedule" && (
        <div className="account-panel">
          <SlotPicker type={appointment.type} value={slot} onChange={setSlot} exclude={appointment.reference} />
          <div className="account-panel-actions">
            <button type="button" className="button button-primary" disabled={!slot || busy} onClick={() => slot && run(() => bookingApi.reschedule(appointment.reference, slot.start))}>
              {busy ? "Wird verschoben …" : "Neue Zeit übernehmen"}
            </button>
            <button type="button" className="quote-ghost" onClick={() => setPanel("none")}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {panel === "cancel" && (
        <div className="account-panel inquiry-form">
          <label>
            Grund (optional)
            <textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="account-panel-actions">
            <button type="button" className="button button-primary" disabled={busy} onClick={() => run(() => bookingApi.cancel(appointment.reference, reason))}>
              {busy ? "Wird storniert …" : "Termin stornieren"}
            </button>
            <button type="button" className="quote-ghost" onClick={() => setPanel("none")}>
              Zurück
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** Upcoming appointments first; past and cancelled ones below. */
export function AppointmentList({ appointments, onChanged }: { appointments: Appointment[]; onChanged: () => void }) {
  const now = new Date();
  const upcoming = appointments
    .filter((a) => a.status === "confirmed" && new Date(a.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start));
  const earlier = appointments.filter((a) => !upcoming.includes(a));
  return (
    <section className="account-card" aria-labelledby="account-appointments">
      <h2 id="account-appointments">Ihre Termine</h2>
      {upcoming.length === 0 ? (
        <p className="account-hint">Zurzeit ist kein Termin geplant.</p>
      ) : (
        <ul className="account-appointments">
          {upcoming.map((appointment) => (
            <AppointmentCard key={appointment.reference} appointment={appointment} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {earlier.length > 0 && (
        <details className="account-earlier">
          <summary>Vergangene und stornierte Termine ({earlier.length})</summary>
          <ul className="account-appointments">
            {earlier.map((appointment) => (
              <AppointmentCard key={appointment.reference} appointment={appointment} onChanged={onChanged} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write `src/account/AccountSettings.tsx`**

```tsx
import { Trash, UserPlus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { bookingApi, type Account } from "../booking/api";

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Colleagues, profile, logging out everywhere and deleting the account. */
export function AccountSettings({ account, onChanged, onLoggedOut }: { account: Account; onChanged: () => void; onLoggedOut: () => void }) {
  const id = useId();
  const [name, setName] = useState(account.customer.name);
  const [phone, setPhone] = useState(account.customer.phone);
  const [companyName, setCompanyName] = useState(account.company.name ?? "");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) run(() => bookingApi.updateAccount({ name, phone, companyName }), "Ihre Angaben wurden gespeichert.");
  };

  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    run(async () => {
      await bookingApi.invite(inviteEmail, inviteName);
      setInviteEmail("");
      setInviteName("");
    }, "Die Einladung wurde verschickt.");
  };

  return (
    <>
      <section className="account-card" aria-labelledby={`${id}-team`}>
        <h2 id={`${id}-team`}>Kolleginnen und Kollegen</h2>
        <p className="account-hint">Alle hier sehen und verwalten die Termine Ihres Unternehmens. Eingeladene melden sich einfach mit ihrer E-Mail-Adresse an.</p>
        <ul className="account-members">
          {account.members.map((member) => (
            <li key={member.id}>
              <span>
                <strong>{member.name}</strong> {member.email}
                {member.self && <em> (Sie)</em>}
              </span>
              {!member.self && (
                <button type="button" className="quote-ghost" disabled={busy} onClick={() => run(() => bookingApi.removeMember(member.id), `${member.name} wurde entfernt.`)}>
                  <Trash size={14} aria-hidden="true" /> Entfernen
                </button>
              )}
            </li>
          ))}
        </ul>
        <form className="inquiry-form account-invite" onSubmit={invite}>
          <div className="form-grid">
            <label htmlFor={`${id}-invite-name`}>
              Name
              <input id={`${id}-invite-name`} required minLength={2} maxLength={100} value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            </label>
            <label htmlFor={`${id}-invite-email`}>
              E-Mail
              <input id={`${id}-invite-email`} type="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            </label>
          </div>
          <button type="submit" className="button button-primary" disabled={busy}>
            Einladen <UserPlus size={16} aria-hidden="true" />
          </button>
        </form>
      </section>

      <section className="account-card" aria-labelledby={`${id}-profile`}>
        <h2 id={`${id}-profile`}>Ihre Angaben</h2>
        <form className="inquiry-form" onSubmit={saveProfile}>
          <div className="form-grid">
            <label htmlFor={`${id}-name`}>
              Name
              <input id={`${id}-name`} autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label htmlFor={`${id}-phone`}>
              Telefon
              <input id={`${id}-phone`} type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label htmlFor={`${id}-company`}>
              Unternehmen
              <input id={`${id}-company`} autoComplete="organization" maxLength={160} value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </label>
            <label htmlFor={`${id}-email`}>
              E-Mail
              <input id={`${id}-email`} value={account.customer.email} readOnly />
            </label>
          </div>
          <button type="submit" className="button button-primary" disabled={busy}>
            Speichern
          </button>
        </form>
      </section>

      <section className="account-card" aria-labelledby={`${id}-safety`}>
        <h2 id={`${id}-safety`}>Sicherheit und Daten</h2>
        <div className="account-panel-actions">
          <button
            type="button"
            className="quote-ghost"
            disabled={busy}
            onClick={async () => {
              await bookingApi.logoutAll().catch(() => null);
              onLoggedOut();
            }}
          >
            Auf allen Geräten abmelden
          </button>
          {!confirmDelete ? (
            <button type="button" className="quote-ghost account-danger" onClick={() => setConfirmDelete(true)}>
              Konto löschen
            </button>
          ) : (
            <span className="account-confirm">
              Zukünftige Termine werden storniert und Ihre Daten gelöscht.{" "}
              <button
                type="button"
                className="button button-primary account-danger-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await bookingApi.deleteAccount();
                    onLoggedOut();
                  } catch (cause) {
                    setError(message(cause));
                    setBusy(false);
                  }
                }}
              >
                Endgültig löschen
              </button>{" "}
              <button type="button" className="quote-ghost" onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </button>
            </span>
          )}
        </div>
      </section>
      <p className="account-status" role="status">
        {notice}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 4: Write `src/account/account.css`**

```css
.account-page {
  display: grid;
  gap: 22px;
  max-width: 980px;
  margin: 0 auto;
  padding: 60px clamp(22px, 5vw, 60px) 100px;
}
.account-head h1,
.account-login h1 {
  margin: 0 0 20px;
  color: var(--ink);
  font-family: "DM Serif Display", serif;
  font-size: clamp(2.2rem, 4.4vw, 3.4rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.08;
}
.account-card {
  display: grid;
  gap: 16px;
  padding: clamp(22px, 3vw, 32px);
  border: 1px solid #d4e6ef;
  border-radius: 20px;
  background: #fff;
  box-shadow: var(--shadow-sheet);
}
.account-card h2 {
  margin: 0;
  color: var(--ink);
  font-family: "DM Serif Display", serif;
  font-size: 1.6rem;
  font-weight: 400;
}
.account-login {
  max-width: 560px;
}
.account-lead {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.95rem;
  line-height: 1.7;
}
.account-hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.6;
}
.account-hint a {
  color: var(--blue-700);
  font-weight: 700;
}
.account-panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.account-appointments {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.account-appointment {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid #e0ecf2;
  border-radius: 14px;
  background: var(--mist);
}
.account-appointment.is-cancelled {
  opacity: 0.7;
}
.account-appointment h3 {
  margin: 0;
  color: var(--ink);
  font-size: 1.05rem;
}
.account-date {
  margin: 0 0 4px;
  color: var(--blue-700);
  font-size: 0.8rem;
  font-weight: 700;
}
.account-meta {
  margin: 4px 0 0;
  color: var(--ink-soft);
  font-size: 0.8rem;
}
.account-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #fbe9e4;
  color: #94462b;
  font-size: 0.72rem;
  font-weight: 700;
}
.account-appointment-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}
.account-appointment-actions .text-link {
  padding: 6px 0;
  color: var(--blue-700);
}
.account-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 12px;
  background: #fff;
}
.account-earlier summary {
  color: var(--ink-soft);
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
}
.account-earlier[open] summary {
  margin-bottom: 12px;
}
.account-members {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.account-members li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #e3eef4;
  color: var(--ink-soft);
  font-size: 0.86rem;
}
.account-members strong {
  margin-right: 6px;
  color: var(--ink);
}
.account-invite {
  gap: 14px;
}
.account-invite .button,
.account-card form > .button {
  justify-self: start;
}
.account-danger {
  color: #94462b;
}
.account-danger-button {
  background: #a4472b;
}
.account-danger-button:hover {
  background: #86381f;
}
.account-confirm {
  color: var(--ink-soft);
  font-size: 0.84rem;
}
.account-status {
  min-height: 1em;
  margin: 0;
  color: #0a8a55;
  font-size: 0.86rem;
  font-weight: 700;
}
```

- [ ] **Step 5: Route `/konto` in `src/App.tsx`**

Below the `BookingDialog` lazy line, add:

```tsx
const AccountApp = lazy(() => import("./account/AccountApp"));
```

Inside `App`, after the `legalPage` constant, replace `const home = !legalPage && !audit;` with:

```tsx
  const account = page === "/konto";
  const home = !legalPage && !audit && !account;
  const [bookingsVersion, setBookingsVersion] = useState(0);
```

In `<main>`, make the account page the first branch:

```tsx
        {account ? (
          <Suspense fallback={<div className="account-page"><p className="slot-status">Kundenkonto wird geladen …</p></div>}>
            <AccountApp onBook={() => openBooking()} refreshKey={bookingsVersion} />
          </Suspense>
        ) : legalPage ? (
          <LegalPage kind={legalPage} />
        ) : audit ? (
```

The rest of the existing ternary stays as it is. Change the booking dialog's `onClose` so the account page reloads after a booking:

```tsx
          <BookingDialog
            preset={booking}
            onClose={() => {
              setBooking(null);
              setBookingsVersion((current) => current + 1);
            }}
            onMessage={openMessage}
          />
```

- [ ] **Step 6: Add the footer link in `src/components/Footer.tsx`**

Replace the link group with:

```tsx
      <div>
        <a href="/konto/">Mein Konto</a>
        <a href="/impressum/">Impressum</a>
        <a href="/datenschutz/">Datenschutz</a>
      </div>
```

- [ ] **Step 7: Type-check, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no errors. The build contains an `AccountApp-*.js` chunk. The six prerendered pages now show "Mein Konto" in the footer.

- [ ] **Step 8: Verify in the browser**

1. Run `npm run booking:up` if it isn't running, then `preview_start` with `dev-alt`. Open `http://127.0.0.1:5174/konto/`.
   - The login card "Willkommen zurück." appears, with the site header and footer.
2. Enter the address booked in Task 19 (`browser-test@example.com`) and click "Code anfordern".
   - Decode the newest `booking/var/mail` subject as in Task 19, Step 10, enter the code, and click "Anmelden".
   - The dashboard shows "Guten Tag, …", the appointment with "Kalender", "Verschieben" and "Stornieren", the colleagues list with "(Sie)", the profile, and "Sicherheit und Daten".
3. Click "Verschieben". The slot picker opens without the appointment's own time blocked by itself. Pick another time and click "Neue Zeit übernehmen".
   - The card shows the new time.
   - A new `.eml` with subject "Termin verschoben: …" exists.
4. Invite `kollegin@example.com`: "Die Einladung wurde verschickt." appears and the list shows two people. Click "Entfernen" on the colleague.
5. Click "Neuen Termin buchen". The booking dialog opens logged in (2 steps). Book a slot and close the dialog: the list refreshes and shows two upcoming appointments.
6. Click "Stornieren" on one appointment, enter a reason and click "Termin stornieren". It moves to "Vergangene und stornierte Termine".
7. Click "Abmelden": the login card appears again. The console shows no errors. At 390×844 there is no horizontal scrolling (check with `document.documentElement.scrollWidth <= innerWidth` via `javascript_tool`).
8. `preview_stop`.

- [ ] **Step 9: Commit**

```bash
git add src/account src/App.tsx src/components/Footer.tsx
git commit -m "feat(site): customer area with appointments, colleagues and account deletion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Admin area `/verwaltung/`

**Files:**
- Create: `src/admin/api.ts`, `src/admin/util.ts`, `src/admin/AppointmentRow.tsx`, `src/admin/AdminApp.tsx`, `src/admin/AdminLogin.tsx`, `src/admin/Overview.tsx`, `src/admin/AppointmentsSection.tsx`, `src/admin/AvailabilitySection.tsx`, `src/admin/CustomersSection.tsx`, `src/admin/SettingsSection.tsx`, `src/admin/admin.css`
- Modify: `src/App.tsx` (route `/verwaltung` without the site chrome), `package.json` (dependency `qrcode-generator`)

**Interfaces:**
- Consumes:
  - The admin API (Task 18).
  - From Task 19: `apiRequest`, `ApiError`, `modeLabels`, `Mode`, `Appointment`, `berlinToday`, `addDays`, `formatDateLong`, `formatTime`.
  - `qrcode-generator` 2.0.4: default export `qrcode(typeNumber, level)` returning `{ addData, make, createSvgTag({ cellSize, margin, scalable }) }`.
- Produces:
  - `AdminApp`, the default export, lazy-loaded.
  - Section components, each without props except `Overview({ onOpen })`.
  - `util.ts`: `message`, `useLoad`, `toLocalInput`, `fromLocalInput`, `weekdays`, `type Section`.
- Note: `<input type="datetime-local">` values are read in the device's time zone; the owner works in Germany. Display always uses Europe/Berlin.

- [ ] **Step 1: Add the QR dependency**

Run: `npm install qrcode-generator@^2.0.4`
Expected: `package.json` `dependencies` gains `"qrcode-generator": "^2.0.4"`, and `node_modules/qrcode-generator/dist/qrcode.d.ts` exists.

- [ ] **Step 2: Write `src/admin/api.ts`**

```ts
import { ApiError, apiRequest, type Appointment, type Mode } from "../booking/api";

export type AdminState = "none" | "needsTotp" | "needsPairing" | "ok";
export type AdminUser = { id: number; name: string; email: string; paired: boolean };
export type AdminAppointment = Appointment & {
  customer: { id: number; name: string | null; email: string | null } | null;
  company: { id: number; name: string | null } | null;
  cancelledBy: string | null;
  cancelReason: string;
  createdAt: string;
};
export type AdminType = {
  id: number;
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  modes: Mode[];
  bufferMin: number;
  slotStepMin: number;
  leadTimeH: number;
  horizonDays: number;
  videoLink: string | null;
  active: boolean;
  sort: number;
};
export type TypeInput = Omit<AdminType, "id" | "videoLink"> & { videoLink: string };
export type Rule = { typeId: number | null; weekday: number; start: string; end: string };
export type Absence = { id: number; start: string; end: string; note: string };
export type CompanyRow = { id: number; name: string | null; members: { id: number; name: string; email: string }[]; appointments: number };
export type Person = { id: number; companyId: number; name: string; email: string; phone: string };
export type CompanyDetail = { company: { id: number; name: string | null }; members: Person[]; appointments: AdminAppointment[] };
export type FailedEmail = { id: number; kind: string; recipient: string; attempts: number; lastError: string; createdAt: string };
export type AuditEntry = { actorType: string; actorId: number | null; action: string; subjectType: string; subjectId: number | null; createdAt: string };
export type MaintenanceRun = { trigger: string; startedAt: string; finishedAt: string | null; stats: Record<string, number> } | null;
export type AppointmentInput = {
  type: string;
  start: string;
  mode: Mode;
  name: string;
  email: string;
  company: string;
  phone: string;
  address: string;
  note: string;
  force: boolean;
};

export const adminApi = {
  session: () => apiRequest<{ state: AdminState; admin: AdminUser | null }>("GET", "admin/session"),
  setup: (key: string, email: string, name: string) => apiRequest<object>("POST", "admin/setup", { key, email, name }),
  login: (email: string) => apiRequest<object>("POST", "admin/login", { email }),
  verify: (email: string, code: string) => apiRequest<{ state: AdminState }>("POST", "admin/verify", { email, code }),
  startPairing: () => apiRequest<{ secret: string; uri: string }>("POST", "admin/totp/start"),
  confirmPairing: (code: string) => apiRequest<{ state: AdminState }>("POST", "admin/totp/confirm", { code }),
  totp: (code: string) => apiRequest<{ state: AdminState }>("POST", "admin/totp", { code }),
  logout: () => apiRequest<object>("POST", "admin/logout"),
  overview: () => apiRequest<{ upcoming: AdminAppointment[]; failedEmails: number; lastMaintenance: MaintenanceRun }>("GET", "admin/overview"),
  types: () => apiRequest<{ types: AdminType[] }>("GET", "admin/appointment-types"),
  createType: (input: TypeInput) => apiRequest<{ type: AdminType }>("POST", "admin/appointment-types", input),
  updateType: (id: number, input: TypeInput) => apiRequest<{ type: AdminType }>("PATCH", `admin/appointment-types/${id}`, input),
  rules: () => apiRequest<{ rules: Rule[] }>("GET", "admin/availability"),
  saveRules: (typeId: number | null, rules: Omit<Rule, "typeId">[]) => apiRequest<{ rules: Rule[] }>("PUT", "admin/availability", { typeId, rules }),
  absences: () => apiRequest<{ absences: Absence[] }>("GET", "admin/absences"),
  addAbsence: (start: string, end: string, note: string) => apiRequest<{ id: number }>("POST", "admin/absences", { start, end, note }),
  deleteAbsence: (id: number) => apiRequest<object>("DELETE", `admin/absences/${id}`),
  appointments: (from: string, to: string, status: string) =>
    apiRequest<{ appointments: AdminAppointment[] }>("GET", `admin/appointments?${new URLSearchParams({ from, to, status })}`),
  async createAppointment(input: AppointmentInput, requestId: { current: string | null }) {
    requestId.current ??= crypto.randomUUID();
    try {
      return await apiRequest<{ appointment: AdminAppointment }>("POST", "admin/appointments", { ...input, requestId: requestId.current });
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) requestId.current = null;
      throw error;
    }
  },
  cancelAppointment: (reference: string, reason: string) => apiRequest<{ appointment: AdminAppointment }>("POST", `admin/appointments/${reference}/cancel`, { reason }),
  rescheduleAppointment: (reference: string, start: string, force: boolean) =>
    apiRequest<{ appointment: AdminAppointment }>("POST", `admin/appointments/${reference}/reschedule`, { start, force }),
  customers: (search: string) => apiRequest<{ companies: CompanyRow[] }>("GET", `admin/customers?${new URLSearchParams({ search })}`),
  company: (id: number) => apiRequest<CompanyDetail>("GET", `admin/companies/${id}`),
  renameCompany: (id: number, name: string) => apiRequest<object>("PATCH", `admin/companies/${id}`, { name }),
  addMember: (companyId: number, email: string, name: string) => apiRequest<{ member: Person }>("POST", `admin/companies/${companyId}/members`, { email, name }),
  updateCustomer: (id: number, input: { name: string; phone: string; companyId?: number }) => apiRequest<{ customer: Person }>("PATCH", `admin/customers/${id}`, input),
  deleteCustomer: (id: number) => apiRequest<object>("DELETE", `admin/customers/${id}`),
  failedEmails: () => apiRequest<{ failed: FailedEmail[] }>("GET", "admin/outbox"),
  retryEmail: (id: number) => apiRequest<object>("POST", `admin/outbox/${id}/retry`),
  audit: () => apiRequest<{ entries: AuditEntry[] }>("GET", "admin/audit"),
  admins: () => apiRequest<{ admins: AdminUser[] }>("GET", "admin/admins"),
  inviteAdmin: (email: string, name: string) => apiRequest<{ admin: AdminUser }>("POST", "admin/admins", { email, name }),
  settings: () => apiRequest<{ ownerEmail: string }>("GET", "admin/settings"),
  saveSettings: (ownerEmail: string) => apiRequest<{ ownerEmail: string }>("PUT", "admin/settings", { ownerEmail }),
  runMaintenance: () => apiRequest<{ stats: Record<string, number> | null }>("POST", "admin/maintenance/run"),
};

export const exportUrl = "/api/booking/admin/export";
```

- [ ] **Step 3: Write `src/admin/util.ts`**

```ts
import { useEffect, useState } from "react";

export type Section = "overview" | "appointments" | "availability" | "customers" | "settings";

export const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/**
 * Loads data for a section. `load` must be stable (a module function or a
 * useCallback) so that it only changes with its inputs; `reload` fetches again.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ load: () => Promise<T>; version: number; data: T | null; error: string } | null>(null);
  useEffect(() => {
    let active = true;
    load()
      .then((data) => {
        if (active) setResult({ load, version, data, error: "" });
      })
      .catch((cause: unknown) => {
        if (active) setResult({ load, version, data: null, error: message(cause) });
      });
    return () => {
      active = false;
    };
  }, [load, version]);
  return {
    data: result?.data ?? null,
    error: result?.error ?? "",
    loading: result === null || result.load !== load || result.version !== version,
    reload: () => setVersion((current) => current + 1),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** ISO → value for <input type="datetime-local"> in the device's time zone. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const fromLocalInput = (value: string) => new Date(value).toISOString();

export const weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
```

- [ ] **Step 4: Write `src/admin/AppointmentRow.tsx`**

```tsx
import type { ReactNode } from "react";
import { modeLabels } from "../booking/api";
import { formatDateLong, formatTime } from "../booking/dates";
import type { AdminAppointment } from "./api";

export function AppointmentRow({ appointment, children }: { appointment: AdminAppointment; children?: ReactNode }) {
  const who = appointment.customer?.name ?? "Ehemaliges Mitglied";
  const details = [modeLabels[appointment.mode], appointment.phone, appointment.customer?.email, appointment.reference].filter(Boolean).join(" · ");
  return (
    <li className={`admin-row is-${appointment.status}`}>
      <div className="admin-row-main">
        <p className="admin-row-time">
          {formatDateLong(appointment.start)} · {formatTime(appointment.start)}–{formatTime(appointment.end)} Uhr
        </p>
        <p className="admin-row-title">
          <strong>{appointment.typeTitle}</strong> · {who}
          {appointment.company?.name ? ` · ${appointment.company.name}` : ""}
        </p>
        <p className="admin-row-meta">{details}</p>
        {appointment.address && <p className="admin-row-meta">Adresse: {appointment.address}</p>}
        {appointment.note && <p className="admin-row-note">{appointment.note}</p>}
        {appointment.status === "cancelled" && (
          <p className="admin-row-cancelled">
            Storniert{appointment.cancelledBy === "owner" ? " durch Sie" : appointment.cancelledBy === "customer" ? " durch den Kunden" : ""}
            {appointment.cancelReason ? `: ${appointment.cancelReason}` : ""}
          </p>
        )}
      </div>
      {children && <div className="admin-row-actions">{children}</div>}
    </li>
  );
}
```

- [ ] **Step 5: Write `src/admin/AdminLogin.tsx`**

```tsx
import qrcode from "qrcode-generator";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { adminApi, type AdminState } from "./api";
import { message } from "./util";

function QrCode({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="admin-qr" role="img" aria-label="QR-Code für die Authenticator-App" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function SixDigits({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label htmlFor={id}>
      {label}
      <input
        id={id}
        className="booking-code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        placeholder="000000"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </label>
  );
}

function EmailStep({ setupKey, onDone }: { setupKey: string | null; onDone: () => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      await (setupKey ? adminApi.setup(setupKey, email, name) : adminApi.login(email));
      setSent(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.verify(email, code);
      if (setupKey) window.history.replaceState(null, "", "/verwaltung/");
      onDone();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card admin-login">
      <p className="section-kicker">Tayyip Ünal · Verwaltung</p>
      <h1>{setupKey ? "Verwaltung einrichten" : "Anmelden"}</h1>
      {!sent ? (
        <form className="inquiry-form" onSubmit={request}>
          {setupKey && (
            <label htmlFor={`${id}-name`}>
              Ihr Name
              <input id={`${id}-name`} required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          <label htmlFor={`${id}-email`}>
            E-Mail
            <input id={`${id}-email`} type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Wird gesendet …" : "Code per E-Mail anfordern"}
          </button>
        </form>
      ) : (
        <form className="inquiry-form" onSubmit={verify}>
          <p className="form-intro">Falls diese Adresse Zugang hat, erhalten Sie jetzt einen 6-stelligen Code per E-Mail.</p>
          <SixDigits id={`${id}-code`} label="Code aus der E-Mail" value={code} onChange={setCode} />
          <button type="submit" className="button button-primary" disabled={busy || code.length !== 6}>
            Weiter
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function TotpStep({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.totp(code);
      onDone();
    } catch (cause) {
      setError(message(cause));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card admin-login">
      <p className="section-kicker">
        <ShieldCheck size={14} aria-hidden="true" /> Zweiter Faktor
      </p>
      <h1>Code aus der App</h1>
      <form className="inquiry-form" onSubmit={submit}>
        <SixDigits id={`${id}-code`} label="6-stelliger Code aus Ihrer Authenticator-App" value={code} onChange={setCode} />
        <button type="submit" className="button button-primary" disabled={busy || code.length !== 6}>
          Anmelden
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Pairing({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [pairing, setPairing] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    adminApi
      .startPairing()
      .then((result) => {
        if (active) setPairing(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.confirmPairing(code);
      onDone();
    } catch (cause) {
      setError(message(cause));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card admin-login">
      <p className="section-kicker">
        <ShieldCheck size={14} aria-hidden="true" /> Authenticator einrichten
      </p>
      <h1>Zweiter Faktor</h1>
      <ol className="admin-steps">
        <li>Öffnen Sie eine Authenticator-App, zum Beispiel Microsoft Authenticator oder Google Authenticator.</li>
        <li>Scannen Sie den QR-Code oder geben Sie den Schlüssel von Hand ein.</li>
        <li>Tragen Sie den 6-stelligen Code aus der App ein.</li>
      </ol>
      {pairing ? (
        <>
          <QrCode text={pairing.uri} />
          <p className="admin-secret">
            <KeyRound size={14} aria-hidden="true" /> Schlüssel: <code>{pairing.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </p>
        </>
      ) : (
        !error && <p className="slot-status">Wird vorbereitet …</p>
      )}
      <form className="inquiry-form" onSubmit={confirm}>
        <SixDigits id={`${id}-code`} label="Code aus der App" value={code} onChange={setCode} />
        <button type="submit" className="button button-primary" disabled={busy || code.length !== 6 || !pairing}>
          Einrichtung abschließen
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Setup link (?setup=…), email code, then pairing or the authenticator code, as the server's state requires. */
export function AdminLogin({ state, onChange }: { state: AdminState; onChange: () => void }) {
  const [setupKey] = useState(() => new URLSearchParams(window.location.search).get("setup"));
  if (state === "needsPairing") return <Pairing onDone={onChange} />;
  if (state === "needsTotp") return <TotpStep onDone={onChange} />;
  return <EmailStep setupKey={setupKey} onDone={onChange} />;
}
```

- [ ] **Step 6: Write `src/admin/Overview.tsx`**

```tsx
import { formatDateLong, formatTime } from "../booking/dates";
import { adminApi, type AdminAppointment } from "./api";
import { AppointmentRow } from "./AppointmentRow";
import { useLoad, type Section } from "./util";

function byDay(items: AdminAppointment[]): [string, AdminAppointment[]][] {
  const groups = new Map<string, AdminAppointment[]>();
  for (const item of items) {
    const day = formatDateLong(item.start);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups];
}

export function Overview({ onOpen }: { onOpen: (section: Section) => void }) {
  const { data, error } = useLoad(adminApi.overview);
  if (error) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return <p className="slot-status">Wird geladen …</p>;
  const days = byDay(data.upcoming);
  return (
    <section className="admin-section">
      <h1>Heute &amp; demnächst</h1>
      {data.failedEmails > 0 && (
        <p className="admin-alert" role="alert">
          {data.failedEmails} E-Mail(s) konnten nicht zugestellt werden.{" "}
          <button type="button" onClick={() => onOpen("settings")}>
            Ansehen
          </button>
        </p>
      )}
      {days.length === 0 ? (
        <p className="account-hint">In den nächsten 14 Tagen ist kein Termin gebucht.</p>
      ) : (
        days.map(([day, items]) => (
          <div key={day} className="admin-day">
            <h2>{day}</h2>
            <ul className="admin-list">
              {items.map((appointment) => (
                <AppointmentRow key={appointment.reference} appointment={appointment} />
              ))}
            </ul>
          </div>
        ))
      )}
      <p className="admin-meta">
        Letzte Wartung:{" "}
        {data.lastMaintenance
          ? `${formatDateLong(data.lastMaintenance.startedAt)}, ${formatTime(data.lastMaintenance.startedAt)} Uhr (${data.lastMaintenance.trigger})`
          : "noch nie"}
      </p>
    </section>
  );
}
```

- [ ] **Step 7: Write `src/admin/AdminApp.tsx`**

```tsx
import { Building2, CalendarRange, Clock3, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { adminApi, type AdminState, type AdminUser } from "./api";
import { AdminLogin } from "./AdminLogin";
import { AppointmentsSection } from "./AppointmentsSection";
import { AvailabilitySection } from "./AvailabilitySection";
import { CustomersSection } from "./CustomersSection";
import { Overview } from "./Overview";
import { SettingsSection } from "./SettingsSection";
import type { Section } from "./util";
import "../booking/booking.css";
import "./admin.css";

const sections: { id: Section; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Heute & demnächst", Icon: LayoutDashboard },
  { id: "appointments", label: "Termine", Icon: CalendarRange },
  { id: "availability", label: "Verfügbarkeit", Icon: Clock3 },
  { id: "customers", label: "Kunden", Icon: Building2 },
  { id: "settings", label: "Einstellungen", Icon: Settings },
];

/** /verwaltung/: the owner's admin area, behind email code plus authenticator. */
export default function AdminApp() {
  const [session, setSession] = useState<{ state: AdminState; admin: AdminUser | null } | null>(null);
  const [version, setVersion] = useState(0);
  const [section, setSection] = useState<Section>("overview");
  const refresh = () => setVersion((current) => current + 1);

  useEffect(() => {
    let active = true;
    adminApi
      .session()
      .then((result) => {
        if (active) setSession(result);
      })
      .catch(() => {
        if (active) setSession({ state: "none", admin: null });
      });
    return () => {
      active = false;
    };
  }, [version]);

  if (session === null) {
    return (
      <div className="admin-shell admin-center">
        <p className="slot-status">Verwaltung wird geladen …</p>
      </div>
    );
  }
  if (session.state !== "ok" || session.admin === null) {
    return (
      <div className="admin-shell admin-center">
        <AdminLogin state={session.state} onChange={refresh} />
      </div>
    );
  }
  return (
    <div className="admin-shell">
      <header className="admin-top">
        <a className="admin-brand" href="/">
          Tayyip Ünal <span>Verwaltung</span>
        </a>
        <nav className="admin-nav" aria-label="Bereiche">
          {sections.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={section === id ? "is-active" : undefined} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
        <div className="admin-user">
          <span>{session.admin.name}</span>
          <button
            type="button"
            className="quote-ghost"
            onClick={async () => {
              await adminApi.logout().catch(() => null);
              refresh();
            }}
          >
            <LogOut size={14} aria-hidden="true" /> Abmelden
          </button>
        </div>
      </header>
      <main className="admin-main">
        {section === "overview" && <Overview onOpen={setSection} />}
        {section === "appointments" && <AppointmentsSection />}
        {section === "availability" && <AvailabilitySection />}
        {section === "customers" && <CustomersSection />}
        {section === "settings" && <SettingsSection />}
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Write `src/admin/AppointmentsSection.tsx`**

```tsx
import { Plus } from "lucide-react";
import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError, modeLabels, type Mode } from "../booking/api";
import { addDays, berlinToday } from "../booking/dates";
import { adminApi, type AdminAppointment } from "./api";
import { AppointmentRow } from "./AppointmentRow";
import { fromLocalInput, message, toLocalInput, useLoad } from "./util";

const allModes: Mode[] = ["phone", "video", "onsite"];
const emptyForm = { type: "erstgespraech", start: "", mode: "phone" as Mode, name: "", email: "", company: "", phone: "", address: "", note: "" };

function AppointmentActions({ appointment, onChanged }: { appointment: AdminAppointment; onChanged: () => void }) {
  const [panel, setPanel] = useState<"none" | "move" | "cancel">("none");
  const [start, setStart] = useState(() => toLocalInput(appointment.start));
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function move() {
    setBusy(true);
    setError("");
    try {
      await adminApi.rescheduleAppointment(appointment.reference, fromLocalInput(start), conflict !== "");
      setPanel("none");
      setConflict("");
      onChanged();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && conflict === "") setConflict(cause.message);
      else setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await adminApi.cancelAppointment(appointment.reference, reason);
      setPanel("none");
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {panel === "none" && (
        <>
          <button type="button" className="quote-ghost" onClick={() => setPanel("move")}>
            Verschieben
          </button>
          <button type="button" className="quote-ghost admin-danger" onClick={() => setPanel("cancel")}>
            Absagen
          </button>
        </>
      )}
      {panel === "move" && (
        <div className="admin-inline inquiry-form">
          <label>
            Neuer Beginn
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                setConflict("");
              }}
            />
          </label>
          {conflict && <p className="form-error">{conflict}</p>}
          <div className="account-panel-actions">
            <button type="button" className="button button-primary" disabled={busy || !start} onClick={move}>
              {conflict ? "Trotzdem speichern" : "Speichern"}
            </button>
            <button
              type="button"
              className="quote-ghost"
              onClick={() => {
                setPanel("none");
                setConflict("");
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {panel === "cancel" && (
        <div className="admin-inline inquiry-form">
          <label>
            Nachricht an den Kunden (optional)
            <textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="account-panel-actions">
            <button type="button" className="button button-primary admin-danger-button" disabled={busy} onClick={cancel}>
              Termin absagen
            </button>
            <button type="button" className="quote-ghost" onClick={() => setPanel("none")}>
              Zurück
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function CreateAppointment({ onCreated }: { onCreated: () => void }) {
  const { data } = useLoad(adminApi.types);
  const requestId = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [conflict, setConflict] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const type = data?.types.find((item) => item.slug === form.type);
  const set = (key: keyof typeof emptyForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setConflict("");
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.createAppointment({ ...form, start: fromLocalInput(form.start), force: conflict !== "" }, requestId);
      requestId.current = null;
      setForm(emptyForm);
      setConflict("");
      setOpen(false);
      onCreated();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && conflict === "") setConflict(cause.message);
      else setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" /> Termin eintragen
      </button>
    );
  }
  return (
    <form className="admin-card inquiry-form admin-create" onSubmit={submit}>
      <h2>Termin für eine Kundin oder einen Kunden eintragen</h2>
      <div className="form-grid">
        <label>
          Terminart
          <select
            value={form.type}
            onChange={(event) => {
              const next = data?.types.find((item) => item.slug === event.target.value);
              setConflict("");
              setForm((current) => ({ ...current, type: event.target.value, mode: next && !next.modes.includes(current.mode) ? next.modes[0] : current.mode }));
            }}
          >
            {data?.types.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Beginn
          <input type="datetime-local" required value={form.start} onChange={set("start")} />
        </label>
        <label>
          Form
          <select value={form.mode} onChange={set("mode")}>
            {(type?.modes ?? allModes).map((value) => (
              <option key={value} value={value}>
                {modeLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input required minLength={2} maxLength={100} value={form.name} onChange={set("name")} />
        </label>
        <label>
          E-Mail
          <input type="email" required maxLength={254} value={form.email} onChange={set("email")} />
        </label>
        <label>
          Unternehmen
          <input maxLength={160} value={form.company} onChange={set("company")} />
        </label>
        <label>
          Telefon
          <input type="tel" maxLength={40} required={form.mode === "phone"} value={form.phone} onChange={set("phone")} />
        </label>
        {form.mode === "onsite" && (
          <label>
            Adresse
            <input required maxLength={300} value={form.address} onChange={set("address")} />
          </label>
        )}
      </div>
      <label>
        Notiz
        <textarea rows={2} maxLength={2000} value={form.note} onChange={set("note")} />
      </label>
      <p className="account-hint">Die Person erhält eine Bestätigung mit Kalendereinladung und sieht den Termin in ihrem Kundenkonto.</p>
      {conflict && <p className="form-error">{conflict}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-panel-actions">
        <button type="submit" className="button button-primary" disabled={busy}>
          {conflict ? "Trotzdem speichern" : "Termin speichern"}
        </button>
        <button type="button" className="quote-ghost" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function AppointmentsSection() {
  const [from, setFrom] = useState(berlinToday);
  const [to, setTo] = useState(() => addDays(berlinToday(), 30));
  const [status, setStatus] = useState("");
  const load = useCallback(() => adminApi.appointments(from, to, status), [from, to, status]);
  const { data, error, loading, reload } = useLoad(load);
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <h1>Termine</h1>
        <CreateAppointment onCreated={reload} />
      </div>
      <div className="admin-filters inquiry-form">
        <label>
          Von
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Bis
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Alle</option>
            <option value="confirmed">Bestätigt</option>
            <option value="cancelled">Storniert</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && !data ? (
        <p className="slot-status">Wird geladen …</p>
      ) : data && data.appointments.length === 0 ? (
        <p className="account-hint">Keine Termine in diesem Zeitraum.</p>
      ) : (
        <ul className="admin-list">
          {data?.appointments.map((appointment) => (
            <AppointmentRow key={appointment.reference} appointment={appointment}>
              {appointment.status === "confirmed" && <AppointmentActions appointment={appointment} onChanged={reload} />}
            </AppointmentRow>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 9: Write `src/admin/AvailabilitySection.tsx`**

```tsx
import { Plus, Trash } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { modeLabels, type Mode } from "../booking/api";
import { formatDateLong, formatTime } from "../booking/dates";
import { adminApi, type AdminType, type TypeInput } from "./api";
import { fromLocalInput, message, useLoad, weekdays } from "./util";

type Row = { weekday: number; start: string; end: string };
const allModes: Mode[] = ["phone", "video", "onsite"];
const blankType: TypeInput = { slug: "", title: "", description: "", durationMin: 60, modes: ["video"], bufferMin: 15, slotStepMin: 30, leadTimeH: 24, horizonDays: 60, videoLink: "", active: true, sort: 10 };
const toInput = (type: AdminType): TypeInput => ({ ...type, videoLink: type.videoLink ?? "" });

function TypeForm({ initial, typeId, onSaved, onCancel }: { initial: TypeInput; typeId: number | null; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const text = (key: "slug" | "title" | "description" | "videoLink") => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const number = (key: "durationMin" | "bufferMin" | "slotStepMin" | "leadTimeH" | "horizonDays" | "sort") => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: Number(event.target.value) }));
  const toggleMode = (mode: Mode) =>
    setForm((current) => ({
      ...current,
      modes: current.modes.includes(mode) ? current.modes.filter((item) => item !== mode) : allModes.filter((item) => item === mode || current.modes.includes(item)),
    }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      await (typeId === null ? adminApi.createType(form) : adminApi.updateType(typeId, form));
      onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-card inquiry-form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Titel
          <input required maxLength={120} value={form.title} onChange={text("title")} />
        </label>
        <label>
          Kurzbezeichnung (für Links)
          <input required pattern="[a-z0-9\-]{2,60}" value={form.slug} onChange={text("slug")} />
        </label>
        <label>
          Dauer (Minuten)
          <input type="number" required min={10} max={480} value={form.durationMin} onChange={number("durationMin")} />
        </label>
        <label>
          Puffer davor und danach (Minuten)
          <input type="number" required min={0} max={240} value={form.bufferMin} onChange={number("bufferMin")} />
        </label>
        <label>
          Raster der Startzeiten (Minuten)
          <input type="number" required min={5} max={240} value={form.slotStepMin} onChange={number("slotStepMin")} />
        </label>
        <label>
          Mindestvorlauf (Stunden)
          <input type="number" required min={0} max={720} value={form.leadTimeH} onChange={number("leadTimeH")} />
        </label>
        <label>
          Buchbar für die nächsten … Tage
          <input type="number" required min={1} max={365} value={form.horizonDays} onChange={number("horizonDays")} />
        </label>
        <label>
          Reihenfolge
          <input type="number" required min={-100} max={100} value={form.sort} onChange={number("sort")} />
        </label>
      </div>
      <label>
        Beschreibung
        <textarea rows={2} maxLength={600} value={form.description} onChange={text("description")} />
      </label>
      <fieldset className="booking-modes">
        <legend>Terminformen</legend>
        {allModes.map((mode) => (
          <label key={mode} className={`booking-mode${form.modes.includes(mode) ? " is-selected" : ""}`}>
            <input type="checkbox" checked={form.modes.includes(mode)} onChange={() => toggleMode(mode)} /> {modeLabels[mode]}
          </label>
        ))}
      </fieldset>
      <label>
        Video-Link (optional, beginnt mit https://)
        <input type="url" maxLength={300} value={form.videoLink} onChange={text("videoLink")} />
      </label>
      <label className="form-consent">
        <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
        <span>Auf der Website buchbar</span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-panel-actions">
        <button type="submit" className="button button-primary" disabled={busy}>
          Speichern
        </button>
        <button type="button" className="quote-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function TypesEditor() {
  const { data, error, reload } = useLoad(adminApi.types);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const done = () => {
    setEditing(null);
    reload();
  };
  return (
    <div className="admin-block">
      <div className="admin-section-head">
        <h2>Terminarten</h2>
        {editing === null && (
          <button type="button" className="quote-ghost" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden="true" /> Neue Terminart
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing === "new" && <TypeForm initial={blankType} typeId={null} onSaved={done} onCancel={() => setEditing(null)} />}
      <ul className="admin-list">
        {data?.types.map((type) =>
          editing === type.id ? (
            <li key={type.id}>
              <TypeForm initial={toInput(type)} typeId={type.id} onSaved={done} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={type.id} className="admin-row">
              <div className="admin-row-main">
                <p className="admin-row-title">
                  <strong>{type.title}</strong>
                  {type.active ? "" : " · nicht buchbar"}
                </p>
                <p className="admin-row-meta">
                  {type.durationMin} Min. · {type.modes.map((mode) => modeLabels[mode]).join(", ")} · Puffer {type.bufferMin} Min. · Vorlauf {type.leadTimeH} Std. · {type.horizonDays} Tage im Voraus
                </p>
              </div>
              <div className="admin-row-actions">
                <button type="button" className="quote-ghost" onClick={() => setEditing(type.id)}>
                  Bearbeiten
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function HoursEditor() {
  const types = useLoad(adminApi.types);
  const rules = useLoad(adminApi.rules);
  const [scope, setScope] = useState("");
  const [draft, setDraft] = useState<{ scope: string; rows: Row[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const typeId = scope === "" ? null : Number(scope);
  const stored: Row[] = (rules.data?.rules ?? []).filter((rule) => rule.typeId === typeId).map(({ weekday, start, end }) => ({ weekday, start, end }));
  const rows = draft !== null && draft.scope === scope ? draft.rows : stored;
  const edit = (next: Row[]) => {
    setNotice("");
    setDraft({ scope, rows: next });
  };

  async function save(next: Row[], success: string) {
    setBusy(true);
    setError("");
    try {
      await adminApi.saveRules(typeId, next);
      setDraft(null);
      rules.reload();
      setNotice(success);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-block">
      <h2>Wöchentliche Zeiten</h2>
      <label className="admin-scope">
        Gilt für
        <select
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
            setNotice("");
          }}
        >
          <option value="">Alle Terminarten</option>
          {types.data?.types.map((type) => (
            <option key={type.id} value={String(type.id)}>
              {type.title}
            </option>
          ))}
        </select>
      </label>
      {typeId !== null && stored.length === 0 && (
        <p className="account-hint">Für diese Terminart gelten die allgemeinen Zeiten. Tragen Sie hier Zeiten ein, um sie nur für diese Terminart festzulegen.</p>
      )}
      <div className="admin-hours">
        {weekdays.map((label, index) => {
          const weekday = index + 1;
          return (
            <div key={weekday} className="admin-hours-day">
              <strong>{label}</strong>
              <div className="admin-hours-ranges">
                {rows.map((row, position) =>
                  row.weekday !== weekday ? null : (
                    <span key={position} className="admin-range">
                      <input type="time" aria-label={`${label} von`} value={row.start} onChange={(event) => edit(rows.map((item, i) => (i === position ? { ...item, start: event.target.value } : item)))} />
                      –
                      <input type="time" aria-label={`${label} bis`} value={row.end} onChange={(event) => edit(rows.map((item, i) => (i === position ? { ...item, end: event.target.value } : item)))} />
                      <button type="button" className="admin-icon" aria-label={`Zeitraum am ${label} entfernen`} onClick={() => edit(rows.filter((_, i) => i !== position))}>
                        <Trash size={14} aria-hidden="true" />
                      </button>
                    </span>
                  ),
                )}
                <button type="button" className="admin-add" onClick={() => edit([...rows, { weekday, start: "09:00", end: "17:00" }])}>
                  <Plus size={14} aria-hidden="true" /> Zeitraum
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="admin-status" role="status">
        {notice}
      </p>
      <div className="account-panel-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => save(rows, "Die Zeiten wurden gespeichert.")}>
          Zeiten speichern
        </button>
        {typeId !== null && stored.length > 0 && (
          <button type="button" className="quote-ghost" disabled={busy} onClick={() => save([], "Für diese Terminart gelten wieder die allgemeinen Zeiten.")}>
            Allgemeine Zeiten verwenden
          </button>
        )}
      </div>
    </div>
  );
}

function AbsencesEditor() {
  const { data, error, reload } = useLoad(adminApi.absences);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true);
    setFailure("");
    try {
      await adminApi.addAbsence(fromLocalInput(start), fromLocalInput(end), note);
      setStart("");
      setEnd("");
      setNote("");
      reload();
    } catch (cause) {
      setFailure(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setFailure("");
    try {
      await adminApi.deleteAbsence(id);
      reload();
    } catch (cause) {
      setFailure(message(cause));
    }
  }

  return (
    <div className="admin-block">
      <h2>Abwesenheiten</h2>
      <p className="account-hint">In diesen Zeiträumen werden keine Termine angeboten, zum Beispiel bei Urlaub oder Seminaren.</p>
      <ul className="admin-list">
        {data?.absences.map((absence) => (
          <li key={absence.id} className="admin-row">
            <div className="admin-row-main">
              <p className="admin-row-title">
                <strong>
                  {formatDateLong(absence.start)}, {formatTime(absence.start)} Uhr
                </strong>{" "}
                bis {formatDateLong(absence.end)}, {formatTime(absence.end)} Uhr
              </p>
              {absence.note && <p className="admin-row-meta">{absence.note}</p>}
            </div>
            <div className="admin-row-actions">
              <button type="button" className="quote-ghost" onClick={() => remove(absence.id)}>
                Entfernen
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="inquiry-form admin-inline" onSubmit={add}>
        <div className="form-grid">
          <label>
            Von
            <input type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            Bis
            <input type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        <label>
          Notiz (optional)
          <input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button type="submit" className="button button-primary" disabled={busy}>
          Abwesenheit eintragen
        </button>
      </form>
      {(error || failure) && (
        <p className="form-error" role="alert">
          {error || failure}
        </p>
      )}
    </div>
  );
}

export function AvailabilitySection() {
  return (
    <section className="admin-section">
      <h1>Verfügbarkeit</h1>
      <TypesEditor />
      <HoursEditor />
      <AbsencesEditor />
    </section>
  );
}
```

- [ ] **Step 10: Write `src/admin/CustomersSection.tsx`**

```tsx
import { UserPlus } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { adminApi, type Person } from "./api";
import { AppointmentRow } from "./AppointmentRow";
import { message, useLoad } from "./util";

function PersonRow({ person, onChanged }: { person: Person; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone);
  const [companyId, setCompanyId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError("");
    try {
      await action();
      after?.();
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    run(() => adminApi.updateCustomer(person.id, { name, phone, ...(companyId ? { companyId: Number(companyId) } : {}) }), () => setEditing(false));
  };

  return (
    <li className="admin-row">
      <div className="admin-row-main">
        {editing ? (
          <form className="inquiry-form admin-inline" onSubmit={save}>
            <div className="form-grid">
              <label>
                Name
                <input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Telefon
                <input maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <label>
                In andere Firma verschieben (Firmen-Nr.)
                <input inputMode="numeric" pattern="[0-9]*" placeholder="leer lassen" value={companyId} onChange={(event) => setCompanyId(event.target.value)} />
              </label>
            </div>
            <div className="account-panel-actions">
              <button type="submit" className="button button-primary" disabled={busy}>
                Speichern
              </button>
              <button type="button" className="quote-ghost" onClick={() => setEditing(false)}>
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="admin-row-title">
              <strong>{person.name}</strong> · {person.email}
            </p>
            <p className="admin-row-meta">
              {person.phone || "keine Telefonnummer"} · Person-Nr. {person.id}
            </p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {!editing && (
        <div className="admin-row-actions">
          <button type="button" className="quote-ghost" onClick={() => setEditing(true)}>
            Bearbeiten
          </button>
          {!confirm ? (
            <button type="button" className="quote-ghost admin-danger" onClick={() => setConfirm(true)}>
              Löschen
            </button>
          ) : (
            <>
              <button type="button" className="button button-primary admin-danger-button" disabled={busy} onClick={() => run(() => adminApi.deleteCustomer(person.id))}>
                Endgültig löschen
              </button>
              <button type="button" className="quote-ghost" onClick={() => setConfirm(false)}>
                Abbrechen
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function CompanyPanel({ companyId, onClose, onChanged }: { companyId: number; onClose: () => void; onChanged: () => void }) {
  const load = useCallback(() => adminApi.company(companyId), [companyId]);
  const { data, error, reload } = useLoad(load);
  const [name, setName] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const changed = () => {
    reload();
    onChanged();
  };

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setFailure("");
    try {
      await action();
      after?.();
      changed();
    } catch (cause) {
      setFailure(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="admin-card">
        <p className="form-error" role="alert">
          {error}
        </p>
        <button type="button" className="quote-ghost" onClick={onClose}>
          Schließen
        </button>
      </div>
    );
  }
  if (!data) return <p className="slot-status">Wird geladen …</p>;
  return (
    <div className="admin-card admin-company">
      <div className="admin-section-head">
        <h2>
          {data.company.name ?? "Privatperson"} <small>Firmen-Nr. {data.company.id}</small>
        </h2>
        <button type="button" className="quote-ghost" onClick={onClose}>
          Schließen
        </button>
      </div>
      <form
        className="inquiry-form admin-inline"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => adminApi.renameCompany(data.company.id, name ?? data.company.name ?? ""), () => setName(null));
        }}
      >
        <label>
          Firmenname (leer lassen für Privatpersonen)
          <input maxLength={160} value={name ?? data.company.name ?? ""} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit" className="quote-ghost" disabled={busy}>
          Namen speichern
        </button>
      </form>
      <h3>Personen</h3>
      <ul className="admin-list">
        {data.members.map((person) => (
          <PersonRow key={person.id} person={person} onChanged={changed} />
        ))}
      </ul>
      <form
        className="inquiry-form admin-inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (!event.currentTarget.reportValidity()) return;
          run(() => adminApi.addMember(data.company.id, memberEmail, memberName), () => {
            setMemberName("");
            setMemberEmail("");
          });
        }}
      >
        <div className="form-grid">
          <label>
            Name
            <input required minLength={2} maxLength={100} value={memberName} onChange={(event) => setMemberName(event.target.value)} />
          </label>
          <label>
            E-Mail
            <input type="email" required maxLength={254} value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} />
          </label>
        </div>
        <button type="submit" className="quote-ghost" disabled={busy}>
          <UserPlus size={14} aria-hidden="true" /> Person hinzufügen und einladen
        </button>
      </form>
      <h3>Termine</h3>
      {data.appointments.length === 0 ? (
        <p className="account-hint">Keine Termine.</p>
      ) : (
        <ul className="admin-list">
          {data.appointments.map((appointment) => (
            <AppointmentRow key={appointment.reference} appointment={appointment} />
          ))}
        </ul>
      )}
      {failure && (
        <p className="form-error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}

export function CustomersSection() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const load = useCallback(() => adminApi.customers(query), [query]);
  const { data, error, loading, reload } = useLoad(load);
  return (
    <section className="admin-section">
      <h1>Kunden</h1>
      <form
        className="inquiry-form admin-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <label>
          Suche nach Firma, Name oder E-Mail
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button type="submit" className="button button-primary">
          Suchen
        </button>
      </form>
      {openId !== null && <CompanyPanel key={openId} companyId={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && !data ? (
        <p className="slot-status">Wird geladen …</p>
      ) : (
        <ul className="admin-list">
          {data?.companies.map((company) => (
            <li key={company.id} className="admin-row">
              <div className="admin-row-main">
                <p className="admin-row-title">
                  <strong>{company.name ?? "Privatperson"}</strong> · Firmen-Nr. {company.id}
                </p>
                <p className="admin-row-meta">
                  {company.members.map((member) => `${member.name} (${member.email})`).join(", ") || "keine Personen"} · {company.appointments} Termin(e)
                </p>
              </div>
              <div className="admin-row-actions">
                <button type="button" className="quote-ghost" onClick={() => setOpenId(company.id)}>
                  Öffnen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 11: Write `src/admin/SettingsSection.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { formatDateLong, formatTime } from "../booking/dates";
import { adminApi, exportUrl } from "./api";
import { message, useLoad } from "./util";

export function SettingsSection() {
  const settings = useLoad(adminApi.settings);
  const failed = useLoad(adminApi.failedEmails);
  const admins = useLoad(adminApi.admins);
  const audit = useLoad(adminApi.audit);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      audit.reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const saveOwner = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    run(async () => {
      await adminApi.saveSettings(ownerEmail ?? settings.data?.ownerEmail ?? "");
      setOwnerEmail(null);
      settings.reload();
    }, "Die Adresse wurde gespeichert.");
  };

  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    run(async () => {
      await adminApi.inviteAdmin(adminEmail, adminName);
      setAdminName("");
      setAdminEmail("");
      admins.reload();
    }, "Die Einladung wurde verschickt.");
  };

  return (
    <section className="admin-section">
      <h1>Einstellungen</h1>

      <div className="admin-card">
        <h2>Benachrichtigungen</h2>
        <form className="inquiry-form admin-inline" onSubmit={saveOwner}>
          <label>
            Kalendereinladungen und Hinweise gehen an
            <input type="email" required maxLength={254} value={ownerEmail ?? settings.data?.ownerEmail ?? ""} onChange={(event) => setOwnerEmail(event.target.value)} />
          </label>
          <button type="submit" className="quote-ghost" disabled={busy}>
            Speichern
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h2>Nicht zugestellte E-Mails</h2>
        {failed.data && failed.data.failed.length > 0 ? (
          <ul className="admin-list">
            {failed.data.failed.map((mail) => (
              <li key={mail.id} className="admin-row">
                <div className="admin-row-main">
                  <p className="admin-row-title">
                    <strong>{mail.recipient}</strong> · {mail.kind}
                  </p>
                  <p className="admin-row-meta">
                    {mail.attempts} Versuche · {mail.lastError}
                  </p>
                </div>
                <div className="admin-row-actions">
                  <button
                    type="button"
                    className="quote-ghost"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await adminApi.retryEmail(mail.id);
                        failed.reload();
                      }, "Die E-Mail wird erneut gesendet.")
                    }
                  >
                    Erneut senden
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="account-hint">Alle E-Mails wurden zugestellt.</p>
        )}
      </div>

      <div className="admin-card">
        <h2>Zugang zur Verwaltung</h2>
        <ul className="admin-list">
          {admins.data?.admins.map((admin) => (
            <li key={admin.id} className="admin-row">
              <div className="admin-row-main">
                <p className="admin-row-title">
                  <strong>{admin.name}</strong> · {admin.email}
                </p>
                <p className="admin-row-meta">{admin.paired ? "Authenticator eingerichtet" : "Einladung offen"}</p>
              </div>
            </li>
          ))}
        </ul>
        <form className="inquiry-form admin-inline" onSubmit={invite}>
          <div className="form-grid">
            <label>
              Name
              <input required minLength={2} maxLength={100} value={adminName} onChange={(event) => setAdminName(event.target.value)} />
            </label>
            <label>
              E-Mail
              <input type="email" required maxLength={254} value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} />
            </label>
          </div>
          <button type="submit" className="quote-ghost" disabled={busy}>
            Einladen
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h2>Wartung und Daten</h2>
        <p className="account-hint">
          Die Wartung versendet ausstehende E-Mails und Erinnerungen und löscht Daten nach Ablauf der Fristen. Sie läuft automatisch alle 15 Minuten.
        </p>
        <div className="account-panel-actions">
          <button
            type="button"
            className="quote-ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await adminApi.runMaintenance();
                if (result.stats === null) throw new Error("Die Wartung lief vor weniger als einer Minute. Bitte versuchen Sie es gleich noch einmal.");
                setStats(result.stats);
              }, "Die Wartung wurde ausgeführt.")
            }
          >
            Wartung jetzt ausführen
          </button>
          <a className="quote-ghost" href={exportUrl} download>
            Alle Daten exportieren (JSON)
          </a>
        </div>
        {stats && (
          <p className="admin-meta">
            {Object.entries(stats)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="admin-card">
        <h2>Protokoll</h2>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Wer</th>
                <th>Aktion</th>
                <th>Objekt</th>
              </tr>
            </thead>
            <tbody>
              {audit.data?.entries.map((entry, index) => (
                <tr key={index}>
                  <td>
                    {formatDateLong(entry.createdAt)}, {formatTime(entry.createdAt)}
                  </td>
                  <td>
                    {entry.actorType}
                    {entry.actorId !== null ? ` #${entry.actorId}` : ""}
                  </td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.subjectType}
                    {entry.subjectId !== null ? ` #${entry.subjectId}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="admin-status" role="status">
        {notice}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 12: Write `src/admin/admin.css`**

```css
.admin-shell {
  min-height: 100vh;
  background: var(--mist);
  color: var(--ink);
}
.admin-center {
  display: grid;
  place-items: center;
  padding: 40px 16px;
}
.admin-top {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 14px clamp(16px, 4vw, 40px);
  border-bottom: 1px solid var(--line);
  background: #fff;
}
.admin-brand {
  color: var(--ink);
  font-family: "DM Serif Display", serif;
  font-size: 1.25rem;
}
.admin-brand span {
  margin-left: 6px;
  color: var(--blue-700);
  font-family: "Manrope", sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.admin-nav {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
}
.admin-nav button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--ink-soft);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.admin-nav button:hover {
  background: var(--mist);
}
.admin-nav button.is-active {
  background: var(--blue-100);
  color: var(--blue-700);
}
.admin-user {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-soft);
  font-size: 0.82rem;
}
.admin-main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 40px) 80px;
}
.admin-section {
  display: grid;
  gap: 20px;
}
.admin-section h1 {
  margin: 0;
  font-family: "DM Serif Display", serif;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  font-weight: 400;
}
.admin-section h2 {
  margin: 0;
  font-size: 1.1rem;
}
.admin-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.admin-card,
.admin-block {
  display: grid;
  gap: 14px;
  padding: clamp(18px, 2.4vw, 26px);
  border: 1px solid #d4e6ef;
  border-radius: 16px;
  background: #fff;
}
.admin-login {
  width: min(520px, 100%);
}
.admin-login h1 {
  margin: 0;
  font-family: "DM Serif Display", serif;
  font-size: 2rem;
  font-weight: 400;
}
.admin-steps {
  margin: 0;
  padding-left: 20px;
  color: var(--ink-soft);
  font-size: 0.86rem;
  line-height: 1.7;
}
.admin-qr {
  width: 200px;
  height: 200px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}
.admin-qr svg {
  display: block;
  width: 100%;
  height: 100%;
}
.admin-secret {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.82rem;
}
.admin-secret code {
  font-size: 0.9rem;
  letter-spacing: 0.08em;
}
.admin-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.admin-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px 20px;
  padding: 14px 16px;
  border: 1px solid #e0ecf2;
  border-radius: 12px;
  background: #fbfdfe;
}
.admin-row.is-cancelled {
  opacity: 0.65;
}
.admin-row-main {
  display: grid;
  flex: 1 1 360px;
  gap: 4px;
  min-width: 0;
}
.admin-row-main p {
  margin: 0;
}
.admin-row-time {
  color: var(--blue-700);
  font-size: 0.78rem;
  font-weight: 700;
}
.admin-row-title {
  font-size: 0.92rem;
}
.admin-row-meta {
  color: var(--ink-soft);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
.admin-row-note {
  color: var(--ink);
  font-size: 0.82rem;
  white-space: pre-line;
}
.admin-row-cancelled {
  color: #94462b;
  font-size: 0.8rem;
  font-weight: 700;
}
.admin-row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}
.admin-inline {
  display: grid;
  gap: 12px;
  width: 100%;
}
.admin-day {
  display: grid;
  gap: 10px;
}
.admin-day h2 {
  color: var(--ink-soft);
  font-size: 0.9rem;
}
.admin-alert {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #edcdc0;
  border-radius: 10px;
  background: #fff3ee;
  color: #94462b;
  font-size: 0.86rem;
}
.admin-alert button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}
.admin-meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}
.admin-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.admin-filters label {
  min-width: 160px;
}
.admin-scope {
  display: grid;
  gap: 6px;
  max-width: 320px;
  color: #34556a;
  font-size: 0.76rem;
  font-weight: 600;
}
.admin-scope select,
.admin-range input {
  padding: 8px 10px;
  border: 1px solid #cbdde7;
  border-radius: 8px;
  font: inherit;
  font-size: 0.86rem;
}
.admin-hours {
  display: grid;
  gap: 10px;
}
.admin-hours-day {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: start;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #edf3f6;
}
.admin-hours-ranges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.admin-range {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.admin-icon,
.admin-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid #d4e6ef;
  border-radius: 8px;
  background: #fff;
  color: var(--blue-700);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.admin-search {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
.admin-search label {
  flex: 1 1 280px;
}
.admin-company h3 {
  margin: 6px 0 0;
  font-size: 0.95rem;
}
.admin-company small {
  color: var(--muted);
  font-family: "Manrope", sans-serif;
  font-size: 0.72rem;
}
.admin-shell a.quote-ghost {
  display: inline-flex;
  align-items: center;
}
.admin-danger {
  color: #94462b;
}
.admin-danger-button {
  background: #a4472b;
}
.admin-danger-button:hover {
  background: #86381f;
}
.admin-status {
  min-height: 1em;
  margin: 0;
  color: #0a8a55;
  font-size: 0.86rem;
  font-weight: 700;
}
.admin-scroll {
  overflow-x: auto;
}
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.admin-table th,
.admin-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #edf3f6;
  text-align: left;
  vertical-align: top;
}
.admin-table th {
  color: var(--muted);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
@media (max-width: 700px) {
  .admin-hours-day {
    grid-template-columns: 1fr;
  }
  .admin-user span {
    display: none;
  }
}
```

- [ ] **Step 13: Route `/verwaltung` in `src/App.tsx` without the site chrome**

Add below the other lazy imports:

```tsx
const AdminApp = lazy(() => import("./admin/AdminApp"));
```

Rename the existing `function App({ path = "/" }: { path?: string })` to `function Site({ page }: { page: string })` and delete its first line, `const page = path.replace(/\/$/, "");`. Then add the new `App` above `export default App;`:

```tsx
function App({ path = "/" }: { path?: string }) {
  const page = path.replace(/\/$/, "");
  if (page === "/verwaltung") {
    return (
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<div className="admin-shell admin-center"><p className="slot-status">Verwaltung wird geladen …</p></div>}>
          <AdminApp />
        </Suspense>
      </MotionConfig>
    );
  }
  return <Site page={page} />;
}
```

`App` calls no hooks before the early return; all hooks live in `Site`, so the rules of hooks hold.

- [ ] **Step 14: Type-check, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no errors. The build contains `AdminApp-*.js`. `grep -l "qrcode" dist/assets/index-*.js` prints nothing: the QR library is only in the admin chunk.

- [ ] **Step 15: Verify in the browser**

1. Start with a fresh stack (`npm run booking:down && npm run booking:up`), then `preview_start` with `dev-alt`.
2. Open `http://127.0.0.1:5174/verwaltung/?setup=local-setup-key`.
   - "Verwaltung einrichten" asks for a name and email. Enter `Tayyip Ünal` / `info@tayyipuenal.de` and click "Code per E-Mail anfordern".
   - Read the code from the newest `.eml` whose decoded subject ends in "– Anmeldung Verwaltung", enter it and click "Weiter".
3. The pairing view shows a QR code (200×200) and the key in groups of four.
   - Compute a code with `node -e 'const c=require("crypto");const s=process.argv[1].replace(/\s/g,"");let b="";for(const ch of s)b+="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch).toString(2).padStart(5,"0");const k=Buffer.from(b.match(/.{8}/g).map(x=>parseInt(x,2)));const t=Buffer.alloc(8);t.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=c.createHmac("sha1",k).update(t).digest();const o=h[19]&15;console.log(String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,"0"))' "<key from the screen>"`.
   - Enter it and click "Einrichtung abschließen". The admin area opens and the URL no longer contains `?setup=`.
4. **Termine:** click "Termin eintragen", fill a Saturday at 10:00 as phone with a test email, and click "Termin speichern". The row appears.
   - Enter a second appointment 15 minutes later. "Überschneidung mit …" appears; click "Trotzdem speichern".
   - Use "Verschieben" to move one appointment, then "Absagen" with a message.
5. **Verfügbarkeit:**
   - Edit the first meeting to 45 minutes and save.
   - Choose "Kostenloses Erstgespräch" under "Gilt für", add a Saturday period 10:00–12:00, and click "Zeiten speichern".
   - Add an absence and remove it.
6. **Kunden:** search for the test email, click "Öffnen", rename the company, add a person, edit the person, then delete the person.
7. **Einstellungen:**
   - Change and restore the notification address.
   - "Wartung jetzt ausführen" shows the counts.
   - "Alle Daten exportieren (JSON)" downloads a file.
   - The log lists the actions, and inviting a second admin shows "Einladung offen".
8. Click "Abmelden": the login view appears. `read_console_messages` shows no errors. At 390×844 the navigation wraps and there is no horizontal page scrolling; the log table scrolls inside its card.
9. `preview_stop`.

- [ ] **Step 16: Commit**

```bash
git add src/admin src/App.tsx package.json package-lock.json
git commit -m "feat(site): admin area with setup, authenticator and all owner operations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Page shells, crawler rules, headers and privacy text

**Files:**
- Modify: `scripts/render-pages.tsx` (shells for `/konto/` and `/verwaltung/`, robots line)
- Create: `public/konto/.htaccess`, `public/verwaltung/.htaccess`
- Modify: `src/components/LegalPage.tsx` (privacy text), `src/seo.ts` (privacy description)

**Interfaces:**
- Consumes: the built `dist/index.html` template (Vite), `pageMeta`
- Produces:
  - `dist/konto/index.html` and `dist/verwaltung/index.html`: an empty `#root` (the client renders, so there is no hydration), `<meta name="robots" content="noindex, nofollow">`, no inline intro script
  - `robots.txt` with `Disallow: /verwaltung/`
  - noindex and CSP headers from the two `.htaccess` files
- **Deviation from the spec, and why:** `/konto/` is **not** disallowed in `robots.txt`. It is linked from every page's footer. A `Disallow` would stop crawlers from reading its `noindex`, and the bare URL could still be indexed. `noindex` (meta tag and `X-Robots-Tag` header) keeps it out of the index. `/verwaltung/` is linked nowhere, so it gets both. Task 23 updates the spec line.

- [ ] **Step 1: Write the shells and the robots rule in `scripts/render-pages.tsx`**

After the `for (const page of pageMeta) { … }` loop and before the `writeFileSync("dist/sitemap.xml", …)` call, insert:

```tsx
// App shells for the customer area and the admin area: rendered only in the
// browser (empty #root, so no hydration), never indexed, and without the
// inline intro script, which the strict Content-Security-Policy would block.
const shells = [
  { path: "/konto/", title: "Kundenkonto | Tayyip Ünal" },
  { path: "/verwaltung/", title: "Verwaltung | Tayyip Ünal" },
];
for (const shell of shells) {
  const html = template
    .replace(/<script>\s*\/\/ Paper intro gate[\s\S]*?<\/script>\s*/, "")
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(shell.title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, '<meta name="robots" content="noindex, nofollow" />');
  if (html.includes("Paper intro gate") || !html.includes('<div id="root"></div>')) {
    throw new Error(`Shell ${shell.path} could not be built from dist/index.html`);
  }
  const directory = join("dist", shell.path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "index.html"), html);
  console.log("Shell", shell.path);
}
```

Change the robots line to:

```tsx
writeFileSync(
  "dist/robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /verwaltung/\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);
```

- [ ] **Step 2: Write `public/konto/.htaccess`**

```apacheconf
# Customer area: never indexed, no inline or third-party scripts, never framed.
<IfModule mod_headers.c>
  Header always set X-Robots-Tag "noindex, nofollow"
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  Header always set Referrer-Policy "same-origin"
</IfModule>
```

- [ ] **Step 3: Write `public/verwaltung/.htaccess`**

```apacheconf
# Admin area: never indexed, no inline or third-party scripts, never framed.
<IfModule mod_headers.c>
  Header always set X-Robots-Tag "noindex, nofollow"
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  Header always set Referrer-Policy "same-origin"
</IfModule>
```

- [ ] **Step 4: Update the privacy text in `src/components/LegalPage.tsx`**

This is a draft for the owner's approval; the release notes flag it.

In section `ueberblick`, replace the paragraph starting "Die Website informiert über unsere Leistungen." with:

```tsx
        <p>
          Die Website informiert über unsere Leistungen. Sie können online einen
          Termin buchen, ein Kundenkonto nutzen oder uns über die
          Anfrageformulare, per E-Mail oder telefonisch erreichen.
        </p>
```

Insert this new section object into `privacySections`, directly after the `anfragen` section:

```tsx
  {
    id: "terminbuchung",
    title: "Terminbuchung & Kundenkonto",
    content: (
      <>
        <p>
          Wenn Sie online einen Termin buchen, verarbeiten wir Ihren Namen, Ihre
          E-Mail-Adresse, den gewählten Termin und die Terminform sowie freiwillige
          Angaben wie Unternehmen, Telefonnummer und Anmerkung, bei Terminen vor
          Ort zusätzlich die Adresse. Zweck ist die Vereinbarung und Durchführung
          des Termins (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
        <p>
          Zur Bestätigung senden wir Ihnen einen 6-stelligen Code per E-Mail. Mit
          der bestätigten E-Mail-Adresse entsteht ein Kundenkonto. Dort sehen Sie
          und von Ihnen eingeladene Kolleginnen und Kollegen die Termine Ihres
          Unternehmens und können sie verschieben oder stornieren. Ein Passwort
          wird nicht vergeben und nicht gespeichert.
        </p>
        <p>
          Die Angaben werden in einer Datenbank auf dem Webserver unseres
          Hosting-Anbieters ALL-INKL.COM in Deutschland gespeichert und nicht an
          weitere Dritte übermittelt. Bestätigungen, Kalendereinladungen und
          Erinnerungen erhalten Sie per E-Mail.
        </p>
        <p>
          Unbestätigte Reservierungen löschen wir kurz nach ihrem Ablauf,
          Bestätigungscodes nach 24 Stunden und Termine 12 Monate nach dem
          Termin. Ein Kundenkonto, das 24 Monate nicht genutzt wurde, löschen wir
          nach vorheriger Ankündigung per E-Mail. Sie können Ihr Konto jederzeit
          selbst löschen; zukünftige Termine werden dabei storniert.
        </p>
        <p>
          Zum Schutz vor Missbrauch zählen wir Anfragen je IP-Adresse und
          E-Mail-Adresse. Dafür speichern wir diese Angaben nur als nicht
          umkehrbaren, verschlüsselten Prüfwert und löschen ihn nach 24 Stunden
          (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </>
    ),
  },
```

In section `cookies`, replace the first paragraph ("Die Website selbst setzt keine Analyse- oder Marketing-Cookies ein …") with:

```tsx
        <p>
          Die Website selbst setzt keine Analyse- oder Marketing-Cookies ein und
          verwendet keine Tracking-Pixel. Nur wenn Sie sich bei einer
          Terminbuchung oder im Kundenkonto mit einem Code anmelden, setzen wir
          ein technisch notwendiges Sitzungs-Cookie. Es enthält eine zufällige
          Kennung, gilt 30 Tage (bei Nutzung verlängert) und wird beim Abmelden
          gelöscht. Für technisch notwendige Cookies ist keine Einwilligung
          erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Die Schrittanzeige des
          Schulungswegs speichert keine Angaben in Cookies oder im dauerhaften
          Browserspeicher.
        </p>
```

- [ ] **Step 5: Update the privacy description in `src/seo.ts`**

Replace `"Informationen zu Kontaktformularen, Hosting, Datenschutz und Ihren Rechten auf der Website von Tayyip Ünal."` with:

```ts
      "Informationen zu Terminbuchung, Kundenkonto, Kontaktformularen, Hosting und Ihren Rechten auf der Website von Tayyip Ünal.",
```

- [ ] **Step 6: Build and check the output**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: the log ends with `Shell /konto/` and `Shell /verwaltung/`.

Run:

```bash
grep -c 'name="robots" content="noindex, nofollow"' dist/konto/index.html dist/verwaltung/index.html
grep -c "Paper intro gate" dist/konto/index.html dist/verwaltung/index.html dist/index.html
grep "Disallow" dist/robots.txt
ls dist/konto/.htaccess dist/verwaltung/.htaccess
grep -o "Terminbuchung &amp; Kundenkonto\|§ 25 Abs. 2 Nr. 2 TDDDG" dist/datenschutz/index.html | sort -u
```

Expected:
- 1 for both shells.
- 0, 0 and 1 for the intro script: it is only on the home page.
- `Disallow: /api/` and `Disallow: /verwaltung/`.
- Both `.htaccess` files are listed.
- Both `Terminbuchung &amp; Kundenkonto` and `§ 25 Abs. 2 Nr. 2 TDDDG` listed for `dist/datenschutz/index.html`.

- [ ] **Step 7: Check the built site as production would serve it**

This serves `dist/` with the same Apache image, so `.htaccess`, CSP and the rewrite are real.

```bash
docker run -d --rm --name tu-dist -p 127.0.0.1:8087:80 --network tu-booking_default \
  -e TU_BOOKING_CONFIG=/var/www/tu-booking/docker/config.docker.php \
  -v "$PWD/dist:/var/www/site:ro" -v "$PWD/booking:/var/www/tu-booking" tu-booking-web
curl -sI http://127.0.0.1:8087/konto/ | grep -i "x-robots-tag\|content-security-policy"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8087/api/booking/appointment-types
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8087/tu-booking/bootstrap.php
```

Expected:
- Both headers are present on `/konto/`.
- `/api/booking/appointment-types` returns `200`.
- `/tu-booking/bootstrap.php` returns `404`.

Then `preview_start` with `url: "http://127.0.0.1:8087/konto/"`. The login card renders, and `read_console_messages` shows no Content-Security-Policy violations. The same holds for `http://127.0.0.1:8087/verwaltung/`, where the login card is "Anmelden". Afterwards run `docker stop tu-dist`.

- [ ] **Step 8: Commit**

```bash
git add scripts/render-pages.tsx public/konto public/verwaltung src/components/LegalPage.tsx src/seo.ts
git commit -m "feat(site): noindex shells for account and admin, CSP headers, privacy text for booking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Configuration, deployment, live checks and the owner's guide

**Files:**
- Create: `scripts/make-booking-config.mjs`, `scripts/deploy-booking.sh`, `docs/booking/EINRICHTUNG.md`, `RELEASE-2026-09-23-booking.md`
- Modify: `scripts/verify-live.mjs` (full replacement), `DEPLOYMENT.md` (new top entry), `docs/superpowers/specs/2026-09-23-booking-portal-design.md` (implementation notes)

**Interfaces:**
- Consumes:
  - `booking/config.example.php` placeholders `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `HEX_64` (twice), `TOKEN` (twice) (Task 1)
  - the build output (Tasks 19–22)
- Produces:
  - `node scripts/make-booking-config.mjs [--out <path>]`: writes the production `booking/config.php` (mode 600) and prints the setup link and the cron URL
  - `sh scripts/deploy-booking.sh` with `FTP_USER`, `UPLOAD_CONFIG=1` and `DRY_RUN=1`
  - `node scripts/verify-live.mjs` with `SITE_URL=` to override the target

- [ ] **Step 1: Write `scripts/make-booking-config.mjs`**

```js
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';

// Creates the production configuration of the booking module with fresh
// secrets. Asks for the MySQL database name, user and password from KAS; the
// password is typed invisibly (or piped in when stdin is not a terminal).
// Never overwrites an existing file. Upload the result once with
// UPLOAD_CONFIG=1 sh scripts/deploy-booking.sh and keep a copy offline.
const outIndex = process.argv.indexOf('--out');
const target = resolve(outIndex > -1 ? process.argv[outIndex + 1] : new URL('../booking/config.php', import.meta.url).pathname);
if (existsSync(target)) {
  console.error(`${target} existiert bereits. Bitte zuerst sichern und entfernen.`);
  process.exit(1);
}

function ask(question, hidden = false) {
  if (hidden && !stdin.isTTY) {
    return new Promise((done) => {
      let data = '';
      stdin.on('data', (chunk) => (data += chunk));
      stdin.on('end', () => done(data.trim()));
    });
  }
  return new Promise((done) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => text.includes(question) && stdout.write(text);
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) stdout.write('\n');
      done(answer.trim());
    });
  });
}

const dbName = process.env.DB_NAME ?? (await ask('Datenbankname aus dem KAS (z. B. d0123456): '));
const dbUser = process.env.DB_USER ?? (await ask('Datenbankbenutzer (meist gleich dem Namen): '));
const dbPassword = await ask('Datenbankpasswort (Eingabe unsichtbar): ', true);
if (!/^[A-Za-z0-9_]+$/.test(dbName) || !/^[A-Za-z0-9_]+$/.test(dbUser) || dbPassword === '') {
  console.error('Bitte Datenbankname, Benutzer und Passwort prüfen.');
  process.exit(1);
}

const hex = () => randomBytes(32).toString('hex');
const token = () => randomBytes(24).toString('base64url');
const php = (value) => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
const setupKey = token();
const maintenanceKey = token();
const config = readFileSync(new URL('../booking/config.example.php', import.meta.url), 'utf8')
  .replace('dbname=DB_NAME', `dbname=${dbName}`)
  .replace("'user' => 'DB_USER'", `'user' => '${php(dbUser)}'`)
  .replace("'password' => 'DB_PASSWORD'", `'password' => '${php(dbPassword)}'`)
  .replace("'code_pepper' => 'HEX_64'", `'code_pepper' => '${hex()}'`)
  .replace("'totp_key' => 'HEX_64'", `'totp_key' => '${hex()}'`)
  .replace("'maintenance_key' => 'TOKEN'", `'maintenance_key' => '${maintenanceKey}'`)
  .replace("'setup_key' => 'TOKEN'", `'setup_key' => '${setupKey}'`);
if (/DB_NAME|DB_USER|DB_PASSWORD|HEX_64|'TOKEN'/.test(config)) throw new Error('Nicht alle Platzhalter wurden ersetzt.');
writeFileSync(target, config, { mode: 0o600 });

console.log(`\nGeschrieben: ${target}`);
console.log('\nBitte sicher aufbewahren (nicht per E-Mail verschicken):');
console.log(`  Einrichtungslink:  https://tayyipuenal.de/verwaltung/?setup=${setupKey}`);
console.log(`  Cron-Adresse:      https://tayyipuenal.de/api/booking/maintenance?key=${maintenanceKey}`);
```

- [ ] **Step 2: Test the generator**

```bash
printf 'geheim' | DB_NAME=d0test DB_USER=d0test node scripts/make-booking-config.mjs --out booking/var/config-test.php
docker compose -f booking/docker/compose.yml exec -T web php -r 'require "bootstrap.php"; $c = TuBooking\Config::load("/var/www/tu-booking/var/config-test.php"); TuBooking\Infrastructure\Crypto::fromConfig($c); echo $c->string("db.dsn"), " ", strlen($c->string("secrets.setup_key")), "\n";'
node scripts/make-booking-config.mjs --out booking/var/config-test.php; echo "exit $?"
rm booking/var/config-test.php
```

Expected:
- The first command prints "Geschrieben: …", then the setup link and the cron address.
- The PHP check prints `mysql:host=localhost;dbname=d0test;charset=utf8mb4 32`.
- The second run prints "… existiert bereits …" and `exit 1`.

- [ ] **Step 3: Write `scripts/deploy-booking.sh`**

```sh
#!/bin/sh
# Lädt Terminbuchung und Website per FTPS (curl) in den ALL-INKL Webspace.
#
#   FTP_USER=w0212c46 sh scripts/deploy-booking.sh                  -> fragt das Passwort einmal ab
#   UPLOAD_CONFIG=1 FTP_USER=w0212c46 sh scripts/deploy-booking.sh  -> nur beim ersten Mal: auch booking/config.php
#   DRY_RUN=1 sh scripts/deploy-booking.sh                          -> zeigt nur den Plan
#
# Reihenfolge für eine laufende Website: zuerst /tu-booking/ (Code und
# Migrationen, außerhalb des Document Root), dann Front-Controller und
# .htaccess, dann alle Assets (alte bleiben liegen), zuletzt das HTML.
# Es wird nichts gelöscht; config.php wird nur mit UPLOAD_CONFIG=1 übertragen.
set -eu
cd "$(dirname "$0")/.."
FTP_HOST="${FTP_HOST:-w0212c46.kasserver.com}"
REMOTE_ROOT="${REMOTE_ROOT:-tayyipuenal.de}"
BOOKING_ROOT="${BOOKING_ROOT:-tu-booking}"
BASE="ftp://$FTP_HOST"
[ -d dist/assets ] || { echo "dist/ fehlt: zuerst npm run build ausführen" >&2; exit 1; }
[ -f dist/konto/index.html ] && [ -f dist/api/booking.php ] || { echo "dist/ ist unvollständig: npm run build erneut ausführen" >&2; exit 1; }

set --
for f in booking/bootstrap.php booking/.htaccess $(find booking/src booking/migrations -type f \( -name '*.php' -o -name '*.sql' \) | sort); do
  set -- "$@" -T "$f" "$BASE/$BOOKING_ROOT/${f#booking/}"
done
if [ "${UPLOAD_CONFIG:-0}" = "1" ]; then
  [ -f booking/config.php ] || { echo "booking/config.php fehlt: zuerst node scripts/make-booking-config.mjs" >&2; exit 1; }
  set -- "$@" -T booking/config.php "$BASE/$BOOKING_ROOT/config.php"
fi
set -- "$@" -T dist/api/booking.php "$BASE/$REMOTE_ROOT/api/booking.php"
for f in inquiry-template.php quote-template.php inquiry.php; do set -- "$@" -T "dist/api/$f" "$BASE/$REMOTE_ROOT/api/$f"; done
set -- "$@" -T dist/.htaccess "$BASE/$REMOTE_ROOT/.htaccess" -T dist/konto/.htaccess "$BASE/$REMOTE_ROOT/konto/.htaccess" -T dist/verwaltung/.htaccess "$BASE/$REMOTE_ROOT/verwaltung/.htaccess"
for f in dist/assets/*; do set -- "$@" -T "$f" "$BASE/$REMOTE_ROOT/assets/$(basename "$f")"; done
for p in audits/iso-9001 audits/iso-14001 audits/iso-45001 impressum datenschutz konto verwaltung; do set -- "$@" -T "dist/$p/index.html" "$BASE/$REMOTE_ROOT/$p/index.html"; done
set -- "$@" -T dist/sitemap.xml "$BASE/$REMOTE_ROOT/sitemap.xml" -T dist/robots.txt "$BASE/$REMOTE_ROOT/robots.txt" -T dist/index.html "$BASE/$REMOTE_ROOT/index.html"

if [ "${DRY_RUN:-0}" = "1" ]; then
  printf '%s\n' "$@" | paste - - - | awk -F'\t' '{print "würde hochladen: " $2 "  ->  " $3}'
  exit 0
fi
if [ -n "${FTP_USER:-}" ]; then set -- --user "$FTP_USER" "$@"; else set -- -n "$@"; fi
echo "Verbinde mit $FTP_HOST (FTPS) …"
# Login verschlüsselt (AUTH TLS), Datenkanal unverschlüsselt: mit dem macOS-curl
# blieb die TLS-Datenverbindung beim zweiten Transfer hängen (siehe DEPLOYMENT.md).
curl -sS --fail --fail-early --ftp-ssl-control --ftp-create-dirs -w 'hochgeladen: %{url_effective}\n' "$@"
echo "Fertig: $(date -u +%Y-%m-%dT%H:%M:%SZ) – alle Dateien übertragen."
```

- [ ] **Step 4: Dry-run the deploy plan**

Run: `npm run build && DRY_RUN=1 sh scripts/deploy-booking.sh | tee /tmp/deploy-plan.txt | head -3 && tail -1 /tmp/deploy-plan.txt && grep -c "tu-booking/" /tmp/deploy-plan.txt && grep -c "config.php" /tmp/deploy-plan.txt`
Expected:
- The first line uploads `booking/bootstrap.php` to `…/tu-booking/bootstrap.php`.
- The last line uploads `dist/index.html`.
- The `tu-booking/` count equals the number of files under `booking/src` plus `booking/migrations` plus 2.
- The `config.php` count is `0`.

- [ ] **Step 5: Replace `scripts/verify-live.mjs`**

```js
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// Compares every deployed public file with the local build and checks the
// guards of both PHP endpoints. Read-only: no mail is sent, nothing is booked.
// SITE_URL=http://127.0.0.1:8087 checks a local copy (see Task 22, Step 7).
const site = process.env.SITE_URL ?? 'https://tayyipuenal.de';
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (!ok) failed++;
};

const files = [
  'index.html', 'audits/iso-9001/index.html', 'audits/iso-14001/index.html', 'audits/iso-45001/index.html',
  'impressum/index.html', 'datenschutz/index.html', 'konto/index.html', 'verwaltung/index.html', 'sitemap.xml', 'robots.txt',
  ...readdirSync('dist/assets').map((file) => `assets/${file}`),
  'media/workflow-de.mp4', 'media/workflow-de.vtt', 'media/workflow-poster.png',
  'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192x192.png', 'icon-512x512.png', 'site.webmanifest',
];
for (const file of [...new Set(files)]) {
  const response = await fetch(`${site}/${file}`, { cache: 'no-store' });
  const remote = response.ok ? sha(Buffer.from(await response.arrayBuffer())) : null;
  check(remote === sha(readFileSync(`dist/${file}`)), `${file}${remote === null ? ` (http ${response.status})` : ''}`);
}

// Enquiry endpoint (unchanged since 2026-09-23).
const get = await fetch(`${site}/api/inquiry.php`, { cache: 'no-store' });
check(get.status === 405, `api/inquiry.php rejects GET (${get.status})`);
const foreign = await fetch(`${site}/api/inquiry.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: '{}' });
check(foreign.status === 403, `api/inquiry.php rejects foreign origin (${foreign.status})`);
const quoteProbe = await fetch(`${site}/api/inquiry.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: site.startsWith('https://tayyipuenal.de') ? site : 'https://tayyipuenal.de' }, body: JSON.stringify({ kind: 'quote', standards: [], consent: 'yes', website: '', requestId: '00000000-0000-4000-8000-000000000000', name: 'x', email: 'x@example.com', company: '', phone: '', note: '', situation: '', size: '', timeframe: '' }) });
const quoteBody = await quoteProbe.json().catch(() => ({}));
check(quoteProbe.status === 422 && /Norm/.test(quoteBody.message ?? ''), `api/inquiry.php understands kind=quote (${quoteProbe.status}: ${quoteBody.message ?? ''})`);
const template = await fetch(`${site}/api/quote-template.php`, { cache: 'no-store' });
check(template.status === 200 && (await template.text()).trim() === '', `api/quote-template.php present and silent (${template.status})`);

// Booking module.
const api = `${site}/api/booking`;
const types = await fetch(`${api}/appointment-types`, { cache: 'no-store' });
const typesBody = await types.json().catch(() => ({}));
check(types.status === 200 && Array.isArray(typesBody.types) && typesBody.types.length > 0, `api/booking/appointment-types answers (${types.status}${typesBody.message ? `: ${typesBody.message}` : ''})`);
check(types.headers.get('cache-control') === 'no-store', 'api/booking responses are not cached');
const getWrite = await fetch(`${api}/appointments`, { cache: 'no-store' });
check(getWrite.status === 405, `api/booking/appointments rejects GET (${getWrite.status})`);
const foreignBooking = await fetch(`${api}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: '{"email":"x@example.com"}' });
check(foreignBooking.status === 403, `api/booking/login rejects foreign origin (${foreignBooking.status})`);
const maintenance = await fetch(`${api}/maintenance?key=falsch`, { cache: 'no-store' });
check(maintenance.status === 403, `api/booking/maintenance needs the key (${maintenance.status})`);
const hidden = await fetch(`${site}/tu-booking/bootstrap.php`, { cache: 'no-store' });
check(hidden.status === 404 || hidden.status === 403, `/tu-booking/ is not reachable from the web (${hidden.status})`);
for (const path of ['konto/', 'verwaltung/']) {
  const page = await fetch(`${site}/${path}`, { cache: 'no-store' });
  const robots = page.headers.get('x-robots-tag') ?? '';
  const csp = page.headers.get('content-security-policy') ?? '';
  check(/noindex/.test(robots) && /script-src 'self'/.test(csp), `${path} sends noindex and a strict CSP`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll live files match the local build and every guard answers as expected.');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 6: Run the live check against the local production copy**

Start the `tu-dist` container exactly as in Task 22, Step 7, then run:

Run: `SITE_URL=http://127.0.0.1:8087 node scripts/verify-live.mjs; docker stop tu-dist`
Expected: every line is `OK`, and the last line is `All live files match the local build and every guard answers as expected.`

In that container `api/inquiry.php` runs the real endpoint with the sendmail stub. Its origin allow-list only knows the production hosts, which is why the quote probe sends `Origin: https://tayyipuenal.de`.

- [ ] **Step 7: Write the owner's guide `docs/booking/EINRICHTUNG.md`**

```markdown
# Terminbuchung einrichten (einmalig, ca. 15 Minuten)

Diese Anleitung richtet die Online-Terminbuchung auf tayyipuenal.de ein. Alles
läuft auf Ihrem bestehenden ALL-INKL-Paket; es entstehen keine zusätzlichen
Kosten und keine weiteren Dienstleister.

## 1. Datenbank anlegen (KAS)

1. Im KAS unter **Datenbanken** auf **Neue Datenbank anlegen** klicken.
2. Als Kommentar „Terminbuchung“ eintragen und ein sicheres Passwort vergeben.
3. Datenbankname und Benutzer (beide beginnen mit `d0…`) notieren. Das Passwort
   wird im nächsten Schritt nur einmal eingegeben.

## 2. Konfiguration erzeugen (auf dem Mac)

Im Projektordner ausführen:

    node scripts/make-booking-config.mjs

Name, Benutzer und Passwort der Datenbank eingeben. Das Skript erzeugt
`booking/config.php` mit neuen, zufälligen Schlüsseln und zeigt zwei Adressen an:

- den **Einrichtungslink** für die Verwaltung (einmalig nutzbar),
- die **Cron-Adresse** für die regelmäßige Wartung.

Beide sicher aufbewahren (zum Beispiel im Passwort-Manager), nicht per E-Mail
verschicken. Eine Kopie von `booking/config.php` gehört ebenfalls dorthin.

## 3. PHP-Version prüfen (KAS)

Unter **Domains** bei tayyipuenal.de **Bearbeiten** wählen und als PHP-Version
**8.3** einstellen (8.2 oder höher ist Pflicht).

## 4. Absenderadresse anlegen (KAS)

Unter **E-Mail** die Adresse **buchung@tayyipuenal.de** anlegen, entweder als
Postfach oder als Weiterleitung an info@tayyipuenal.de. Von dieser Adresse
kommen alle Buchungsmails und Kalendereinladungen.

## 5. Zustellbarkeit verbessern (KAS, empfohlen)

- Unter **E-Mail** prüfen, ob **DKIM** für tayyipuenal.de angeboten wird, und es aktivieren.
- Unter **DNS** einen TXT-Eintrag für `_dmarc.tayyipuenal.de` anlegen:
  `v=DMARC1; p=none; rua=mailto:info@tayyipuenal.de`

Damit landen die Bestätigungscodes zuverlässiger im Posteingang (Gmail,
Outlook.com, GMX, web.de).

## 6. Hochladen

    npm run build
    UPLOAD_CONFIG=1 FTP_USER=w0212c46 sh scripts/deploy-booking.sh
    node scripts/verify-live.mjs

`UPLOAD_CONFIG=1` nur beim ersten Mal verwenden. Spätere Updates ohne diesen
Zusatz hochladen, damit die Konfiguration auf dem Server unverändert bleibt.

## 7. Wartung einplanen (KAS)

Unter **Tools → Cronjobs** einen neuen Cronjob anlegen:

- Art: URL aufrufen
- Adresse: die Cron-Adresse aus Schritt 2
- Intervall: alle 15 Minuten

Ohne Cronjob läuft die Wartung automatisch bei normalen Seitenaufrufen mit;
Erinnerungsmails kommen dann aber weniger pünktlich.

## 8. Verwaltung einrichten

1. Den Einrichtungslink aus Schritt 2 öffnen.
2. Name und E-Mail eintragen und den Code aus der E-Mail eingeben.
3. Eine Authenticator-App öffnen (zum Beispiel Microsoft Authenticator oder
   Google Authenticator), den QR-Code scannen und den 6-stelligen Code eingeben.

Ab jetzt melden Sie sich unter **tayyipuenal.de/verwaltung/** mit E-Mail-Code
und App-Code an.

## 9. Prüfen und freigeben

- Unter **Verfügbarkeit** Terminarten, Dauer und Wochenzeiten prüfen
  (vorbelegt: kostenloses Erstgespräch, 30 Minuten, Mo–Fr 9–17 Uhr).
- Den Abschnitt „Terminbuchung & Kundenkonto“ in der Datenschutzerklärung lesen und freigeben.
- Eine Testbuchung mit dem Namen „Technischer Test“ machen:
  - Die Einladung in Outlook mit „Annehmen“ übernehmen.
  - Den Termin in der Verwaltung absagen und prüfen, dass der Eintrag in
    Outlook verschwindet.
- Unter **Datensicherung** im KAS prüfen, welche Datenbank-Sicherungen Ihr Paket enthält.

## Wenn etwas nicht klappt

- **„Die Terminbuchung ist gerade nicht erreichbar“:** Datenbankdaten in
  `config.php` oder die PHP-Version prüfen.
- **Keine Codes im Posteingang:** den Spam-Ordner prüfen und Schritt 5 umsetzen.
- **Authenticator verloren:** Eine zweite Person mit Zugang kann Sie nicht
  zurücksetzen. Bitte melden Sie sich bei Ihrem Webentwickler; die Kopplung
  lässt sich in der Datenbank zurücksetzen.
```

- [ ] **Step 8: Write `RELEASE-2026-09-23-booking.md`**

```markdown
# Booking portal, phase 1 — 2026-09-23

Built and verified locally. **Not uploaded.** Owner setup: `docs/booking/EINRICHTUNG.md`. Spec: `docs/superpowers/specs/2026-09-23-booking-portal-design.md`. Plan: `docs/superpowers/plans/2026-09-23-booking-phase-1.md`.

## What changed

- **Real 1:1 booking.** "Erstgespräch" (header, hero, configurator, contact) and "Termin vereinbaren" (SCC card) open a booking dialog in the configurator's step pattern: type, day and time, details, email code, done.
  - Slots come from weekly hours, absences, buffers, notice and horizon, in Europe/Berlin.
  - A 15-minute hold blocks the slot until the code is entered; logged-in customers book without a code.
  - "Kein passender Termin? Nachricht senden" still opens the enquiry form.
- **Customer area** `/konto/`:
  - Passwordless login by email code; a company's colleagues share its appointments.
  - Customers can reschedule or cancel up to 24 h ahead and download the calendar file.
  - Customers can invite and remove colleagues, edit their profile, log out everywhere and delete the account.
- **Admin area** `/verwaltung/`:
  - Login: a one-time setup link, then email code plus authenticator app.
  - Overview; appointments (phoned-in bookings, move and cancel with overlap warnings); appointment types, weekly hours and absences.
  - Customers and companies; notification address, failed emails, second admin, maintenance run, JSON export, audit log.
- **Outlook:** every confirmed, moved and cancelled appointment reaches the owner's address as an iMIP invitation (`REQUEST`/`CANCEL`, stable UID, sequence). Customers get the same invitation.
- **PHP module** `booking/`, deployed to `/tu-booking/` outside the document root:
  - Plain PHP 8.2+, PDO/MySQL, no runtime dependencies.
  - Transactional outbox with retries.
  - Maintenance job via ALL-INKL cron URL, or piggyback on requests.
  - Retention rules as in the spec.
- **Privacy text:** new section "Terminbuchung & Kundenkonto" and the session-cookie sentence. This needs the owner's approval before upload.

## Verification

(Filled in during Task 24 with the real outputs: PHPUnit test and assertion counts, PHPStan result, the 9 HTTP flow tests, tsc/lint/build, the local production copy check, browser checks at 390 px and 1440 px.)

## Open questions for the owner

1. Which appointment types, durations and weekly hours should be offered, and is there a video link?
2. Are the retention periods right?
3. Which ALL-INKL plan is booked (cron jobs, backups)?
4. Approval of the privacy text.
```

- [ ] **Step 9: Add the entry to `DEPLOYMENT.md`**

Insert directly below the `# Production deployment` heading:

```markdown
## Pending: booking portal, phase 1 — 2026-09-23

Built and verified locally, not uploaded. See `RELEASE-2026-09-23-booking.md`. First publication needs the owner's one-time setup in `docs/booking/EINRICHTUNG.md`: database, `config.php`, PHP 8.3, `buchung@` address, cron job, setup link. Then run `npm run build`, `UPLOAD_CONFIG=1 FTP_USER=w0212c46 sh scripts/deploy-booking.sh` (later uploads without `UPLOAD_CONFIG`), and `node scripts/verify-live.mjs`. The PHP application goes to `/tu-booking/` next to the domain folder, never into `tayyipuenal.de/`.
```

- [ ] **Step 10: Record the implementation decisions in the spec**

Append to `docs/superpowers/specs/2026-09-23-booking-portal-design.md`:

```markdown
## Changes made while planning phase 1

- `appointments` carries `company_id`, so appointments stay with the company when their booker is removed. A removed booker's appointment notifies the remaining members.
- `settings` table for the owner-editable notification address. `admins` stores `totp_pending_enc` and `totp_last_step`: pairing reuses a pending secret, and authenticator codes are accepted once only.
- Expired holds are deleted 30 minutes after expiry, not at expiry, so that a code re-sent near the end of a hold can still confirm the booking.
- `robots.txt` disallows only `/verwaltung/`. `/konto/` is linked from every footer and relies on `noindex` (meta tag and `X-Robots-Tag`), because a disallowed URL can still be indexed.
- `site.client_ip_header` lets the local HTTP tests simulate several visitors. It is empty in production, where rate limits use `REMOTE_ADDR`.
- Cancellations caused by retention use `cancelled_by = 'system'`.
```

- [ ] **Step 11: Commit**

```bash
git add scripts/make-booking-config.mjs scripts/deploy-booking.sh scripts/verify-live.mjs docs/booking/EINRICHTUNG.md RELEASE-2026-09-23-booking.md DEPLOYMENT.md docs/superpowers/specs/2026-09-23-booking-portal-design.md
git commit -m "chore(booking): config generator, deploy script, live checks and owner guide" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Full verification and hand-over

**Files:**
- Create: `booking/tools/preview-emails.php` (development only; never uploaded, because the deploy script only takes `bootstrap.php`, `.htaccess`, `src/` and `migrations/`)
- Modify: `RELEASE-2026-09-23-booking.md` (Verification section with the real results)

**Interfaces:**
- Consumes: everything above. The only new file is the email preview tool; this task proves the whole branch works.

- [ ] **Step 1: Back end from a clean stack**

Run: `npm run booking:deps && npm run test:booking:fresh`
Expected: `All 9 booking HTTP tests passed.`

Run: `npm run booking:test`
Expected: `OK (… tests, … assertions)`. Note both numbers for the release notes.

Run: `npm run booking:stan`
Expected: `[OK] No errors`.

- [ ] **Step 2: The existing enquiry endpoint still works in the same stack**

Run: `npm run booking:down && npm run booking:up && node scripts/test-inquiry.mjs`
Expected: `PASS: method, origin, validation, injection, honeypot, size, successful queue response, idempotency, conflict, rate limiting.`

Run: `npm run booking:down && npm run booking:up && node scripts/test-quote.mjs`
Expected: its PASS line. Each suite runs against a fresh container because they share the endpoint's rate limit.

- [ ] **Step 3: Front end**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no errors. The six prerendered pages and both shells are written.

Run: `ls dist/assets | grep -E "^(BookingDialog|AccountApp|AdminApp)-"`
Expected: the three lazy chunks, each with its `.js` and its `.css` where the component imports CSS.

- [ ] **Step 4: Email previews**

Write `booking/tools/preview-emails.php`:

```php
<?php
declare(strict_types=1);

// Renders every booking email into var/preview/ as HTML and .eml for a visual
// check, like scripts/preview-email.php does for the enquiry mail. Runs in the
// local Docker stack against its development database; nothing is sent.
//   docker compose -f booking/docker/compose.yml exec -T web php tools/preview-emails.php

require dirname(__DIR__) . '/bootstrap.php';

use TuBooking\App;
use TuBooking\Config;
use TuBooking\Domain\Mode;
use TuBooking\Domain\Reference;
use TuBooking\Infrastructure\Mail\Mailer;
use TuBooking\Infrastructure\Mail\Message;
use TuBooking\Infrastructure\Mail\MimeBuilder;
use TuBooking\Support\SystemClock;

$mailer = new class implements Mailer {
    /** @var list<Message> */
    public array $sent = [];

    public function send(Message $message): void
    {
        $this->sent[] = $message;
    }
};
$app = new App(Config::load(), new SystemClock(), ['mailer' => $mailer]);
$app->migrator()->ensureCurrent();
$run = bin2hex(random_bytes(3));
$type = $app->types()->bySlug('erstgespraech') ?? throw new RuntimeException('Seed type missing.');
$companyId = $app->companies()->create('Beispiel & Söhne GmbH');
$customer = $app->customers()->create($companyId, "vorschau-$run@example.com", 'Miriam Beispiel', '+49 231 123456');
$start = (new DateTimeImmutable('+3 days 09:00', new DateTimeZone('Europe/Berlin')))->setTimezone(new DateTimeZone('UTC'));
$id = $app->appointments()->createConfirmed(Reference::generate(), $type->id, $customer->id, $companyId, $start, $start->add(new DateInterval('PT30M')), Mode::Phone, '+49 231 123456', '', "Wir planen die Erstzertifizierung nach ISO 9001.\nBitte vormittags anrufen.");
$to = [['email' => $customer->email, 'name' => $customer->name]];
$notifications = $app->notifications();
$notifications->code(random_int(100000, 999999), $customer->email, '482913', false);
$notifications->code(random_int(100000, 999999), 'info@tayyipuenal.de', '705114', true);
$notifications->noAccount("neu-$run@example.com");
$notifications->appointmentConfirmed($app->appointments()->view($id), $to);
$app->appointments()->reschedule($id, $start->add(new DateInterval('P1D')), $start->add(new DateInterval('P1DT30M')));
$notifications->appointmentRescheduled($app->appointments()->view($id), $start, $to);
$notifications->appointmentReminder($app->appointments()->view($id), $to);
$app->appointments()->cancel($id, 'owner', 'Leider bin ich an diesem Tag verhindert.');
$notifications->appointmentCancelled($app->appointments()->view($id), $to, 'Leider bin ich an diesem Tag verhindert.');
$notifications->memberInvited("kollegin-$run@example.com", 'Klara Kollegin', 'Beispiel & Söhne GmbH', 'Miriam Beispiel');
$notifications->adminInvited("assistenz-$run@example.com", 'Büro');
$notifications->accountDeleted('Miriam Beispiel', 1);
$notifications->inactivityNotice($customer, new DateTimeImmutable('+30 days'));
$app->outbox()->dispatch(100);

$directory = dirname(__DIR__) . '/var/preview';
if (!is_dir($directory)) {
    mkdir($directory, 0777, true);
}
$mime = new MimeBuilder('buchung@tayyipuenal.de', 'Tayyip Ünal · Terminbuchung', 'info@tayyipuenal.de');
foreach ($mailer->sent as $index => $message) {
    $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower((string) iconv('UTF-8', 'ASCII//TRANSLIT', $message->subject))), '-');
    $name = sprintf('%02d-%s', $index + 1, substr($slug, 0, 60));
    file_put_contents("$directory/$name.html", $message->html);
    $mail = $mime->build($message);
    $headers = "To: {$mail['to']}\r\nSubject: {$mail['subject']}\r\n";
    foreach ($mail['headers'] as $header => $value) {
        $headers .= "$header: $value\r\n";
    }
    file_put_contents("$directory/$name.eml", $headers . "\r\n" . $mail['body']);
}
echo count($mailer->sent) . " E-Mails nach var/preview/ geschrieben.\n";
```

Run: `docker compose -f booking/docker/compose.yml exec -T web php tools/preview-emails.php`
Expected: `14 E-Mails nach var/preview/ geschrieben.`

Run: `grep -l "method=REQUEST" booking/var/preview/*.eml | wc -l && grep -l "method=CANCEL" booking/var/preview/*.eml | wc -l`
Expected: `4` REQUEST files (customer confirmed and rescheduled, owner new and moved) and `2` CANCEL files (customer and owner).

Open each `booking/var/preview/*.html` in the browser pane (`preview_start` with a `file://` URL) and check:
- German text, and "Beispiel &amp; Söhne GmbH" shown correctly escaped.
- The code large on the code emails.
- The owner emails list customer, phone, note and reference.
- No layout overflow at 390 px.

For a look at Outlook's invitation view, the `.eml` files can be opened on the Mac, for example `open booking/var/preview/04-*.eml`.

- [ ] **Step 5: Local production copy**

Start `tu-dist` as in Task 22, Step 7. Run `SITE_URL=http://127.0.0.1:8087 node scripts/verify-live.mjs`, then `docker stop tu-dist`.
Expected: every check `OK`.

- [ ] **Step 6: Browser pass on the dev server**

Repeat the browser checks of Task 19 (Step 10), Task 20 (Step 8) and Task 21 (Step 15) on a fresh stack in one session.
- Take screenshots at 390×844 and 1440×900 of:
  - the slot step, the code step and the success panel of the booking dialog
  - the `/konto/` dashboard
  - the `/verwaltung/` overview
- Confirm no console errors on any of them.
- With reduced motion emulated, the booking dialog changes steps without animation and nothing stays hidden.
- The home page intro, story section and configurator behave as before. Scroll through once and check that the configurator's five steps still send (API intercepted as in the 2026-09-23 release).

- [ ] **Step 7: Fill in the release notes**

Replace the placeholder paragraph under `## Verification` in `RELEASE-2026-09-23-booking.md` with the real results, one line per check:
- PHPUnit counts
- PHPStan
- the 9 HTTP tests by name
- `test-inquiry` and `test-quote`
- `tsc`/lint/build
- the lazy chunk names
- the email preview count
- the local production copy check
- the screenshot list and console result

- [ ] **Step 8: Commit and stop before publishing**

```bash
git add booking/tools/preview-emails.php RELEASE-2026-09-23-booking.md
git commit -m "docs(booking): email previews and phase 1 verification results" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Publishing needs the owner at the keyboard (FTP password, KAS steps, setup link). Do **not** upload. Hand over:
- `docs/booking/EINRICHTUNG.md`
- the release notes
- the open questions

