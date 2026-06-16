# PHP + Laravel Skills

Deep reference for Laravel development patterns. Load specific sections on demand.

> **Core rules apply on top of this file.** These are *stack-specific* patterns only — the universal guardrails live in `~/.claude/rules/`: coverage targets in `testing.md`, the security checklist in `security.md`, accessibility in `a11y.md`, code quality in `code-quality.md`. This file complements those rules; it does not restate them.

---

## laravel-first

This profile is a thin layer, not a copy of `laravel.com/docs`. The agent already knows the framework. This section encodes only:

1. **How to choose** — read what the project adopted; defer to Laravel canon; apply the small list of shop overrides below.
2. **The shop overrides** — the few opinions that the framework allows multiple answers for.

For everything else — facade names, method signatures, helpers, validation rules, Eloquent relationships, queues, events, broadcasting — defer to `https://laravel.com/docs` and to the patterns already adopted in the codebase.

### 1. Respect what the project already does

Before suggesting an approach, grep for what's adopted. The committed choice wins, even if it differs from this profile's greenfield default.

| If choosing… | Look at the project for |
|--------------|--------------------------|
| Auth scaffolding | `composer.json` for `laravel/sanctum`, `laravel/passport`, `laravel/breeze`, `laravel/fortify`, `laravel/jetstream` |
| Authorization | `composer.json` for `spatie/laravel-permission` (else core Gates + Policies) |
| Test runner | `composer.json` for `pestphp/pest`, `tests/Pest.php` (else PHPUnit) |
| Static analysis | `phpstan.neon` `includes:` / `extends:` (Larastan vs vanilla PHPStan) |
| Formatter | `pint.json` vs `.php-cs-fixer.php` |
| Queue / cache driver | `config/queue.php`, `config/cache.php`, `.env` |
| API response style | Existing controllers — Eloquent direct, `response()->json`, or `JsonResource` |

### 2. Defer to Laravel canon for the rest

Facade names, helper signatures, route declarations, validation rules, Eloquent relationships, queue/event/broadcasting APIs — read `https://laravel.com/docs` and the project's existing code. This profile does not duplicate framework documentation, because it goes out of date the moment Laravel ships a new version.

### 3. Shop overrides (the only opinions encoded here)

These differ from "whatever Laravel allows" and apply even when the framework offers multiple options.

- **`env()` is restricted to `config/*.php`.** Use `config('services.foo.key')` everywhere else — `php artisan config:cache` nulls runtime `env()` in production. Enforced by the lint hook. The Blade `@env(...)` directive is a separate construct and is excluded.
- **`password_hash` / `password_verify` → `Hash` facade.** Only legitimate exception: legacy-import auth migration (verifying against hashes from a non-Laravel system, then re-hashing on next login via a custom `UserProvider`). Document it in code. Also a hook-warning.
- **Pure unit tests extend `PHPUnit\Framework\TestCase`**, not `Tests\TestCase`. Booting the Laravel app per test is wasted unless the SUT touches the container, DB, or HTTP kernel. (If it calls a facade, you'll see "A facade root has not been set" — at that point either inject the dependency or extend `Tests\TestCase`.)
- **Greenfield defaults** (apply only when the project hasn't committed to a choice yet):
  - **Sanctum** for SPA + API tokens; **Passport** only if full OAuth2 is a hard requirement.
  - **Core Gates + Policies**; **Spatie Permission** only when team/role tables are a product requirement.
  - **Larastan** (not vanilla PHPStan) at level 8+; `phpstan.neon` must extend `vendor/larastan/larastan/extension.neon`.
  - **Pint** (not PHP-CS-Fixer).
  - **PHPUnit** is the default; **Pest** if the project opts in.
  - **Rector + `driftingly/rector-laravel`** for automated upgrades.

That's the complete rule set. Everything else, look it up.

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

---

## a11y

Laravel renders server-side HTML via Blade (the profile globs `resources/views/**/*.blade.php`), so accessibility applies to every rendered view. Universal principles and severity ranking live in `~/.claude/rules/a11y.md`; this section covers the Blade mechanics. (Inertia/Vue or API-only front-ends push a11y to the front-end's own profile.)

### Form fields with `@error`

Blade's `@error` directive is the idiomatic hook — use it to drive `aria-invalid` and `aria-describedby`, not just to print red text.

```blade
{{-- ✗ Bad — error printed below, no programmatic link --}}
<input type="email" name="email" value="{{ old('email') }}">
@error('email')<span class="error">{{ $message }}</span>@enderror

{{-- ✓ Good --}}
<label for="email">Email</label>
<input type="email" id="email" name="email" value="{{ old('email') }}"
       @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
@error('email')
  <span id="email-error" class="error">{{ $message }}</span>
@enderror
```

Extract this into a `<x-form.input name="email" label="Email"/>` Blade component so every field is wired identically — the component owns the `for`/`id`/`aria-describedby` wiring once.

### Patterns

| Concern | Pattern |
|---------|---------|
| Accessible name | `<label for>` matching the input `id`; never placeholder-only |
| Error linking | `@error('field')` → `aria-invalid="true"` + `aria-describedby="field-error"` on the input, with a matching error node id |
| Flash messages | Render `session('status')` / error bags in an `aria-live="polite"` region (`assertive` for errors) so post-redirect feedback is announced |
| Validation summary | A `role="alert"` region listing `$errors->all()` at the top of the form, focused on submit failure |
| Old input | `old('field')` preserves values on validation redirect — required so the user isn't re-entering data they can't see |
| Required | `required` attribute from the Form Request rules, not just a visual marker |

### Recurring misses (catch in review)

- `@error` used only to print text — no `aria-invalid`/`aria-describedby` on the field.
- `session('status')` / `$errors` rendered in a plain `<div>` with no `aria-live`.
- Placeholder used as the only label.
- Livewire/Alpine interactive components that don't manage focus or announce `wire:loading` state (`aria-busy`).

### Tooling

`axe-core`/`pa11y` against rendered pages, Dusk or Playwright for keyboard walk-throughs, and the browser a11y tree. See `~/.claude/rules/a11y.md` for the pre-commit checklist.
