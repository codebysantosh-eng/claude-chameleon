# Active Stack: PHP + Laravel
COMMANDS: test=php artisan test | pint=composer pint | lint=composer phpstan (Larastan) | migrate=php artisan migrate
FILES: app/**/*.php, tests/**/*.php, config/**/*.php, database/**/*.php, routes/**/*.php
FORBIDDEN: dd()/dump()→Log | secrets→env() | raw SQL→Eloquent | unvalidated input→Form Request — and always prefer Laravel built-ins (Http/Mail/Hash/Storage/Cookie/Crypt/Carbon) over raw PHP; see skills/SKILL.md#laravel-first
