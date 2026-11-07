<?php

declare(strict_types=1);

use App\Kernel;
use Symfony\Component\Dotenv\Dotenv;

require __DIR__ . '/../../vendor/autoload.php';

new Dotenv()->bootEnv(__DIR__ . '/../../.env', 'test');

$kernel = new Kernel('test', true);
$kernel->boot();

// Only the test kernel exposes the private services TwigStan reads. Returning the kernel,
// not the Twig environment, lets it read the routes.
return $kernel;
