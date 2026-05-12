# Active Stack: PHP + Laravel
COMMANDS: test=php artisan test | pint=composer pint | larastan=composer phpstan | migrate=php artisan migrate
FILES: app/**/*.php, tests/**/*.php, config/**/*.php, database/**/*.php, routes/**/*.php
FORBIDDEN: dd()/dump() → Log facade | hardcoded secrets → env() helper | raw SQL → Eloquent | unvalidated input → Form Requests | raw PHP where a Laravel facade exists → see skills/SKILL.md#laravel-first
