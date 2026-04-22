# Active Stack: PHP + Laravel
COMMANDS: test=composer test | pint=composer pint | phpstan=composer phpstan | migrate=php artisan migrate
FILES: app/**/*.php, tests/**/*.php, config/**/*.php, database/**/*.php
FORBIDDEN: dd()/dump() → Log facade | hardcoded secrets → env() helper | raw SQL → Eloquent | unvalidated input → Form Requests
