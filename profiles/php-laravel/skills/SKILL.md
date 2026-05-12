# PHP + Laravel Skills

Deep reference for Laravel development patterns. Load specific sections on demand.

---

## laravel-first

The single most important rule when working in this profile: **reach for the Laravel facade or helper before any generic PHP function.** Laravel facades are not "wrappers for convenience" — they give you test fakes, dependency injection, configurable drivers, queueing, retries, and consistent error handling for free. Generic PHP gives you none of that.

### Decision tree

When you need to do X, ask in this order:

1. Is there a Laravel facade for it? Use the facade.
2. Is there a global helper (`request()`, `response()`, `now()`, `auth()`, `config()`, `session()`, `cookie()`, `redirect()`, `route()`, `view()`, `validator()`)? Use the helper.
3. Is there a Laravel package recommended in `context.md`? Use it.
4. Only then drop to raw PHP, and add a comment explaining why the Laravel path was insufficient.

### Quick mapping

```
HTTP out     → Http::get(...)            NOT  curl_*, file_get_contents($url)
Email        → Mail::to(...)             NOT  mail()
Request data → request()->input(...)     NOT  $_GET, $_POST, $_REQUEST
Files in     → request()->file(...)      NOT  $_FILES
Session      → session()->put/get(...)   NOT  $_SESSION, session_start()
Cookies      → Cookie::queue(...)        NOT  setcookie()
Storage      → Storage::disk()->put()    NOT  fopen, file_put_contents, mkdir
Hashing      → Hash::make / Hash::check  NOT  password_hash, password_verify
Encryption   → Crypt::encryptString      NOT  openssl_encrypt
Dates        → now(), Carbon, $casts     NOT  date(), strtotime(), time()
DB           → Eloquent / DB::table()    NOT  mysqli_*, raw PDO
JSON resp    → response()->json($data)   NOT  json_encode + header()
Redirect     → return redirect(...)      NOT  header('Location: ...')
Headers      → response()->withHeaders() NOT  header()
Logging      → Log::info($msg, $ctx)     NOT  error_log, dd(), dump()
Halt request → abort(404), throw         NOT  die, exit
Config read  → config('foo.bar')         NOT  env('FOO_BAR') outside config/
Subprocess   → Process::run(...) / Job   NOT  exec, shell_exec, proc_open
```

### Why `env()` is restricted outside `config/`

After `php artisan config:cache` runs in production, all `env()` calls outside `config/*.php` return `null`. Always read runtime values via `config('services.foo.key')`, where `services.foo.key` is populated from `env()` *inside* `config/services.php`. This is the single most common production-only bug from generic-PHP habits.

### Why facades over helpers in libraries

Facades are testable via `Http::fake()`, `Mail::fake()`, `Queue::fake()`, `Storage::fake()`, `Bus::fake()`, `Event::fake()`, `Notification::fake()`. Raw PHP functions cannot be faked. If you write `mail(...)` you cannot assert in a test that a mail was sent without mocking PHP's built-ins — which Laravel will not help you with.

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

Pure unit tests should NOT extend `Tests\TestCase` — that bootstraps the full Laravel app for every test. Extend `PHPUnit\Framework\TestCase` directly for fast, isolated unit tests; reserve `Tests\TestCase` for feature/integration tests that need the container, DB, or HTTP kernel.

```php
namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
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

### Pest equivalent (Laravel 11+ default)

```php
use App\Services\DiscountCalculator;

it('gives members a 10% discount', function () {
    expect((new DiscountCalculator())->calculate(100.0, isMember: true))->toBe(90.0);
});

it('throws on negative amount', function () {
    (new DiscountCalculator())->calculate(-1.0, isMember: true);
})->throws(InvalidArgumentException::class);
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
