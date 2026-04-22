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
| Test | PHPUnit 11 | Via `composer test` with Paratest for parallel execution |
| Format | Laravel Pint | PSR-12 + Laravel conventions; run `composer pint` |
| Static analysis | PHPStan (level 8+) / Larastan | Optional; install with `composer require --dev larastan/larastan`. Configure in `phpstan.neon`. |
| Lint | PHP-CS-Fixer | PSR-12 compliance (if not using Pint) |
| Refactor | Rector | Automated upgrades and refactoring |
| Logger | Monolog (via Log facade) | Structured logging; never `dd()`, `dump()`, or `var_dump()` in production. Use channels for per-context routing. |
| ORM | Eloquent | Prefer query builder; use models with relationships |
| Validation | Form Requests + Validation Rules | Never trust user input; validate at boundaries |
| Auth | Laravel Breeze / Fortify | Use built-in auth; never roll custom auth |
| Authorization | Spatie Laravel Permission | Gate checks + Policies; team-scoped permissions |
| Migrations | Laravel Migrations | `php artisan migrate`; always reversible |
| Queue | Laravel Queue | Use queue jobs for async work; configure connection in .env |
| Secrets | .env + env() helper | Never hardcode; validate required secrets at startup |
| Testing DB | SQLite in-memory | Use RefreshDatabase trait; parallel safe with Paratest |
| Commands | `composer` scripts | All commands routed via composer.json scripts |

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
| Testing patterns | skills/SKILL.md#testing |
| Security | skills/SKILL.md#security |
| Migrations | skills/SKILL.md#migrations |
| Schema & ORM | skills/SKILL.md#schema |
