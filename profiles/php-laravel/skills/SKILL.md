# PHP + Laravel Skills

Deep reference for Laravel development patterns. Load specific sections on demand.

---

## testing

### PHPUnit with Laravel TestCase

```php
namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;

class PostControllerTest extends TestCase
{
    public function testUserCanCreatePost(): void
    {
        $user = User::factory()->create();
        
        $response = $this->actingAs($user)
            ->postJson('/api/posts', [
                'title' => 'Test Post',
                'content' => 'Body',
            ]);

        $response->assertCreated();
        $this->assertDatabaseHas('posts', ['title' => 'Test Post']);
    }

    public function testUnauthenticatedUserCannotCreate(): void
    {
        $response = $this->postJson('/api/posts', ['title' => 'Test']);
        $response->assertUnauthorized();
    }
}
```

### Unit test with PHPUnit

```php
namespace Tests\Unit;

use Tests\TestCase;
use App\Services\DiscountCalculator;

class DiscountCalculatorTest extends TestCase
{
    public function test_member_gets_10_percent_discount(): void
    {
        $calculator = new DiscountCalculator();
        $this->assertEquals(90.0, $calculator->calculate(100.0, isMember: true));
    }

    public function test_negative_amount_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $calculator = new DiscountCalculator();
        $calculator->calculate(-1.0, isMember: true);
    }
}
```

### phpunit.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="vendor/autoload.php" colors="true">
    <testsuites>
        <testsuite name="unit">
            <directory>tests/Unit</directory>
        </testsuite>
        <testsuite name="feature">
            <directory>tests/Feature</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory suffix=".php">app</directory>
        </include>
    </source>
</phpunit>
```

---

## security

### Form Requests for Validation

```php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePostRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Check both authentication + authorization (permission/gate)
        return $this->user() !== null && $this->user()->can('create', Post::class);
    }

    public function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'published_at' => 'nullable|date',
        ];
    }
}
```

### Policy for Authorization

```php
namespace App\Policies;

use App\Models\User;
use App\Models\Post;

class PostPolicy
{
    public function update(User $user, Post $post): bool
    {
        // Check both authentication + resource ownership
        return $post->user_id === $user->id;
    }

    public function delete(User $user, Post $post): bool
    {
        return $post->user_id === $user->id && $user->role === 'admin';
    }
}
```

### Structured Logging with Monolog

```php
use Illuminate\Support\Facades\Log;

// Good: structured logging
Log::info('User login', [
    'user_id' => $user->id,
    'ip' => request()->ip(),
    'timestamp' => now(),
]);

// Bad: dd() or var_dump()
dd($user); // FORBIDDEN
```

---

## migrations

### Create Migration

```bash
php artisan make:migration create_posts_table
```

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('content');
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
    }
};
```

### Run Migrations

```bash
php artisan migrate              # Run pending migrations
php artisan migrate:rollback     # Rollback last batch
php artisan migrate:refresh      # Reset and re-run all
php artisan migrate:reset        # Rollback all migrations
```

---

## schema

### Eloquent Model with Type Hints

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Post extends Model
{
    use HasFactory;

    // Always define $fillable explicitly to prevent mass-assignment exploits
    // Leaving it empty or setting $guarded = [] exposes all columns
    protected $fillable = ['title', 'content', 'published_at'];
    protected $casts = [
        'published_at' => 'datetime',
    ];

    public function user(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function comments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Comment::class);
    }
}
```

### Query Builder (not raw SQL)

```php
// Good: Eloquent query builder
$posts = Post::where('published_at', '<=', now())
    ->orderBy('published_at', 'desc')
    ->with('user')
    ->paginate(15);

// Bad: raw SQL
DB::select('SELECT * FROM posts WHERE published_at <= ?', [now()]);
```
