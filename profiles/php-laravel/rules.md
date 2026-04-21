# Active Stack: PHP + Laravel

COMMANDS: test=composer test | pint=composer pint | phpstan=composer phpstan | rector=composer rector | serve=php artisan serve | migrate=php artisan migrate | queue=php artisan queue:listen | tinker=php artisan tinker

FILES: app/**/*.php, tests/**/*.php, config/**/*.php, database/**/*.php, routes/**/*.php

FORBIDDEN:
  dd() / dump() / var_dump() → structured logger (Monolog) or Log facade
  Raw SQL queries → Eloquent query builder or models
  Hardcoded secrets → .env variables + env() helper
  Custom authentication → Laravel Breeze / Fortify / Laravel Sanctum
  Unvalidated user input → Form Requests or validate() helper
  Direct database mutations outside transactions → DB::transaction()
  Cross-cutting side effects inline in models → Use model observers for lifecycle events that span concerns (audit, cache bust, webhooks). Local derivation belongs in mutators/$casts.
  Missing type hints on properties → Use PHP 8.4 typed properties
  Weak authorization (permission-only) → Check both permission + resource ownership in Policy
  console.log() in JavaScript → Structured logger compatible with backend (Pino/Winston)
  Any in TypeScript → unknown or proper type with type guards
