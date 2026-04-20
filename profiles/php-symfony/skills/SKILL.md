# PHP + Symfony Skills

Deep reference for Symfony development patterns. Load specific sections on demand.

---

## testing

### PHPUnit with Symfony WebTestCase

```php
// tests/Controller/PostControllerTest.php
namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class PostControllerTest extends WebTestCase
{
    public function testCreatePostReturns201(): void
    {
        $client = static::createClient();
        $client->request('POST', '/api/posts', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->getToken(),
        ], json_encode(['title' => 'Test Post', 'content' => 'Body']));

        $this->assertResponseStatusCodeSame(201);
        $this->assertJson($client->getResponse()->getContent());
    }

    public function testListRequiresAuth(): void
    {
        $client = static::createClient();
        $client->request('GET', '/api/posts');
        $this->assertResponseStatusCodeSame(401);
    }
}
```

### Unit test with PHPUnit

```php
namespace App\Tests\Service;

use PHPUnit\Framework\TestCase;
use App\Service\DiscountCalculator;

class DiscountCalculatorTest extends TestCase
{
    private DiscountCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new DiscountCalculator();
    }

    public function testMemberGets10PercentDiscount(): void
    {
        $this->assertSame(90.0, $this->calculator->calculate(100.0, isMember: true));
    }

    public function testNonMemberPaysFullPrice(): void
    {
        $this->assertSame(100.0, $this->calculator->calculate(100.0, isMember: false));
    }

    public function testNegativeAmountThrows(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->calculator->calculate(-1.0, isMember: true);
    }
}
```

### phpunit.xml.dist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="tests/bootstrap.php" colors="true">
    <testsuites>
        <testsuite name="unit">
            <directory>tests/Unit</directory>
        </testsuite>
        <testsuite name="integration">
            <directory>tests/Integration</directory>
        </testsuite>
    </testsuites>
    <coverage>
        <include>
            <directory suffix=".php">src</directory>
        </include>
    </coverage>
</phpunit>
```

---

## security

### Symfony Security configuration

```yaml
# config/packages/security.yaml
security:
    password_hashers:
        App\Entity\User:
            algorithm: bcrypt
            cost: 13  # minimum 12 for production

    providers:
        app_user_provider:
            entity:
                class: App\Entity\User
                property: email

    firewalls:
        api:
            pattern: ^/api
            stateless: true
            jwt: ~  # using LexikJWTAuthenticationBundle
```

### Voter for resource-level authorization

```php
namespace App\Security\Voter;

use App\Entity\Post;
use App\Entity\User;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

class PostVoter extends Voter
{
    public const DELETE = 'POST_DELETE';

    protected function supports(string $attribute, mixed $subject): bool
    {
        return $attribute === self::DELETE && $subject instanceof Post;
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) return false;

        /** @var Post $post */
        $post = $subject;
        return $post->getAuthor() === $user;
    }
}
```

### Controller with authorization

```php
#[Route('/api/posts/{id}', methods: ['DELETE'])]
public function delete(Post $post): JsonResponse
{
    $this->denyAccessUnlessGranted(PostVoter::DELETE, $post);
    // Throws 403 AccessDeniedException if voter returns false

    $this->entityManager->remove($post);
    $this->entityManager->flush();

    return new JsonResponse(null, 204);
}
```

---

## doctrine

### Entity conventions

```php
namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'posts')]
class Post
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $title;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $author;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(string $title, User $author)
    {
        $this->title = $title;
        $this->author = $author;
        $this->createdAt = new \DateTimeImmutable();
    }
}
```

### Transactions

```php
$this->entityManager->wrapInTransaction(function () use ($from, $to, $amount): void {
    if ($from->getBalance() < $amount) {
        throw new \DomainException('Insufficient balance');
    }
    $from->debit($amount);
    $to->credit($amount);
    // EntityManager auto-persists managed entities on commit
});
```

### Repository pattern

```php
namespace App\Repository;

use App\Entity\Post;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;

class PostRepository extends ServiceEntityRepository
{
    public function findPublishedByAuthor(User $author): array
    {
        return $this->createQueryBuilder('p')
            ->where('p.author = :author')
            ->andWhere('p.publishedAt IS NOT NULL')
            ->setParameter('author', $author)
            ->orderBy('p.publishedAt', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
```

---

## logging

### Monolog configuration

```yaml
# config/packages/monolog.yaml
monolog:
    handlers:
        main:
            type: stream
            path: "%kernel.logs_dir%/%kernel.environment%.log"
            level: debug
            channels: ["!event"]
        console:
            type: console
            process_psr_3_messages: false
            channels: ["!event", "!doctrine"]
```

### Usage in services

```php
use Psr\Log\LoggerInterface;

class OrderService
{
    public function __construct(private readonly LoggerInterface $logger) {}

    public function placeOrder(Order $order): void
    {
        try {
            // ... business logic
            $this->logger->info('Order placed', [
                'order_id' => $order->getId(),
                'user_id' => $order->getUser()->getId(),
                'amount' => $order->getTotal(),
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Order failed', [
                'order_id' => $order->getId(),
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
```

---

## services

### Service configuration (services.yaml)

```yaml
# config/services.yaml
services:
    _defaults:
        autowire: true      # inject by type-hint
        autoconfigure: true # auto-tag services

    App\:
        resource: '../src/'
        exclude:
            - '../src/DependencyInjection/'
            - '../src/Entity/'
            - '../src/Kernel.php'
```

### Constructor injection

```php
// ✓ Good — constructor injection
class PostService
{
    public function __construct(
        private readonly PostRepository $postRepository,
        private readonly LoggerInterface $logger,
        private readonly EntityManagerInterface $entityManager,
    ) {}
}

// ✗ Bad — service locator (hides dependencies)
class PostService
{
    public function createPost(): void
    {
        $em = $this->container->get('doctrine.orm.entity_manager'); // hidden dep
    }
}
```
