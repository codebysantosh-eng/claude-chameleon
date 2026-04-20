# Active Stack: PHP + Symfony
COMMANDS: test=composer test | lint=php-cs-fixer fix --dry-run --diff | analyse=phpstan analyse | format=php-cs-fixer fix
FILES: src/**/*.php, templates/**/*.twig
FORBIDDEN: var_dump() → Monolog | dd() → remove before commit | direct DB queries → Doctrine ORM
