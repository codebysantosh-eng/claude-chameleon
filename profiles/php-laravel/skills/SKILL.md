# PHP + Laravel Skills

Deep reference for Laravel development patterns. Load specific sections on demand.

---

## laravel-first

The single most important rule when working in this profile: **reach for the Laravel facade or helper before any generic PHP function.** Laravel facades are not "convenience wrappers" — they give you test fakes, dependency injection, configurable drivers, queueing, retries, and consistent error handling for free. Generic PHP gives you none of that.

This section is the canonical mapping. `rules.md` and `context.md` only point here — they do not duplicate the table.

### Decision tree

When you need to do X, ask in this order:

1. Is there a Laravel **facade** for it? Use the facade.
2. Is there a **global helper** (`request()`, `response()`, `now()`, `auth()`, `config()`, `session()`, `cookie()`, `redirect()`, `route()`, `view()`, `validator()`, `abort()`, `dispatch()`)? Use the helper.
3. Is there a **Laravel package** recommended in `context.md`? Use it.
4. Only then drop to raw PHP, and add a comment explaining why the Laravel path was insufficient.

### Full mapping (generic PHP → Laravel)

| Domain | Laravel built-in | Avoid (in app code) |
|--------|------------------|---------------------|
| HTTP client | `Http::get / post / withToken / retry / pool / fake` | `curl_*`, `file_get_contents($url)`, `fsockopen` |
| Email | `Mail::to($user)->send(new YourMailable(...))` | `mail()` |
| Multi-channel notifications | `Notification::send($users, new YourNotification(...))` or `$user->notify(...)` | Direct calls to mail / SMS / Slack clients |
| Request data | `request()->input/file/cookie/header/ip(...)` or a Form Request | `$_GET`, `$_POST`, `$_REQUEST`, `$_FILES`, `$_COOKIE`, `$_SERVER` |
| Form normalization | `prepareForValidation()` on a Form Request | Mutating `$request` inline in the controller |
| Session | `session()->put/get/forget/flush(...)` | `$_SESSION`, `session_start()`, `session_destroy()` |
| Cookies | `cookie($name, $value, $minutes)` / `Cookie::queue(...)` | `setcookie()` |
| Storage | `Storage::disk('s3')->get/put/delete/move(...)` | `fopen`, `fwrite`, `file_put_contents`, `mkdir`, `unlink`, `rename` |
| Hashing | `Hash::make / Hash::check / Hash::needsRehash` | `password_hash`, `password_verify`, `crypt` |
| Encryption | `Crypt::encryptString / decryptString` | `openssl_encrypt`, `openssl_decrypt` |
| Dates | `now()`, `Carbon::parse(...)`, `CarbonImmutable`, model `$casts` to `datetime` / `immutable_datetime` | `date()`, `strtotime()`, `time()`, `mktime()`, `gmdate()` |
| Database queries | Eloquent / `DB::table(...)` / `DB::transaction(...)` | `mysqli_*`, raw `new PDO`, hand-built `BEGIN`/`COMMIT` strings |
| API response shaping | `JsonResource` / `ResourceCollection` (return from controller) | `json_encode($model)` in a controller |
| JSON response | `return response()->json($data)` | `json_encode + header('Content-Type: application/json')` |
| Redirect | `return redirect($url)` / `return redirect()->route('foo')` | `header('Location: ...')` + `exit` |
| Headers | `response()->withHeaders([...])` | `header(...)` |
| Logging | `Log::info / warning / error($msg, ['context' => $value])` | `error_log()`, `dd()`, `dump()`, `var_dump()` |
| Halt request | `abort(404, '...')`, throw an exception, return a response | `die`, `exit` in controllers/services |
| Config read at runtime | `config('services.foo.key')` (populated from `env()` inside `config/services.php`) | `env('SERVICES_FOO_KEY')` outside `config/*.php`, `getenv()` |
| Subprocess | `Process::run(...)` facade (Laravel 11+) or a queued Job | `exec`, `shell_exec`, `system`, `proc_open`, `popen` |
| Eloquent accessor / mutator (L9+) | `protected function fullName(): Attribute { return Attribute::make(get: fn () => "{$this->first} {$this->last}"); }` | `getFullNameAttribute()` / `setFullNameAttribute()` (legacy syntax — works but discouraged in new code) |
| Cross-cutting model side effects | Observers (audit, cache bust, webhooks) | Inline calls in controllers/services |
| Lifecycle reactions across models | Events + Listeners | Tight coupling between domain objects |
| Route-bound models | Implicit + scoped binding (`Route::get('/users/{user}/posts/{post:slug}', ...)`) | Manual `User::find($request->user)` lookups |
| Event broadcasting | `broadcast(new YourEvent(...))->toOthers()` | Hand-rolling WebSocket / Pusher clients |

### Why `env()` is restricted outside `config/`

After `php artisan config:cache` runs in production, all `env()` calls outside `config/*.php` return `null`. The same rule applies inside service providers' `register()` / `boot()`, inside controllers, jobs, services, and Blade views. Always read runtime values via `config('services.foo.key')`, where `services.foo.key` is populated from `env()` *inside* `config/services.php`. This is the single most common production-only bug from generic-PHP habits.

The Blade `@env('production')` *directive* is unrelated — it's an environment-check conditional, not the `env()` helper. The lint hook excludes it explicitly.

### Why facades over raw PHP in libraries

Facades are testable via `Http::fake()`, `Mail::fake()`, `Mail::assertSent(...)`, `Queue::fake()`, `Bus::fake()`, `Bus::assertDispatched(...)`, `Storage::fake()`, `Event::fake()`, `Notification::fake()`, `Notification::assertSentTo(...)`. Raw PHP functions cannot be faked. If you write `mail(...)` you cannot assert in a test that a mail was sent without mocking PHP's built-ins — which Laravel will not help you with.

### Where raw PHP is acceptable

- **Legacy auth migration** — importing hashes from a non-Laravel system; you may call `password_verify` against legacy hashes inside a custom `UserProvider`, then re-hash with `Hash::make` on next login. Document the migration in code.
- **Vendor package shim or polyfill** where the Laravel facade is genuinely not available.
- **One-off Artisan command** that pre-dates the project's Laravel version (rare).
- **External system interop** where the third party requires a specific hashing/encryption format Laravel doesn't expose.

In every other case the answer is the Laravel built-in.

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

**Caveat:** when you extend `PHPUnit\Framework\TestCase` directly, the container is not booted and facade roots are not set. Any call to `app()`, `resolve()`, or a facade like `Cache::`, `Log::`, `Config::` will throw "A facade root has not been set." If your SUT touches facades, either (a) it's not actually a pure unit — extend `Tests\TestCase`, or (b) inject the dependency you need.

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

### Pest equivalent (when the project opts into Pest)

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
