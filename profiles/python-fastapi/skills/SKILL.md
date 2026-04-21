# Python + FastAPI Skills

Deep reference for FastAPI development patterns. Load specific sections on demand.

---

## testing

### Async test setup

```python
# conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from myapp.main import app
from myapp.database import get_db
from myapp.models import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

### Async integration tests

```python
@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post("/users/", json={
        "email": "test@example.com",
        "username": "testuser",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_get_user_requires_auth(client: AsyncClient):
    response = await client.get("/users/me")
    assert response.status_code == 401
```

### pytest.ini / pyproject.toml

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
addopts = "--cov=. --cov-report=term-missing"

[tool.coverage.run]
omit = ["*/migrations/*", "alembic/*"]
```

---

## async

### Route patterns

```python
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

app = FastAPI()

class UserCreate(BaseModel):
    email: str
    username: str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str

@app.post("/users/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    db_user = await crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return await crud.create_user(db=db, user=user)
```

### Never block the event loop

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

# ✗ Bad — blocks event loop in async route
@app.get("/report")
async def get_report():
    report = generate_report_sync()  # blocks everything!
    return report

# ✓ Good — asyncio.to_thread (Python 3.9+, preferred)
@app.get("/report")
async def get_report():
    report = await asyncio.to_thread(generate_report_sync)
    return report

# ✓ Better — async I/O natively
@app.get("/data")
async def get_data(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()
```

### Dependency injection pattern

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        # PyJWT exceptions — python-jose used JWTError (unmaintained, do not use)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await crud.get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

# Use in routes
@app.get("/users/me", response_model=UserResponse)
async def read_me(current_user: User = Depends(get_current_user)):
    return current_user
```

---

## security

### Request validation with Pydantic v2

```python
from pydantic import BaseModel, EmailStr, field_validator

class UserCreate(BaseModel):
    email: EmailStr  # validated format
    username: str
    password: str

    @field_validator('username')
    @classmethod
    def username_alphanumeric(cls, v):
        if not v.isalnum():
            raise ValueError('Username must be alphanumeric')
        return v

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v
```

### Custom exception handlers

```python
from fastapi import Request
from fastapi.responses import JSONResponse

class DomainException(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code

@app.exception_handler(DomainException)
async def domain_exception_handler(request: Request, exc: DomainException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "code": exc.code},
    )
```

### JWT refresh token rotation

```python
from datetime import datetime, timedelta, timezone
import jwt  # PyJWT
from fastapi import HTTPException, status

import os
SECRET_KEY = os.environ["SECRET_KEY"]  # raises KeyError at startup if missing — fail loud
ALGORITHM = "HS256"

def create_access_token(user_id: int) -> str:
    return jwt.encode({"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(minutes=15)}, SECRET_KEY, ALGORITHM)

def create_refresh_token(user_id: int) -> str:
    return jwt.encode({"sub": str(user_id), "type": "refresh", "exp": datetime.now(timezone.utc) + timedelta(days=7)}, SECRET_KEY, ALGORITHM)

@app.post("/auth/refresh")
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        # Check token not revoked
        if await db.get(RevokedToken, refresh_token):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    # Rotate: revoke old, issue new pair
    db.add(RevokedToken(token=refresh_token))
    await db.commit()
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
    }

@app.post("/auth/logout")
async def logout(refresh_token: str, db: AsyncSession = Depends(get_db)):
    db.add(RevokedToken(token=refresh_token))
    await db.commit()
    return {"status": "logged out"}
```

---

## resilience

### httpx timeouts for outbound HTTP calls

```python
import httpx

# Always set timeouts — default is None (hangs forever)
async with httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=10.0, write=5.0, pool=2.0)) as client:
    response = await client.get("https://api.example.com/data")
    response.raise_for_status()
```

### Retry with tenacity

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import httpx

@retry(
    retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
)
async def fetch_external(url: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.json()
```

### Circuit breaker with pybreaker

```python
import pybreaker

# Opens after 3 failures; tries again after 30s
db_breaker = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=30)

@db_breaker
async def query_external_service(params: dict) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.post("https://external.api/", json=params)
        r.raise_for_status()
        return r.json()

# In route:
try:
    result = await query_external_service(params)
except pybreaker.CircuitBreakerError:
    raise HTTPException(status_code=503, detail="External service unavailable")
```

---

## logging

### structlog with FastAPI middleware

```python
import structlog
from fastapi import Request
import uuid

logger = structlog.get_logger()

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    logger.info("request_started", method=request.method, path=request.url.path)
    response = await call_next(request)
    logger.info("request_finished", status_code=response.status_code)
    return response
```

---

## database

### Async SQLAlchemy session

```python
# database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/dbname"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### Alembic migrations

```bash
# Initialize
alembic init alembic

# Create migration
alembic revision --autogenerate -m "add user table"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

---

## migrations

### Alembic async setup

```python
# alembic/env.py — async-compatible configuration
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context
from myapp.models import Base
from myapp.config import settings

config = context.config
fileConfig(config.config_file_name)
target_metadata = Base.metadata

def run_migrations_online():
    connectable = create_async_engine(settings.DATABASE_URL)

    async def do_run():
        async with connectable.connect() as connection:
            await connection.run_sync(context.run_migrations)

    import asyncio
    asyncio.run(do_run())

run_migrations_online()
```

### Safe migration patterns

```python
# ✓ Add nullable column first, backfill, then add NOT NULL constraint
# Step 1 — migration: add nullable
op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))

# Step 2 — migration: backfill (run separately in prod before step 3)
# UPDATE users SET bio = '' WHERE bio IS NULL;

# Step 3 — migration: add NOT NULL
op.alter_column('users', 'bio', nullable=False)

# ✗ Never add NOT NULL without a default on a large table — locks the table
op.add_column('users', sa.Column('bio', sa.Text(), nullable=False))  # BAD
```

### Alembic commands

```bash
# Check current revision
alembic current

# Show pending migrations
alembic history --verbose

# Stamp without running (after manual schema changes)
alembic stamp head

# Generate empty migration for data migrations
alembic revision -m "backfill user bio"
```

---

## performance

### Connection pool tuning

```python
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,          # base connections
    max_overflow=20,       # burst connections
    pool_pre_ping=True,    # validate connections before use
    pool_recycle=3600,     # recycle after 1 hour to avoid stale connections
)
```

### Background tasks for non-blocking work

```python
from fastapi import BackgroundTasks

def send_welcome_email(email: str) -> None:
    # runs after response is sent — never awaited by the request
    ...

@app.post("/users/", status_code=201)
async def create_user(
    user: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    db_user = await crud.create_user(db, user)
    background_tasks.add_task(send_welcome_email, db_user.email)
    return db_user
```

### Redis caching with aiocache

```python
from aiocache import cached, Cache
from aiocache.serializers import JsonSerializer

@cached(ttl=300, cache=Cache.REDIS, serializer=JsonSerializer())
async def get_popular_posts() -> list[dict]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Post).order_by(Post.view_count.desc()).limit(10)
        )
        return [p.__dict__ for p in result.scalars().all()]
```

### Profiling slow routes

```python
import time
from fastapi import Request

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    response.headers["X-Process-Time"] = f"{duration:.4f}"
    if duration > 0.5:
        logger.warning("slow_request", path=request.url.path, duration=duration)
    return response
```
