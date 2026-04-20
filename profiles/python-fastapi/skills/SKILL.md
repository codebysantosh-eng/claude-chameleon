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
from pydantic import BaseModel

app = FastAPI()

class UserCreate(BaseModel):
    email: str
    username: str

class UserResponse(BaseModel):
    id: int
    email: str
    username: str

    class Config:
        from_attributes = True

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

# ✓ Good — run sync code in executor
@app.get("/report")
async def get_report():
    loop = asyncio.get_event_loop()
    report = await loop.run_in_executor(None, generate_report_sync)
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
    except JWTError:
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
