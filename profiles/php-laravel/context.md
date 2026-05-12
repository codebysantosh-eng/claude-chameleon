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

Shop-specific choices only. For canonical facade / helper / API references defer to `https://laravel.com/docs` and the project's existing code. Greenfield defaults below apply only when the project hasn't committed to a different choice.

| Category | Choice | Notes |
|----------|--------|-------|
| Test runner | `php artisan test` (PHPUnit default; Pest if `composer.json` has `pestphp/pest`) | Pest is opt-in via the `laravel new` installer prompt since L11. Use Paratest or `--parallel` for parallel execution. |
| Format | Laravel Pint | Pint is canonical. Do not introduce PHP-CS-Fixer alongside. |
| Static analysis | **Larastan** level 8+ | Required, not optional. `phpstan.neon` must extend `vendor/larastan/larastan/extension.neon`. Vanilla PHPStan misses Eloquent / facade types. |
| Refactor | Rector + `driftingly/rector-laravel` | Always pair Rector with the Laravel ruleset for facade-aware rewrites. |
| Auth scaffolding | Sanctum (SPA + API tokens) — Passport only for OAuth2 | If the project has already adopted Breeze / Fortify / Jetstream / Passport, follow it. |
| Authorization | **Core Gates + Policies** — Spatie Permission only for team/role scoping | If the project has already adopted Spatie, follow it. |
| Secrets | `env()` only inside `config/*.php`; `config('services.foo.key')` everywhere else | `config:cache` nulls runtime `env()` in production. Hook-enforced. |
| Hashing | `Hash` facade | Legacy-import auth migration is the only legitimate exception for `password_hash` / `password_verify`. Hook-warned. |
| Testing DB | SQLite in-memory + `RefreshDatabase` (default), `DatabaseTransactions` for real-DB commit semantics or DDL | Parallel safe with Paratest (per-process DB). |
| Migrations | Laravel Migrations, reversible `up` + `down` | Test rollback in CI. |
| Commands | `composer` scripts + `php artisan` | Routine commands routed via `composer.json` scripts; Laravel-canonical commands stay as `php artisan ...`. |

For everything else — facades (Http, Mail, Storage, Cache, Cookie, Crypt, Carbon, Log, Notification, Bus, Process, Hash, Crypt), helpers, API Resources, Form Requests, Observers, Events, broadcasting, queue methods, route binding — defer to Laravel docs and the project's adopted patterns. This profile does not duplicate framework documentation.

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
| **How to pick — adopted patterns, Laravel docs, shop overrides** | **skills/SKILL.md#laravel-first** |
| Testing patterns | skills/SKILL.md#testing |
| Security | skills/SKILL.md#security |
| Migrations | skills/SKILL.md#migrations |
| Schema & ORM | skills/SKILL.md#schema |
