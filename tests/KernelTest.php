<?php

declare(strict_types=1);

use App\Kernel;
use Symfony\Component\Filesystem\Filesystem;

covers(Kernel::class);

// The allowed environments are only checked while the container is built: a cached container
// would boot whatever the list says, so each test boots with a cache of its own.
beforeEach(function (): void {
    $_SERVER['APP_CACHE_DIR'] = sys_get_temp_dir() . '/kernel-test-' . bin2hex(random_bytes(6));
});

afterEach(function (): void {
    $cacheDirectory = $_SERVER['APP_CACHE_DIR'] ?? null;
    if (is_string($cacheDirectory)) {
        new Filesystem()->remove($cacheDirectory);
    }

    unset($_SERVER['APP_CACHE_DIR']);
});

it('boots in each environment it allows', function (string $environment): void {
    $kernel = new Kernel($environment, false);
    $kernel->boot();

    expect($kernel->getEnvironment())->toBe($environment);

    $kernel->shutdown();
})->with(['prod', 'dev', 'test']);

it('refuses an environment it does not allow', function (): void {
    new Kernel('staging', false)->boot();
})->throws(InvalidArgumentException::class, 'is not registered as allowed');
