---
name: php-symfony
displayName: PHP + Symfony
detectors:
  - file: symfony.lock
    weight: 4
  - file-contains: [composer.json, "symfony/framework-bundle"]
    weight: 4
  - file-contains: [composer.json, "symfony"]
    weight: 2
  - glob: "src/Controller/**"
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| Test | PHPUnit | Via `composer test`; phpunit.xml.dist for config |
| Lint | php-cs-fixer | PSR-12 + Symfony coding standards |
| Static analysis | phpstan (level 8+) | Strict type checking |
| Refactor | rector | Automated upgrades and refactoring |
| Logger | Monolog (symfony/monolog-bundle) | Never var_dump() or dd() |
| ORM | Doctrine ORM | Never raw SQL without DQL |
| Validation | Symfony Validator component | Annotations or YAML |
| Auth | symfony/security-bundle | Never roll custom auth |
| Secrets | symfony/dotenv + env vars | No hardcoded values |
| DI | services.yaml autowiring | Constructor injection preferred |
| Migrations | Doctrine Migrations | `doctrine:migrations:migrate` |
| Commands | `composer test` | Routes all commands via composer scripts |

| Pattern | Rule |
|---------|------|
| DI | Constructor injection; never `new` for services |
| Controllers | Thin controllers; business logic in services |
| DTOs | Use Data Transfer Objects for command/query boundaries |
| Events | Symfony EventDispatcher for cross-cutting concerns |
| Transactions | `$entityManager->wrapInTransaction()` for multi-step writes |
| Forms | Symfony Form component; validate with constraints |

| Skill topic | Reference |
|-------------|-----------|
| Testing | skills/SKILL.md#testing |
| Security | skills/SKILL.md#security |
| Doctrine | skills/SKILL.md#doctrine |
| Logging | skills/SKILL.md#logging |
| DI and Services | skills/SKILL.md#services |
