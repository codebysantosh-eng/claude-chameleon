---
name: python-django
displayName: Python + Django
detectors:
  - file: manage.py
    weight: 4
  - file-contains: [requirements.txt, "django"]
    weight: 3
  - file-contains: [pyproject.toml, "django"]
    weight: 3
  - file-contains: [setup.cfg, "django"]
    weight: 3
  - file-contains: [setup.py, "django"]
    weight: 3
  - file-contains: [Pipfile, "django"]
    weight: 3
  - glob: "**/*.py"
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| Test | pytest + pytest-django | Coverage via pytest-cov |
| Lint | ruff | Replaces flake8 + isort |
| Format | black | 88-char line length |
| Typecheck | mypy | Strict mode recommended |
| Security | bandit + pip-audit | bandit for code, pip-audit for deps |
| Logger | structlog (Django middleware) / loguru (scripts) | Never print() |
| Validation | Django forms + DRF serializers | Schema at every boundary |
| Auth | django-allauth or DRF SimpleJWT | Never roll custom auth |
| Secrets | django-environ | Read from .env at runtime; `env('KEY')` raises if missing |
| ORM | Django ORM | Never raw SQL without parameterization |
| Migrations | makemigrations + migrate | Dev: makemigrations; Prod: migrate |
| Test data | bare fixtures (default) | factory_boy for complex object graphs |
| WSGI/ASGI | gunicorn / uvicorn | gunicorn for sync, uvicorn for async |

| Pattern | Rule |
|---------|------|
| Views | CBV preferred for CRUD; function-based views for one-offs |
| URLs | Named URL patterns; use `reverse()` not hardcoded paths |
| Settings | Split into base/dev/prod; environment-specific via django-environ |
| Signals | Use sparingly; prefer explicit function calls |
| Transactions | `@transaction.atomic` for multi-step writes |

| Skill topic | Reference |
|-------------|-----------|
| Testing | skills/SKILL.md#testing |
| Security + session auth | skills/SKILL.md#security |
| ORM + performance | skills/SKILL.md#orm |
| Logging | skills/SKILL.md#logging |
| API (DRF) | skills/SKILL.md#drf |
