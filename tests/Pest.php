<?php

declare(strict_types=1);

// The graph's default home, $HOME, dies with each `docker compose run --rm`: the bind-mounted
// cache keeps it. Local only, since CI passes --ci. Every test reads the watched files without
// covering them, so a change to one reruns the whole suite.
pest()->tia()
    ->directory('.phpunit.cache/tia')
    ->locally()
    ->watch([
        '.env*' => 'tests',
        'composer.lock' => 'tests',
        'config/**' => 'tests',
        'tests/Pest.php' => 'tests',
        'tests/bootstrap.php' => 'tests',
    ]);
