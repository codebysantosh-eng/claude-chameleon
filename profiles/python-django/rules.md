# Active Stack: Python + Django
COMMANDS: test=pytest --cov --cov-report=term | lint=ruff check . | format=black . | typecheck=mypy . | audit=pip audit
FILES: **/*.py, manage.py
FORBIDDEN: print() → structlog or loguru | raw SQL → Django ORM | hardcoded settings → django-environ or python-decouple
