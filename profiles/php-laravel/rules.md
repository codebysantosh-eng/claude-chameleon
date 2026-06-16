# Active Stack: PHP + Laravel
COMMANDS: test=php artisan test | pint=composer pint | larastan=composer phpstan | migrate=php artisan migrate
FILES: app/**/*.php, tests/**/*.php, config/**/*.php, database/**/*.php, routes/**/*.php, resources/views/**/*.blade.php
FORBIDDEN: dd()/dump() → Log facade | hardcoded secrets → config() (env() only inside config/*.php) | raw SQL → Eloquent | unvalidated input → Form Requests | raw PHP where a Laravel facade exists → see skills/SKILL.md#laravel-first
