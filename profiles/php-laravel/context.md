---
name: php-laravel
displayName: PHP + Laravel
detectors:
  - file: composer.lock
    weight: 2
  - file-contains: [composer.json, "laravel/framework"]
    weight: 4
  - file-contains: [composer.json, "laravel/"]
    weight: 2
  - file: artisan
    weight: 4
  - glob: "app/Http/Controllers/**"
    weight: 2
  - glob: "app/Models/**"
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| Test runner | `php artisan test` (PHPUnit 11 or Pest 3) | Canonical Laravel command; Pest is Laravel 11+ default for new projects. `composer test` also works if scripted. Use Paratest for parallel execution. |
| Format | Laravel Pint | PSR-12 + Laravel conventions; run `composer pint`. Pint is canonical — do not introduce PHP-CS-Fixer alongside. |
| Static analysis | **Larastan** (PHPStan + Laravel extension) level 8+ | Required, not optional. Install with `composer require --dev larastan/larastan`. `phpstan.neon` must extend `vendor/larastan/larastan/extension.neon`. Vanilla PHPStan misses Eloquent/facade types. |
| Refactor | Rector + `driftingruby/rector-laravel` | Generic Rector misses Laravel idioms; always pair with the Laravel ruleset for upgrade paths and facade-aware rewrites. |
| Logger | Monolog via `Log` facade | Structured logging; never `dd()`, `dump()`, or `var_dump()` in production. Use channels for per-context routing. |
| ORM | Eloquent | Prefer query builder; use models with relationships. `DB::select(raw SQL)` only when Eloquent cannot express the query. |
| Validation | Form Requests + Validation Rules | Never trust user input; validate at boundaries. Never call `$request->validate()` in controllers when a Form Request is feasible. |
| Auth | Laravel Breeze / Fortify / Sanctum | Use built-in auth scaffolding; never roll custom password/session logic. Sanctum for SPA + API tokens, Passport only if full OAuth2 is required. |
| Authorization | **Gates + Policies (core)** — Spatie Permission only when team/role scoping is needed | Core Laravel handles per-resource authz via Policies; reach for Spatie only when role/permission tables are a product requirement. |
| Migrations | Laravel Migrations | `php artisan migrate`; always reversible (`up`/`down` both implemented). |
| Queue | Laravel Queue + Horizon (Redis) | Use queue jobs for async work; Horizon for monitoring when on Redis. Never spawn raw background processes. |
| Mail | `Mail` facade + Mailables | Never call PHP's `mail()` directly; Mailables give templating, queueing, and testing helpers. |
| HTTP client | `Http` facade (Guzzle wrapper) | Never call `curl_*` or `file_get_contents($url)`; the facade gives retries, fakes, and middleware. |
| Filesystem | `Storage` facade | Never call `fopen`/`file_put_contents`/`mkdir`/`unlink` on app data paths; the facade abstracts disks (local/s3/etc) and is mockable in tests. |
| Cache | `Cache` facade (Redis driver in prod) | Never reach for APCu or filesystem cache directly in app code. |
| Session | `session()` helper / `Session` facade | Never touch `$_SESSION` or call `session_start()`. |
| Cookies | `cookie()` helper / `Cookie::queue()` | Never call PHP's `setcookie()`. |
| Dates | `now()` / `Carbon` / `CarbonImmutable` | Never call `date()` / `strtotime()` / `time()` directly. Models cast date columns to Carbon via `$casts`. |
| Hashing | `Hash` facade (bcrypt/argon) | Never call `password_hash` / `password_verify` directly; the facade rotates work factor centrally. |
| Encryption | `Crypt` facade | Never use raw `openssl_encrypt`; the facade handles key + IV + MAC. |
| Secrets | `.env` + `config()` (not `env()` outside config files) | `env()` only inside `config/*.php`; everywhere else read via `config('services.foo.key')` so config caching works. |
| Testing DB | SQLite in-memory + `RefreshDatabase` | Parallel safe with Paratest; use `DatabaseTransactions` if a foreign DB driver is needed. |
| Commands | `composer` scripts + `php artisan` | Routine commands routed via composer.json scripts; Laravel-canonical commands stay as `php artisan ...`. |

| Pattern | Rule |
|---------|------|
| Models | Use `BelongsToOrganization` trait for multi-tenancy; add type hints on properties |
| Controllers | Thin controllers; business logic in services/jobs |
| Requests | Form Requests for validation; never validate in controller |
| Services | Orchestrate business logic; single responsibility |
| Jobs | Queue jobs for long-running tasks; set timeout + retry policy |
| Observers | Use for cross-cutting lifecycle side effects (audit, cache bust, webhooks). Keep local field derivation in mutators/$casts. |
| Policies | Every model gets a Policy; check both permission + resource ownership |
| Middleware | Reuse framework middleware; apply consistently via middleware groups |
| Migrations | Write reversible migrations; test rollback in CI |
| Seeding | Factories for tests; Seeders for demo data only |
| Testing | Test both happy path + error cases; use test helpers from TestCase |
| Transactions | Use `DB::transaction()` for multi-step writes; test rollback |
| Caching | Use appropriate cache driver (Redis for distributed); invalidate on mutations |

| Skill topic | Reference |
|-------------|-----------|
| Laravel-first decision tree | skills/SKILL.md#laravel-first |
| Testing patterns | skills/SKILL.md#testing |
| Security | skills/SKILL.md#security |
| Migrations | skills/SKILL.md#migrations |
| Schema & ORM | skills/SKILL.md#schema |

## Prefer Laravel built-ins (summary)

Default for every new file: reach for the Laravel facade or helper before raw PHP. Top five highest-impact cases:

| If you would write… | Use instead | Why |
|---------------------|-------------|-----|
| `env('KEY')` outside `config/*.php` | `config('services.foo.key')` | `env()` returns null after `config:cache` in production |
| `curl_*` / `file_get_contents($url)` | `Http::get/post/...` | Fakeable via `Http::fake()`; retries, middleware, JSON parsing |
| `mail(...)` | `Mail::to($user)->send(new YourMailable(...))` | Fakeable via `Mail::fake()`; templating, queueing |
| `password_hash` / `password_verify` | `Hash::make` / `Hash::check` | Rotates work factor centrally; matches auth provider |
| `$_GET` / `$_POST` / `$_SESSION` / `setcookie()` | `request()->input(...)`, `session()`, `Cookie::queue(...)` | Validated, testable, lifecycle-managed |

Full mapping (Storage / Crypt / Carbon / Process / DB / error_log / etc.) and the *why* lives in [skills/SKILL.md#laravel-first](skills/SKILL.md). That is the single source of truth — do not duplicate the table here.
