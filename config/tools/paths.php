<?php

declare(strict_types=1);

// What Rector and ECS work on. Symfony's skeleton (the front controller, the preloader, and the
// generated bundle and reference lists) stays as its recipes write it, so recipe updates merge.
return [
    'paths' => [
        __DIR__ . '/../../config',
        __DIR__ . '/../../src',
    ],
    'skip' => [
        __DIR__ . '/../../config/bundles.php',
        __DIR__ . '/../../config/preload.php',
        __DIR__ . '/../../config/reference.php',
    ],
];
