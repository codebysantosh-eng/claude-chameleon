---
name: python-fastapi
displayName: Python + FastAPI
detectors:
  - file-contains: [requirements.txt, "fastapi"]
    weight: 4
  - file-contains: [pyproject.toml, "fastapi"]
    weight: 4
  - file-contains: [Pipfile, "fastapi"]
    weight: 4
  - glob: "**/*.py"
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| Test | pytest + httpx (AsyncClient) + pytest-asyncio | Coverage via pytest-cov |
| Lint | ruff | Replaces flake8 + isort |
| Format | black | |
| Typecheck | mypy (strict) | Pydantic models enforce types at runtime too |
| Security | bandit + pip-audit | |
| Logger | structlog (JSON) | Never print() |
| Validation | Pydantic v2 models | request/response + serialization |
| DB | SQLAlchemy (async) or SQLModel | Alembic for migrations |
| API docs | OpenAPI auto-generated | Keep `response_model` accurate |
| Auth | python-jose (JWT) or fastapi-users | |
| Rate limiting | slowapi | Redis-backed for multi-instance |

| Pattern | Rule |
|---------|------|
| Routes | Always declare `response_model`; use `status_code` explicitly |
| Async | Routes should be `async def`; never call sync blocking code inside |
| Dependencies | Use `Depends()` for auth, DB sessions, settings injection |
| Error handling | Raise `HTTPException`; custom exception handlers for domain errors |
| DB session | Use `async with` session; never share sessions across requests |
| Settings | Use `pydantic-settings` (`BaseSettings`) for env config |

| Skill topic | Reference |
|-------------|-----------|
| Testing | skills/SKILL.md#testing |
| Async patterns | skills/SKILL.md#async |
| Security | skills/SKILL.md#security |
| Logging | skills/SKILL.md#logging |
| Database | skills/SKILL.md#database |
