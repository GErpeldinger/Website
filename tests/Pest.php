<?php

declare(strict_types=1);

// In an agent worktree, .git is a file pointing outside the container, so git fails there. A
// condition here and not --no-tia: Pest 5.3 doesn't pass that flag on to its parallel workers.
if (is_dir(__DIR__ . '/../.git')) {
    // The graph's default home, $HOME, dies with each `docker compose run --rm`: the bind-mounted
    // cache keeps it. Local only, since CI passes --ci. Every test reads the watched files without
    // covering them, so a change to one reruns the whole suite.
    pest()->tia()
        ->directory('.cache/phpunit/tia')
        ->locally()
        ->watch([
            '.env*' => 'tests',
            'composer.lock' => 'tests',
            'config/**' => 'tests',
            'tests/Fixtures/**' => 'tests',
            'tests/Pest.php' => 'tests',
            'tests/bootstrap.php' => 'tests',
        ]);
}
