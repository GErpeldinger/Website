<?php

declare(strict_types=1);

use TwigCsFixer\Config\Config;
use TwigCsFixer\File\Finder;

$finder = new Finder();
$finder->in(__DIR__ . '/../../templates');

// No cache file: it would land in the repository root, and linting a few templates is instant.
return new Config()
    ->setFinder($finder)
    ->setCacheFile(null);
