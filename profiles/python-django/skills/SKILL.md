# Python + Django Skills

Deep reference for Django development patterns. Load specific sections on demand.

---

## testing

### pytest-django setup

```python
# conftest.py
import pytest

@pytest.fixture
def user(db):
    from myapp.models import User
    return User.objects.create_user(
        username='testuser',
        email='test@example.com',
        password='testpass123',
    )

@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()

@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client
```

### pytest.ini / pyproject.toml config

```toml
# pyproject.toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "myproject.settings.test"
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "--cov=. --cov-report=term-missing"

[tool.coverage.run]
omit = ["*/migrations/*", "manage.py", "*/settings/*"]
```

### Unit test example

```python
import pytest
from myapp.services import calculate_discount

class TestCalculateDiscount:
    def test_member_gets_10_percent_off(self):
        assert calculate_discount(100, is_member=True) == 90

    def test_non_member_pays_full_price(self):
        assert calculate_discount(100, is_member=False) == 100

    def test_raises_for_negative_amount(self):
        with pytest.raises(ValueError, match="Amount must be positive"):
            calculate_discount(-1, is_member=True)
```

### Integration test with DB

```python
@pytest.mark.django_db
class TestUserAPI:
    def test_create_user_returns_201(self, api_client):
        response = api_client.post('/api/users/', {
            'email': 'new@example.com',
            'username': 'newuser',
            'password': 'securepass123',
        })
        assert response.status_code == 201
        assert response.data['email'] == 'new@example.com'

    def test_list_requires_auth(self, api_client):
        response = api_client.get('/api/users/')
        assert response.status_code == 401
```

### factory_boy for complex objects

```python
import factory
from factory.django import DjangoModelFactory

class UserFactory(DjangoModelFactory):
    class Meta:
        model = 'auth.User'

    username = factory.Sequence(lambda n: f'user{n}')
    email = factory.LazyAttribute(lambda o: f'{o.username}@example.com')
    password = factory.PostGenerationMethodCall('set_password', 'testpass123')

class PostFactory(DjangoModelFactory):
    class Meta:
        model = 'blog.Post'

    title = factory.Faker('sentence')
    author = factory.SubFactory(UserFactory)
```

---

## security

### Input validation with DRF serializers

```python
from rest_framework import serializers

class CreateUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['email', 'username', 'password']
        extra_kwargs = {'password': {'write_only': True}}

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value.lower()

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
```

### Auth check in views

```python
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_post(request, post_id):
    try:
        post = Post.objects.get(id=post_id)
    except Post.DoesNotExist:
        return Response({'error': 'Post not found'}, status=404)

    # Resource-level authorization
    if post.author != request.user:
        return Response({'error': 'Not your post'}, status=403)

    post.delete()
    return Response(status=204)
```

### Never expose internals in errors

```python
import structlog

logger = structlog.get_logger()

try:
    result = expensive_operation()
except Exception as e:
    logger.error("operation_failed", error=str(e), user_id=request.user.id)
    return Response({'error': 'Operation failed. Please try again.'}, status=500)
```

---

## orm

### Transactions for multi-step writes

```python
from django.db import transaction

@transaction.atomic
def transfer_credits(from_user, to_user, amount):
    from_user.refresh_from_db()  # avoid stale reads
    if from_user.credits < amount:
        raise ValueError("Insufficient credits")
    from_user.credits -= amount
    to_user.credits += amount
    from_user.save()
    to_user.save()
```

### Avoid N+1 queries

```python
# ✗ Bad — N+1
posts = Post.objects.all()
for post in posts:
    print(post.author.name)  # N queries!

# ✓ Good — single JOIN
posts = Post.objects.select_related('author').all()

# ✓ Good — prefetch for reverse FK / M2M
posts = Post.objects.prefetch_related('tags', 'comments__author').all()
```

### Queryset patterns

```python
# Defer expensive fields
users = User.objects.defer('large_text_field').all()

# Only fetch what you need
users = User.objects.values('id', 'email').all()

# Exists check (cheaper than count)
if User.objects.filter(email=email).exists():
    raise ValidationError("Email taken")

# Bulk create (one query)
User.objects.bulk_create([User(email=e) for e in email_list])
```

---

## logging

### structlog setup

```python
# settings/base.py
import structlog

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json' if not DEBUG else 'pretty',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.JSONRenderer() if not DEBUG
        else structlog.dev.ConsoleRenderer(),
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
)
```

### Usage

```python
import structlog

logger = structlog.get_logger()

# Bind context for the request
logger = logger.bind(request_id=request_id, user_id=user.id)

# Business events
logger.info("order_placed", order_id=order.id, amount=order.total)

# Failures with context
logger.error("payment_failed", order_id=order.id, error=str(e))

# Never log PII or secrets
# logger.info("user_login", password=password)  # NEVER
```

---

## drf

### ViewSet with authentication

```python
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Post.objects.filter(author=self.request.user).select_related('author')

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        post = self.get_object()  # handles 404 + permission check
        if post.is_published:
            return Response({'error': 'Already published'}, status=400)
        post.publish()
        return Response({'status': 'published'})
```

### Pagination

```python
# settings/base.py
REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.CursorPagination',
    'PAGE_SIZE': 20,
    'ORDERING': '-created_at',
}
```
