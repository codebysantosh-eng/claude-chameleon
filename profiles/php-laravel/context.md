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
| Test runner | `php artisan test` (PHPUnit 11; Pest 3 opt-in) | Canonical Laravel command. Pest is offered in the `laravel new` installer prompt since L11 but PHPUnit remains the default if you accept defaults. Use Paratest or `--parallel` for parallel execution. |
| Format | Laravel Pint | PSR-12 + Laravel conventions; run `composer pint`. Pint is canonical — do not introduce PHP-CS-Fixer alongside. |
| Static analysis | **Larastan** (PHPStan + Laravel extension) level 8+ | Required. Install with `composer require --dev larastan/larastan`. `phpstan.neon` must extend `vendor/larastan/larastan/extension.neon`. Vanilla PHPStan misses Eloquent / facade types. |
| Refactor | Rector + `driftingly/rector-laravel` | Generic Rector misses Laravel idioms; always pair with the `driftingly/rector-laravel` ruleset for facade-aware upgrade paths. |
| Logger | Monolog via `Log` facade | Structured logging; never `dd()`, `dump()`, or `var_dump()` in production. Use channels for per-context routing. |
| ORM | Eloquent | Prefer query builder; use models with relationships. `DB::select(raw SQL)` only when Eloquent cannot express the query. |
| Validation | Form Requests + Validation Rules | Never trust user input; validate at boundaries. Use `prepareForValidation()` to normalize before rules run. |
| Auth | Laravel Breeze / Fortify / Sanctum | Use built-in auth scaffolding; never roll custom password/session logic. Sanctum for SPA + API tokens, Passport only if full OAuth2 is required. |
| Authorization | **Gates + Policies (core)** — Spatie Permission only when team/role scoping is needed | Core Laravel handles per-resource authz via Policies; reach for Spatie only when role/permission tables are a product requirement. |
| API responses | `JsonResource` / `ResourceCollection` | Shape responses through API Resources; do not return Eloquent models directly from API controllers. |
| Notifications | `Notification` facade + Notifiable trait | Multi-channel (mail/SMS/Slack/database/broadcast); never call channel-specific clients directly. |
| Jobs | `dispatch()` / `Bus::chain` / `Bus::batch` | Queue long-running work; chain dependent jobs and batch parallel ones rather than orchestrating manually. |
| Migrations | Laravel Migrations | `php artisan migrate`; always reversible (`up`/`down` both implemented). |
| Queue | Laravel Queue + Horizon (Redis) | Use queue jobs for async work; Horizon for monitoring when on Redis. Never spawn raw background processes. |
| Mail | `Mail` facade + Mailables | Never call PHP's `mail()` directly; Mailables give templating, queueing, and `Mail::fake()`. |
| HTTP client | `Http` facade (Guzzle wrapper) | Never call `curl_*` or `file_get_contents($url)`; the facade gives retries, fakes (`Http::fake()`), and middleware. |
| Filesystem | `Storage` facade | Never call `fopen` / `file_put_contents` / `mkdir` / `unlink` on app data paths; the facade abstracts disks and is mockable via `Storage::fake()`. |
| Cache | `Cache` facade (Redis driver in prod) | Never reach for APCu or filesystem cache directly in app code. |
| Session | `session()` helper / `Session` facade | Never touch `$_SESSION` or call `session_start()`. |
| Cookies | `cookie()` helper / `Cookie::queue()` | Never call PHP's `setcookie()`. |
| Dates | `now()` / `Carbon` / `CarbonImmutable` | Never call `date()` / `strtotime()` / `time()` directly. Cast date columns to `datetime` / `immutable_datetime` via `$casts`. |
| Hashing | `Hash` facade (bcrypt/argon) | Never call `password_hash` / `password_verify` directly; the facade rotates work factor centrally. Legacy-import migrations are the only legitimate exception. |
| Encryption | `Crypt` facade | Never use raw `openssl_encrypt`; the facade handles key + IV + MAC. |
| Secrets | `.env` + `config()` (not `env()` outside `config/*.php`) | `env()` only inside `config/*.php`; everywhere else read via `config('services.foo.key')` so `config:cache` works in production. |
| Testing DB | SQLite in-memory + `RefreshDatabase` | Parallel safe with Paratest (per-process DB). Switch to `DatabaseTransactions` on MySQL/Postgres if the SUT relies on commit semantics or DDL; the trait wraps each test in a transaction and rolls back. |
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
| **Laravel-first decision tree + full generic-PHP → facade mapping** | **skills/SKILL.md#laravel-first** (single source of truth — do not duplicate the mapping here) |
| Testing patterns | skills/SKILL.md#testing |
| Security | skills/SKILL.md#security |
| Migrations | skills/SKILL.md#migrations |
| Schema & ORM | skills/SKILL.md#schema |
