# Active Stack: Python + FastAPI
COMMANDS: test=pytest --cov --cov-report=term | lint=ruff check . | format=black . | typecheck=mypy . | audit=pip audit
FILES: **/*.py
FORBIDDEN: print() → structlog | sync blocking I/O in async routes → use asyncio or run_in_executor | response without response_model → always declare
